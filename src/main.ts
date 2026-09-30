import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import { COLORS, DASH, DEFAULT_SEED, FIXED_DT, MAX_FRAME_TIME } from './config.ts'
import { GameLoop } from './core/time.ts'
import { Rng } from './core/rng.ts'
import { seedFromString } from './core/rules.ts'
import { initSafeArea, getInsets } from './platform/safeArea.ts'
import { setHapticsEnabled } from './platform/haptics.ts'
import { initNative, onAppPause, registerBackButton } from './platform/native.ts'
import { createRenderer } from './render/app.ts'
import { Camera } from './render/camera.ts'
import { loadFonts } from './render/fonts.ts'
import { TextureRegistry } from './render/textures.ts'
import { IchorLayer } from './render/ichorLayer.ts'
import { PodRings, renderEntities } from './render/entityRenderer.ts'
import { HazardRenderer } from './render/hazardRenderer.ts'
import { EliteTags } from './render/eliteTags.ts'
import { EmergeFx } from './render/emergeFx.ts'
import { PostFX } from './render/postfx.ts'
import { Vignette } from './render/vignette.ts'
import { BackdropSystem } from './render/backdrop.ts'
import { AudioEngine } from './audio/audio.ts'
import { DamageNumbers } from './effects/damageNumbers.ts'
import { FeelDirector } from './effects/feelDirector.ts'
import { ScreenFx } from './effects/screenFx.ts'
import { DEATH_BEAT_MS, DEATH_RECAP_MS, DEATH_SKIP_MS, TimePreset } from './effects/timeDirector.ts'
import { Arena, type DecorSpeck } from './game/arena.ts'
import { Player } from './game/player.ts'
import { World, type RunMode } from './game/world.ts'
import { InputManager } from './input/input.ts'
import { DebugOverlay } from './ui/debugOverlay.ts'
import { Hud } from './ui/hud.ts'
import { Callouts } from './ui/callouts.ts'
import { OffscreenArrows } from './ui/offscreenArrows.ts'
import { LevelUpModal } from './ui/levelupModal.ts'
import { MainMenu } from './ui/mainMenu.ts'
import { GameOver } from './ui/gameOver.ts'
import { WinPanel } from './ui/winPanel.ts'
import { SettingsPanel } from './ui/settingsPanel.ts'
import { Leaderboard } from './ui/leaderboard.ts'
import { dismissNamePrompt } from './ui/namePrompt.ts'
import { submitScore } from './net/leaderboard.ts'
import { TouchHint } from './ui/touchHint.ts'
import { Toast } from './ui/toast.ts'
import { bakeIcons } from './ui/icons.ts'
import { FONT, INK, T } from './ui/tokens.ts'
import { tweens } from './ui/tween.ts'
import { numGlyphs } from './ui/digits.ts'
import { flushStorage, initStorage, loadJSON, saveJSON } from './platform/storage.ts'
import { loadSettings, saveSettings, type Settings } from './state/settings.ts'
import { recordWorldBest, loadWorldBest } from './state/persistence.ts'
import { buildRunResult, type RunEnd, type RunResult } from './state/runResult.ts'
import { updateLifetime } from './state/stats.ts'
import { evaluateFeats } from './state/feats.ts'
import { migrateSave } from './state/migrate.ts'
import { shareRunCard } from './share/shareCard.ts'
import { flushUpdatePrompt, setupUpdatePrompt } from './pwa/updatePrompt.ts'
import { CHARACTERS, DEFAULT_CHARACTER_ID, characterById, type CharacterDef } from './content/characters.ts'
import { ARENAS, DEFAULT_ARENA_ID, arenaById } from './content/arenas.ts'
import { FEATS, featForReward, validateFeats } from './content/feats.ts'
import { FACTORY_PAINT_ID, paintById, type PaintDef } from './content/paints.ts'
import { WEAPONS } from './content/weapons.ts'
import { grant, isOwned, ownedPaintIds, resolvePools } from './state/unlocks.ts'
import { spawnEnemy, debugFloodSwarmers } from './systems/spawn.ts'
import { clampPlayerToCage, directorJumpTo, directorTick } from './systems/director.ts'
import { hazardsTick } from './systems/hazards.ts'
import { aiSystem, buildEnemyHash } from './systems/ai.ts'
import { weaponSystem } from './systems/weapons.ts'
import { projectileSystem, enemyProjectileSystem } from './systems/projectiles.ts'
import { pickupSystem } from './systems/pickups.ts'
import { collisionSystem } from './systems/collision.ts'
import { acidSystem } from './systems/acid.ts'
import { dashSystem } from './systems/dash.ts'
import { healPlayer, playerSpeedMul } from './systems/damage.ts'
import { banishCard, canReroll, draftDue, openDraft as dealDraft, pickCard, pickPerkId, rerollDraft, skipDraft } from './systems/draft.ts'
import { scoreStep } from './game/scoring.ts'
import { particleSystem } from './systems/particles.ts'

