import { COLORS } from '../config.ts'

/**
 * Weapon registry — pure data. The starting Pistol has infinite ammo (the
 * always-available fallback); pickups grant the others with finite ammo and
 * revert to the Pistol when empty. Adding a weapon = one entry here (+ a
 * projectile sprite in the manifest if it wants a custom one).
 */
export interface WeaponDef {
  id: string
  name: string
  fireRate: number // shots per second
  damage: number
  projectileSpeed: number // px/sec
  spread: number // radians, half-angle
  projectilesPerShot: number
  pierce: number
  knockback: number
  projectileLife: number // seconds
  projectileRadius: number
  tint: number
  /** Magazine for pickups; -1 = infinite (the default Pistol). */
  ammo: number
  /** Per-shot screen-shake trauma. */
  shake: number
}

export const DEFAULT_WEAPON_ID = 'pistol'

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'Sidearm',
    fireRate: 5.5,
    damage: 15,
    projectileSpeed: 760,
    spread: 0.02,
    projectilesPerShot: 1,
    pierce: 0,
    knockback: 130,
    projectileLife: 0.8,
    projectileRadius: 4,
    tint: COLORS.bullet,
    ammo: -1,
    shake: 0.05,
  },
  smg: {
    id: 'smg',
    name: 'Splatter SMG',
    fireRate: 13,
    damage: 7,
    projectileSpeed: 820,
    spread: 0.1,
    projectilesPerShot: 1,
    pierce: 0,
    knockback: 90,
    projectileLife: 0.65,
    projectileRadius: 3.5,
    tint: COLORS.bullet,
    ammo: 240,
    shake: 0.03,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Boomstick',
    fireRate: 2.1,
    damage: 6,
    projectileSpeed: 720,
    spread: 0.32,
    projectilesPerShot: 9,
    pierce: 0,
    knockback: 260,
    projectileLife: 0.4,
    projectileRadius: 4,
    tint: 0xffd27a,
    ammo: 44,
    shake: 0.16,
  },
  plasma: {
    id: 'plasma',
    name: 'Ion Lance',
    fireRate: 7,
    damage: 17,
    projectileSpeed: 980,
    spread: 0.03,
    projectilesPerShot: 1,
    pierce: 3,
    knockback: 70,
    projectileLife: 0.9,
    projectileRadius: 5.5,
    tint: 0xb98cff,
    ammo: 100,
    shake: 0.06,
  },
}

/** Weapon ids that can drop as field pickups (everything but the default). */
export const PICKUP_WEAPON_IDS = Object.keys(WEAPONS).filter((id) => id !== DEFAULT_WEAPON_ID)
