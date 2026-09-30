import { PODS } from '../config.ts'

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
 * A pilot's rule (section 4.10): data the sim reads at its hooks. Each pilot
 * sets only the fields of its own rule; the rest keep the NO_RULES values.
 */
export interface PilotRules {
  /** Seconds to take a pod before Quartermaster's cut (NOVA 0: at once). */
  podHold: number
  /** Pods are captured and home in like gems. */
  podHoming: boolean
  /** Base weapon damage per emptied pickup magazine, and its cap. */
  salvageDmg: number
  salvageMax: number
  /** Dash charges before Phase Step. */
  dashCharges: number
  /** Each dash readies the gun (fireCooldown 0) and multiplies damage by
   *  dashDmgMul for dashDmgSec. */
  dashReload: boolean
  dashDmgMul: number
  dashDmgSec: number
  /** Medkit drops happen (their rolls always do). */
  medkits: boolean
  /** Kill healing per kill and its HP/s cap before perks. */
  killHeal: number
  killHealCap: number
  /** Max HP gained (and healed) per elite and per boss kill. */
  eliteMaxHp: number
  bossMaxHp: number
}

const NO_RULES: Readonly<PilotRules> = {
  podHold: PODS.holdTime,
  podHoming: false,
  salvageDmg: 0,
  salvageMax: 0,
  dashCharges: 1,
  dashReload: false,
  dashDmgMul: 1,
  dashDmgSec: 0,
  medkits: true,
  killHeal: 0,
  killHealCap: 6,
  eliteMaxHp: 0,
  bossMaxHp: 0,
}

function rules(r: Partial<PilotRules>): PilotRules {
  return { ...NO_RULES, ...r }
}

/**
 * Playable pilots. Stats and the rule FEED THE SIM (a run's identity), so they
 * must be pure device-independent data: the same seed with the same pilot
 * replays identically everywhere. Colors and the rule copy are presentation.
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
  /** The rule's name and UI copy (section 4.10). */
  ruleName: string
  ruleDesc: string
  rules: PilotRules
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
    ruleName: 'SALVAGER',
    ruleDesc: 'Takes pods instantly. Every emptied pickup gun makes her Sidearm stronger.',
    rules: rules({ podHold: 0, podHoming: true, salvageDmg: 0.05, salvageMax: 0.5 }),
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
    ruleName: 'AFTERBURNER',
    ruleDesc: 'Two dash charges. Every dash reloads her gun and boosts damage.',
    rules: rules({ dashCharges: 2, dashReload: true, dashDmgMul: 1.3, dashDmgSec: 1.5 }),
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
    ruleName: 'REAPER',
    ruleDesc: 'No medkits. Kills heal her. Elites and bosses make her bigger.',
    rules: rules({ medkits: false, killHeal: 1, killHealCap: 8, eliteMaxHp: 8, bossMaxHp: 25 }),
    unlock: { how: 'earn', feat: 'thick_hide' },
  },
]

export const DEFAULT_CHARACTER_ID = 'nova'

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!
}
