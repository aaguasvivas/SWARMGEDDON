/**
 * Global tunables and the alien-hive palette.
 *
 * Everything here is data the engine reads, no logic. Later phases move
 * content (weapons/enemies/perks) into `src/content/*`; this file holds the
 * engine-level constants that don't belong to any single content registry.
 */

/** Fixed simulation step. The sim runs at exactly this rate regardless of FPS. */
export const FIXED_DT = 1 / 60

/**
 * Hard clamp on a single rendered frame's delta (seconds). Prevents the
 * "spiral of death": after a tab is backgrounded or the device hitches, we
 * cap catch-up to ~3 sim steps instead of trying to replay seconds at once.
 */
export const MAX_FRAME_TIME = 0.05

/** Default RNG seed when not running a seeded daily challenge. */
export const DEFAULT_SEED = 0x5eed1e

/**
 * The play-field is a FIXED large world (not the viewport) with a follow camera
 * that keeps the player near screen center. This gives Crimsonland's "huge
 * field" feel, room to kite out of tight spots, and a full 360° aim circle that
 * never runs off the screen edge. Fixed size also makes the Daily Challenge
 * truly device-independent (spawn positions no longer depend on screen size).
 */
export const ARENA_W = 2800
export const ARENA_H = 1900

/** Player movement constants (world units). */
export const PLAYER_RADIUS = 18
export const PLAYER_SPEED = 285 // units per second

/** Gamepad analog deadzone: sticks rest noisily around center. */
export const STICK_DEADZONE = 0.18

/** Player survival. */
export const PLAYER_MAX_HP = 100

/**
 * Pool / population caps. These bound worst-case work so the hot loop can never
 * spiral: spawners and FX emitters refuse to exceed them. Sized for the 500+
 * enemy stress target with headroom.
 */
export const MAX_ENEMIES = 700
export const MAX_PARTICLES = 1500
export const MAX_PICKUPS = 400
/** Pickup slots guaranteed per kind; the rest of MAX_PICKUPS is shared. */
export const PICKUP_RESERVE = { xp: 200, bank: 1, health: 40, weapon: 4, core: 4, bonus: 2 } as const
export const MAX_ACID = 64
export const MAX_ENEMY_PROJECTILES = 300

/**
 * Health pickups: perk-free sustain tied to killing. Most kills have a small
 * chance to drop a medkit that magnetizes in and heals a little; elites/bosses
 * are reliable chunks. So clearing a big swarm lets you claw HP back bit by bit.
 */
export const HEALTH_DROP_CHANCE = 0.07
export const HEALTH_HEAL = 5
export const HEALTH_HEAL_ELITE = 14

/** Spatial-hash cell size (world units). ~3-4x an enemy diameter is a good ratio. */
export const HASH_CELL = 72

/**
 * Ichor (signature persistent terrain). Stamps accumulate into one render
 * texture at constant draw cost. `INTENSITY` scales per-stamp alpha (the
 * settings slider in Phase 3 ties here).
 */
export const ICHOR_INTENSITY = 0.55
export const ICHOR_MIN_SCALE = 0.5
export const ICHOR_MAX_SCALE = 1.15

/** Virtual touch-stick geometry. */
export const TOUCH_STICK_RADIUS = 64 // max knob travel from base
export const TOUCH_STICK_DEADZONE = 0.12

/**
 * Alien-hive palette. Bioluminescent, engineered-organism feeling: deep
 * blue-black void, acid-green + violet accents. Hex ints for PixiJS fills.
 */
