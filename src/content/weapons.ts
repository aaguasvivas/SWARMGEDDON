import { COLORS } from '../config.ts'
import type { SfxName } from '../audio/audio.ts'

/** Evolved weapon behaviors (A4.2), resolved per bullet at hit time. */
export type EvoBehavior =
  | 'pierceOnKill' | 'pointBlank' | 'lockOn' | 'pierceRamp' | 'firstHitCrit'
  | 'ignite' | 'bomblets' | 'stormChain' | 'rangeRamp'

/**
 * Weapon registry: pure data. Pilot base weapons and evolved weapons have
 * infinite ammo; pickups carry a magazine that lasts `ammo / fireRate` seconds
 * whatever the fire-rate perks, then revert to the base weapon. Special
 * mechanics ride on optional fields: `explode*` (rockets), `chain*`
 * (lightning) and `evo` (evolved weapons).
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
  /** Screen kick per trigger pull, px, against the aim. */
  kickPx: number
  sfx: SfxName
  /** Explosive: AoE on impact. */
  explodeRadius?: number
  explodeDamage?: number
  /** Chain lightning: jump to N more nearby enemies per hit. */
  chain?: number
  chainRange?: number
  /** Rail and beam: shots draw as tracers stretched along travel (section 6.4). */
  tracer?: true
  /** Pickup weapons: the paired perk (A4.1) and the evolution id (A4.2). */
  pair?: string
  evolvesTo?: string
  evo?: EvoBehavior
}

