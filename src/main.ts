import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import { COLORS, DASH, DEFAULT_SEED, FIXED_DT, MAX_FRAME_TIME, PLAYER_RADIUS } from './config.ts'
import { GameLoop } from './core/time.ts'
import { Rng } from './core/rng.ts'
import { dailySpec, dayOf, seedFromString } from './core/rules.ts'
import { initSafeArea, getInsets } from './platform/safeArea.ts'
import { setHapticsEnabled } from './platform/haptics.ts'
import { initNative, registerBackButton } from './platform/native.ts'
import { onBackground } from './platform/lifecycle.ts'
import { createRenderer, makeLayers } from './render/app.ts'
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
import { World, type RunConfig, type RunMode } from './game/world.ts'
import { warmSystems } from './game/warmup.ts'
import { runSystems, sweepPools } from './game/step.ts'
import { InputManager, PAD_B, PAD_START } from './input/input.ts'
import { DebugOverlay } from './ui/debugOverlay.ts'
import { Hud } from './ui/hud.ts'
import { Callouts } from './ui/callouts.ts'
import { OffscreenArrows } from './ui/offscreenArrows.ts'
import { LevelUpModal } from './ui/levelupModal.ts'
import { MainMenu, type MenuModel } from './ui/mainMenu.ts'
import { Recap, buildRecapModel } from './ui/recap.ts'
import { PauseSheet, type PauseInfo, type PauseMark } from './ui/pauseSheet.ts'
import { buildTiles } from './ui/buildGrid.ts'
import { WinPanel } from './ui/winPanel.ts'
import { CoreReveal } from './ui/coreReveal.ts'
import { SettingsPanel } from './ui/settingsPanel.ts'
import { Leaderboard } from './ui/leaderboard.ts'
import { Records } from './ui/records.ts'
import { Hints } from './ui/hints.ts'
import type { LockInfo } from './ui/carousel.ts'
import { featProgress, featValue, nextGoals } from './ui/goalsPanel.ts'
import { dismissNamePrompt, namePromptOpen, promptName } from './ui/namePrompt.ts'
import { ConfirmSheet } from './ui/confirmSheet.ts'
import {
  deleteMyScores, getPlayerName, leaderboardEnabled, markAsked, optIn, optInState, optOut, setPlayerName, shouldAskOptIn, submitRun, willPost,
  type SubmitOutcome,
} from './net/leaderboard.ts'
import { TouchHint } from './ui/touchHint.ts'
import { Toast, type ToastSlot } from './ui/toast.ts'
import { bakeIcons } from './ui/icons.ts'
import { FONT, T } from './ui/tokens.ts'
import { tweens } from './ui/tween.ts'
import { numGlyphs } from './ui/digits.ts'
import { flushStorage, initStorage, loadJSON, saveJSON } from './platform/storage.ts'
import { loadSettings, saveSettings, type Settings } from './state/settings.ts'
import { recordWorldBest, loadWorldBest } from './state/persistence.ts'
import { buildRunResult, type RunEnd, type RunMeta, type RunResult } from './state/runResult.ts'
import {
  CHECKPOINT_EVERY_S, clearCheckpoint, holdRankedLock, loadDay, loadStreak, lostCheckpoint, markRankedStarted, postable, pruneDays,
  type DailyDayRecord, rankedAvailable, rankedRun, recordDailyEnd, releaseRankedLock, saveCheckpoint, todayUtc,
} from './state/daily.ts'
import { loadStats, updateLifetime } from './state/stats.ts'
import { evaluateFeats, loadFeats } from './state/feats.ts'
import { nearestGoals } from './state/recapGoals.ts'
import { migrateSave } from './state/migrate.ts'
import { recordThreatClear, selectThreat, selectedThreat, unlockedThreat } from './state/threatLadder.ts'
import { shareRunCard } from './share/shareCard.ts'
import { flushUpdatePrompt, setupUpdatePrompt } from './pwa/updatePrompt.ts'
import { CHARACTERS, DEFAULT_CHARACTER_ID, characterById } from './content/characters.ts'
import { ARENAS, DEFAULT_ARENA_ID, arenaById } from './content/arenas.ts'
import { FEATS, featForReward, validateFeats } from './content/feats.ts'
import { threatLevel } from './content/threat.ts'
import { FACTORY_PAINT_ID, paintById, type PaintDef } from './content/paints.ts'
import { PICKUP_WEAPON_IDS, WEAPONS } from './content/weapons.ts'
import { PERKS } from './content/perks.ts'
import { grant, isOwned, ownedPaintIds, resolvePools } from './state/unlocks.ts'
import { spawnEnemy, debugFloodSwarmers } from './systems/spawn.ts'
import { directorJumpTo } from './systems/director.ts'
import { aiSystem, buildEnemyHash } from './systems/ai.ts'
import { dropHiveCore } from './systems/pickups.ts'
import { grantPrimeCore, resolveCore } from './systems/cores.ts'
import { banishCard, canReroll, draftDue, openDraft as dealDraft, pickCard, pickPerkId, rerollDraft, skipDraft } from './systems/draft.ts'
import { particleSystem } from './systems/particles.ts'

type Screen = 'menu' | 'playing' | 'gameover' | 'leaderboard' | 'records'
/** A discrete hit tints the ship this color for FeelDirector.shipFlash (section 6.5). */
const SHIP_HURT_TINT = 0xff6a6a
/** Elite tags keep this many screen px below the HUD rows. */
const TAG_HUD_GAP = 6
/** The touch-hint banner's center: below the chip and badge row in portrait; in
 *  landscape below the plate, between the chip and the badge. */
const HINT_BELOW_ROW_P = 20
const HINT_BELOW_PLATE_L = 28
/** The ship's drawn extent (its barrel tip) in units of PLAYER_RADIUS: the menu
 *  scales the hero ship so this fits the menu's hero radius. */
const SHIP_EXTENT = 1.5
/** Where the player goes once a run is recorded. */
type AfterRun = 'recap' | 'menu' | 'retry'
/** Section 9.3: the draft's controls hint shows for the first 3 drafts per install. */
const HINT_DRAFT_PICK = 'draftPick'
const HINT_DRAFT_PICK_SHOWS = 3
/** Section 6.5: the full level-up ceremony punches the camera in this much. */
const DRAFT_PUNCH = 0.04
/** The pause sheet's timeline spans the run arc (0 to 12:00). */
const PAUSE_SPAN_S = 720
/** A16.2: the countdown's last beat is 1320 Hz against 880. */
const COUNTDOWN_LAST_RATIO = 1.5