export const COLORS = {
  void: 0x05070d,
  arenaFloor: 0x0a0e16,
  gridLine: 0x141d2e,
  gridLineBright: 0x1d2c44,
  arenaBorder: 0x2a6f63,
  arenaBorderGlow: 0x3df0c0,

  player: 0x1ce8b5,
  playerOutline: 0x0b3b30,
  playerVisor: 0x06231d,
  playerBarrel: 0x0e4d40,

  ichor: 0x6cff5a, // signature acid-green gore (used heavily from Phase 1)
  ichorDeep: 0x8a3df0, // violet undertone

  crosshair: 0x3df0c0,
  touchStickBase: 0x1d2c44,
  touchStickKnob: 0x3df0c0,

  // Combat
  swarmer: 0x8fe04a, // acid-green carapace (applied as sprite tint)
  swarmerHurt: 0xffffff, // hit-flash tint
  bullet: 0xaffff0,
  gib: 0x6cff5a,
  gibDark: 0x2e8f3a,
  muzzle: 0xfff2b0,
  hurtFlash: 0xff2d4a,
  acid: 0x9bff3a,
  gem: 0x57f0ff,
  health: 0x4dffa0, // medkit green (matches the HP bar)
  xpBar: 0x57c8ff,
  xpBarBack: 0x10243a,

  // Ichor stamp tints (randomized between these for variety)
  ichorA: 0x4ecb3a,
  ichorB: 0x7a2fd6,

  hudText: 0x7dffd6,
  hudDim: 0x3a5a52,
  hudHpFill: 0x2ee6a6,
  hudHpBack: 0x10231d,
} as const

// P3: damage model and dash (A1)
export const DASH = {
  ticks: 9, distance: 170, // 18.89 u per tick at 60 Hz, about 1133 u/s
  iframes: 0.20, endLag: 0.10, endLagSpeedMul: 0.5,
  cooldown: 2.0, buffer: 0.15, minMoveForDir: 0.2, maxCharges: 4, closeCallRefund: 0.8,
} as const
export const GRACE = { hit: 0.5, draft: 0.75, revive: 1.5, win: 3.0 } as const
export const BITE = { scale: 0.4, window: 0.4, w2: 0.5, w3: 0.25, capFracOfMaxHp: 0.16 } as const
/** A burrower (or dune leviathan) that surfaced this recently, with its body
 *  this close to the player, counts as a Close Call trigger (section 4.3). */
export const CLOSE_CALL = { surfacedWithin: 0.25, surfacedDist: 60 } as const
export const DASH_BTN = {
  visualD: 64, hitR: 44,
  portrait: { offX: 58, offY: 200 }, // center = (W - R - offX, H - B - offY)
  landscape: { offX: 64, offY: 150 },
  aimExclusionPad: 8, fireLatch: 0.45, fireLatchWindow: 0.25,
} as const

// P4: director core (docs/NEXT-LEVEL.md 4.1 and A7.1)
/** Pulses never fill past this; authored events and brood may. */
export const PRACTICAL_CAP = 450
/** Spawn rings around the player, device independent and off screen on every
 *  phone view. NEAR serves the opening minute so the first arrivals are close. */
export const RING_NEAR = { halfW: 640, halfH: 560 } as const
export const RING_STD = { halfW: 900, halfH: 640 } as const
export const RING_NEAR_UNTIL = 60
/** Top-up spawns per second while the field is under the row's minAlive. */
export const TOPUP_RATE = 30
export const WARN_LEAD = 3.0
export const ELITE_WARN_LEAD = 2.0
export const DMG_RAMP_PER_MIN = 0.04
export const SPEED_RAMP = 0.0012
export const SPEED_RAMP_CAP_T = 360
export const ENEMY_SPEED_CEIL = 240
export const HP_RAMP_T_CAP = 720
/** Boss scheduling: arrival is max(at, lastBossKillAt + BOSS_MIN_GAP); mid2
 *  that cannot arrive by MID2_LATEST is skipped. */
export const BOSS_MIN_GAP = 20
export const MID2_LATEST = 570
export const BOSS_SPAWN_DIST = 300
/** Event and elite beats due during a boss fight fire this long after the
 *  kill, then DEFER_GAP apart; an event more than DEFER_DROP_LATE late is dropped. */
