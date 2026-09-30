import { COLORS } from '../config.ts'

/**
 * Enemy registry: pure data. "Type" = sprite key + stats + a behavior tag the
 * AI switches on + behavior-specific param blocks + an animation/ichor
 * signature. Variants reuse a base sprite with a different tint/scale; only the
 * genuinely new silhouettes get their own sprite builder.
 */
export type EnemyBehavior = 'chaser' | 'flyer' | 'spitter' | 'splitter' | 'burrower' | 'aura' | 'teleporter' | 'boss' | 'egg' | 'charger'

export interface EnemyDef {
  id: string
  /** Player-facing name for alerts and labels (max 18 chars). */
  displayName: string
  sprite: string
  hp: number
  speed: number
  radius: number
  damage: number
  xp: number
  tint: number
  scale: number
  behavior: EnemyBehavior
  gibColor: number
  gibCount: number
  hpRamp: number
  frontArmor?: number
  /** Ranged (spitter/stinger/teleporter blast). */
  preferRange?: number
  fireCooldown?: number
  projectileSpeed?: number
  projectileDamage?: number
  leavesAcid?: boolean
  /** Splitter offspring. */
  splitInto?: string
  splitCount?: number
  /** Aura buff applied to nearby enemies (hive mind). */
  aura?: { radius: number; speedMul: number }
  /** Burrower submerge cycle. */
  burrow?: { underTime: number; surfaceTime: number; underSpeedMul: number }
  /** Teleporter relocation. */
  teleport?: { cooldown: number; range: number }
  /** Reality-warper: drives the screen-distortion gimmick while alive. */
  warps?: boolean
  /** Charger: telegraphed line-dash (heading locked at windup start, zero RNG). */
  charge?: { triggerRange: number; windup: number; dashSpeed: number; dashTime: number; recover: number }
  /** Gravity well: drags the player toward this enemy (total pull is clamped
   *  globally (see aiSystem), so it can never overpower the move stick). */
  wellPull?: { radius: number; strength: number }
  /** Egg: hatches `count` of `into` this many seconds after it is laid. */
  hatch?: { after: number; into: string; count: number }
  elite?: boolean
  boss?: boolean
  /** Position in ENEMY_IDS: assigned when this module loads, never authored. */
  idx: number
}

type EnemySpec = Omit<EnemyDef, 'idx'>

