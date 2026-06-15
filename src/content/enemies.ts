import { COLORS } from '../config.ts'

/**
 * Enemy registry — pure data. "Type" = sprite key + stats + a behavior tag the
 * AI switches on + behavior-specific param blocks + an animation/ichor
 * signature. Variants reuse a base sprite with a different tint/scale; only the
 * genuinely new silhouettes get their own sprite builder.
 */
export type EnemyBehavior = 'chaser' | 'flyer' | 'spitter' | 'splitter' | 'burrower' | 'aura' | 'teleporter' | 'queen'

export interface EnemyDef {
  id: string
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
  /** Queen brood spawning + enrage. */
  brood?: { ids: readonly string[]; count: number; cooldown: number }
  enrageAt?: number // hp fraction
  elite?: boolean
  boss?: boolean
}

export const ENEMIES: Record<string, EnemyDef> = {
  swarmer: { id: 'swarmer', sprite: 'swarmer', hp: 3, speed: 74, radius: 14, damage: 20, xp: 1, tint: COLORS.swarmer, scale: 1, behavior: 'chaser', gibColor: COLORS.gib, gibCount: 5, hpRamp: 1 / 30 },
  biter: { id: 'biter', sprite: 'swarmer', hp: 2, speed: 104, radius: 11, damage: 14, xp: 1, tint: 0xff7a5a, scale: 0.8, behavior: 'chaser', gibColor: 0xff8a6a, gibCount: 4, hpRamp: 1 / 40 },
  flyer: { id: 'flyer', sprite: 'flyer', hp: 2, speed: 138, radius: 12, damage: 16, xp: 1, tint: 0x66e0ff, scale: 0.95, behavior: 'flyer', gibColor: 0x8fefff, gibCount: 4, hpRamp: 1 / 45 },
  wraith: { id: 'wraith', sprite: 'flyer', hp: 6, speed: 116, radius: 14, damage: 20, xp: 2, tint: 0xb27aff, scale: 1.15, behavior: 'flyer', gibColor: 0xc79aff, gibCount: 5, hpRamp: 1 / 28 },
  beetle: { id: 'beetle', sprite: 'beetle', hp: 26, speed: 48, radius: 20, damage: 34, xp: 4, tint: 0xc9a23a, scale: 1.3, behavior: 'chaser', gibColor: 0xd8b24a, gibCount: 9, frontArmor: 0.6, hpRamp: 1 / 8 },
  brute: { id: 'brute', sprite: 'beetle', hp: 42, speed: 66, radius: 24, damage: 46, xp: 6, tint: 0x8a5a2a, scale: 1.55, behavior: 'chaser', gibColor: 0xb07a3a, gibCount: 11, hpRamp: 1 / 6 },
  spitter: { id: 'spitter', sprite: 'spitter', hp: 9, speed: 56, radius: 16, damage: 18, xp: 3, tint: 0xb6ff5a, scale: 1.1, behavior: 'spitter', gibColor: 0x9bff3a, gibCount: 6, preferRange: 280, fireCooldown: 2.1, projectileSpeed: 300, projectileDamage: 14, leavesAcid: true, hpRamp: 1 / 22 },
  stinger: { id: 'stinger', sprite: 'spitter', hp: 7, speed: 70, radius: 14, damage: 16, xp: 3, tint: 0xe2ff8a, scale: 1, behavior: 'spitter', gibColor: 0xd8ff7a, gibCount: 5, preferRange: 240, fireCooldown: 1.2, projectileSpeed: 460, projectileDamage: 11, leavesAcid: false, hpRamp: 1 / 26 },
  splitter: { id: 'splitter', sprite: 'splitter', hp: 14, speed: 60, radius: 18, damage: 22, xp: 3, tint: 0xff7ad8, scale: 1.2, behavior: 'splitter', gibColor: 0xff9ae0, gibCount: 7, splitInto: 'swarmer', splitCount: 3, hpRamp: 1 / 20 },
  burrower: { id: 'burrower', sprite: 'burrower', hp: 16, speed: 92, radius: 16, damage: 30, xp: 4, tint: 0xcf8f5a, scale: 1.15, behavior: 'burrower', gibColor: 0xd8a06a, gibCount: 7, burrow: { underTime: 1.8, surfaceTime: 3.2, underSpeedMul: 1.7 }, hpRamp: 1 / 16 },
  hivemind: { id: 'hivemind', sprite: 'hivemind', hp: 30, speed: 40, radius: 20, damage: 18, xp: 6, tint: 0xff5ab0, scale: 1.3, behavior: 'aura', gibColor: 0xff7ac0, gibCount: 9, aura: { radius: 170, speedMul: 1.35 }, hpRamp: 1 / 12 },
  psychic: { id: 'psychic', sprite: 'psychic', hp: 18, speed: 52, radius: 16, damage: 16, xp: 5, tint: 0x9b7aff, scale: 1.15, behavior: 'teleporter', gibColor: 0xb79aff, gibCount: 7, preferRange: 300, fireCooldown: 2.4, projectileSpeed: 420, projectileDamage: 18, teleport: { cooldown: 3.5, range: 260 }, hpRamp: 1 / 18 },
  warper: { id: 'warper', sprite: 'warper', hp: 24, speed: 58, radius: 18, damage: 24, xp: 6, tint: 0x7affd8, scale: 1.25, behavior: 'chaser', gibColor: 0x9affe0, gibCount: 8, warps: true, hpRamp: 1 / 14 },
  guardian: { id: 'guardian', sprite: 'beetle', hp: 120, speed: 54, radius: 28, damage: 52, xp: 20, tint: 0xe85a3a, scale: 1.9, behavior: 'chaser', gibColor: 0xff7a4a, gibCount: 16, frontArmor: 0.4, elite: true, hpRamp: 1 / 4 },
  queen: { id: 'queen', sprite: 'queen', hp: 1600, speed: 34, radius: 46, damage: 60, xp: 200, tint: 0xff3a8a, scale: 2.6, behavior: 'queen', gibColor: 0xff6aa8, gibCount: 30, boss: true, brood: { ids: ['swarmer', 'splitter', 'flyer'], count: 4, cooldown: 4 }, enrageAt: 0.5, hpRamp: 1 / 2 },
}
