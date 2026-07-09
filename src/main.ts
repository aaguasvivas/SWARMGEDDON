import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS, DEFAULT_SEED, FIXED_DT, MAX_FRAME_TIME } from './config.ts'
import { clamp } from './core/vec.ts'
import { GameLoop } from './core/time.ts'
import { Rng, seedFromString } from './core/rng.ts'
import { initSafeArea, getInsets } from './platform/safeArea.ts'
import { buzz, setHapticsEnabled } from './platform/haptics.ts'
import { initNative, registerBackButton } from './platform/native.ts'
import { createRenderer } from './render/app.ts'
import { TextureRegistry } from './render/textures.ts'
import { IchorLayer } from './render/ichorLayer.ts'
import { renderEntities } from './render/entityRenderer.ts'
import { PostFX } from './render/postfx.ts'
import { Vignette } from './render/vignette.ts'
import { BackdropSystem } from './render/backdrop.ts'
import { AudioEngine } from './audio/audio.ts'
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
import { loadJSON, saveJSON } from './platform/storage.ts'
import { loadSettings, saveSettings, type Settings } from './state/settings.ts'
import { recordRun, recordWorldBest, loadWorldBest, type RunResult } from './state/persistence.ts'
import { shareRunCard } from './share/shareCard.ts'
import { flushUpdatePrompt, setupUpdatePrompt } from './pwa/updatePrompt.ts'
import { CHARACTERS, DEFAULT_CHARACTER_ID, characterById } from './content/characters.ts'
import { ARENAS, DEFAULT_ARENA_ID, arenaById } from './content/arenas.ts'
import { evaluateUnlocks, grant, isUnlocked } from './state/unlocks.ts'
import { spawnSystem, spawnEnemy, debugFloodSwarmers } from './systems/spawn.ts'
import { aiSystem, buildEnemyHash } from './systems/ai.ts'
import { weaponSystem } from './systems/weapons.ts'
import { projectileSystem, enemyProjectileSystem } from './systems/projectiles.ts'
import { pickupSystem } from './systems/pickups.ts'
import { collisionSystem } from './systems/collision.ts'
import { acidSystem } from './systems/acid.ts'
import { particleSystem } from './systems/particles.ts'

type Screen = 'menu' | 'playing' | 'gameover' | 'leaderboard'

/**
 * Phase 3 bootstrap + game state machine. boot -> menu -> playing -> gameover.
 * Wires modes (Endless / Daily), persistence, audio, settings, the level-up
 * draft, and the reality-warp distortion onto the combat core.
 */
