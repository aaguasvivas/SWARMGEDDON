import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import { COLORS, DASH, DEFAULT_SEED, FIXED_DT, MAX_FRAME_TIME } from './config.ts'
import { GameLoop } from './core/time.ts'
import { Rng, seedFromString } from './core/rng.ts'
import { initSafeArea, getInsets } from './platform/safeArea.ts'
import { setHapticsEnabled } from './platform/haptics.ts'
import { initNative, onAppPause, registerBackButton } from './platform/native.ts'
import { createRenderer } from './render/app.ts'
import { Camera } from './render/camera.ts'
import { loadFonts } from './render/fonts.ts'
import { TextureRegistry } from './render/textures.ts'
import { IchorLayer } from './render/ichorLayer.ts'
import { renderEntities } from './render/entityRenderer.ts'
import { PostFX } from './render/postfx.ts'
import { Vignette } from './render/vignette.ts'
import { BackdropSystem } from './render/backdrop.ts'
import { AudioEngine } from './audio/audio.ts'
import { DamageNumbers } from './effects/damageNumbers.ts'
import { FeelDirector } from './effects/feelDirector.ts'
import { DEATH_BEAT_MS, DEATH_RECAP_MS, DEATH_SKIP_MS, TimePreset } from './effects/timeDirector.ts'
import { Arena, type DecorSpeck } from './game/arena.ts'
import { Player } from './game/player.ts'
import { World, type RunMode } from './game/world.ts'
import { InputManager } from './input/input.ts'
import { DebugOverlay } from './ui/debugOverlay.ts'
import { Hud } from './ui/hud.ts'
import { LevelUpModal } from './ui/levelupModal.ts'
import { MainMenu } from './ui/mainMenu.ts'
import { GameOver } from './ui/gameOver.ts'
import { SettingsPanel } from './ui/settingsPanel.ts'
import { Leaderboard } from './ui/leaderboard.ts'
import { dismissNamePrompt } from './ui/namePrompt.ts'
import { submitScore } from './net/leaderboard.ts'
import { TouchHint } from './ui/touchHint.ts'
import { bakeIcons } from './ui/icons.ts'
import { FONT } from './ui/tokens.ts'
import { tweens } from './ui/tween.ts'
import { numGlyphs } from './ui/digits.ts'
import { flushStorage, initStorage, loadJSON, saveJSON } from './platform/storage.ts'
import { loadSettings, saveSettings, type Settings } from './state/settings.ts'
import { recordRun, recordWorldBest, loadWorldBest, type RunResult } from './state/persistence.ts'
import { shareRunCard } from './share/shareCard.ts'
import { flushUpdatePrompt, setupUpdatePrompt } from './pwa/updatePrompt.ts'
import { CHARACTERS, DEFAULT_CHARACTER_ID, characterById } from './content/characters.ts'
import { ARENAS, DEFAULT_ARENA_ID, arenaById } from './content/arenas.ts'
import { evaluateUnlocks, grant, isUnlocked } from './state/unlocks.ts'
import { spawnEnemy, debugFloodSwarmers } from './systems/spawn.ts'
import { directorJumpTo, directorTick } from './systems/director.ts'
import { aiSystem, buildEnemyHash } from './systems/ai.ts'
import { weaponSystem } from './systems/weapons.ts'
import { projectileSystem, enemyProjectileSystem } from './systems/projectiles.ts'
import { pickupSystem } from './systems/pickups.ts'
import { collisionSystem } from './systems/collision.ts'
import { acidSystem } from './systems/acid.ts'
import { dashSystem } from './systems/dash.ts'
import { particleSystem } from './systems/particles.ts'

type Screen = 'menu' | 'playing' | 'gameover' | 'leaderboard'

/**
 * Phase 3 bootstrap + game state machine. boot -> menu -> playing -> gameover.
 * Wires modes (Endless / Daily), persistence, audio, settings, the level-up
 * draft, and the reality-warp distortion onto the combat core.
 */
