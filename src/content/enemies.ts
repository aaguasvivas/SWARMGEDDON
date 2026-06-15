import { COLORS } from '../config.ts'

/**
 * Enemy registry — pure data. "Type" = sprite key + stats + a behavior tag the
 * AI system switches on + an animation/ichor signature. The alien-hive fiction
 * is just these numbers and sprites; reskinning swaps them with zero engine
 * change.
 */
export type EnemyBehavior = 'chaser' | 'flyer' | 'spitter' | 'splitter'

export interface EnemyDef {
  id: string
  sprite: string
  hp: number
  speed: number
  radius: number
  damage: number // contact damage per second
  xp: number
  tint: number
  scale: number
  behavior: EnemyBehavior
  gibColor: number
  gibCount: number
  /** Beetle-style frontal armor: fraction of damage blocked when hit from the
   *  front (0 = none). */
  frontArmor?: number
  /** Spitter ranged params. */
  preferRange?: number
  fireCooldown?: number
  projectileSpeed?: number
  projectileDamage?: number
  /** Splitter: what it spawns on death and how many. */
  splitInto?: string
  splitCount?: number
  /** Per-type HP growth applied with elapsed run time (toughness ramp). */
  hpRamp: number
}

export const ENEMIES: Record<string, EnemyDef> = {
  swarmer: {
    id: 'swarmer',
    sprite: 'swarmer',
    hp: 3,
    speed: 74,
    radius: 14,
    damage: 20,
    xp: 1,
    tint: COLORS.swarmer,
    scale: 1,
    behavior: 'chaser',
    gibColor: COLORS.gib,
    gibCount: 5,
    hpRamp: 1 / 30, // +1 hp per 30s
  },
  flyer: {
    id: 'flyer',
    sprite: 'flyer',
    hp: 2,
    speed: 138,
    radius: 12,
    damage: 16,
    xp: 1,
    tint: 0x66e0ff,
    scale: 0.95,
    behavior: 'flyer',
    gibColor: 0x8fefff,
    gibCount: 4,
    hpRamp: 1 / 45,
  },
  beetle: {
    id: 'beetle',
    sprite: 'beetle',
    hp: 26,
    speed: 48,
    radius: 20,
    damage: 34,
    xp: 4,
    tint: 0xc9a23a,
    scale: 1.3,
    behavior: 'chaser',
    gibColor: 0xd8b24a,
    gibCount: 9,
    frontArmor: 0.6,
    hpRamp: 1 / 8, // tanks scale hard
  },
  spitter: {
    id: 'spitter',
    sprite: 'spitter',
    hp: 9,
    speed: 56,
    radius: 16,
    damage: 18,
    xp: 3,
    tint: 0xb6ff5a,
    scale: 1.1,
    behavior: 'spitter',
    gibColor: 0x9bff3a,
    gibCount: 6,
    preferRange: 280,
    fireCooldown: 2.1,
    projectileSpeed: 300,
    projectileDamage: 14,
    hpRamp: 1 / 22,
  },
  splitter: {
    id: 'splitter',
    sprite: 'splitter',
    hp: 14,
    speed: 60,
    radius: 18,
    damage: 22,
    xp: 3,
    tint: 0xff7ad8,
    scale: 1.2,
    behavior: 'splitter',
    gibColor: 0xff9ae0,
    gibCount: 7,
    splitInto: 'swarmer',
    splitCount: 3,
    hpRamp: 1 / 20,
  },
}
