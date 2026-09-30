/**
 * Timed bonus pickups (A5.3): pure data. A kill may drop one; the type roll
 * weighs these, and `duration` 0 is an instant effect.
 */
export interface BonusDef {
  id: string
  name: string
  weight: number
  /** Seconds the effect lasts; 0 = instant. */
  duration: number
  tint: number
}

export const BONUS_NUKE = 0
export const BONUS_FREEZE = 1
export const BONUS_OVERDRIVE = 2
export const BONUS_SHIELD = 3
export const BONUS_FIREBLAST = 4
export const BONUS_VACUUM = 5

/** Indexed by the BONUS_* constants; the FeelQueue carries bonuses by index. */
export const BONUSES: readonly BonusDef[] = [
  { id: 'nuke', name: 'NUKE', weight: 14, duration: 0, tint: 0xff5a3c },
  { id: 'freeze', name: 'FREEZE', weight: 16, duration: 4.0, tint: 0x9be7ff },
  { id: 'overdrive', name: 'OVERDRIVE', weight: 20, duration: 8.0, tint: 0xffc24a },
  { id: 'shield', name: 'SHIELD', weight: 16, duration: 6.0, tint: 0x4dffa0 },
  { id: 'fireblast', name: 'FIREBLAST', weight: 20, duration: 0, tint: 0xff9a3c },
  { id: 'vacuum', name: 'VACUUM', weight: 14, duration: 0, tint: 0xb886ff },
]