async function boot(): Promise<void> {
  await initStorage()
  initSafeArea()
  // Fonts load alongside the renderer; every Text is created after both.
  const fontsReady = loadFonts()
  const mount = document.getElementById('app')
  if (!mount) throw new Error('#app mount not found')

  // A cold WKWebView can transiently fail WebGL context creation (seen once on
  // the iOS simulator under heavy load). One delayed retry recovers it; only a
  // second failure is a real, reportable error.
  let renderer
  try {
    renderer = await createRenderer(mount)
  } catch {
    await new Promise((r) => setTimeout(r, 900))
    renderer = await createRenderer(mount)
  }
  const { app, layers } = renderer
  await fontsReady

  const texReg = new TextureRegistry(app.renderer)
  texReg.bakePlaceholders()
  bakeIcons(app.renderer)

  const audio = new AudioEngine()
  audio.attachUnlock()

  // Cosmetic RNG (stable, boot-time) for decor + ichor splat shapes. The run's
  // streams live in World.rngs and are reseeded per run.
  const cosmetic = new Rng(seedFromString('swarmgeddon:decor'))

  const arena = new Arena()
  arena.setDecor(makeDecor(cosmetic, 220)) // more specks for the bigger world
  arena.build() // fixed world, drawn once
  layers.floor.addChild(arena.view)

  const ichor = new IchorLayer(app.renderer, cosmetic)
  ichor.resize(arena.bounds.w, arena.bounds.h, arena.bounds.x, arena.bounds.y) // once; arena is fixed
  layers.ichor.addChild(ichor.view)

  const player = new Player()
  const world = new World(arena, player, ichor, layers, texReg)
  // Presentation only: the sim never reads the camera.
  const camera = new Camera()
  const numbers = new DamageNumbers()
  layers.overlay.addChild(numbers.view)
  const camLayers = [layers.world, layers.overlay] as const
  layers.warpHost.addChild(player.view) // above the swarm, inside the warped/bloomed scene

  // Bloom + grade over the game scene (UI stays crisp & unbloomed). On `scene`
  // (identity vs the camera-translated `world`); filterArea is pinned to the
  // screen in layout() so the filter only processes the visible window.
  const postFX = new PostFX(layers.scene)

  const input = new InputManager(app.canvas)
  input.setEnabled(false)
  const feel = new FeelDirector(world, audio, numbers)
  const vignette = new Vignette()
  // Per-world atmosphere: ambient motes (world-space) + screen-space overlay +
  // the color grade/tinted vignette. Bakes its textures once; only tints per world.
  const backdrop = new BackdropSystem(layers, postFX, vignette)
  const crosshair = buildCrosshair()
  const hurtOverlay = new Graphics()
  const flashOverlay = new Graphics() // brief white pop on level-up
  const hud = new Hud()
  const modal = new LevelUpModal()
  const mainMenu = new MainMenu()
  const gameOver = new GameOver()
  const settingsPanel = new SettingsPanel()
  const leaderboard = new Leaderboard()
  const touchHint = new TouchHint()
  // Dev instrument only: null in prod so the class, its per-frame update, and
  // the backtick toggle are all tree-shaken from the shipped bundle.
  const debug = import.meta.env.DEV ? new DebugOverlay() : null
  // vignette sits at the bottom of the UI (above the world, below the HUD).
  layers.ui.addChild(
    vignette.view, hud.view, input.touch.view, hurtOverlay, flashOverlay, crosshair,
    touchHint.view, modal.view, mainMenu.view, gameOver.view, settingsPanel.view, leaderboard.view,
  )
  if (debug) layers.ui.addChild(debug.view)

  // Touch onboarding state: show the dual-stick guide on touch devices until the
  // player has used both sticks once (persisted), fading each side as it's used.
  const isTouchDevice =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    new URLSearchParams(location.search).get('touch') === '1' // testing override
  let touchLearned = loadJSON('seenTouchControls', false)
  let touchMoveUsed = false
  let touchAimUsed = false
  // One-time "collect for XP" label on the first gem a new player ever sees.
  let showGemHint = !loadJSON('seenGemHint', false)
  let levelFlash = 0
  // Whether the wreck visuals have landed this death.
  let deathBeat = false

  // --- settings ---
  let settings = loadSettings()
  let shakeMul = 1
  function applySettings(s: Settings): void {
    audio.setVolumes(s.master, s.sfx, s.music)
    ichor.intensityMul = s.ichor
    shakeMul = s.shake
    postFX.setIntensity(s.glow)
    backdrop.setQuality(s.glow) // lean fallback for the Glow-off tier (next run)
    input.autoFire = s.autoFire
    setHapticsEnabled(s.haptics)
    feel.time.reduceMotion = s.reduceMotion
    camera.reduceMotion = s.reduceMotion
    tweens.reduceMotion = s.reduceMotion
    numbers.mode = s.damageNumbers
  }
  applySettings(settings)

  // --- state machine ---
  let screen: Screen = 'menu'
  let lastResult: RunResult | null = null
  let submitToken = 0

  // Register the SW + "new version" toast, but never mid-run ("Update"
  // reloads the page, which would destroy an active run). Parked toasts are
  // released by flushUpdatePrompt() on the menu/game-over transitions.
  setupUpdatePrompt(() => screen !== 'playing')

  // --- loadout selection (persisted; locked picks resolve to the default) ---
  let selCharId = loadJSON('sel:char', DEFAULT_CHARACTER_ID)
  let selArenaId = loadJSON('sel:arena', DEFAULT_ARENA_ID)

  function refreshLoadoutUI(): void {
    const c = characterById(selCharId)
    const a = arenaById(selArenaId)
    const cOpen = isUnlocked(c.id, c.unlock)
    const aOpen = isUnlocked(a.id, a.unlock)
    // Two SHORT lines (pilot, then arena): a single run-on line wraps
    // unpredictably on phones and is hard to scan.
    const cHint = cOpen ? `${c.name}: ${c.passiveDesc}` : `🔒 ${c.name}: ${c.unlock.earnDesc}`
    const aHint = aOpen ? `${a.name}: vs ${a.broodName}` : `🔒 ${a.name}: ${a.unlock.earnDesc}`
    mainMenu.setLoadout(
      cOpen ? `▸ ${c.name}` : `🔒 ${c.name}`,
      aOpen ? `▸ ${a.name}` : `🔒 ${a.name}`,
      `${cHint}\n${aHint}`,
      c.colors.body,
    )
    // The selected world's personal best (best time + most kills), shown on the
    // menu and refreshed each time the arena selector cycles.
    mainMenu.setWorldBest(a.name, loadWorldBest(a.id))
  }
  mainMenu.onCyclePilot = () => {
    const i = CHARACTERS.findIndex((c) => c.id === selCharId)
    selCharId = CHARACTERS[(i + 1) % CHARACTERS.length]!.id
    saveJSON('sel:char', selCharId)
    refreshLoadoutUI()
  }
  mainMenu.onCycleArena = () => {
    const i = ARENAS.findIndex((a) => a.id === selArenaId)
    selArenaId = ARENAS[(i + 1) % ARENAS.length]!.id
    saveJSON('sel:arena', selArenaId)
    refreshLoadoutUI()
  }
  refreshLoadoutUI()

  /** Resolve the effective run loadout: locked picks fall back to the default,
   *  and the Daily's arena rotates deterministically by date for everyone. */
  function resolveLoadout(mode: RunMode): { char: (typeof CHARACTERS)[number]; theme: (typeof ARENAS)[number] } {
    const cSel = characterById(selCharId)
    const char = isUnlocked(cSel.id, cSel.unlock) ? cSel : characterById(DEFAULT_CHARACTER_ID)
    let theme = arenaById(selArenaId)
    if (!isUnlocked(theme.id, theme.unlock)) theme = arenaById(DEFAULT_ARENA_ID)
    if (mode === 'daily') theme = ARENAS[seedFromString('swarmgeddon:arena:' + todayStr()) % ARENAS.length]!
    return { char, theme }
  }

  function startRun(mode: RunMode): void {
    const { char, theme } = resolveLoadout(mode)
    world.beginRun(runSeed(mode), mode, char, theme)
    audio.setTheme(theme.music)
    feel.reset()
    deathBeat = false
    backdrop.setTheme(theme, arena.glowSpots) // motes/atmosphere/grade/vignette/glows
    camera.reset()
    followCamera(0, true) // seed the camera before the first sim step
    hud.reset() // don't let last run's dying bars sweep across the fresh run
    hud.announceWorld(theme.name, `vs ${theme.broodName.toUpperCase()}`, theme.borderGlow)
    touchMoveUsed = false
    touchAimUsed = false
    screen = 'playing'
    input.setEnabled(true)
    modal.close()
    mainMenu.hide()
    gameOver.hide()
    settingsPanel.hide()
    leaderboard.hide()
  }

  function endRun(): void {
    const result: RunResult = {
      mode: world.mode,
      time: world.time,
      kills: world.kills,
      level: world.level,
      score: world.score,
      seed: world.seed,
      date: todayStr(),
      character: world.character.id,
      arena: world.arenaTheme.id,
    }
    lastResult = result
    feel.time.reset()
    const isHigh = recordRun(result)
    const gains = recordWorldBest(result) // per-world best time / most kills
    gameOver.show(result, isHigh, gains)
    // Earned unlocks: banner them and refresh the menu selectors.
    const fresh = evaluateUnlocks(result)
    feel.runEnded(isHigh, fresh.length > 0)
    if (fresh.length > 0) {
      gameOver.setUnlocks(fresh)
      refreshLoadoutUI()
    }
    screen = 'gameover'
    input.setEnabled(false)
    // Submit to the global leaderboard (no-op if unconfigured). The token pins
    // the async response to THIS run: a slow response from run N must never
    // stamp its rank (or overwrite the rank) on run N+1's death screen.
    const token = ++submitToken
    void submitScore(result).then((r) => {
      if (token !== submitToken || screen !== 'gameover') return
      if (r) gameOver.setRank(r.rank)
      else gameOver.setSubmitFailed()
    })
    flushUpdatePrompt() // a parked "new version" toast may show now
  }

  function toMenu(): void {
    screen = 'menu'
    input.setEnabled(false)
    feel.reset()
    camera.reset()
    deathBeat = false
    gameOver.hide()
    settingsPanel.hide()
    leaderboard.hide()
    refreshLoadoutUI() // re-read the selected world's best (a run may have set one)
    mainMenu.refresh(todayStr())
    mainMenu.show()
    // Reset the whole presentation to the hive home base. The menu idles a live
    // arena behind it (see the player.spawn at world center), so music, floor
    // theme, and ichor tints must AGREE, not show the last world with hive music.
    const home = arenaById(DEFAULT_ARENA_ID)
    world.arenaTheme = home
    arena.setTheme(home)
    ichor.stampTintA = home.ichorA
    ichor.stampTintB = home.ichorB
    audio.setTheme(home.music)
    backdrop.setTheme(home, arena.glowSpots)
    flushUpdatePrompt()
  }

  function toLeaderboard(): void {
    screen = 'leaderboard'
    input.setEnabled(false)
    mainMenu.hide()
    gameOver.hide()
    leaderboard.open()
  }

  mainMenu.onPlay = startRun
  mainMenu.onSettings = () => settingsPanel.open(settings)
  mainMenu.onLeaderboard = toLeaderboard
  gameOver.onRetry = () => startRun(world.mode)
  gameOver.onMenu = toMenu
  gameOver.onLeaderboard = toLeaderboard
  gameOver.onShare = () => {
    if (lastResult) void shareRunCard(lastResult)
  }
  leaderboard.onBack = toMenu
  settingsPanel.onChange = (s) => {
    settings = s
    applySettings(s)
    saveSettings(s)
  }
  settingsPanel.onClose = () => settingsPanel.hide()
  /** The only way a draft opens: its cards are rolled once here and stay
   *  cached on the world until the pick. An empty roll clears the pending
   *  levels instead of freezing the run. */
  function openDraft(): void {
    if (world.rollDraft() === 0) {
      world.pendingLevelUps = 0
      world.paused = false
      modal.close()
      return
    }
    world.paused = true
    modal.open(world.draftCards)
    feel.draftOpened()
    levelFlash = 1
  }
  function pickPerk(perkId: string): void {
    world.choosePerk(perkId)
    world.pendingLevelUps--
    feel.cardPicked()
    if (world.pendingLevelUps > 0) openDraft()
    // A chained draft that rolled empty cleared pendingLevelUps, so it resumes here too.
    if (world.pendingLevelUps > 0) return
    modal.close()
    world.paused = false
    world.resumeFromDraft()
    input.cancelDashPress()
    feel.time.play(TimePreset.Resume)
  }
  modal.onPick = pickPerk

  // --- layout (screen-dependent only; the arena/ichor are fixed-size) ---
  function layout(): void {
    const w = app.screen.width
    const h = app.screen.height
    const insets = getInsets()
    camera.resize(w, h)
    feel.shake.resize(w, h)
    hud.layout(w, h, insets)
    input.touch.layoutDash(w, h, insets)
    debug?.layout(insets)
    touchHint.layout(w, h, insets, input.touch.dashX, input.touch.dashY)
    vignette.resize(w, h)
    backdrop.layout(w, h)
    modal.setScreen(w, h)
    mainMenu.layout(w, h)
    gameOver.layout(w, h)
    settingsPanel.layout(w, h)
    leaderboard.layout(w, h)
    // Pin the bloom to the visible window (not the whole 2800x1900 arena).
    layers.scene.filterArea = new Rectangle(0, 0, w, h)
    hurtOverlay.clear()
    hurtOverlay.rect(0, 0, w, h).fill(COLORS.hurtFlash)
    flashOverlay.clear()
    flashOverlay.rect(0, 0, w, h).fill(0xeafff6)
    // Idle the player at world center so the menu has a live arena behind it.
    if (screen === 'menu') player.spawn(arena.bounds.x + arena.bounds.w / 2, arena.bounds.y + arena.bounds.h / 2)
  }
  layout()
  toMenu()
  // Bind to the renderer's own resize event (authoritative: it fires exactly when
  // `resizeTo: window` updates app.screen) plus window events as a backstop.
  app.renderer.on('resize', layout)
  window.addEventListener('resize', layout)
  window.addEventListener('orientationchange', layout)

  // Native shell glue (no-ops on web).
  void initNative()
  registerBackButton(() => {
    // Dismiss the topmost overlay first: back must never exit the app while
    // something closable is open (Android store-review expectation).
    if (dismissNamePrompt()) return true
    if (settingsPanel.isOpen()) {
      settingsPanel.hide()
      return true
    }
    if (modal.isOpen()) return true // swallow back while choosing a perk
    if (screen !== 'menu') {
      toMenu()
      return true
    }
    return false // already at the menu -> let the OS exit the app
  })

  window.addEventListener('keydown', (e) => {
    // Typing in a real text field (the leaderboard name prompt) must never be
    // read as game input: 'r' would restart, Enter would start a run.
    const tgt = e.target as HTMLElement | null
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
    if (modal.isOpen()) {
      if (e.key === '1') modal.pickByIndex(0)
      else if (e.key === '2') modal.pickByIndex(1)
      else if (e.key === '3') modal.pickByIndex(2)
      return
    }
    if (debug && e.key === '`') {
      debug.toggle()
    } else if (screen === 'playing') {
      if (e.key === 'Escape') toMenu()
      else if (e.key === 'r' || e.key === 'R') startRun(world.mode)
    } else if (screen === 'gameover') {
      if (e.key === 'Enter' && gameOver.acceptsInput()) startRun(world.mode)
      else if (e.key === 'Escape') toMenu()
    } else if (screen === 'menu' && e.key === 'Enter' && !settingsPanel.isOpen()) {
      startRun('endless')
    }
  })

  /** Follow the ship (interpolated position, or the sim position on a seed). */
  function followCamera(fd: number, seed = false): void {
    const playing = screen === 'playing'
    const touchPortrait = playing && input.lastType === 'touch' && app.screen.height > app.screen.width
    const boss = playing && world.bossAlive && world.boss ? world.boss : null
    const sx = seed ? player.x : player.view.x
    const sy = seed ? player.y : player.view.y
    camera.update(fd, sx, sy, playing ? input.aimDir.x : 0, playing ? input.aimDir.y : 0, touchPortrait, boss, world.arena.bounds)
  }

  function sweepPools(): void {
    world.enemies.sweep()
    world.projectiles.sweep()
    world.enemyProjectiles.sweep()
    world.particles.sweep()
    world.pickups.sweep()
    world.acid.sweep()
  }

  // One fixed simulation step (extracted so dev tooling can drive it).
  function stepSim(dt: number): void {
    if (screen !== 'playing' || world.paused) return
    if (world.pendingGameOver) {
      // Death sequence: the swarm keeps moving over the wreck while time,
      // kills and level stay frozen. Particles keep integrating so debris
      // settles instead of hanging in the air.
      buildEnemyHash(world)
      aiSystem(world, dt)
      particleSystem(world, dt)
      sweepPools()
      return
    }

    world.time += dt
    // Aim is cursor-relative to the player's SCREEN position, using the camera
    // from the last rendered frame (exactly what the player saw and aimed at).
    // The camera itself is recomputed each render from the interpolated position.
    input.update(camera.worldToScreenX(player.x), camera.worldToScreenY(player.y))
    directorTick(world, dt)
    buildEnemyHash(world)
    aiSystem(world, dt)
    dashSystem(world, input, dt)
    weaponSystem(world, dt, input)
    projectileSystem(world, dt)
    enemyProjectileSystem(world, dt)
    pickupSystem(world, dt)
    collisionSystem(world, dt)
    acidSystem(world, dt)
    particleSystem(world, dt)
    player.update(dt, input.move, input.aimDir, arena.bounds, world.mods.moveSpeedMul, world.pullX, world.pullY)
    if (player.hp > 0 && world.mods.regenPerSec > 0) {
      player.hp = Math.min(player.maxHp, player.hp + world.mods.regenPerSec * dt)
    }

    sweepPools()

    // Hand-off: a level earned this tick opens the draft (death outranks it, so
    // a pick is never applied posthumously).
    if (world.pendingLevelUps > 0 && !world.pendingGameOver) openDraft()
  }

  // Leaving the death sequence early: a fresh tap after the skip beat, or the
  // app going to the background, goes straight to the recap.
  app.canvas.addEventListener('pointerdown', () => {
    if (screen === 'playing' && world.pendingGameOver && feel.time.deathMs >= DEATH_SKIP_MS) endRun()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return
    if (screen === 'playing' && world.pendingGameOver) endRun()
    void flushStorage()
  })
  onAppPause(() => void flushStorage())

  let warpAmt = 0
  // Ambient render clock: advanced by the CLAMPED render delta (never lurches
  // after a backgrounded tab), decoupled from the sim accumulator so backdrop
  // motion can't judder against the fixed step or feed the sim.
  let renderClock = 0
  const loop = new GameLoop(
    FIXED_DT,
    MAX_FRAME_TIME,
    stepSim,
    (alpha) => {
      const fd = loop.frameMs / 1000
      renderClock += fd

      // Time effects run on the render clock: they scale how fast real time
      // feeds the sim, never the sim step itself.
      const time = feel.time
      time.advance(loop.frameMs)
      feel.drain(renderClock * 1000, camera)
      if (screen === 'playing' && world.pendingGameOver) {
        time.startDeath()
        if (!deathBeat && time.deathMs >= DEATH_BEAT_MS) {
          deathBeat = true
          camera.hold = 0.25
          postFX.shiftSaturation(-0.6)
          vignette.view.alpha = 0.85
        }
        if (time.deathMs >= DEATH_RECAP_MS) endRun()
      }
      loop.timeScale = time.scale(world.paused)
      const playing = screen === 'playing'

      if (playing && showGemHint && world.firstGemAt >= 0) {
        showGemHint = false
        numbers.label('COLLECT FOR XP', world.firstGemX, world.firstGemY - 18, COLORS.gem)
        saveJSON('seenGemHint', true)
      }

      renderEntities(world, alpha)
      player.render(alpha)
      // i-frames: the ship blinks at 15 Hz.
      player.view.alpha = player.invuln > 0 && (Math.floor(renderClock * 30) & 1) === 1 ? 0.35 : 1
      ichor.flush()

      // Touch UI (sticks + DASH) on touch devices until a mouse or pad takes
      // over; hidden while a draft pauses the run.
      const touchUI = playing && !world.paused && (input.lastType === 'touch' || (isTouchDevice && !input.hasPointer && input.lastType !== 'gamepad'))
      input.touch.view.visible = touchUI
      if (touchUI) {
        const maxCharges = world.maxDashCharges
        const cd = DASH.cooldown * world.mods.dashCooldownMul
        input.touch.updateDash(world.dashCharges, maxCharges, world.dashCharges < maxCharges ? 1 - world.dashRecharge / cd : 1, fd)
      }
      const showCrosshair = playing && input.lastType === 'kbm' && input.hasPointer
      crosshair.visible = showCrosshair
      if (showCrosshair) crosshair.position.set(input.pointerX, input.pointerY)

      hud.view.visible = playing
      if (playing) hud.update(world, fd)

      if ((!world.paused || !playing) && modal.isOpen()) modal.close()

      // Touch onboarding: show the dual-stick guide on touch until both sticks
      // have been used once (then remember it, forever). Each side fades on use.
      if (playing) {
        if (input.touch.moving) touchMoveUsed = true
        if (input.touch.aiming) touchAimUsed = true
        if (touchMoveUsed && touchAimUsed && !touchLearned) {
          touchLearned = true
          saveJSON('seenTouchControls', true)
        }
      }
      const showTouchHint = playing && isTouchDevice && !input.hasPointer && !touchLearned && !world.bossAlive
      touchHint.view.visible = showTouchHint
      if (showTouchHint) touchHint.update(fd, touchMoveUsed, touchAimUsed)

      // Hurt vignette + a low-HP danger pulse so you feel the pressure.
      feel.update(fd, playing)
      let red = feel.hurtFlash * 0.45
      if (playing) {
        const frac = world.player.hp / world.player.maxHp
        if (frac < 0.32) {
          const t = performance.now() / 1000
          red = Math.max(red, (1 - frac / 0.32) * (0.12 + Math.sin(t * 7) * 0.06))
        }
      }
      hurtOverlay.alpha = playing ? red : 0

      // Level-up flash.
      levelFlash = Math.max(0, levelFlash - fd * 3.5)
      flashOverlay.alpha = levelFlash * 0.4

      // Follow camera (from the interpolated player position) + shake, onto the
      // world and the unbloomed number overlay alike.
      const sh = feel.shake
      sh.update(fd, renderClock)
      followCamera(fd)
      camera.apply(camLayers, sh.offsetX * shakeMul, sh.offsetY * shakeMul, sh.rotation * shakeMul)
      numbers.update(renderClock * 1000, camera.zoom)
      tweens.update(renderClock * 1000)

      // Ambient backdrop (motes + atmosphere). AFTER the camera write above, so
      // camera-bounded mote recycling uses this frame's window (no edge popping).
      backdrop.update(renderClock, fd, camera.x, camera.y, camera.w, camera.h)

      // Reality-warp distortion: scale/rotate around the player, inside the
      // bloomed scene (so the filter never sits on a transformed container).
      const warpTarget = playing && world.warperActive ? 1 : 0
      warpAmt += (warpTarget - warpAmt) * Math.min(1, fd * 4)
      const now = performance.now() / 1000
      const wh = layers.warpHost
      // pivot == position so scale/rotation orbit the player while leaving the
      // content otherwise in place (the offsets cancel at scale 1 / rotation 0).
      wh.pivot.set(player.view.x, player.view.y)
      wh.position.set(player.view.x, player.view.y)
      wh.scale.set(1 + Math.sin(now * 6) * 0.02 * warpAmt)
      wh.rotation = Math.sin(now * 1.3) * 0.012 * warpAmt

      // Adaptive music.
      audio.intensity = playing ? Math.min(1, world.enemies.size / 120 + (world.bossAlive ? 0.4 : 0)) : 0.12
      audio.updateMusic()

      if (debug) {
        debug.update({
          fps: loop.fps,
          frameMs: loop.frameMs,
          p95: loop.p95(),
          maxMs: loop.maxMs,
          longFrames: loop.longFrames,
          badFrames: loop.badFrames,
          totalFrames: loop.totalFrames,
          steps: loop.steps,
          enemies: world.enemies.size,
          projectiles: world.projectiles.size + world.enemyProjectiles.size,
          particles: world.particles.size + world.pickups.size + world.acid.size,
          inputType: input.lastType,
          firing: input.firing,
          width: Math.round(app.screen.width),
          height: Math.round(app.screen.height),
          dpr: app.renderer.resolution,
          seed: world.seed,
        })
      }

      app.render()
    },
  )

  // Warm the GPU paths Pixi otherwise builds on FIRST use mid-combat: the
  // additive-blend batch pipeline (first spark/muzzle flash), the number atlas
  // (first damage number) and the Text rasterizer in both faces (first label).
  // Warming them here keeps them from landing as an in-run hitch.
  // Sprite textures themselves are already GPU-resident (baked at boot).
  {
    const warm = new Container()
    warm.position.set(-4000, -4000)
    warm.alpha = 0.001
    const plain = texReg.makeSprite('swarmer')
    plain.visible = true
    const additive = texReg.makeSprite('particle')
    additive.visible = true
    additive.blendMode = 'add'
    additive.x = 24
    const digit = new Sprite(numGlyphs().tex[48]!)
    digit.x = 48
    const mono = new Text({ text: 'SWARM 0123', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 16 } })
    mono.y = 24
    const display = new Text({ text: 'SWARM', style: { fontFamily: FONT.display, fontWeight: '900', fontSize: 16 } })
    display.y = 48
    warm.addChild(plain, additive, digit, mono, display)
    app.stage.addChild(warm)
    app.render()
    app.stage.removeChild(warm)
    warm.destroy({ children: true })
  }

  loop.start()

  if (import.meta.env.DEV) {
    ;(window as unknown as { __SWARM: unknown }).__SWARM = {
      world,
      app,
      audio,
      input,
      feel,
      hud,
      loop,
      camera,
      numbers,
      perfReset: () => loop.resetStats(),
      leaderboard,
      toLeaderboard: () => toLeaderboard(),
      touchHint,
      setGlow: (v: number) => postFX.setIntensity(v),
      get screen() {
        return screen
      },
      startRun: (mode: RunMode) => startRun(mode),
      endRun: () => endRun(),
      pickPerk: (id: string) => pickPerk(id),
      get settings() {
        return settings
      },
      setLoadout: (charId: string, arenaId: string) => {
        grant(charId)
        grant(arenaId)
        selCharId = charId
        selArenaId = arenaId
        refreshLoadoutUI()
      },
      step: (n = 60) => {
        for (let i = 0; i < n; i++) stepSim(FIXED_DT)
      },
      flood: (n: number) => debugFloodSwarmers(world, n),
      jumpTo: (t: number) => directorJumpTo(world, t),
      spawn: (id: string, n = 1) => {
        const b = world.arena.bounds
        const rng = world.rngs.spawn
        for (let i = 0; i < n; i++) spawnEnemy(world, id, b.x + rng.float() * b.w, b.y + rng.float() * b.h)
      },
      addXp: (n: number) => world.addXp(n),
      give: (id: string) => world.equipWeapon(id),
    }
  }
}