export const DEFER_AFTER_KILL = 10
export const DEFER_GAP = 12
export const DEFER_DROP_LATE = 60

// P5: draft, perks, XP flow (A2.3, A6)
export const DRAFT = {
  rareBase: 0.15, rareStep: 0.06, rareMax: 0.55, ownedBias: 0.55, fusionRepeat: 0.35,
  familyStep: 0.5, familyMax: 2.5, startRerolls: 2, startBanishes: 1, maxRerolls: 5, maxBanishes: 3,
  skipHealFrac: 0.2, minGap: 12, lockFullMs: 450, lockShortMs: 300, fullCeremonies: 3,
  /** The Keystone draft never opens before this sim time (s). */
  firstOpenAt: 6,
} as const
/** Fallback cards: SHARPEN damage per pick, FIELD REPAIR heal fraction. */
export const FALLBACK = { sharpenMul: 1.04, repairFrac: 0.35 } as const
/** XP curve and gems (A6). bankLeash: the uncaptured bank gem never sits
 *  farther than this from the player, so it stays in the phone view (short
 *  half-extent 280 u) even with the 78 u aim look-ahead. */
export const XP = { firstLevelCost: 6, a: 5, b: 6, c: 1.2, surgeAfter: 40, surgeMul: 2,
  gemSoftCap: 200, captureRadius: 125, homeStart: 260, homeMax: 900, homeRamp: 0.35, medkitLife: 10,
  bankLeash: 150 } as const
/** Berserker's medkit burst (A2): fire rate bonus and its length in seconds. */
export const BERSERK_MEDKIT = { fireRate: 0.4, sec: 3 } as const
/** Adrenal Wake: the fire-rate window after a dash, doubled by a Close Call. */
export const ADRENAL_WAKE = { sec: 2, closeCallSec: 4 } as const
/** Arc Rounds hops: damage fraction of the hit and hop range (world units). */
export const ARC_ROUNDS = { dmgFrac: 0.5, range: 150 } as const
/** Cryo slow cap on bosses. */
export const BOSS_SLOW_CAP = 0.3

// P6a: hazards, cage, boss framework (docs/NEXT-LEVEL.md 4.1, 4.7, A7.1)
export const CAGE_R = 520
export const CAGE_R_MIN = 340
/** Top-up floor for the swarm kept outside the cage, per arena. */
export const CAGE_OUTSIDE_MIN: Readonly<Record<string, number>> = { hive: 40, depths: 35, wastes: 30 }
/** The cage center keeps CAGE_R + CAGE_WALL_PAD inside the arena walls; the
 *  ring clears the player by at least CAGE_PLAYER_PAD. */
export const CAGE_WALL_PAD = 30
export const CAGE_PLAYER_PAD = 80
/** The arrival shockwave throws the swarm this far past the ring. */
export const CAGE_SHOCK_PAD = 40
/** Top-up spawns land at least this far past the ring while it is up. */
export const CAGE_SPAWN_PAD = 80
export const POST_BOSS_LULL = 15
export const POST_BOSS_LULL_MIN = 0.5
export const FRENZY_AFTER = 90
export const FRENZY_STEP = 15
export const FRENZY_CADENCE = 1.1
export const FRENZY_CADENCE_MAX = 1.6
export const FRENZY_CAGE_STEP = 25
export const STALEMATE_AFTER = 210
/** Boss and elite HP: hp x clamp(baseDps / BOSS_DPS_REF, 1, BOSS_BUILD_MAX) ** BOSS_HP_EXP. */
export const BOSS_DPS_REF = 88
export const BOSS_BUILD_MAX = 12
export const BOSS_HP_EXP = 0.75
export const ELITE_HP_MUL = 1.5
export const ELITE_AFFIX_HP = 0.25
export const BOSS_TELE_MIN = 0.6
export const BOSS_EMERGE = 1.0
export const BOSS_ROAR = 0.8
/** The arrival marker shows where the boss will emerge for this long before it does. */
export const BOSS_MARKER_LEAD = 1.5
export const BOSS_MARKER_R = 90
export const MAX_BROOD = 24
export const MAX_HAZARDS = 48
export const PURGE_SEC = 1.2
export const PURGE_RADIUS = 1500
export const WIN_PANEL_DELAY = 2.0

