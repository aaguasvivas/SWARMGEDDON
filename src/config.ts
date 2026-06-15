/**
 * Global tunables and the alien-hive palette.
 *
 * Everything here is data the engine reads — no logic. Later phases move
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

/** Pixels of empty gutter between the screen edge (inside safe area) and the arena. */
export const ARENA_MARGIN = 24

/** Player movement constants (world units; world units == CSS px in the fixed-camera arena). */
export const PLAYER_RADIUS = 18
export const PLAYER_SPEED = 270 // units per second

/** Gamepad analog deadzone — sticks rest noisily around center. */
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
export const MAX_FLOATERS = 48

/** Spatial-hash cell size (world units). ~3-4x an enemy diameter is a good ratio. */
export const HASH_CELL = 72

/** Juice. */
export const SHAKE_MAX_OFFSET = 22 // px at full trauma
export const SHAKE_DECAY = 1.7 // trauma units per second
export const HITSTOP_MAX = 0.08 // hard cap on a single freeze (seconds)

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
  damageText: 0xeafff0,
  muzzle: 0xfff2b0,
  hurtFlash: 0xff2d4a,

  // Ichor stamp tints (randomized between these for variety)
  ichorA: 0x4ecb3a,
  ichorB: 0x7a2fd6,

  hudText: 0x7dffd6,
  hudDim: 0x3a5a52,
  hudHpFill: 0x2ee6a6,
  hudHpBack: 0x10231d,
} as const