type Screen = 'menu' | 'playing' | 'gameover' | 'leaderboard'
/** A discrete hit tints the ship this color for FeelDirector.shipFlash (section 6.5). */
const SHIP_HURT_TINT = 0xff6a6a
/** Elite tags keep this many screen px below the HUD rows. */
const TAG_HUD_GAP = 6
/** The touch-hint banner's center: below the chip and badge row in portrait; in
 *  landscape below the plate, between the chip and the badge. */
const HINT_BELOW_ROW_P = 20
const HINT_BELOW_PLATE_L = 28
/** Where the player goes once a run is recorded. */
type AfterRun = 'recap' | 'menu' | 'retry'

/**
 * Phase 3 bootstrap + game state machine. boot -> menu -> playing -> gameover.
 * Wires modes (Endless / Daily), persistence, audio, settings, the level-up
 * draft, and the reality-warp distortion onto the combat core.
 */
async function boot(): Promise<void> {
  await initStorage()
  const featErrors = validateFeats()
  if (featErrors.length > 0) throw new Error('feat table: ' + featErrors.join('; '))
  const welcome = migrateSave(todayStr())
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
  texReg.bakeHazards()
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
  const hazardView = new HazardRenderer(texReg)
  layers.ichor.addChild(hazardView.view)
  const eliteTags = new EliteTags(texReg)
  layers.ichor.addChild(eliteTags.rings)
  const emerge = new EmergeFx(texReg)
  const podRings = new PodRings()
  layers.fx.addChild(podRings.view, emerge.view)

  const player = new Player()
  const world = new World(arena, player, ichor, layers, texReg)
  // Presentation only: the sim never reads the camera.
  const camera = new Camera()
  const numbers = new DamageNumbers()
  layers.overlay.addChild(numbers.view)
  layers.overlay.addChild(eliteTags.view)
  const camLayers = [layers.world, layers.overlay] as const
  layers.warpHost.addChild(player.view) // above the swarm, inside the warped/bloomed scene

  // Bloom + grade over the game scene (UI stays crisp & unbloomed). On `scene`
  // (identity vs the camera-translated `world`); filterArea is pinned to the
  // screen in layout() so the filter only processes the visible window.
  const postFX = new PostFX(layers.scene)

  const input = new InputManager(app.canvas)
  input.setEnabled(false)
  const hud = new Hud()
  const callouts = new Callouts()
  const arrows = new OffscreenArrows()
  const feel = new FeelDirector(world, audio, numbers, callouts, arrows, hud)
  layers.overlay.addChild(feel.shipFx.view)
  const screenFx = new ScreenFx()
  const pausedLabel = buildPausedLabel()
  const vignette = new Vignette()
  // Per-world atmosphere: ambient motes (world-space) + screen-space overlay +
  // the color grade/tinted vignette. Bakes its textures once; only tints per world.
  const backdrop = new BackdropSystem(layers, postFX, vignette)
  const crosshair = buildCrosshair()
  const flashOverlay = new Graphics() // brief white pop on level-up
  const modal = new LevelUpModal()
  const mainMenu = new MainMenu()
  const gameOver = new GameOver()
  const winPanel = new WinPanel()
  const settingsPanel = new SettingsPanel()
  const leaderboard = new Leaderboard()
  const touchHint = new TouchHint()
  const toast = new Toast()
  // Dev instrument only: null in prod so the class, its per-frame update, and
  // the backtick toggle are all tree-shaken from the shipped bundle.
  const debug = import.meta.env.DEV ? new DebugOverlay() : null
  // vignette sits at the bottom of the UI (above the world, below the HUD).
  layers.ui.addChild(
    vignette.view, screenFx.view, arrows.view, hud.view, input.touch.view, flashOverlay, crosshair, callouts.view, pausedLabel,
    touchHint.view, modal.view, winPanel.view, mainMenu.view, gameOver.view, settingsPanel.view, leaderboard.view, toast.view,
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
    callouts.reduceMotion = s.reduceMotion
    camera.reduceMotion = s.reduceMotion
    tweens.reduceMotion = s.reduceMotion
    numbers.mode = s.damageNumbers
  }
  applySettings(settings)

  // --- state machine ---
  let screen: Screen = 'menu'
  /** Why the sim is paused beyond a draft: the win panel is up, or the pause button. */
  let pauseReason: 'none' | 'win' | 'pause' = 'none'
  let lastResult: RunResult | null = null
  let submitToken = 0
  /** UTC day the current run started on (a run belongs to its start date). */
  let runDate = ''
  /** Paint id the current run flies. */
  let runPaint = FACTORY_PAINT_ID

  // Register the SW + "new version" toast, but never mid-run ("Update"
  // reloads the page, which would destroy an active run). Parked toasts are
  // released by flushUpdatePrompt() on the menu/game-over transitions.
  setupUpdatePrompt(() => screen !== 'playing')

  // --- loadout selection (persisted; locked picks resolve to the default) ---
  let selCharId = loadJSON('sel:char', DEFAULT_CHARACTER_ID)
  let selArenaId = loadJSON('sel:arena', DEFAULT_ARENA_ID)
  let selPaintId = loadJSON('sel:paint', FACTORY_PAINT_ID)

  /** The selected paint while it is owned; null flies the pilot's own colors. */
  function selectedPaint(): PaintDef | null {
    const p = paintById(selPaintId)
    return p && isOwned('paint:' + p.id) ? p : null
  }

  function refreshLoadoutUI(): void {
    const c = characterById(selCharId)
    const a = arenaById(selArenaId)
    const cOpen = isOwned(c.id)
    const aOpen = isOwned(a.id)
    const paint = selectedPaint()
    // Two SHORT lines (pilot, then arena): a single run-on line wraps
    // unpredictably on phones and is hard to scan.
    const cHint = cOpen ? `${c.name}: ${c.passiveDesc}` : `🔒 ${c.name}: ${featForReward(c.id)!.desc}`
    const aHint = aOpen ? `${a.name}: vs ${a.broodName}` : `🔒 ${a.name}: ${featForReward(a.id)!.desc}`
    mainMenu.setLoadout(
      cOpen ? `▸ ${c.name}` : `🔒 ${c.name}`,
      aOpen ? `▸ ${a.name}` : `🔒 ${a.name}`,
      ownedPaintIds().length > 1 ? `▸ ${paint ? paint.name : 'FACTORY'}` : null,
      `${cHint}\n${aHint}`,
      (paint ?? c.colors).body,
    )
    // The ship idling behind the menu previews the pilot and paint.
    if (screen === 'menu') {
      const ship = cOpen ? c : characterById(DEFAULT_CHARACTER_ID)
      player.paint(paint ?? ship.colors, ship.shape)
    }
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
  mainMenu.onCyclePaint = () => {
    const ids = ownedPaintIds()
    selPaintId = ids[(ids.indexOf(selectedPaint()?.id ?? FACTORY_PAINT_ID) + 1) % ids.length]!
    saveJSON('sel:paint', selPaintId)
    refreshLoadoutUI()
  }
  refreshLoadoutUI()

  /** Resolve the effective run loadout: locked picks fall back to the default,
   *  and the Daily's arena rotates deterministically by date for everyone. */
  function resolveLoadout(mode: RunMode): { char: CharacterDef; theme: (typeof ARENAS)[number] } {
    const cSel = characterById(selCharId)
    const char = isOwned(cSel.id) ? cSel : characterById(DEFAULT_CHARACTER_ID)
    let theme = arenaById(selArenaId)
    if (!isOwned(theme.id)) theme = arenaById(DEFAULT_ARENA_ID)
    if (mode === 'daily') theme = ARENAS[seedFromString('swarmgeddon:arena:' + todayStr()) % ARENAS.length]!
    return { char, theme }
  }

  function startRun(mode: RunMode): void {
    const { char, theme } = resolveLoadout(mode)
    runDate = todayStr()
    world.beginRun(runSeed(mode), mode, char, theme)
    // Pools and paint resolve once here; a grant mid-run never changes this run.
    const pools = resolvePools(mode)
    world.perkPool = pools.perks
    world.weaponPool = pools.weapons
    const paint = selectedPaint()
    runPaint = paint ? paint.id : FACTORY_PAINT_ID
    player.paint(paint ?? char.colors, char.shape)
    world.baseBulletTint = paint ? paint.bullet : WEAPONS[char.startWeapon]!.tint
    audio.setTheme(theme.music)
    feel.reset(loadWorldBest(theme.id).score)
    deathBeat = false
    backdrop.setTheme(theme, arena.glowSpots) // motes/atmosphere/grade/vignette/glows
    camera.reset()
    followCamera(0, true) // seed the camera before the first sim step
    const daily = mode === 'daily'
    hud.reset(world, daily ? 'DAILY' : '') // don't let last run's dying bars sweep across the fresh run
    emerge.setTheme(theme)
    emerge.reset(world)
    if (daily) feel.intro('DAILY', theme.name + ' · SAME RUN FOR EVERYONE', T.accentGold, true)
    else feel.intro(theme.name, 'vs ' + theme.broodName.toUpperCase(), theme.borderGlow, false)
    pausedLabel.visible = false
    touchMoveUsed = false
    touchAimUsed = false
    screen = 'playing'
    pauseReason = 'none'
    input.setEnabled(true)
    modal.close()
    winPanel.hide()
    mainMenu.hide()
    toast.hide()
    gameOver.hide()
    settingsPanel.hide()
    leaderboard.hide()
  }

  /** Every exit from a live run comes through here (death, quit, clear,
   *  stalemate, a page closed mid-run): the run is recorded exactly once, then
   *  the player moves on to the recap, the menu or a fresh run. */
  function endRun(end: RunEnd, after: AfterRun = 'recap'): void {
    pauseReason = 'none'
    pausedLabel.visible = false
    winPanel.hide()
    // Until the Daily lifecycle exists, every Daily is ranked.
    const result = buildRunResult(world, end, { date: runDate, ranked: world.mode === 'daily', dailyNumber: 0, paint: runPaint })
    lastResult = result
    feel.time.reset()
    const lifetime = updateLifetime(result)
    const gains = recordWorldBest(result)
    const done = evaluateFeats(result, lifetime)
    if (done.length > 0) refreshLoadoutUI()
    if (after === 'menu') {
      toMenu()
      return
    }
    // A quick retry skips the recap only when the run has no news to show.
    if (after === 'retry' && done.length === 0 && !gains.score && !gains.time && !gains.kills) {
      startRun(world.mode)
      return
    }
    gameOver.show(result, gains)
    feel.runEnded(gains.score, done.length > 0)
    gameOver.setUnlocks(done)
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
    pauseReason = 'none'
    pausedLabel.visible = false
    winPanel.hide()
    input.setEnabled(false)
    feel.reset()
    camera.reset()
    deathBeat = false
    gameOver.hide()
    settingsPanel.hide()
    leaderboard.hide()
    refreshLoadoutUI() // re-read the selected world's best (a run may have set one)
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
    toast.hide()
    gameOver.hide()
    leaderboard.open()
  }

  mainMenu.onPlay = startRun
  mainMenu.onSettings = () => {
    toast.hide()
    settingsPanel.open(settings)
  }
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
   *  cached on world.draft until the pick. An empty roll clears the pending
   *  levels instead of freezing the run. Picks never chain-open: further
   *  pending levels wait for the DRAFT.minGap rule. */
  function openDraft(): void {
    if (dealDraft(world) === 0) {
      world.pendingLevelUps = 0
      world.draft.open = false
      world.paused = false
      modal.close()
      return
    }
    world.paused = true
    modal.open(world.draft, input.lastType === 'touch')
    feel.draftOpened()
    levelFlash = 1
  }
  function resumeFromDraft(): void {
    modal.close()
    world.paused = false
    world.resumeFromDraft()
    input.cancelDashPress()
    feel.time.play(TimePreset.Resume)
  }
  function takeCard(i: number): void {
    if (!world.draft.open || i < 0 || i >= world.draft.count) return
    pickCard(world, i)
    feel.cardPicked()
    resumeFromDraft()
  }
  function skipCard(): void {
    if (!world.draft.open) return
    skipDraft(world)
    resumeFromDraft()
  }
  modal.onPick = takeCard
  modal.onSkip = skipCard
  modal.onReroll = () => rerollDraft(world)
  modal.onBanish = (i) => banishCard(world, i)
  modal.canReroll = () => canReroll(world)

  /** The PRIME is dead and the purge is over: Standard asks EXTRACT or
   *  OVERTIME, the Daily ends as a clear. Pending level-ups resolve first. */
  function openWin(): void {
    if (world.mode === 'daily') {
      endRun('clear')
      return
    }
    pauseReason = 'win'
    world.paused = true
    winPanel.show(world.script.text.win, world.director.clearTime, input.lastType === 'kbm')
  }
  winPanel.onExtract = () => endRun('clear')
  winPanel.onOvertime = () => {
    winPanel.hide()
    pauseReason = 'none'
    world.startOvertime()
    world.paused = false
    world.resumeFromDraft()
    input.cancelDashPress()
    feel.time.play(TimePreset.Resume)
  }

  // --- layout (screen-dependent only; the arena/ichor are fixed-size) ---
  function layout(): void {
    const w = app.screen.width
    const h = app.screen.height
    const insets = getInsets()
    camera.resize(w, h)
    feel.shake.resize(w, h)
    hud.layout(w, h, insets, world)
    input.touch.layoutDash(w, h, insets)
    input.touch.setExclusionRect(hud.pauseRect)
    callouts.layout(w, insets.left, insets.right, hud.laneY, hud.laneScale)
    pausedLabel.position.set(insets.left + (w - insets.left - insets.right) / 2, hud.laneY)
    pausedLabel.scale.set(hud.laneScale)
    screenFx.layout(w, h)
    debug?.layout(insets)
    touchHint.layout(w, h, insets, input.touch.dashX, input.touch.dashY, hud.pillTop, h > w ? hud.rowBottom + HINT_BELOW_ROW_P : hud.topBottom + HINT_BELOW_PLATE_L)
    vignette.resize(w, h)
    backdrop.layout(w, h)
    modal.setScreen(w, h, insets)
    winPanel.layout(w, h, insets)
    mainMenu.layout(w, h)
    gameOver.layout(w, h)
    settingsPanel.layout(w, h)
    leaderboard.layout(w, h)
    toast.layout(w, insets, mainMenu.toastSlot)
    // Pin the bloom to the visible window (not the whole 2800x1900 arena).
    layers.scene.filterArea = new Rectangle(0, 0, w, h)
    flashOverlay.clear()
    flashOverlay.rect(0, 0, w, h).fill(0xeafff6)
    // Idle the player at world center so the menu has a live arena behind it.
    if (screen === 'menu') player.spawn(arena.bounds.x + arena.bounds.w / 2, arena.bounds.y + arena.bounds.h / 2)
  }
  layout()
  toMenu()
  if (welcome) toast.show(welcome, 6)
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
    if (modal.isOpen() || pauseReason === 'win') return true // swallow back while a choice is up
    if (screen === 'playing') {
      quitRun('recap')
      return true
    }
    if (screen === 'gameover' && !gameOver.acceptsInput()) return true
    if (screen !== 'menu') {
      toMenu()
      return true
    }
    return false // already at the menu -> let the OS exit the app
  })

  /** The end of a run the player leaves. runState stays 'won' from the PRIME
   *  kill until OVERTIME starts (purge, pending drafts, win panel), so any
   *  exit in that span is a clear. */
  function leaveEnd(left: 'quit' | 'interrupted'): RunEnd {
    if (world.pendingGameOver) return 'death'
    if (world.director.runState === 'won') return 'clear'
    return left
  }

  function quitRun(after: AfterRun): void {
    endRun(leaveEnd('quit'), after)
  }

  window.addEventListener('keydown', (e) => {
    // Typing in a real text field (the leaderboard name prompt) must never be
    // read as game input: 'r' would restart, Enter would start a run.
    const tgt = e.target as HTMLElement | null
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
    if (modal.isOpen()) {
      if (e.key === '1' || e.key === '2' || e.key === '3') modal.pressCard(Number(e.key) - 1)
      else if (e.key === 'r' || e.key === 'R') modal.reroll()
      else if (e.key === 'b' || e.key === 'B') modal.toggleBanish()
      else if (e.key === 'Backspace') {
        e.preventDefault()
        skipCard()
      }
      return
    }
    if (pauseReason === 'win') {
      winPanel.pressKey(e.key)
      return
    }
    if (debug && e.key === '`') {
      debug.toggle()
    } else if (screen === 'playing') {
      if (e.key === 'Escape') quitRun('recap')
      else if (e.key === 'r' || e.key === 'R') quitRun('retry')
      else if (e.key === 'p' || e.key === 'P') togglePause()
    } else if (screen === 'gameover') {
      if (e.key === 'Enter' && gameOver.acceptsInput()) startRun(world.mode)
      else if (e.key === 'Escape' && gameOver.acceptsInput()) toMenu()
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
    world.hazards.sweep()
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
    hazardsTick(world, dt)
    acidSystem(world, dt)
    scoreStep(world, dt)
    particleSystem(world, dt)
    player.update(dt, input.move, input.aimDir, arena.bounds, playerSpeedMul(world), world.pullX, world.pullY)
    clampPlayerToCage(world)
    if (world.mods.regenPerSec > 0) healPlayer(world, world.mods.regenPerSec * dt)

    sweepPools()

    // Hand-offs, in rank order: death (next tick), the stalemate, the win, then
    // a draft (DRAFT.minGap apart). A pick is never applied posthumously, and
    // level-ups earned before the win are drafted before the win panel opens.
    if (world.pendingGameOver) return
    if (world.pendingEnd) endRun('stalemate')
    else if (world.pendingWin && world.pendingLevelUps === 0) openWin()
    else if (draftDue(world)) openDraft()
  }

  /** The HUD pause button (and P): the sim holds until a tap or P. The pause
   *  sheet (section 9.4) replaces this stand-in. */
  function togglePause(): void {
    if (pauseReason === 'pause') {
      pauseReason = 'none'
      world.paused = false
      pausedLabel.visible = false
      input.setEnabled(true)
      feel.time.play(TimePreset.Resume)
      return
    }
    if (screen !== 'playing' || world.paused || world.pendingGameOver || pauseReason !== 'none') return
    pauseReason = 'pause'
    world.paused = true
    pausedLabel.visible = true
    input.setEnabled(false)
  }
  hud.onPause = togglePause

  // Leaving the death sequence early: a fresh tap after the skip beat, or the
  // app going to the background, goes straight to the recap. A tap while the
  // pause stand-in shows resumes.
  app.canvas.addEventListener('pointerdown', (e) => {
    if (screen === 'playing' && world.pendingGameOver && feel.time.deathMs >= DEATH_SKIP_MS) endRun('death')
    else if (pauseReason === 'pause' && !hud.pauseRect.contains(e.offsetX, e.offsetY)) togglePause()
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return
    if (screen === 'playing' && world.pendingGameOver) endRun('death')
    void flushStorage()
  })
  // A page closed or reloaded mid-run still records the run; after the PRIME kill it counts as EXTRACT.
  window.addEventListener('pagehide', () => {
    if (screen === 'playing') endRun(leaveEnd('interrupted'), 'menu')
    void flushStorage()
  })
  onAppPause(() => void flushStorage())

  /** The callout's screen box this frame (arrows step below it). */
  const laneBox = new Float32Array(4)
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
        if (time.deathMs >= DEATH_RECAP_MS) endRun('death')
      }
      loop.timeScale = time.scale(world.paused)
      const playing = screen === 'playing'

      if (playing && showGemHint && world.firstGemAt >= 0) {
        showGemHint = false
        numbers.label('COLLECT FOR XP', world.firstGemX, world.firstGemY, 18, COLORS.gem)
        saveJSON('seenGemHint', true)
      }

      renderEntities(world, alpha)
      hazardView.update(world, alpha)
      podRings.update(world, alpha)
      emerge.update(world, alpha)
      player.render(alpha)
      // i-frames: the ship blinks at 15 Hz; a discrete hit tints it red for a beat.
      player.view.alpha = player.invuln > 0 && (Math.floor(renderClock * 30) & 1) === 1 ? 0.35 : 1
      player.view.tint = feel.shipFlash > 0 ? SHIP_HURT_TINT : 0xffffff
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

      hud.view.visible = playing && !modal.isOpen()
      feel.update(fd, playing)
      if (playing) hud.update(world, fd, feel.pulse)

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
      const showTouchHint = playing && !world.paused && isTouchDevice && !input.hasPointer && !touchLearned && !world.bossAlive
      touchHint.view.visible = showTouchHint
      if (showTouchHint) touchHint.update(fd, touchMoveUsed, touchAimUsed)


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
      if (playing) emerge.scan(world, camera.x, camera.y, camera.w, camera.h)
      const hudTop = hud.stackBottom
      const laneShown = callouts.bounds(laneBox)
      eliteTags.update(world, playing, camera.zoom, camera.screenToWorldY(hudTop + TAG_HUD_GAP), laneShown ? laneBox : null, camera)
      const shipSX = camera.worldToScreenX(player.view.x)
      const shipSY = camera.worldToScreenY(player.view.y)
      screenFx.view.visible = playing
      if (playing) screenFx.update(feel.hurtFlash, feel.lowHp, feel.pulse, feel.edge, feel.edgeX, feel.edgeY, shipSX, shipSY)
      const cues = playing && !world.paused
      callouts.view.visible = playing && !modal.isOpen() && pauseReason === 'none'
      callouts.update(cues ? fd : 0)
      arrows.view.visible = cues
      if (cues) {
        arrows.avoid(touchUI ? input.touch.dashX : -1e4, input.touch.dashY)
        arrows.update(world, camera, app.screen.width, hudTop, hud.pillTop, laneShown ? laneBox : null, fd)
      }
      tweens.update(renderClock * 1000)
      toast.update(fd)

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
      callouts,
      arrows,
      emerge,
      loop,
      camera,
      numbers,
      togglePause: () => togglePause(),
      perfReset: () => loop.resetStats(),
      leaderboard,
      toLeaderboard: () => toLeaderboard(),
      touchHint,
      setGlow: (v: number) => postFX.setIntensity(v),
      get screen() {
        return screen
      },
      startRun: (mode: RunMode) => startRun(mode),
      endRun: (end: RunEnd = 'death', after: AfterRun = 'recap') => endRun(end, after),
      get lastResult() {
        return lastResult
      },
      pickCard: (i: number) => takeCard(i),
      reroll: () => modal.reroll(),
      banish: (i: number) => {
        if (banishCard(world, i)) modal.refresh()
      },
      skip: () => skipCard(),
      /** Harness forced pick: take perk `id` whatever the cards show. */
      forcePick: (id: string) => {
        if (!world.draft.open) return
        pickPerkId(world, id)
        resumeFromDraft()
      },
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
      /** Own every feat reward: Standard pools become the canonical ones. */
      unlockAll: () => {
        for (const f of FEATS) grant(f.reward)
        refreshLoadoutUI()
      },
      setPaint: (id: string) => {
        if (id !== FACTORY_PAINT_ID) grant('paint:' + id)
        selPaintId = id
        saveJSON('sel:paint', id)
        refreshLoadoutUI()
      },
      get runPaint() {
        return runPaint
      },
      toast,
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
      saveJSON,
      loadJSON,
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

/** Stand-in for the pause sheet: a line in the callout lane. */
function buildPausedLabel(): Container {
  const c = new Container()
  const title = new Text({ text: 'PAUSED', style: { fontFamily: FONT.display, fontWeight: '900', fontSize: 26, letterSpacing: 2, fill: T.textHi, stroke: { color: INK, width: 6, join: 'round' } } })
  title.anchor.set(0.5)
  title.y = -11
  const sub = new Text({ text: 'TAP OR PRESS P TO RESUME', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 14, fill: T.textPrimary, stroke: { color: INK, width: 5, join: 'round' } } })
  sub.anchor.set(0.5)
  sub.y = 18
  c.addChild(title, sub)
  c.visible = false
  c.eventMode = 'none'
  return c
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