// P10: score, RunResult v2, stats (docs/NEXT-LEVEL.md 5, 7.3, A14)
/** Multiplier tier colors, indexed by tier (1 to 8); all at least 6.5:1 on INK. */
export const TIER_COLOR: readonly number[] = [0x7da99c, 0x7da99c, 0x7dffd6, 0x57c8ff, 0xb886ff, 0xffe066, 0xffb066, 0xff6a6a, 0xff6cf0]
/** A run shorter than this adds seconds, kills and damage to the lifetime stats, but no run. */
export const STATS_MIN_RUN_S = 10

// P8: fusions, evolutions, pods (docs/NEXT-LEVEL.md 4.5, A3, A4, A5.1)
export const PODS = { first: 20, interval: 15, life: 20, blinkLast: 3, minDist: 250, maxDist: 450,
  edgeInset: 60, cageInset: 40, holdTime: 0.4, holdDecayPerSec: 2, holdRadiusPad: 6,
  affinityChance: 0.5, eliteChance: 0.35, bossPodOffset: 60 } as const
/** Blast queue (A3): capacity, and the flags each entry carries. KNOCK shoves
 *  non-elite, non-boss enemies knockPx away from the blast center. */
export const BLAST_CAP = 64
export const BLAST_NO_BONUS = 1
export const BLAST_KNOCK = 2
export const BLAST_CRIT = 4
export const BLAST_KNOCK_PX = 40
/** Ricochet: a spent bullet seeks the nearest unhit enemy within radius and
 *  lives at least minLife more. */
export const SEEK = { radius: 280, minLife: 0.35 } as const
/** Incendiary burn length (s); the burn refreshes and does not stack. */
export const BURN_SEC = 2
/** Fusion effects (A3). */
export const FUSION = {
  shatterR: 70, shatterBase: 12, shatterFrac: 0.25,
  firestormArcMul: 1.5,
  pinballDmgMul: 1.15,
  headhunterR: 55, headhunterFrac: 0.4,
  guillotineEliteFrac: 0.5, guillotineXpMul: 2,
  bloodrushBelow: 0.5, bloodrushHealMul: 2, bloodrushCapMul: 1.5, bloodrushSpeedMul: 1.2,
  livingArmorFrac: 0.25,
  ramPad: 30, ramThornsMul: 6, ramPush: 40,
  salvoShots: 12, salvoDmgFrac: 0.6,
  coldBloodMul: 1.3,
} as const
/** Evolved weapon behaviors (A4.2). */
export const EVO = {
  pointBlankSec: 0.12, pointBlankMul: 2,
  lockStep: 0.05, lockMax: 0.75, lockResetSec: 0.4,
  pierceRampMul: 1.2, pierceRampMax: 2.5,
  igniteDps: 10, infernoBurnMul: 1.25,
  bombletCount: 3, bombletDelay: 0.25, bombletDist: 55, bombletR: 50, bombletFrac: 0.35,
  stormChainFrac: 0.75, stormBlastR: 70, stormBlastFrac: 0.5,
  rangeRampPer100: 0.12, rangeRampMax: 0.9,
} as const

// P7: swarm events and affixes (docs/NEXT-LEVEL.md 4.7, A8, A9)
/** Concurrent event parts in emission (a FINAL SWARM fills all three). */
export const EVENT_SLOTS = 3
/** A stream unit this far past the arena wall it heads through despawns with no credit. */
export const STREAM_EXIT_PAD = 40
/** Events and brood ignore maxAlive; they spawn only while the field is under
 *  MAX_ENEMIES minus this. */
export const SPAWN_ROOM = 20