const SPECS: Record<string, EnemySpec> = {
  swarmer: { id: 'swarmer', displayName: 'SWARMER', sprite: 'swarmer', hp: 3, speed: 74, radius: 14, damage: 20, xp: 1, tint: COLORS.swarmer, scale: 1, behavior: 'chaser', gibColor: COLORS.gib, gibCount: 5, hpRamp: 1 / 30 },
  biter: { id: 'biter', displayName: 'BITER', sprite: 'swarmer', hp: 2, speed: 104, radius: 11, damage: 14, xp: 1, tint: 0xff7a5a, scale: 0.8, behavior: 'chaser', gibColor: 0xff8a6a, gibCount: 4, hpRamp: 1 / 40 },
  flyer: { id: 'flyer', displayName: 'FLYER', sprite: 'flyer', hp: 2, speed: 138, radius: 12, damage: 16, xp: 1, tint: 0x66e0ff, scale: 0.95, behavior: 'flyer', gibColor: 0x8fefff, gibCount: 4, hpRamp: 1 / 45 },
  wraith: { id: 'wraith', displayName: 'WRAITH', sprite: 'flyer', hp: 6, speed: 116, radius: 14, damage: 20, xp: 2, tint: 0xb27aff, scale: 1.15, behavior: 'flyer', gibColor: 0xc79aff, gibCount: 5, hpRamp: 1 / 28 },
  beetle: { id: 'beetle', displayName: 'BEETLE', sprite: 'beetle', hp: 26, speed: 48, radius: 20, damage: 34, xp: 4, tint: 0xc9a23a, scale: 1.3, behavior: 'chaser', gibColor: 0xd8b24a, gibCount: 9, frontArmor: 0.6, hpRamp: 1 / 8 },
  brute: { id: 'brute', displayName: 'BRUTE', sprite: 'beetle', hp: 42, speed: 66, radius: 24, damage: 46, xp: 6, tint: 0x8a5a2a, scale: 1.55, behavior: 'chaser', gibColor: 0xb07a3a, gibCount: 11, hpRamp: 1 / 6 },
  spitter: { id: 'spitter', displayName: 'SPITTER', sprite: 'spitter', hp: 9, speed: 56, radius: 16, damage: 18, xp: 3, tint: 0xb6ff5a, scale: 1.1, behavior: 'spitter', gibColor: 0x9bff3a, gibCount: 6, preferRange: 280, fireCooldown: 2.1, projectileSpeed: 300, projectileDamage: 14, leavesAcid: true, hpRamp: 1 / 22 },
  stinger: { id: 'stinger', displayName: 'STINGER', sprite: 'spitter', hp: 7, speed: 70, radius: 14, damage: 16, xp: 3, tint: 0xe2ff8a, scale: 1, behavior: 'spitter', gibColor: 0xd8ff7a, gibCount: 5, preferRange: 240, fireCooldown: 1.2, projectileSpeed: 460, projectileDamage: 11, leavesAcid: false, hpRamp: 1 / 26 },
  splitter: { id: 'splitter', displayName: 'SPLITTER', sprite: 'splitter', hp: 14, speed: 60, radius: 18, damage: 22, xp: 3, tint: 0xff7ad8, scale: 1.2, behavior: 'splitter', gibColor: 0xff9ae0, gibCount: 7, splitInto: 'swarmer', splitCount: 3, hpRamp: 1 / 20 },
  burrower: { id: 'burrower', displayName: 'BURROWER', sprite: 'burrower', hp: 16, speed: 92, radius: 16, damage: 30, xp: 4, tint: 0xcf8f5a, scale: 1.15, behavior: 'burrower', gibColor: 0xd8a06a, gibCount: 7, burrow: { underTime: 1.8, surfaceTime: 3.2, underSpeedMul: 1.7 }, hpRamp: 1 / 16 },
  hivemind: { id: 'hivemind', displayName: 'HIVE MIND', sprite: 'hivemind', hp: 30, speed: 40, radius: 20, damage: 18, xp: 6, tint: 0xff5ab0, scale: 1.3, behavior: 'aura', gibColor: 0xff7ac0, gibCount: 9, aura: { radius: 170, speedMul: 1.35 }, hpRamp: 1 / 12 },
  psychic: { id: 'psychic', displayName: 'PSYCHIC', sprite: 'psychic', hp: 18, speed: 52, radius: 16, damage: 16, xp: 5, tint: 0x9b7aff, scale: 1.15, behavior: 'teleporter', gibColor: 0xb79aff, gibCount: 7, preferRange: 300, fireCooldown: 2.4, projectileSpeed: 420, projectileDamage: 18, teleport: { cooldown: 3.5, range: 260 }, hpRamp: 1 / 18 },
  warper: { id: 'warper', displayName: 'WARPER', sprite: 'warper', hp: 24, speed: 58, radius: 18, damage: 24, xp: 6, tint: 0x7affd8, scale: 1.25, behavior: 'chaser', gibColor: 0x9affe0, gibCount: 8, warps: true, hpRamp: 1 / 14 },
  guardian: { id: 'guardian', displayName: 'GUARDIAN', sprite: 'beetle', hp: 120, speed: 54, radius: 28, damage: 52, xp: 20, tint: 0xe85a3a, scale: 1.9, behavior: 'chaser', gibColor: 0xff7a4a, gibCount: 16, frontArmor: 0.4, elite: true, hpRamp: 1 / 4 },
  // A boss the director spawns takes its HP from the stage table (content/bosses.ts).
  queen: { id: 'queen', displayName: 'THE QUEEN', sprite: 'queen', hp: 1600, speed: 34, radius: 46, damage: 60, xp: 120, tint: 0xff3a8a, scale: 2.6, behavior: 'boss', gibColor: 0xff6aa8, gibCount: 30, boss: true, hpRamp: 0 },
  queenPrime: { id: 'queenPrime', displayName: 'QUEEN PRIME', sprite: 'queen', hp: 4200, speed: 34, radius: 56, damage: 60, xp: 240, tint: 0xff2a6a, scale: 3.2, behavior: 'boss', gibColor: 0xff6aa8, gibCount: 36, boss: true, hpRamp: 0 },
  egg: { id: 'egg', displayName: 'EGG', sprite: 'splitter', hp: 40, speed: 0, radius: 14, damage: 0, xp: 2, tint: 0xffc2e6, scale: 0.9, behavior: 'egg', gibColor: 0xffd6ee, gibCount: 5, hatch: { after: 4.0, into: 'swarmer', count: 3 }, hpRamp: 0 },

  // --- Three Worlds roster (docs/WORLDS-SPEC.md) -----------------------------
  // HIVE signature: splitter-line capstone: one kill cascades 2 splitters -> 6 swarmers.
  broodmother: { id: 'broodmother', displayName: 'BROODMOTHER', sprite: 'broodmother', hp: 44, speed: 46, radius: 22, damage: 26, xp: 8, tint: 0xff8ad0, scale: 1.7, behavior: 'splitter', gibColor: 0xff9ae0, gibCount: 11, splitInto: 'splitter', splitCount: 2, hpRamp: 1 / 10 },
  // DEPTHS signature: shoal-scale speed aura (needs per-def speedMul, honored in ai.ts).
  deepCaller: { id: 'deepCaller', displayName: 'DEEP CALLER', sprite: 'deepCaller', hp: 40, speed: 36, radius: 20, damage: 16, xp: 8, tint: 0xd28fff, scale: 1.4, behavior: 'aura', gibColor: 0xdbaeff, gibCount: 8, aura: { radius: 230, speedMul: 1.55 }, hpRamp: 1 / 10 },
  // DEPTHS verb: slow drifting gravity well that drags the player toward it.
  abyssalMaw: { id: 'abyssalMaw', displayName: 'ABYSSAL MAW', sprite: 'maw', hp: 36, speed: 30, radius: 20, damage: 20, xp: 7, tint: 0xff6aba, scale: 1.5, behavior: 'chaser', gibColor: 0xff8ac3, gibCount: 8, wellPull: { radius: 260, strength: 120 }, hpRamp: 1 / 12 },
  // WASTES verb: telegraphed line-dash: heading locks at windup, sidestep beats it.
  cinderCharger: { id: 'cinderCharger', displayName: 'CINDER CHARGER', sprite: 'charger', hp: 18, speed: 78, radius: 16, damage: 26, xp: 4, tint: 0xfffb4a, scale: 1.05, behavior: 'charger', gibColor: 0xfffd66, gibCount: 6, charge: { triggerRange: 300, windup: 0.7, dashSpeed: 460, dashTime: 0.55, recover: 0.65 }, hpRamp: 1 / 16 },
  // WASTES signature: long-range artillery whose slow globs carpet the floor.
  cinderMortarch: { id: 'cinderMortarch', displayName: 'CINDER MORTARCH', sprite: 'cinderMortarch', hp: 30, speed: 34, radius: 18, damage: 18, xp: 8, tint: 0xfffd66, scale: 1.4, behavior: 'spitter', gibColor: 0xfaff7a, gibCount: 8, preferRange: 380, fireCooldown: 2.8, projectileSpeed: 170, projectileDamage: 20, leavesAcid: true, hpRamp: 1 / 12 },
  // DEPTHS elite: psychic remix; the teleporter behavior already fires shots.
  abyssalWarden: { id: 'abyssalWarden', displayName: 'WARDEN', sprite: 'psychic', hp: 260, speed: 52, radius: 26, damage: 40, xp: 26, tint: 0xff9ac9, scale: 2.0, behavior: 'teleporter', gibColor: 0xffb2d1, gibCount: 14, preferRange: 320, fireCooldown: 2.0, projectileSpeed: 340, projectileDamage: 26, teleport: { cooldown: 2.8, range: 300 }, elite: true, hpRamp: 1 / 4 },
  // WASTES elite: burrower remix: intangible submerged; unload in surface windows.
  duneLeviathan: { id: 'duneLeviathan', displayName: 'LEVIATHAN', sprite: 'burrower', hp: 320, speed: 96, radius: 28, damage: 64, xp: 30, tint: 0xe8e75a, scale: 2.3, behavior: 'burrower', gibColor: 0xedf06a, gibCount: 16, burrow: { underTime: 2.5, surfaceTime: 2.5, underSpeedMul: 2.2 }, elite: true, hpRamp: 1 / 4 },
  // DEPTHS boss: the reality-warp runs for the whole fight.
  voidMatron: { id: 'voidMatron', displayName: 'THE VOID MATRON', sprite: 'queen', hp: 1500, speed: 40, radius: 44, damage: 55, xp: 120, tint: 0xff6b95, scale: 2.5, behavior: 'boss', gibColor: 0xff9ab9, gibCount: 28, boss: true, warps: true, hpRamp: 0 },
  voidMatronPrime: { id: 'voidMatronPrime', displayName: 'MATRON PRIME', sprite: 'queen', hp: 4200, speed: 40, radius: 54, damage: 55, xp: 240, tint: 0xff4f86, scale: 3.1, behavior: 'boss', gibColor: 0xff9ab9, gibCount: 34, boss: true, warps: true, hpRamp: 0 },
  // WASTES boss: surrounds itself with flak turrets.
  emberTyrant: { id: 'emberTyrant', displayName: 'THE EMBER TYRANT', sprite: 'queen', hp: 2000, speed: 30, radius: 48, damage: 60, xp: 130, tint: 0xffeb3d, scale: 2.8, behavior: 'boss', gibColor: 0xfff25a, gibCount: 32, boss: true, hpRamp: 0 },
  emberTyrantPrime: { id: 'emberTyrantPrime', displayName: 'TYRANT PRIME', sprite: 'queen', hp: 4200, speed: 30, radius: 58, damage: 60, xp: 260, tint: 0xffd23d, scale: 3.4, behavior: 'boss', gibColor: 0xfff25a, gibCount: 38, boss: true, hpRamp: 0 },
  // EMBER TYRANT brood: a rooted gun. It collapses when its fight ends (bossAI).
  flakTurret: { id: 'flakTurret', displayName: 'FLAK TURRET', sprite: 'cinderMortarch', hp: 60, speed: 0, radius: 16, damage: 0, xp: 3, tint: 0xff8a2a, scale: 1.0, behavior: 'spitter', gibColor: 0xffb05a, gibCount: 6, fireCooldown: 1.6, projectileSpeed: 460, projectileDamage: 11, leavesAcid: false, hpRamp: 0.1 },
}

/** Every enemy id in a stable order (RunResult kill tallies and the killer id). */
export const ENEMY_IDS: readonly string[] = Object.keys(SPECS)
export const ENEMIES: Record<string, EnemyDef> = {}
for (let i = 0; i < ENEMY_IDS.length; i++) ENEMIES[ENEMY_IDS[i]!] = { ...SPECS[ENEMY_IDS[i]!]!, idx: i }
