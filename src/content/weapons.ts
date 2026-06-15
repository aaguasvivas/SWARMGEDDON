import { COLORS } from '../config.ts'

/**
 * Weapon definition — pure data. Phase 1 ships one weapon; Phase 2 turns this
 * into the full registry the rest of the game drafts from. The fields are the
 * complete feel vocabulary (fire rate, spread, pierce, knockback, …) so later
 * weapons need no new engine support.
 */
export interface WeaponDef {
  name: string
  fireRate: number // shots per second
  damage: number
  projectileSpeed: number // px/sec
  spread: number // radians, half-angle
  projectilesPerShot: number
  pierce: number // enemies a bullet passes through (0 = stop on first)
  knockback: number // impulse strength
  projectileLife: number // seconds
  projectileRadius: number
  tint: number
}

/** The default starting weapon: a punchy full-auto that paints the floor fast. */
export const DEFAULT_WEAPON: WeaponDef = {
  name: 'Splatter SMG',
  fireRate: 11,
  damage: 7,
  projectileSpeed: 780,
  spread: 0.085,
  projectilesPerShot: 1,
  pierce: 0,
  knockback: 120,
  projectileLife: 0.7,
  projectileRadius: 4,
  tint: COLORS.bullet,
}
