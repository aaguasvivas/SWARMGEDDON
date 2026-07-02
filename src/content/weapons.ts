import { COLORS } from '../config.ts'
import type { SfxName } from '../audio/audio.ts'

/**
 * Weapon registry — pure data. The starting Sidearm has infinite ammo; pickups
 * grant the others with finite mags that revert to the Sidearm when empty. Two
 * special mechanics ride on optional fields: `explode*` (rockets) and `chain*`
 * (lightning). Everything else is feel expressed through the shared params.
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
  ammo: number // -1 = infinite (Sidearm)
  shake: number // per-shot trauma
  sfx: SfxName
  /** Explosive: AoE on impact. */
  explodeRadius?: number
  explodeDamage?: number
  /** Chain lightning: jump to N more nearby enemies per hit. */
  chain?: number
  chainRange?: number
}

export const DEFAULT_WEAPON_ID = 'pistol'

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'Sidearm', fireRate: 5.5, damage: 16, projectileSpeed: 780,
    spread: 0.02, projectilesPerShot: 1, pierce: 0, knockback: 130, projectileLife: 0.8,
    projectileRadius: 4, tint: COLORS.bullet, ammo: -1, shake: 0.05, sfx: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Splatter SMG', fireRate: 13, damage: 7, projectileSpeed: 840,
    spread: 0.1, projectilesPerShot: 1, pierce: 0, knockback: 90, projectileLife: 0.6,
    projectileRadius: 3.5, tint: COLORS.bullet, ammo: 260, shake: 0.03, sfx: 'smg',
  },
  shotgun: {
    id: 'shotgun', name: 'Boomstick', fireRate: 2.1, damage: 6, projectileSpeed: 720,
    spread: 0.32, projectilesPerShot: 9, pierce: 0, knockback: 280, projectileLife: 0.36,
    projectileRadius: 4, tint: 0xffd27a, ammo: 48, shake: 0.16, sfx: 'shotgun',
  },
  minigun: {
    id: 'minigun', name: 'Hive Ripper', fireRate: 20, damage: 6, projectileSpeed: 900,
    spread: 0.14, projectilesPerShot: 1, pierce: 0, knockback: 60, projectileLife: 0.55,
    projectileRadius: 3.5, tint: 0xffe08a, ammo: 480, shake: 0.025, sfx: 'smg',
  },
  plasma: {
    id: 'plasma', name: 'Ion Lance', fireRate: 7, damage: 18, projectileSpeed: 980,
    spread: 0.03, projectilesPerShot: 1, pierce: 3, knockback: 70, projectileLife: 0.9,
    projectileRadius: 5.5, tint: 0xb98cff, ammo: 110, shake: 0.06, sfx: 'plasma',
  },
  railgun: {
    id: 'railgun', name: 'Rail Spike', fireRate: 1.5, damage: 90, projectileSpeed: 1700,
    spread: 0.004, projectilesPerShot: 1, pierce: 8, knockback: 320, projectileLife: 0.6,
    projectileRadius: 5, tint: 0x86f7ff, ammo: 28, shake: 0.22, sfx: 'heavy',
  },
  flamethrower: {
    id: 'flamethrower', name: 'Pyre', fireRate: 22, damage: 4.5, projectileSpeed: 460,
    spread: 0.26, projectilesPerShot: 2, pierce: 2, knockback: 14, projectileLife: 0.32,
    projectileRadius: 6, tint: 0xff9a3c, ammo: 420, shake: 0.02, sfx: 'beam',
  },
  rocket: {
    id: 'rocket', name: 'Bile Mortar', fireRate: 1.4, damage: 26, projectileSpeed: 560,
    spread: 0.02, projectilesPerShot: 1, pierce: 0, knockback: 200, projectileLife: 1.6,
    projectileRadius: 7, tint: 0xa6ff7a, ammo: 26, shake: 0.2, sfx: 'heavy',
    explodeRadius: 92, explodeDamage: 44,
  },
  lightning: {
    id: 'lightning', name: 'Arc Lash', fireRate: 6, damage: 16, projectileSpeed: 1050,
    spread: 0.05, projectilesPerShot: 1, pierce: 0, knockback: 40, projectileLife: 0.6,
    projectileRadius: 4.5, tint: 0x9be7ff, ammo: 130, shake: 0.05, sfx: 'beam',
    chain: 4, chainRange: 150,
  },
  beam: {
    id: 'beam', name: 'Photon Beam', fireRate: 24, damage: 5, projectileSpeed: 1500,
    spread: 0.008, projectilesPerShot: 1, pierce: 5, knockback: 8, projectileLife: 0.5,
    projectileRadius: 3, tint: 0xff6cf0, ammo: 600, shake: 0.015, sfx: 'beam',
  },
  vortex: {
    id: 'vortex', name: 'Vortex Cannon', fireRate: 2.2, damage: 22, projectileSpeed: 430,
    spread: 0.02, projectilesPerShot: 1, pierce: 12, knockback: 360, projectileLife: 1.3,
    projectileRadius: 9, tint: 0x9b7aff, ammo: 64, shake: 0.13, sfx: 'plasma',
  },
  hailstorm: {
    id: 'hailstorm', name: 'Hailstorm', fireRate: 9, damage: 5, projectileSpeed: 780,
    spread: 0.22, projectilesPerShot: 3, pierce: 1, knockback: 50, projectileLife: 0.5,
    projectileRadius: 3, tint: 0x86f7ff, ammo: 360, shake: 0.04, sfx: 'smg',
  },

  // --- pilot base weapons (infinite ammo, never drop) -------------------------
  // Sidegrades of the Sidearm (~equal single-target DPS, different shapes) so
  // no pilot strictly outguns another from the start.
  scorcher: {
    id: 'scorcher', name: 'Scorcher', fireRate: 3.4, damage: 26, projectileSpeed: 760,
    spread: 0.03, projectilesPerShot: 1, pierce: 0, knockback: 210, projectileLife: 0.75,
    projectileRadius: 5, tint: 0xffb066, ammo: -1, shake: 0.07, sfx: 'heavy',
  },
  stiletto: {
    id: 'stiletto', name: 'Stiletto', fireRate: 7.5, damage: 11, projectileSpeed: 900,
    spread: 0.015, projectilesPerShot: 1, pierce: 1, knockback: 70, projectileLife: 0.7,
    projectileRadius: 3.5, tint: 0xc9a0ff, ammo: -1, shake: 0.04, sfx: 'beam',
  },
}

/** Weapon ids that can drop as field pickups. Infinite-ammo weapons are the
 *  pilots' base weapons — they never drop (finite mags revert to the pilot's). */
export const PICKUP_WEAPON_IDS = Object.keys(WEAPONS).filter((id) => WEAPONS[id]!.ammo !== -1)
