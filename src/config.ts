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

/** Pickups / XP. */
export const BASE_MAGNET_RADIUS = 125 // px; scaled by the Magnetic perk. Generous
// so XP gems visibly zip to the player on a kill, which makes them obviously collectible.
export const GEM_LIFETIME = 12 // seconds before an uncollected XP gem fades
export const WEAPON_DROP_INTERVAL = 13 // seconds between weapon pod drops
export const WEAPON_DROP_LIFETIME = 24

/**
 * Health pickups: perk-free sustain tied to killing. Most kills have a small
 * chance to drop a medkit that magnetizes in and heals a little; elites/bosses
 * are reliable chunks. So clearing a big swarm lets you claw HP back bit by bit.
 */
export const HEALTH_DROP_CHANCE = 0.07
export const HEALTH_HEAL = 5
export const HEALTH_HEAL_ELITE = 14
export const HEALTH_LIFETIME = 10

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
export const BOSS_SPAWN_MIN_DIST = 160
/** Event and elite beats due during a boss fight fire this long after the
 *  kill, then DEFER_GAP apart; an event more than DEFER_DROP_LATE late is dropped. */
export const DEFER_AFTER_KILL = 10
export const DEFER_GAP = 12
export const DEFER_DROP_LATE = 60