// DEV-only testing affordance. In prod this shipped as a cheat door: ?seed=X
// applied to DAILY runs too, letting a practiced seed onto the daily board.
const SEED_OVERRIDE = import.meta.env.DEV ? new URLSearchParams(location.search).get('seed') : null
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function runSeed(mode: RunMode): number {
  if (SEED_OVERRIDE) {
    const n = Number(SEED_OVERRIDE)
    return Number.isFinite(n) ? n >>> 0 : seedFromString(SEED_OVERRIDE)
  }
  if (mode === 'daily') return seedFromString('swarmgeddon:' + todayStr())
  return (performance.now() * 1000) >>> 0 || DEFAULT_SEED
}

function makeDecor(rng: Rng, count: number): DecorSpeck[] {
  const out: DecorSpeck[] = []
  for (let i = 0; i < count; i++) {
    out.push({ nx: rng.float(), ny: rng.float(), r: rng.range(1, 3.5), alpha: rng.range(0.03, 0.1) })
  }
  return out
}

function buildCrosshair(): Container {
  const c = new Container()
  const g = new Graphics()
  const col = COLORS.crosshair
  g.circle(0, 0, 10).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(-14, 0).lineTo(-5, 0).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(5, 0).lineTo(14, 0).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(0, -14).lineTo(0, -5).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(0, 5).lineTo(0, 14).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.circle(0, 0, 1.5).fill(col)
  c.addChild(g)
  c.visible = false
  return c
}

boot().catch((err) => {
  console.error('SWARMGEDDON failed to boot:', err)
  // Safari stacks omit the message line, so print String(err) FIRST, then the
  // stack, plus a GPU capability probe: enough to diagnose from a screenshot.
  let gl = 'gl-probe: '
  try {
    const c = document.createElement('canvas')
    gl += `webgl2=${!!c.getContext('webgl2')} webgl=${!!c.getContext('webgl')} gpu=${'gpu' in navigator}`
  } catch (e) {
    gl += 'probe-failed: ' + String(e)
  }
  document.body.innerHTML =
    '<pre style="color:#ff6b6b;font:13px monospace;padding:44px 20px;white-space:pre-wrap;">' +
    'SWARMGEDDON failed to boot:\n\n' +
    String(err) + '\n\n' + gl + '\n\n' +
    String(err && (err as Error).stack ? (err as Error).stack : '') +
    '</pre>'
})
