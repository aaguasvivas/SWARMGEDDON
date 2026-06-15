/**
 * Perks — pure data + a pure modifier function. The whole game's "build" lives
 * in a `Modifiers` struct: perks fold into it (composing/stacking), and systems
 * read the aggregate. Adding a perk = adding one entry here; no engine change.
 */

export interface Modifiers {
  fireRateMul: number
  damageMul: number
  extraProjectiles: number
  extraPierce: number
  spreadMul: number
  knockbackMul: number
  moveSpeedMul: number
  bonusHp: number
  regenPerSec: number
  lifestealPerKill: number
  magnetMul: number
  critChance: number
  critMul: number
}

export function baseModifiers(): Modifiers {
  return {
    fireRateMul: 1,
    damageMul: 1,
    extraProjectiles: 0,
    extraPierce: 0,
    spreadMul: 1,
    knockbackMul: 1,
    moveSpeedMul: 1,
    bonusHp: 0,
    regenPerSec: 0,
    lifestealPerKill: 0,
    magnetMul: 1,
    critChance: 0,
    critMul: 2,
  }
}

export type PerkRarity = 'common' | 'rare'

export interface PerkDef {
  id: string
  name: string
  desc: string
  rarity: PerkRarity
  maxStacks: number
  /** Fold this perk's contribution (at `stacks` copies) into the modifiers. */
  apply: (m: Modifiers, stacks: number) => void
}

export const PERKS: readonly PerkDef[] = [
  {
    id: 'adrenaline',
    name: 'Adrenaline',
    desc: '+14% fire rate',
    rarity: 'common',
    maxStacks: 5,
    apply: (m, s) => (m.fireRateMul *= 1 + 0.14 * s),
  },
  {
    id: 'heavy_rounds',
    name: 'Heavy Rounds',
    desc: '+22% damage',
    rarity: 'common',
    maxStacks: 5,
    apply: (m, s) => (m.damageMul *= 1 + 0.22 * s),
  },
  {
    id: 'twin_shot',
    name: 'Twin Shot',
    desc: '+1 projectile per shot (wider spread)',
    rarity: 'rare',
    maxStacks: 3,
    apply: (m, s) => {
      m.extraProjectiles += s
      m.spreadMul *= 1 + 0.18 * s
    },
  },
  {
    id: 'piercing',
    name: 'Piercing Rounds',
    desc: 'bullets pierce +1 enemy',
    rarity: 'common',
    maxStacks: 4,
    apply: (m, s) => (m.extraPierce += s),
  },
  {
    id: 'fleet_footed',
    name: 'Fleet Footed',
    desc: '+9% move speed',
    rarity: 'common',
    maxStacks: 5,
    apply: (m, s) => (m.moveSpeedMul *= 1 + 0.09 * s),
  },
  {
    id: 'regrowth',
    name: 'Regrowth',
    desc: 'regenerate +1.4 HP/sec',
    rarity: 'common',
    maxStacks: 4,
    apply: (m, s) => (m.regenPerSec += 1.4 * s),
  },
  {
    id: 'vampiric',
    name: 'Vampiric',
    desc: 'heal +1.6 HP per kill',
    rarity: 'rare',
    maxStacks: 3,
    apply: (m, s) => (m.lifestealPerKill += 1.6 * s),
  },
  {
    id: 'vitality',
    name: 'Vitality',
    desc: '+25 max HP (and heal)',
    rarity: 'common',
    maxStacks: 5,
    apply: (m, s) => (m.bonusHp += 25 * s),
  },
  {
    id: 'magnetic',
    name: 'Magnetic',
    desc: '+60% pickup range',
    rarity: 'common',
    maxStacks: 3,
    apply: (m, s) => (m.magnetMul *= 1 + 0.6 * s),
  },
  {
    id: 'deadeye',
    name: 'Deadeye',
    desc: '+12% crit chance (2.2x dmg)',
    rarity: 'rare',
    maxStacks: 3,
    apply: (m, s) => {
      m.critChance = Math.min(0.75, m.critChance + 0.12 * s)
      m.critMul = 2.2
    },
  },
]

const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]))
export function perkById(id: string): PerkDef {
  const p = PERK_BY_ID.get(id)
  if (!p) throw new Error('unknown perk: ' + id)
  return p
}