export const DEFAULT_WEAPON_ID = 'pistol'

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'Sidearm', fireRate: 5.5, damage: 16, projectileSpeed: 780,
    spread: 0.02, projectilesPerShot: 1, pierce: 0, knockback: 130, projectileLife: 0.8,
    projectileRadius: 4, tint: COLORS.bullet, ammo: -1, kickPx: 1.5, sfx: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Splatter SMG', fireRate: 13, damage: 8.5, projectileSpeed: 840,
    spread: 0.1, projectilesPerShot: 1, pierce: 0, knockback: 90, projectileLife: 0.6,
    projectileRadius: 3.5, tint: COLORS.bullet, ammo: 260, kickPx: 1.0, sfx: 'smg', pair: 'adrenaline', evolvesTo: 'gore_hose',
  },
  shotgun: {
    id: 'shotgun', name: 'Boomstick', fireRate: 2.1, damage: 6, projectileSpeed: 720,
    spread: 0.32, projectilesPerShot: 9, pierce: 0, knockback: 280, projectileLife: 0.36,
    projectileRadius: 4, tint: 0xffd27a, ammo: 48, kickPx: 6, sfx: 'shotgun', pair: 'twin_shot', evolvesTo: 'devastator',
  },
  minigun: {
    id: 'minigun', name: 'Hive Ripper', fireRate: 20, damage: 6, projectileSpeed: 900,
    spread: 0.14, projectilesPerShot: 1, pierce: 0, knockback: 60, projectileLife: 0.55,
    projectileRadius: 3.5, tint: 0xffe08a, ammo: 480, kickPx: 0.8, sfx: 'smg', pair: 'heavy_rounds', evolvesTo: 'hive_reaper',
  },
  plasma: {
    id: 'plasma', name: 'Ion Lance', fireRate: 7, damage: 18, projectileSpeed: 980,
    spread: 0.03, projectilesPerShot: 1, pierce: 3, knockback: 70, projectileLife: 0.9,
    projectileRadius: 5.5, tint: 0xb98cff, ammo: 110, kickPx: 2, sfx: 'plasma', pair: 'piercing', evolvesTo: 'ion_spear',
  },
  railgun: {
    id: 'railgun', name: 'Rail Spike', fireRate: 1.5, damage: 90, projectileSpeed: 1700,
    spread: 0.004, projectilesPerShot: 1, pierce: 8, knockback: 320, projectileLife: 0.6,
    projectileRadius: 5, tint: 0x86f7ff, ammo: 28, kickPx: 9, sfx: 'crack', pair: 'deadeye', evolvesTo: 'skewer', tracer: true,
  },
  flamethrower: {
    id: 'flamethrower', name: 'Pyre', fireRate: 22, damage: 4.5, projectileSpeed: 460,
    spread: 0.26, projectilesPerShot: 2, pierce: 2, knockback: 14, projectileLife: 0.32,
    projectileRadius: 6, tint: 0xff9a3c, ammo: 420, kickPx: 0.4, sfx: 'whoosh', pair: 'incendiary', evolvesTo: 'inferno',
  },
  rocket: {
    id: 'rocket', name: 'Bile Mortar', fireRate: 1.4, damage: 26, projectileSpeed: 560,
    spread: 0.02, projectilesPerShot: 1, pierce: 0, knockback: 200, projectileLife: 1.6,
    projectileRadius: 7, tint: 0xa6ff7a, ammo: 26, kickPx: 5, sfx: 'heavy', pair: 'explosive_rounds', evolvesTo: 'plague_barrage',
    explodeRadius: 92, explodeDamage: 44,
  },
  lightning: {
    id: 'lightning', name: 'Arc Lash', fireRate: 6, damage: 16, projectileSpeed: 1050,
    spread: 0.05, projectilesPerShot: 1, pierce: 0, knockback: 40, projectileLife: 0.6,
    projectileRadius: 4.5, tint: 0x9be7ff, ammo: 130, kickPx: 1.5, sfx: 'beam', pair: 'arc_rounds', evolvesTo: 'storm_lash',
    chain: 4, chainRange: 150,
  },
  beam: {
    id: 'beam', name: 'Photon Beam', fireRate: 24, damage: 5, projectileSpeed: 1500,
    spread: 0.008, projectilesPerShot: 1, pierce: 5, knockback: 8, projectileLife: 0.5,
    projectileRadius: 3, tint: 0xff6cf0, ammo: 600, kickPx: 0.3, sfx: 'beam', pair: 'long_barrel', evolvesTo: 'solar_lance', tracer: true,
  },
  vortex: {
    id: 'vortex', name: 'Vortex Cannon', fireRate: 2.6, damage: 32, projectileSpeed: 430,
    spread: 0.02, projectilesPerShot: 1, pierce: 12, knockback: 360, projectileLife: 1.3,
    projectileRadius: 9, tint: 0x9b7aff, ammo: 64, kickPx: 5, sfx: 'plasma', pair: 'overpressure',
  },
  hailstorm: {
    id: 'hailstorm', name: 'Hailstorm', fireRate: 9, damage: 5, projectileSpeed: 780,
    spread: 0.22, projectilesPerShot: 3, pierce: 1, knockback: 50, projectileLife: 0.5,
    projectileRadius: 3, tint: 0x86f7ff, ammo: 360, kickPx: 1.2, sfx: 'smg', pair: 'cryo_rounds',
  },

  // --- pilot base weapons (infinite ammo, never drop) -------------------------
  // Sidegrades of the Sidearm (~equal single-target DPS, different shapes) so
  // no pilot strictly outguns another from the start.
  scorcher: {
    id: 'scorcher', name: 'Scorcher', fireRate: 3.4, damage: 26, projectileSpeed: 760,
    spread: 0.03, projectilesPerShot: 1, pierce: 0, knockback: 210, projectileLife: 0.75,
    projectileRadius: 5, tint: 0xffb066, ammo: -1, kickPx: 2.5, sfx: 'heavy',
  },
  stiletto: {
    id: 'stiletto', name: 'Stiletto', fireRate: 7.5, damage: 12, projectileSpeed: 900,
    spread: 0.015, projectilesPerShot: 1, pierce: 1, knockback: 70, projectileLife: 0.7,
    projectileRadius: 3.5, tint: 0xc9a0ff, ammo: -1, kickPx: 1.2, sfx: 'beam',
  },
}

/** An evolved weapon: its source's feel with the A4.2 stats, infinite ammo,
 *  and kickPx x1.2. */
function evolved(src: WeaponDef, id: string, name: string, evo: EvoBehavior, stats: Partial<WeaponDef>): WeaponDef {
  return { ...src, ...stats, id, name, ammo: -1, kickPx: src.kickPx * 1.2, pair: undefined, evolvesTo: undefined, evo }
}

