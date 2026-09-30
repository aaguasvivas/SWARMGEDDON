import type { Modifiers } from './perks.ts'

/**
 * How an item is owned (section 7.4). Every selectable pilot, world and paint
 * carries one. An `earn` item is locked until the feat that rewards it is done;
 * `sku` leaves room for a cosmetic purchase without code changes.
 */
export interface UnlockMeta {
  how: 'default' | 'earn' | 'premium'
  /** The feat whose reward this item is. */
  feat?: string
  sku?: string
}

/**
 * Playable pilots. Stats and the signature passive FEED THE SIM (a run's
 * identity), so they must be pure device-independent data: the same seed with
 * the same pilot replays identically everywhere. Colors are presentation.
 * Passives fold into the run's base Modifiers (same pipeline as perks, zero
 * engine changes).
 */
export interface CharacterDef {
  id: string
  name: string
  tagline: string
  /** Hull silhouette (presentation only; hitbox is PLAYER_RADIUS regardless):
   *  vanguard = round hull + side pods, dart = swept wedge, heavy = armored hex. */
  shape: 'vanguard' | 'dart' | 'heavy'
  colors: { body: number; outline: number; visor: number; barrel: number }
  maxHp: number
  speed: number
  /** Infinite-ammo base weapon; finite pickups still revert to this. */
  startWeapon: string
  passiveName: string
  passiveDesc: string
  applyPassive: (m: Modifiers) => void
  unlock: UnlockMeta
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'nova',
    name: 'NOVA',
    tagline: 'the balanced vanguard',
    shape: 'vanguard',
    colors: { body: 0x1ce8b5, outline: 0x0b3b30, visor: 0x06231d, barrel: 0x0e4d40 },
    maxHp: 100,
    speed: 285,
    startWeapon: 'pistol',
    passiveName: 'Magnet Coil',
    passiveDesc: '+35% pickup range',
    applyPassive: (m) => (m.magnetMul *= 1.35),
    unlock: { how: 'default' },
  },
  {
    id: 'ember',
    name: 'EMBER',
    tagline: 'fast, fragile, furious',
    shape: 'dart',
    colors: { body: 0xff9a4a, outline: 0x4a1e08, visor: 0x2b1206, barrel: 0x8a3d12 },
    maxHp: 85,
    speed: 305,
    startWeapon: 'scorcher',
    passiveName: 'Overcharge',
    passiveDesc: '+15% damage',
    applyPassive: (m) => (m.damageMul *= 1.15),
    unlock: { how: 'earn', feat: 'overcharged' },
  },
  {
    id: 'vesper',
    name: 'VESPER',
    tagline: 'slow, heavy, hungry',
    shape: 'heavy',
    colors: { body: 0xb886ff, outline: 0x2c1450, visor: 0x1a0b33, barrel: 0x5b2ea6 },
    maxHp: 120,
    speed: 265,
    startWeapon: 'stiletto',
    passiveName: 'Reaper',
    passiveDesc: '+1 HP per kill',
    applyPassive: (m) => (m.lifestealPerKill += 1),
    unlock: { how: 'earn', feat: 'thick_hide' },
  },
]

export const DEFAULT_CHARACTER_ID = 'nova'

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!
}