async function boot(): Promise<void> {
  initSafeArea()
  const mount = document.getElementById('app')
  if (!mount) throw new Error('#app mount not found')

  const { app, layers } = await createRenderer(mount)

  const texReg = new TextureRegistry(app.renderer)
  texReg.bakePlaceholders()

  const audio = new AudioEngine()
  audio.attachUnlock()

  // Cosmetic RNG (stable, boot-time) for decor + ichor splats; sim RNG is
  // reseeded per run inside World.beginRun for daily determinism.
  const cosmetic = new Rng(seedFromString('swarmgeddon:decor'))
  const sim = new Rng(DEFAULT_SEED)

  const arena = new Arena()
  arena.setDecor(makeDecor(cosmetic, 220)) // more specks for the bigger world
  arena.build() // fixed world — drawn once
  layers.floor.addChild(arena.view)

  const ichor = new IchorLayer(app.renderer, cosmetic)
  ichor.resize(arena.bounds.w, arena.bounds.h, arena.bounds.x, arena.bounds.y) // once; arena is fixed
  layers.ichor.addChild(ichor.view)

  const player = new Player()
  const world = new World(sim, arena, player, ichor, audio, layers, texReg)
  layers.warpHost.addChild(player.view) // above the swarm, inside the warped/bloomed scene

  // Bloom + grade over the game scene (UI stays crisp & unbloomed). On `scene`
  // (identity vs the camera-translated `world`); filterArea is pinned to the
  // screen in layout() so the filter only processes the visible window.
  const postFX = new PostFX(layers.scene)

  const input = new InputManager(app.canvas)
  input.setEnabled(false)
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
  // Dev instrument only — null in prod so the class, its per-frame update, and
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
  }
  applySettings(settings)

  // --- state machine ---
  let screen: Screen = 'menu'
  let lastResult: RunResult | null = null
  let submitToken = 0

  // Register the SW + "new version" toast — but never mid-run ("Update"
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
    // Two SHORT lines (pilot, then arena) — a single run-on line wraps
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
    backdrop.setTheme(theme) // motes/atmosphere/grade/vignette to match the world
    applyCamera(player.x, player.y) // seed the camera before the first sim step
    hud.reset() // don't let last run's dying bars sweep across the fresh run
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
    const isHigh = recordRun(result)
    const gains = recordWorldBest(result) // per-world best time / most kills
    gameOver.show(result, isHigh, gains)
    // Earned unlocks: banner them and refresh the menu selectors.
    const fresh = evaluateUnlocks(result)
    if (fresh.length > 0) {
      gameOver.setUnlocks(fresh)
      refreshLoadoutUI()
    }
    screen = 'gameover'
    input.setEnabled(false)
    buzz(150)
    input.rumble(320, 0.9)
    // Submit to the global leaderboard (no-op if unconfigured). The token pins
    // the async response to THIS run — a slow response from run N must never
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
    gameOver.hide()
    settingsPanel.hide()
    leaderboard.hide()
    refreshLoadoutUI() // re-read the selected world's best (a run may have set one)
    mainMenu.refresh(todayStr())
    mainMenu.show()
    // Reset the whole presentation to the hive home base — the menu idles a live
    // arena behind it (see the player.spawn at world center), so music, floor
    // theme, and ichor tints must AGREE, not show the last world with hive music.
    const home = arenaById(DEFAULT_ARENA_ID)
    world.arenaTheme = home
    arena.setTheme(home)
    ichor.stampTintA = home.ichorA
    ichor.stampTintB = home.ichorB
    audio.setTheme(home.music)
    backdrop.setTheme(home)
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
  modal.onPick = (perkId) => {
    world.choosePerk(perkId)
    world.pendingLevelUps--
    buzz(20)
    if (world.pendingLevelUps > 0) modal.open(world.draftPerks())
    else {
      modal.close()
      world.paused = false
    }
  }

  // --- layout (screen-dependent only; the arena/ichor are fixed-size) ---
  function layout(): void {
    const w = app.screen.width
    const h = app.screen.height
    const insets = getInsets()
    world.viewW = w
    world.viewH = h
    hud.layout(w, h, insets)
    debug?.layout(insets)
    touchHint.layout(w, h, insets)
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
  // Bind to the renderer's own resize event (authoritative — fires exactly when
  // `resizeTo: window` updates app.screen) plus window events as a backstop.
  app.renderer.on('resize', layout)
  window.addEventListener('resize', layout)
  window.addEventListener('orientationchange', layout)

  // Native shell glue (no-ops on web).
  void initNative()
  registerBackButton(() => {
    // Dismiss the topmost overlay first — back must never exit the app while
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
    // read as game input — 'r' would restart, Enter would start a run.
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
      if (e.key === 'Enter') startRun(world.mode)
      else if (e.key === 'Escape') toMenu()
    } else if (screen === 'menu' && e.key === 'Enter' && !settingsPanel.isOpen()) {
      startRun('endless')
    }
  })

  // Follow camera: center on (px,py), clamped so we never show past the world
  // wall. Writes world.camX/camY (world-space top-left of the visible window).
  function applyCamera(px: number, py: number): void {
    const b = world.arena.bounds
    const w = world.viewW
    const h = world.viewH
    world.camX = b.w <= w ? b.x - (w - b.w) / 2 : clamp(px - w / 2, b.x, b.x + b.w - w)
    world.camY = b.h <= h ? b.y - (h - b.h) / 2 : clamp(py - h / 2, b.y, b.y + b.h - h)
  }

  // One fixed simulation step (extracted so dev tooling can drive it).
  function stepSim(dt: number): void {
    if (screen !== 'playing' || world.paused) return
    // Death outranks a level-up earned on the same tick — otherwise the perk
    // draft opens over a corpse and the pick is applied posthumously.
    if (world.pendingLevelUps > 0 && !world.pendingGameOver) {
      world.paused = true
      return
    }
    const j = world.juice
    if (j.hitstop > 0) {
      j.hitstop -= dt
      if (j.hitstop <= 0 && world.pendingGameOver) endRun()
      return
    }

    world.time += dt
    // Aim is cursor-relative to the player's SCREEN position, using the camera
    // from the last rendered frame (exactly what the player saw and aimed at).
    // The camera itself is recomputed each render from the interpolated position.
    input.update(player.x - world.camX, player.y - world.camY)
    spawnSystem(world, dt)
    buildEnemyHash(world)
    aiSystem(world, dt)
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

    world.enemies.sweep()
    world.projectiles.sweep()
    world.enemyProjectiles.sweep()
    world.particles.sweep()
    world.floaters.sweep()
    world.pickups.sweep()
    world.acid.sweep()
  }

  let warpAmt = 0
  let levelFlash = 0
  let prevHurt = 0
  // Ambient render clock: advanced by the CLAMPED render delta (never lurches
  // after a backgrounded tab), decoupled from the sim accumulator so backdrop
  // motion can't judder against the fixed step or feed the sim.
  let renderClock = 0
  const loop = new GameLoop(
    FIXED_DT,
    MAX_FRAME_TIME,
    stepSim,
    (alpha) => {
      const playing = screen === 'playing'
      const fd = loop.frameMs / 1000
      renderClock += fd
      renderEntities(world, alpha)
      player.render(alpha)
      ichor.flush()

      input.touch.view.visible = playing && input.lastType === 'touch'
      const showCrosshair = playing && input.lastType === 'kbm' && input.hasPointer
      crosshair.visible = showCrosshair
      if (showCrosshair) crosshair.position.set(input.pointerX, input.pointerY)

      hud.view.visible = playing
      if (playing) hud.update(world, fd)

      // Level-up modal lifecycle.
      if (playing && world.paused && world.pendingLevelUps > 0 && !world.pendingGameOver && !modal.isOpen()) {
        const draft = world.draftPerks()
        if (draft.length === 0) {
          world.pendingLevelUps = 0
          world.paused = false
        } else {
          modal.open(draft)
          buzz(30)
          input.rumble(90, 0.4)
          levelFlash = 1
        }
      }
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
      const showTouchHint = playing && isTouchDevice && !input.hasPointer && !touchLearned
      touchHint.view.visible = showTouchHint
      if (showTouchHint) touchHint.update(fd, touchMoveUsed, touchAimUsed)

      // Rumble on a discrete hit (hurtFlash jumps); contact's gradual drain won't trigger.
      if (playing && world.hurtFlash - prevHurt > 0.15) input.rumble(120, 0.5)
      prevHurt = world.hurtFlash
      world.hurtFlash = Math.max(0, world.hurtFlash - fd * 2.2)

      // Hurt vignette + a low-HP danger pulse so you feel the pressure.
      let red = world.hurtFlash * 0.45
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

      // Follow camera (smooth, from the interpolated player position) + shake.
      world.juice.updateShake(fd)
      applyCamera(player.view.x, player.view.y)
      layers.world.position.set(
        -world.camX + world.juice.offsetX * shakeMul,
        -world.camY + world.juice.offsetY * shakeMul,
      )

      // Ambient backdrop (motes + atmosphere). AFTER the camera write above, so
      // camera-bounded mote recycling uses this frame's window (no edge popping).
      backdrop.update(renderClock, fd, world.camX, world.camY, world.viewW, world.viewH)

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
          particles: world.particles.size + world.floaters.size + world.pickups.size + world.acid.size,
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

  // Warm the GPU paths Pixi otherwise builds on FIRST use mid-combat — the
  // additive-blend batch pipeline (first spark/muzzle flash) and the Text
  // rasterizer (first damage number) — so they never land as an in-run hitch.
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
    const text = new Text({ text: '0123456789!', style: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 14 } })
    text.y = 24
    warm.addChild(plain, additive, text)
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
      hud,
      loop,
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
      spawn: (id: string, n = 1) => {
        const b = world.arena.bounds
        for (let i = 0; i < n; i++) spawnEnemy(world, id, b.x + world.rng.float() * b.w, b.y + world.rng.float() * b.h)
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
  document.body.innerHTML =
    '<pre style="color:#ff6b6b;font:14px monospace;padding:20px;white-space:pre-wrap;">' +
    'SWARMGEDDON failed to boot:\n\n' +
    String(err && (err as Error).stack ? (err as Error).stack : err) +
    '</pre>'
})