// --- evolutions (A4.2): a Hive Core evolves the held pickup weapon ---------
const W = WEAPONS
W.gore_hose = evolved(W.smg!, 'gore_hose', 'Gore Hose', 'pierceOnKill',
  { fireRate: 18, damage: 10, spread: 0.08, projectileSpeed: 860, projectileLife: 0.6 })
W.devastator = evolved(W.shotgun!, 'devastator', 'Devastator', 'pointBlank',
  { fireRate: 2.4, projectilesPerShot: 12, damage: 7, spread: 0.34, knockback: 320, projectileLife: 0.38 })
W.hive_reaper = evolved(W.minigun!, 'hive_reaper', 'Hive Reaper', 'lockOn',
  { fireRate: 24, damage: 7, spread: 0.12 })
W.ion_spear = evolved(W.plasma!, 'ion_spear', 'Ion Spear', 'pierceRamp',
  { fireRate: 8, damage: 24, pierce: 6, projectileSpeed: 1100 })
W.skewer = evolved(W.railgun!, 'skewer', 'Skewer', 'firstHitCrit',
  { fireRate: 1.6, damage: 120, pierce: 20, projectileSpeed: 2000, knockback: 400 })
W.inferno = evolved(W.flamethrower!, 'inferno', 'Inferno', 'ignite',
  { fireRate: 22, projectilesPerShot: 3, damage: 4, pierce: 2, projectileLife: 0.45 })
W.plague_barrage = evolved(W.rocket!, 'plague_barrage', 'Plague Barrage', 'bomblets',
  { fireRate: 1.2, projectilesPerShot: 3, spread: 0.08, damage: 26, explodeRadius: 110, explodeDamage: 50 })
W.storm_lash = evolved(W.lightning!, 'storm_lash', 'Storm Lash', 'stormChain',
  { fireRate: 7, damage: 18, chain: 7, chainRange: 200 })
W.solar_lance = evolved(W.beam!, 'solar_lance', 'Solar Lance', 'rangeRamp',
  { fireRate: 24, damage: 6, pierce: 10, projectileLife: 0.6 })

for (const id in W) W[id] = uniformWeapon(W[id]!)

/**
 * Every def carries every key in one order (an absent option is undefined), so
 * all weapons share one hidden class: the per-shot reads of `world.weapon`
 * stay direct, and the first pickup weapon of a run no longer deoptimizes the
 * code compiled for the base one. The literal's type lists every key, so a new
 * WeaponDef key is a compile error here until it is copied.
 */
function uniformWeapon(w: WeaponDef): WeaponDef {
  const d: { [K in keyof Required<WeaponDef>]: WeaponDef[K] | undefined } = {
    id: w.id, name: w.name, fireRate: w.fireRate, damage: w.damage, projectileSpeed: w.projectileSpeed, spread: w.spread,
    projectilesPerShot: w.projectilesPerShot, pierce: w.pierce, knockback: w.knockback, projectileLife: w.projectileLife,
    projectileRadius: w.projectileRadius, tint: w.tint, ammo: w.ammo, kickPx: w.kickPx, sfx: w.sfx,
    explodeRadius: w.explodeRadius, explodeDamage: w.explodeDamage, chain: w.chain, chainRange: w.chainRange, tracer: w.tracer,
    pair: w.pair, evolvesTo: w.evolvesTo, evo: w.evo,
  }
  return d as WeaponDef
}

/** Every weapon in a fixed order; the FeelQueue carries weapons by index. */
export const WEAPON_LIST: readonly WeaponDef[] = Object.values(WEAPONS)

export function weaponIndex(id: string): number {
  for (let i = 0; i < WEAPON_LIST.length; i++) if (WEAPON_LIST[i]!.id === id) return i
  return -1
}

/** Weapon ids that can drop as field pickups. Infinite-ammo weapons (pilot base
 *  weapons and evolutions) never drop. */
export const PICKUP_WEAPON_IDS = Object.keys(WEAPONS).filter((id) => WEAPONS[id]!.ammo !== -1)