/**
 * Phase 3 bootstrap + game state machine. boot -> menu -> playing -> gameover.
 * Wires modes (Endless / Daily), persistence, audio, settings, the level-up
 * draft, and the reality-warp distortion onto the combat core.
 */
async function boot(): Promise<void> {
  await initStorage()
  const featErrors = validateFeats()
  if (featErrors.length > 0) throw new Error('feat table: ' + featErrors.join('; '))
  const welcome = migrateSave(todayUtc())
  pruneDays(todayUtc())
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
  texReg.packAtlas()
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
  const vignette = new Vignette()
  // Per-world atmosphere: ambient motes (world-space) + screen-space overlay +
  // the color grade/tinted vignette. Bakes its textures once; only tints per world.
  const backdrop = new BackdropSystem(layers, postFX, vignette)
  const crosshair = buildCrosshair()
  const modal = new LevelUpModal()
  const mainMenu = new MainMenu()
  const recap = new Recap()
  const pauseSheet = new PauseSheet()
  const winPanel = new WinPanel()
  const coreReveal = new CoreReveal()
  const settingsPanel = new SettingsPanel()
  const leaderboard = new Leaderboard()
  const records = new Records()
  const hints = new Hints(callouts)
  const confirm = new ConfirmSheet()
  const touchHint = new TouchHint()
  const toast = new Toast()
  // Dev instrument only: null in prod so the class, its per-frame update, and
  // the backtick toggle are all tree-shaken from the shipped bundle.
  const debug = import.meta.env.DEV ? new DebugOverlay() : null
  // vignette sits at the bottom of the UI (above the world, below the HUD).
  layers.ui.addChild(
    vignette.view, screenFx.view, arrows.view, hud.view, hints.chip, input.touch.view, crosshair, callouts.view,
    touchHint.view, modal.view, winPanel.view, coreReveal.view, pauseSheet.view, mainMenu.view, recap.view, leaderboard.view, records.view, settingsPanel.view,
    confirm.view, toast.view,
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
    modal.reduceMotion = s.reduceMotion
    numbers.mode = s.damageNumbers
    feel.flashes = s.flashes
  }
  applySettings(settings)

  // --- state machine ---
  let screen: Screen = 'menu'
  /** Why the sim is paused beyond a draft: the win panel, a core reveal, or the pause button. */
  let pauseReason: 'none' | 'win' | 'core' | 'pause' = 'none'
  let lastResult: RunResult | null = null
  let submitToken = 0
  /** The start gate: a run's sim holds at t = 0 until the player's first move,
   *  aim or dash, so a player still reading the screen takes no damage. */
  let gateOpen = true
  /** Sim time of the next ranked Daily checkpoint. */
  let nextCkptAt = CHECKPOINT_EVERY_S
  /** Boot is done: the menu may show its own toasts (the boot toast goes first). */
  let booted = false

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

  /** The feat that unlocks `key` and its progress, or null when `key` is owned. */
  function lockInfo(key: string): LockInfo | null {
    if (isOwned(key)) return null
    const f = featForReward(key)!
    const v = featValue(f, loadFeats().prog, loadStats())
    return { desc: f.desc, progress: featProgress(f, v), frac: Math.min(1, v / f.target) }
  }

  /** The menu as the save stands now (section 9.7). */
  function menuModel(): MenuModel {
    const L = loadStats()
    const c = characterById(selCharId)
    const a = arenaById(selArenaId)
    const aOpen = isOwned(a.id)
    const paint = selectedPaint()
    const best = loadWorldBest(a.id)
    const unlocked = aOpen ? unlockedThreat(a.id) : 0
    const sel = threatLevel(selectedThreat(a.id))
    const counted = L.runs > 0
    let daily: MenuModel['daily'] = null
    if (counted) {
      const date = todayUtc()
      const spec = dailySpec(date)
      const streak = loadStreak()
      const yesterday = dayOf(Date.parse(date + 'T00:00:00Z') - 86_400_000)
      const ranked = rankedRun(date)
      daily = {
        date,
        number: spec.number,
        world: arenaById(spec.world).name,
        pilot: characterById(spec.pilot).name,
        threat: spec.threat,
        threatName: threatLevel(spec.threat).name,
        rankedOpen: rankedAvailable(date),
        rankedScore: ranked ? ranked.score : null,
        practiceBest: loadDay(date).practiceBest ?? 0,
        played: streak.played,
        streak: streak.last === date || streak.last === yesterday ? streak.run : 0,
        pilotFree: !isOwned(spec.pilot),
      }
    }
    return {
      firstLaunch: !counted && !L.importedV1,
      touch: isTouchDevice && !input.hasPointer,
      pilot: { name: c.name, color: c.colors.body, stats: `${c.maxHp} HP \u00b7 ${c.speed} SPD`, ruleName: c.ruleName, ruleDesc: c.ruleDesc, lock: lockInfo(c.id) },
      pilotArrows: CHARACTERS.filter((p) => isOwned(p.id)).length >= 2,
      world: {
        name: a.name,
        color: a.borderGlow,
        sub: `vs ${a.broodName.toUpperCase()}` + (best.score > 0 ? ` \u00b7 BEST ${best.score.toLocaleString('en-US')}` : ''),
        lock: lockInfo(a.id),
      },
      worldArrows: ARENAS.filter((w) => isOwned(w.id)).length >= 2,
      threat: unlocked >= 1 ? { unlocked, selected: sel.level, name: sel.name, rule: sel.rule } : null,
      paint: ownedPaintIds().length > 1 ? (paint ? paint.name : 'FACTORY') : null,
      daily,
      goals: nextGoals(3, L),
      records: counted,
      leaders: leaderboardEnabled(),
    }
  }

  function refreshLoadoutUI(): void {
    mainMenu.setModel(menuModel())
    // The ship idling behind the menu previews the pilot and paint.
    if (screen === 'menu') {
      const c = characterById(selCharId)
      player.paint(isOwned(c.id) ? (selectedPaint() ?? c.colors) : c.colors, c.shape)
    }
  }
  function cycle<T extends { id: string }>(list: readonly T[], id: string, dir: number): string {
    const i = list.findIndex((x) => x.id === id)
    return list[(i + dir + list.length) % list.length]!.id
  }
  mainMenu.onPilot = (dir) => {
    selCharId = cycle(CHARACTERS, selCharId, dir)
    saveJSON('sel:char', selCharId)
    refreshLoadoutUI()
  }
  mainMenu.onWorld = (dir) => {
    selArenaId = cycle(ARENAS, selArenaId, dir)
    saveJSON('sel:arena', selArenaId)
    refreshLoadoutUI()
  }
  mainMenu.onPaint = () => {
    const ids = ownedPaintIds()
    selPaintId = ids[(ids.indexOf(selectedPaint()?.id ?? FACTORY_PAINT_ID) + 1) % ids.length]!
    saveJSON('sel:paint', selPaintId)
    refreshLoadoutUI()
  }
  mainMenu.onThreat = (t) => {
    selectThreat(selArenaId, t)
    refreshLoadoutUI()
  }
  refreshLoadoutUI()

  /** The menu's PLAY: Standard with the shown pilot and world, when both are owned. */
  function canPlay(): boolean {
    return isOwned(selCharId) && isOwned(selArenaId)
  }

  /** The config a run starts from. Standard: the selected pilot and world
   *  (locked picks fall back to the default) and the owned pools. The Daily:
   *  the date's spec for everyone, locks ignored, canonical pools. Pools and
   *  paint resolve once here; a grant mid-run never changes this run. */
  function buildRunConfig(mode: RunMode, date: string): RunConfig {
    const paint = selectedPaint()
    const pools = resolvePools(mode)
    let char = characterById(selCharId)
    let theme = arenaById(selArenaId)
    let seed = runSeed()
    let threat = 0
    let dailyNumber = 0
    if (mode === 'daily') {
      const spec = dailySpec(date)
      char = characterById(spec.pilot)
      theme = arenaById(spec.world)
      seed = spec.seed
      threat = spec.threat
      dailyNumber = spec.number
    } else {
      if (!isOwned(char.id)) char = characterById(DEFAULT_CHARACTER_ID)
      if (!isOwned(theme.id)) theme = arenaById(DEFAULT_ARENA_ID)
      threat = selectedThreat(theme.id)
    }
    return {
      mode,
      ranked: mode === 'daily' && rankedAvailable(date),
      seed,
      date,
      dailyNumber,
      character: char,
      theme,
      threat,
      perkPool: pools.perks,
      weaponPool: pools.weapons,
      paint: paint ? paint.id : FACTORY_PAINT_ID,
      baseBulletTint: paint ? paint.bullet : WEAPONS[char.startWeapon]!.tint,
    }
  }

  function runMeta(): RunMeta {
    const run = world.run!
    return { date: run.date, ranked: run.ranked, dailyNumber: run.dailyNumber, paint: run.paint }
  }

  /** `retry`: RETRY on the recap, which skips the title card. */
  function startRun(mode: RunMode, date = todayUtc(), retry = false): void {
    const cfg = buildRunConfig(mode, date)
    // The ranked attempt is spent before the first sim step, whatever ends it.
    if (cfg.ranked) {
      markRankedStarted(cfg.date)
      holdRankedLock()
    }
    world.beginRun(cfg)
    nextCkptAt = CHECKPOINT_EVERY_S
    const theme = cfg.theme
    player.paint(selectedPaint() ?? cfg.character.colors, cfg.character.shape)
    player.view.scale.set(1)
    hints.beginRun(input.lastType === 'touch' || (isTouchDevice && !input.hasPointer))
    audio.setTheme(theme.music)
    feel.reset(loadWorldBest(theme.id).score)
    deathBeat = false
    backdrop.setTheme(theme, arena.glowSpots) // motes/atmosphere/grade/vignette/glows
    camera.reset()
    followCamera(0, true) // seed the camera before the first sim step
    const daily = mode === 'daily'
    const dailyTitle = daily ? 'DAILY #' + cfg.dailyNumber : ''
    hud.reset(world, dailyTitle) // don't let last run's dying bars sweep across the fresh run
    emerge.setTheme(theme)
    emerge.reset(world)
    if (daily) feel.intro(dailyTitle, theme.name + (cfg.ranked ? ' · SAME RUN FOR EVERYONE' : ' · PRACTICE RUN'), T.accentGold, true)
    else if (!retry) feel.intro(theme.name, 'vs ' + theme.broodName.toUpperCase(), theme.borderGlow, false)
    gateOpen = false
    input.armStartGate()
    touchMoveUsed = false
    touchAimUsed = false
    screen = 'playing'
    pauseReason = 'none'
    input.setEnabled(true)
    modal.close()
    winPanel.hide()
    coreReveal.hide()
    pauseSheet.hide()
    mainMenu.hide()
    toast.hide()
    confirm.close()
    recap.hide()
    settingsPanel.hide()
    leaderboard.hide()
    records.hide()
  }

  /** The Daily from the menu or a retry: the ranked attempt asks first. */
  function playDaily(): void {
    const date = todayUtc()
    if (!rankedAvailable(date)) {
      startRun('daily', date)
      return
    }
    confirm.open(
      'RANKED ATTEMPT',
      'Your first Daily run today is the ranked one. After it, practice as much as you like.',
      'START',
      'BACK',
      () => startRun('daily', date),
    )
  }

  function retry(): void {
    if (world.mode === 'daily') playDaily()
    else startRun('endless', todayUtc(), true)
  }

  /** File a finished run in the save: lifetime stats, THREAT, world bests,
   *  feats and the Daily record. */
  function fileRun(r: RunResult) {
    const lifetime = updateLifetime(r)
    recordThreatClear(r)
    const gains = recordWorldBest(r)
    const done = evaluateFeats(r, lifetime)
    if (r.mode === 'daily') recordDailyEnd(r)
    return { lifetime, gains, done }
  }

  /** Every exit from a live run comes through here (death, quit, clear,
   *  stalemate, a page closed mid-run): the run is recorded exactly once, then
   *  the player moves on to the recap, the menu or a fresh run. */
  function endRun(end: RunEnd, after: AfterRun = 'recap'): void {
    releaseRankedLock()
    pauseReason = 'none'
    winPanel.hide()
    coreReveal.hide()
    pauseSheet.hide()
    modal.close()
    audio.setPaused(false)
    const result = buildRunResult(world, end, runMeta())
    lastResult = result
    feel.time.reset()
    // What the recap compares with, read before this run is recorded.
    const best = loadWorldBest(result.arena)
    const before = { bestScore: best.score, bestTime: best.time, dayBest: result.mode === 'daily' ? dayBest(loadDay(result.date)) : 0 }
    const featsBefore = loadFeats()
    const { lifetime, gains, done } = fileRun(result)
    if (done.length > 0) refreshLoadoutUI()
    if (after === 'menu') {
      void postRun(result, false)
      toMenu()
      return
    }
    // A quick retry skips the recap only when the run has no news to show. A
    // Daily always shows its recap (its rank is the news).
    if (after === 'retry' && result.mode !== 'daily' && done.length === 0 && !gains.score && !gains.time && !gains.kills) {
      void postRun(result, false)
      startRun('endless', todayUtc(), true)
      return
    }
    const model = buildRecapModel(result, before, done, nearestGoals(featsBefore, loadFeats()))
    recap.show(model)
    feel.runEnded(model.newBest, done.length > 0)
    const ask = shouldAskOptIn(lifetime.runs) && recap.canShowOptIn()
    if (ask) markAsked()
    recap.setOptInVisible(ask)
    screen = 'gameover'
    input.setEnabled(false)
    void postRun(result, true)
    // Last, so the toast takes the recap's free slot in its final layout (the
    // opt-in card and the rank row placed), after the recap makes room for it.
    // It waits for a recap with no opt-in card: the card's area is the toast
    // slot, and it would cover its buttons.
    const featsHint = done.length > 0 && !ask ? hints.once('feats') : null
    if (featsHint) {
      recap.reserveToast(featsHint)
      showToast(featsHint)
    }
    flushUpdatePrompt() // a parked "new version" toast may show now
  }

  /** Post a finished run when it qualifies (section 8.1). The token pins the
   *  async answer to THIS recap: a slow answer from run N never lands on run N+1's. */
  async function postRun(r: RunResult, onRecap: boolean): Promise<void> {
    const token = ++submitToken
    const run = postable(r)
    if (onRecap && willPost(run)) recap.expectRankLine()
    const out = await submitRun(run)
    if (out.kind === 'posted' && out.renamed) showToast(`That name is not allowed. Posted as ${out.name}.`)
    if (!onRecap || token !== submitToken || screen !== 'gameover') return
    const line = rankLine(r, out)
    recap.setRankLine(line ? line[0] : '', line ? line[1] : 'muted')
    toast.layout(app.screen.width, getInsets(), toastSlot()) // the rank line may move the recap's slot
  }

  /** A Daily day's best score before a practice run: its ranked run or a practice best. */
  function dayBest(day: DailyDayRecord): number {
    const ranked = day.ranked && 'score' in day.ranked ? day.ranked.score : 0
    return Math.max(ranked, day.practiceBest ?? 0)
  }

  /** The recap's leaderboard line (A15). */
  function rankLine(r: RunResult, out: SubmitOutcome): [string, 'rank' | 'muted'] | null {
    const n = (v: number): string => v.toLocaleString('en-US')
    switch (out.kind) {
      case 'posted':
        if (out.day) return [`RANK ${n(out.day.rank)} OF ${n(out.day.of)} TODAY`, 'rank']
        if (out.week && out.all) return [`${arenaById(r.arena).name}: #${n(out.week.rank)} THIS WEEK · #${n(out.all.rank)} ALL TIME`, 'rank']
        return null
      case 'duplicate':
        return ['Your ranked Daily is already posted.', 'muted']
      case 'failed':
        return ['Score not posted. Check your connection.', 'muted']
      case 'gone':
        return ['Score not posted. The leaderboard is offline.', 'muted']
      case 'outdated':
        return ['Score not posted. Update the game to post scores.', 'muted']
      case 'rejected':
        return ['Score not posted.', 'muted']
      case 'off':
        return null
    }
  }

  /** CHOOSE A NAME or JOIN: the prompt, then posting turns on and the recap's
   *  run plus today's ranked Daily post. Resolves null when the player cancels,
   *  else as soon as posting is on, with the posts (they settle when both have
   *  their answer). */
  async function joinLeaderboard(): Promise<{ posts: Promise<unknown> } | null> {
    const name = await promptName(getPlayerName())
    if (name === null) return null
    optIn(name)
    const ranked = rankedRun(todayUtc())
    const current = screen === 'gameover' ? lastResult : null
    const same = current && current.mode === 'daily' && current.ranked && ranked && current.date === ranked.date
    return { posts: Promise.all([current ? postRun(current, true) : null, ranked && !same ? submitRun(ranked) : null]) }
  }

  /** The screen a toast shows over decides where it may sit. */
  function toastSlot(): ToastSlot | null {
    if (settingsPanel.isOpen()) return settingsPanel.toastSlot
    return screen === 'gameover' ? recap.toastSlot : mainMenu.toastSlot
  }

  function showToast(text: string, sec = 5): void {
    toast.layout(app.screen.width, getInsets(), toastSlot())
    toast.show(text, sec)
  }

  function toMenu(): void {
    screen = 'menu'
    pauseReason = 'none'
    winPanel.hide()
    coreReveal.hide()
    pauseSheet.hide()
    input.setEnabled(false)
    feel.reset()
    camera.reset()
    deathBeat = false
    recap.hide()
    settingsPanel.hide()
    leaderboard.hide()
    records.hide()
    confirm.close()
    toast.hide()
    // A locked selection resets to the default on menu entry (section 9.7).
    if (!isOwned(selCharId)) saveJSON('sel:char', (selCharId = DEFAULT_CHARACTER_ID))
    if (!isOwned(selArenaId)) saveJSON('sel:arena', (selArenaId = DEFAULT_ARENA_ID))
    if (selPaintId !== FACTORY_PAINT_ID && !selectedPaint()) saveJSON('sel:paint', (selPaintId = FACTORY_PAINT_ID))
    // The hero ship idles at the world center, nose up.
    player.spawn(arena.bounds.x + arena.bounds.w / 2, arena.bounds.y + arena.bounds.h / 2)
    player.facing = -Math.PI / 2
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
    if (booted) dailyHint()
  }

  /** The first time the menu shows the Daily card, its hint (section 9.10). */
  function dailyHint(): void {
    if (screen !== 'menu' || !mainMenu.view.visible || loadStats().runs === 0) return
    const line = hints.once('daily')
    if (line) showToast(line)
  }

  function toLeaderboard(): void {
    screen = 'leaderboard'
    input.setEnabled(false)
    mainMenu.hide()
    toast.hide()
    recap.hide()
    leaderboard.open(selArenaId)
  }

  function toRecords(): void {
    screen = 'records'
    mainMenu.hide()
    toast.hide()
    records.open()
  }

  /** Settings over the menu; closing it shows the menu again. */
  function openSettings(): void {
    toast.hide()
    mainMenu.hide()
    settingsPanel.open(settings, accountState())
  }

  function closeSettings(): void {
    settingsPanel.hide()
    // Opened from the pause sheet: back to it (section 9.8).
    if (screen === 'playing' && pauseReason === 'pause') pauseSheet.reshow()
    else if (screen === 'menu') {
      refreshLoadoutUI()
      mainMenu.show()
    }
  }

  function accountState(): { posting: boolean; name: string } {
    return { posting: optInState() === true, name: getPlayerName() }
  }

  mainMenu.onPlay = () => {
    if (canPlay()) startRun('endless')
  }
  mainMenu.onDaily = playDaily
  mainMenu.onNewDay = refreshLoadoutUI
  mainMenu.onSettings = openSettings
  mainMenu.onRecords = toRecords
  mainMenu.onLeaderboard = toLeaderboard
  records.onBack = toMenu
  recap.onRetry = retry
  recap.onMenu = toMenu
  recap.onLeaderboard = toLeaderboard
  recap.onShare = () => {
    if (lastResult) void shareRunCard(lastResult)
  }
  recap.optIn.onChoose = () => {
    void joinLeaderboard().then((joined) => {
      if (joined && screen === 'gameover') recap.setOptInVisible(false)
    })
  }
  recap.optIn.onDecline = () => {
    optOut()
    recap.setOptInVisible(false)
    showToast('You can turn this on in Settings.')
  }
  leaderboard.onBack = toMenu
  leaderboard.onJoin = joinLeaderboard
  leaderboard.onEditName = async () => {
    const name = await promptName(getPlayerName())
    if (name !== null && optInState() === true) setPlayerName(name)
  }
  settingsPanel.onChange = (s) => {
    settings = s
    applySettings(s)
    saveSettings(s)
  }
  settingsPanel.onClose = closeSettings
  // ACCOUNT (section 8.3): posting starts with a name, and REMOVE MY SCORES asks first.
  settingsPanel.onPostScores = (on) => {
    if (!on) {
      optOut()
      settingsPanel.setAccount(accountState())
      return
    }
    void promptName(getPlayerName()).then((name) => {
      if (name !== null) optIn(name)
      settingsPanel.setAccount(accountState())
    })
  }
  settingsPanel.onEditName = () => {
    void promptName(getPlayerName()).then((name) => {
      if (name !== null) setPlayerName(name)
      settingsPanel.setAccount(accountState())
    })
  }
  settingsPanel.onRemoveScores = () => {
    confirm.open('REMOVE MY SCORES', 'Remove all your scores from the public board? This cannot be undone.', 'REMOVE', 'CANCEL', () => {
      void deleteMyScores().then((r) => {
        settingsPanel.setAccount(accountState())
        showToast(
          r === 'ok' ? 'Your scores are removed.' : r === 'gone' ? 'The leaderboard is offline.' : r === 'outdated' ? 'Update the game to see the leaderboard.' : 'Could not reach the leaderboard.',
        )
      })
    }, true)
  }
  settingsPanel.onShowTips = () => {
    hints.reset()
    touchLearned = false
  }
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
    const full = feel.draftOpened()
    modal.open(world.draft, {
      touch: input.lastType === 'touch',
      pad: input.lastType === 'gamepad',
      level: world.level - world.pendingLevelUps + 1,
      full,
      flash: full && feel.tryFlash(renderClock * 1000),
      sub: hints.draftLine(),
      hint: hints.bump(HINT_DRAFT_PICK) < HINT_DRAFT_PICK_SHOWS,
      shipX: camera.worldToScreenX(player.view.x),
      shipY: camera.worldToScreenY(player.view.y),
    })
    if (full) camera.punchZoom(DRAFT_PUNCH)
  }
  function resumeFromDraft(): void {
    world.paused = false
    world.resumeFromDraft()
    input.cancelDashPress()
    feel.time.play(TimePreset.Resume)
  }
  function takeCard(i: number): void {
    if (!world.draft.open || i < 0 || i >= world.draft.count) return
    pickCard(world, i)
    feel.cardPicked()
    modal.closeAfterPick(i)
    resumeFromDraft()
  }
  function skipCard(): void {
    if (!world.draft.open) return
    skipDraft(world)
    modal.closeAfterPick(-1)
    resumeFromDraft()
  }
  modal.onPick = takeCard
  modal.onSkip = skipCard
  modal.onReroll = () => rerollDraft(world)
  modal.onBanish = (i) => banishCard(world, i)
  modal.canReroll = () => canReroll(world)
  modal.onDeal = (i) => feel.cardDealt(i)

  /** The PRIME is dead and the purge is over: Standard asks EXTRACT or
   *  OVERTIME, the Daily ends as a clear. Pending level-ups resolve first. */
  function openWin(): void {
    if (world.mode === 'daily') {
      endRun('clear')
      return
    }
    pauseReason = 'win'
    world.paused = true
    // The lane hides under the panel: drop what is queued so nothing stale plays after OVERTIME.
    callouts.clear()
    winPanel.show(world.script.text.win, world.director.clearTime, feel.primeFlawless, input.lastType)
  }
  winPanel.onExtract = () => endRun('clear')
  /** OVERTIME grants the PRIME core; its reveal resumes the run. */
  function startOvertime(): void {
    winPanel.hide()
    world.startOvertime()
    grantPrimeCore(world)
    openCore()
  }

  /** A Hive Core was taken: the sim waits on its reveal (and the evolution
   *  choice), then resumes with the draft grace. */
  function openCore(): void {
    pauseReason = 'core'
    world.paused = true
    coreReveal.show(world.core, world.perkStacks, input.lastType)
  }
  function closeCore(evolve: boolean): void {
    if (!world.core.pending) return
    resolveCore(world, evolve)
    coreReveal.hide()
    pauseReason = 'none'
    world.paused = false
    world.resumeFromDraft()
    input.cancelDashPress()
    feel.time.play(TimePreset.Resume)
  }
  coreReveal.onClose = closeCore
  winPanel.onOvertime = startOvertime

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
    arrows.layout(w, insets.left, insets.right, h - insets.bottom)
    screenFx.layout(w, h)
    debug?.layout(insets)
    touchHint.layout(w, h, insets, input.touch.dashX, input.touch.dashY, hud.pillTop, h > w ? hud.rowBottom + HINT_BELOW_ROW_P : hud.topBottom + HINT_BELOW_PLATE_L)
    vignette.resize(w, h)
    backdrop.layout(w, h)
    modal.setScreen(w, h, insets)
    winPanel.layout(w, h, insets)
    coreReveal.layout(w, h, insets)
    pauseSheet.layout(w, h, insets)
    mainMenu.layout(w, h, insets)
    recap.layout(w, h, insets)
    settingsPanel.layout(w, h, insets)
    leaderboard.layout(w, h, insets)
    records.layout(w, h, insets)
    hints.layoutChip(hud.hintSlot.x, hud.hintSlot.y, hud.hintSlot.s)
    confirm.layout(w, h, insets)
    toast.layout(w, insets, toastSlot())
    // Pin the bloom to the visible window (not the whole 2800x1900 arena).
    layers.scene.filterArea = new Rectangle(0, 0, w, h)
  }
  layout()
  toMenu()
  const recovered = await recoverCheckpoint()
  const bootToast = [recovered, welcome].filter((t) => t !== null).join('\n')
  if (bootToast) showToast(bootToast, 6)
  else dailyHint()
  booted = true
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
    if (confirm.isOpen()) {
      confirm.close()
      return true
    }
    if (settingsPanel.isOpen()) {
      closeSettings()
      return true
    }
    if (modal.isShown() || pauseReason === 'win' || pauseReason === 'core') return true // swallow back while a choice is up
    if (screen === 'playing') {
      // Back pauses (section 9.4); on the sheet it resumes.
      if (pauseSheet.isOpen()) pauseSheet.startCountdown()
      else openPause()
      return true
    }
    if (screen === 'gameover' && !recap.acceptsInput()) return true
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
    if (namePromptOpen()) return
    if (confirm.pressKey(e.key)) return
    if (modal.isOpen()) {
      if (e.key === '1' || e.key === '2' || e.key === '3') modal.pressCard(Number(e.key) - 1)
      else if (e.key === 'r' || e.key === 'R') modal.reroll()
      else if (e.key === 'b' || e.key === 'B') modal.toggleBanish()
      else if (e.key === 'Backspace') {
        e.preventDefault()
        modal.skip()
      }
      return
    }
    if (settingsPanel.isOpen()) {
      if (e.key === 'Escape') settingsPanel.onClose()
      return
    }
    if (pauseReason === 'win') {
      winPanel.pressKey(e.key)
      return
    }
    if (pauseReason === 'core') {
      coreReveal.pressKey(e.key)
      return
    }
    if (debug && e.key === '`') {
      debug.toggle()
    } else if ((screen === 'records' || screen === 'leaderboard') && e.key === 'Escape') {
      toMenu()
    } else if (screen === 'playing') {
      const pauseKey = e.key === 'Escape' || e.key === 'p' || e.key === 'P'
      if (pauseSheet.isOpen()) {
        if (pauseKey) pauseSheet.startCountdown()
      } else if (pauseKey) {
        openPause()
      } else if (e.key === 'r' || e.key === 'R') {
        // A Daily records every exit, so R asks through the pause sheet (section 7.5).
        if (world.mode === 'daily') openPause()
        else quitRun('retry')
      }
    } else if (screen === 'gameover') {
      recap.pressKey(e.key)
    } else if (screen === 'menu' && e.key === 'Enter' && !confirm.isOpen() && canPlay()) {
      startRun('endless')
    }
  })

  /** Follow the ship (interpolated position, or the sim position on a seed). */
  function followCamera(fd: number, seed = false): void {
    const playing = screen === 'playing'
    const touchPortrait = playing && input.lastType === 'touch' && app.screen.height > app.screen.width
    const boss = playing && world.bossAlive && world.boss ? world.boss : null
    let sx = seed ? player.x : player.view.x
    let sy = seed ? player.y : player.view.y
    if (screen === 'menu' && !seed) {
      // The menu places the hero ship: offset the view so the ship lands on it.
      sx += (app.screen.width / 2 - mainMenu.heroX) / camera.baseZoom
      sy += (app.screen.height / 2 - mainMenu.heroY) / camera.baseZoom
      player.view.scale.set(mainMenu.heroR / (SHIP_EXTENT * PLAYER_RADIUS * camera.baseZoom))
    }
    camera.update(fd, sx, sy, playing ? input.aimDir.x : 0, playing ? input.aimDir.y : 0, touchPortrait, boss, world.arena.bounds)
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
      sweepPools(world)
      return
    }

    world.time += dt
    // Aim is cursor-relative to the player's SCREEN position, using the camera
    // from the last rendered frame (exactly what the player saw and aimed at).
    // The camera itself is recomputed each render from the interpolated position.
    input.update(camera.worldToScreenX(player.x), camera.worldToScreenY(player.y))
    if (!gateOpen) {
      // The start gate: no step happens until a sample holds a deliberate
      // input, and the step that sees it runs on that same sample, so the run
      // from there on is the one an immediate input would have played.
      if (!input.engaged()) {
        world.time = 0
        return
      }
      gateOpen = true
    }
    runSystems(world, input, dt)

    // Hand-offs, in rank order: death (next tick), the stalemate, the win, a
    // core reveal, then a draft (DRAFT.minGap apart). A pick is never applied
    // posthumously, and level-ups and a core taken before the win resolve
    // before the win panel opens.
    if (world.pendingGameOver) return
    if (world.pendingEnd) endRun('stalemate')
    else if (world.pendingWin && world.pendingLevelUps === 0 && !world.core.pending) openWin()
    else if (world.core.pending) openCore()
    else if (draftDue(world)) openDraft()
  }

  /** The pause sheet (section 9.4): the pause button, Esc, P, back, the pad's
   *  Start, or the app leaving the foreground. Nothing opens over a draft, a
   *  core reveal, the win panel or the death sequence. */
  function openPause(): void {
    if (screen !== 'playing' || world.pendingGameOver) return
    if (pauseSheet.counting()) {
      // Paused again during the countdown: back to the sheet.
      input.setEnabled(false)
      audio.setPaused(true)
      pauseSheet.reshow()
      return
    }
    if (pauseReason !== 'none' || world.paused || modal.isShown()) return
    pauseReason = 'pause'
    world.paused = true
    input.setEnabled(false)
    audio.setPaused(true)
    audio.play('uiBack')
    pauseSheet.show(pauseInfo(), input.lastType === 'gamepad')
  }
  hud.onPause = openPause
  // RESUME starts the 3 2 1 countdown; input is live from its start (section 9.4).
  pauseSheet.onResume = () => {
    input.setEnabled(true)
    audio.setPaused(false)
    audio.play('uiConfirm')
  }
  pauseSheet.onCount = (n) => audio.play('countdown', 0, n === 1 ? COUNTDOWN_LAST_RATIO : 1)
  pauseSheet.onCountdownDone = () => {
    pauseReason = 'none'
    world.paused = false
    feel.time.play(TimePreset.Resume)
  }
  pauseSheet.onSettings = () => {
    pauseSheet.hide()
    settingsPanel.open(settings, accountState())
  }
  pauseSheet.onQuit = () => {
    pauseSheet.hide()
    audio.setPaused(false)
    quitRun('recap')
  }

  /** The sheet's run line, boss timeline and build. */
  function pauseInfo(): PauseInfo {
    const run = world.run!
    const parts = [world.arenaTheme.name, world.character.name]
    if (world.threat > 0) parts.push('T' + world.threat)
    const sec = Math.floor(world.time)
    parts.push(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, `${world.kills.toLocaleString('en-US')} KILLS`)
    const marks: PauseMark[] = []
    for (const b of world.script.beats) {
      if (b.kind !== 'boss') continue
      const t = Math.floor(b.at)
      const at = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
      marks.push({ at: b.at, label: (b.stage === 'final' ? 'PRIME ' : 'BOSS ') + at, prime: b.stage === 'final' })
    }
    return {
      run: parts.join(' · '),
      daily: run.mode === 'daily' ? (run.ranked ? 'RANKED' : 'PRACTICE') : '',
      marks,
      now: world.time,
      span: Math.max(PAUSE_SPAN_S, world.time),
      build: buildTiles(world.perkStacks),
    }
  }

  // Leaving the death sequence early: a fresh tap after the skip beat, or the
  // app going to the background, goes straight to the recap.
  app.canvas.addEventListener('pointerdown', () => {
    if (screen === 'playing' && world.pendingGameOver && feel.time.deathMs >= DEATH_SKIP_MS) endRun('death')
  })
  // Leaving the foreground: a dying run goes to its recap, a live one pauses
  // (section 9.4) after the Daily checkpoint is written.
  onBackground(() => {
    if (screen === 'playing' && world.pendingGameOver) {
      endRun('death')
    } else {
      writeCheckpoint()
      openPause()
    }
    void flushStorage()
  })
  // A page closed or reloaded mid-run still records the run; after the PRIME kill it counts as EXTRACT.
  window.addEventListener('pagehide', () => {
    if (screen === 'playing') endRun(leaveEnd('interrupted'), 'menu')
    void flushStorage()
  })

  /** The ranked Daily as it stands, in case the app dies without ending it. */
  function writeCheckpoint(): void {
    const run = world.run
    if (screen !== 'playing' || !run || !run.ranked || world.pendingGameOver) return
    saveCheckpoint(buildRunResult(world, leaveEnd('interrupted'), runMeta()))
  }

  /** A ranked Daily the app lost (killed in the background) becomes that day's
   *  ranked result at the next boot. Returns the toast, or null. */
  async function recoverCheckpoint(): Promise<string | null> {
    const r = await lostCheckpoint()
    if (!r) return null
    clearCheckpoint()
    if (loadDay(r.date).ranked) return null
    const lifetime = updateLifetime(r)
    recordWorldBest(r)
    if (evaluateFeats(r, lifetime).length > 0) refreshLoadoutUI()
    recordDailyEnd(r)
    refreshLoadoutUI()
    void postRun(r, false)
    return `Ranked Daily #${r.dailyNumber} saved at ${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')} when the app closed.`
  }

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
      if (screen === 'playing') hints.scan(world.feel, world)
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

      if (playing && world.time >= nextCkptAt) {
        nextCkptAt = world.time + CHECKPOINT_EVERY_S
        writeCheckpoint()
      }

      hints.update(fd, world, playing, !hud.pendingShown)
      hud.hintHeld = hints.chip.visible

      renderEntities(world, alpha)
      hazardView.update(world, alpha)
      podRings.update(world, alpha)
      emerge.update(world, alpha)
      player.render(alpha)
      // i-frames: the ship blinks at 15 Hz; a discrete hit tints it red for a beat.
      player.view.alpha = player.invuln > 0 && (Math.floor(renderClock * 30) & 1) === 1 ? 0.35 : 1
      player.view.tint = feel.shipFlash > 0 ? SHIP_HURT_TINT : 0xffffff
      ichor.flush()

      // Menus and modals read the pad's button presses once a frame.
      const pad = input.padPresses()
      if (pad !== 0) {
        if (modal.isOpen()) modal.pad(pad)
        else if (pauseReason === 'win') winPanel.padPress(pad)
        else if (pauseReason === 'core') coreReveal.padPress(pad)
        else if (settingsPanel.isOpen()) {
          if (pad & (PAD_B | PAD_START)) settingsPanel.onClose()
        } else if (pauseSheet.isOpen()) pauseSheet.padPress(pad)
        else if (screen === 'gameover') recap.padPress(pad)
        else if (playing && pad & PAD_START) openPause()
      }

      // Touch UI (sticks + DASH) on touch devices until a mouse or pad takes
      // over; hidden while a draft or the pause sheet holds the run, shown again
      // for the resume countdown.
      const counting = pauseSheet.counting()
      const touchUI = playing && (!world.paused || counting) && (input.lastType === 'touch' || (isTouchDevice && !input.hasPointer && input.lastType !== 'gamepad'))
      input.touch.view.visible = touchUI
      if (touchUI) {
        const maxCharges = world.maxDashCharges
        const cd = DASH.cooldown * world.mods.dashCooldownMul
        input.touch.updateDash(world.dashCharges, maxCharges, world.dashCharges < maxCharges ? 1 - world.dashRecharge / cd : 1, fd)
      }
      const showCrosshair = playing && input.lastType === 'kbm' && input.hasPointer
      crosshair.visible = showCrosshair
      if (showCrosshair) crosshair.position.set(input.pointerX, input.pointerY)

      hud.view.visible = playing && !modal.isShown() && !coreReveal.isOpen() && !pauseSheet.isOpen()
      feel.update(fd, playing)
      if (playing) hud.update(world, fd, feel.pulse)

      if (!playing && modal.isShown()) modal.close()
      const nowMs = performance.now()
      modal.update(nowMs)
      coreReveal.update(nowMs)
      pauseSheet.update(nowMs)
      recap.update(nowMs)
      // World-space text (labels, damage numbers, elite tags) never shows through a scrim.
      layers.overlay.visible = !(modal.isShown() || winPanel.isOpen() || coreReveal.isOpen() || pauseSheet.isOpen() || screen === 'gameover')

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
      callouts.view.visible = playing && !modal.isShown() && pauseReason === 'none'
      callouts.update(cues ? fd : 0)
      arrows.view.visible = cues
      if (cues) {
        arrows.avoid(touchUI ? input.touch.dashX : -1e4, input.touch.dashY)
        arrows.update(world, camera, hudTop, hud.pillTop, laneShown ? laneBox : null, fd)
      }
      tweens.update(renderClock * 1000)
      toast.update(fd)
      mainMenu.tick(Date.now(), fd)
      postFX.setPulse(feel.bloomPulse)

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

      if (debug?.shown) {
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

  // PB: run the boss, event and hit code paths once on a scratch World.
  const scratch = new World(new Arena(), new Player(), new IchorLayer(app.renderer, new Rng(1)), makeLayers(), texReg)
  warmSystems(scratch, buildRunConfig('endless', todayUtc()), input, (w) => renderEntities(w, 0))

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
      pause: () => openPause(),
      pauseSheet,
      settingsPanel,
      recap,
      modal,
      winPanel,
      coreReveal,
      /** Whether the start gate has opened (a run holds at t = 0 until it does). */
      get gateOpen() {
        return gateOpen
      },
      perfReset: () => loop.resetStats(),
      leaderboard,
      toLeaderboard: () => toLeaderboard(),
      mainMenu,
      records,
      toRecords: () => toRecords(),
      openSettings: () => openSettings(),
      hints,
      confirm,
      toMenu: () => toMenu(),
      touchHint,
      setGlow: (v: number) => postFX.setIntensity(v),
      get screen() {
        return screen
      },
      get pauseReason() {
        return pauseReason
      },
      /** The win panel's OVERTIME button (harness `ot` flag). */
      overtime: () => {
        if (pauseReason === 'win') startOvertime()
      },
      /** Unlock THREAT up to `t` in `arenaId` and select it for the next Standard run. */
      setThreat: (arenaId: string, t: number) => {
        if (unlockedThreat(arenaId) < t) saveJSON('threat', { ...loadJSON<Record<string, number>>('threat', {}), [arenaId]: t })
        selectThreat(arenaId, t)
      },
      startRun: (mode: RunMode) => startRun(mode),
      /** The Daily of any UTC day, straight in (no confirm sheet). */
      startDaily: (date: string) => startRun('daily', date),
      /** Harness: restart the current run's config on `seed` with the canonical
       *  pools (plus any overrides), keeping pilot and world. */
      beginSeed: (seed: number, over: Partial<RunConfig> = {}) => {
        gateOpen = true
        world.beginRun({ ...world.run!, seed: seed >>> 0, perkPool: PERKS, weaponPool: PICKUP_WEAPON_IDS, ...over })
      },
      dailySpec,
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
        return world.run?.paint
      },
      toast,
      // The harness drives the sim itself, so stepping or jumping opens the start gate.
      step: (n = 60) => {
        gateOpen = true
        for (let i = 0; i < n; i++) stepSim(FIXED_DT)
      },
      flood: (n: number) => debugFloodSwarmers(world, n),
      jumpTo: (t: number) => {
        gateOpen = true
        directorJumpTo(world, t)
      },
      spawn: (id: string, n = 1) => {
        const b = world.arena.bounds
        const rng = world.rngs.spawn
        for (let i = 0; i < n; i++) spawnEnemy(world, id, b.x + rng.float() * b.w, b.y + rng.float() * b.h)
      },
      addXp: (n: number) => world.addXp(n),
      give: (id: string) => world.equipWeapon(id),
      /** A Hive Core of CORES.table row `row` (0 mid1, 1 mid2, 2 overtime), 60 u right of the ship. */
      dropCore: (row = 0) => dropHiveCore(world, player.x + 60, player.y, row),
      /** Close the core reveal as a tap would: the evolution (when offered) or the levels. */
      takeCore: (evolve: boolean) => closeCore(evolve),
      /** Harness: file a RunResult as endRun does (no recap, no post). */
      fileRun: (r: RunResult) => void fileRun(r),
      markRankedStarted,
      isOwned,
      /** Harness: open total feats whose target the saved stats already meet. */
      metOpenFeats: () => {
        const s = loadFeats()
        const L = loadStats()
        return FEATS.filter((f) => f.kind === 'total' && !s.done[f.id] && f.value(L) >= f.target).map((f) => f.id)
      },
      saveJSON,
      loadJSON,
    }
  }
}

// DEV-only testing affordance for Standard runs. The Daily always plays its
// date's seed: in v1 ?seed=X reached the Daily and let a practiced seed onto its board.
const SEED_OVERRIDE = import.meta.env.DEV ? new URLSearchParams(location.search).get('seed') : null
function runSeed(): number {
  if (SEED_OVERRIDE) {
    const n = Number(SEED_OVERRIDE)
    return Number.isFinite(n) ? n >>> 0 : seedFromString(SEED_OVERRIDE)
  }
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
  c.eventMode = 'none'
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
