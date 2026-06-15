/**
 * Perks — pure data + a pure modifier fold. The whole "build" lives in one
 * `Modifiers` struct; perks compose into it (stacking), systems read the
 * aggregate. Adding a perk is one entry here, zero engine change.
 */
export interface Modifiers {
  fireRateMul: number
  damageMul: number
  extraProjectiles: number
  extraPierce: number
  spreadMul: number
  knockbackMul: number
  projectileSpeedMul: number
  projectileLifeMul: number
  moveSpeedMul: number
  bonusHp: number
  hpMul: number
  regenPerSec: number
  lifestealPerKill: number
  magnetMul: number
  critChance: number
  critMul: number
  xpMul: number
  bounces: number // ricochet
  explosiveRounds: number // bonus explosion on bullet death
  slowOnHit: number // 0..1 slow strength applied to hit enemies
  thorns: number // dps to enemies touching the player
  dodge: number // 0..1 chance to negate a discrete hit
  damageReduction: number // 0..1 incoming damage cut
  revives: number // extra lives
  berserker: number // fire rate scales with missing HP
}

export function baseModifiers(): Modifiers {
  return {
    fireRateMul: 1, damageMul: 1, extraProjectiles: 0, extraPierce: 0, spreadMul: 1,
    knockbackMul: 1, projectileSpeedMul: 1, projectileLifeMul: 1, moveSpeedMul: 1,
    bonusHp: 0, hpMul: 1, regenPerSec: 0, lifestealPerKill: 0, magnetMul: 1,
    critChance: 0, critMul: 2, xpMul: 1, bounces: 0, explosiveRounds: 0, slowOnHit: 0,
    thorns: 0, dodge: 0, damageReduction: 0, revives: 0, berserker: 0,
  }
}

export type PerkRarity = 'common' | 'rare'

export interface PerkDef {
  id: string
  name: string
  desc: string
  rarity: PerkRarity
  maxStacks: number
  apply: (m: Modifiers, stacks: number) => void
}

export const PERKS: readonly PerkDef[] = [
  { id: 'adrenaline', name: 'Adrenaline', desc: '+14% fire rate', rarity: 'common', maxStacks: 5, apply: (m, s) => (m.fireRateMul *= 1 + 0.14 * s) },
  { id: 'heavy_rounds', name: 'Heavy Rounds', desc: '+22% damage', rarity: 'common', maxStacks: 5, apply: (m, s) => (m.damageMul *= 1 + 0.22 * s) },
  { id: 'twin_shot', name: 'Twin Shot', desc: '+1 projectile (wider spread)', rarity: 'rare', maxStacks: 3, apply: (m, s) => { m.extraProjectiles += s; m.spreadMul *= 1 + 0.18 * s } },
  { id: 'piercing', name: 'Piercing Rounds', desc: 'bullets pierce +1 enemy', rarity: 'common', maxStacks: 4, apply: (m, s) => (m.extraPierce += s) },
  { id: 'fleet_footed', name: 'Fleet Footed', desc: '+9% move speed', rarity: 'common', maxStacks: 5, apply: (m, s) => (m.moveSpeedMul *= 1 + 0.09 * s) },
  { id: 'regrowth', name: 'Regrowth', desc: 'regenerate +1.4 HP/sec', rarity: 'common', maxStacks: 4, apply: (m, s) => (m.regenPerSec += 1.4 * s) },
  { id: 'vampiric', name: 'Vampiric', desc: 'heal +1.6 HP per kill', rarity: 'rare', maxStacks: 3, apply: (m, s) => (m.lifestealPerKill += 1.6 * s) },
  { id: 'vitality', name: 'Vitality', desc: '+25 max HP (and heal)', rarity: 'common', maxStacks: 5, apply: (m, s) => (m.bonusHp += 25 * s) },
  { id: 'magnetic', name: 'Magnetic', desc: '+60% pickup range', rarity: 'common', maxStacks: 3, apply: (m, s) => (m.magnetMul *= 1 + 0.6 * s) },
  { id: 'deadeye', name: 'Deadeye', desc: '+12% crit chance', rarity: 'rare', maxStacks: 3, apply: (m, s) => (m.critChance = Math.min(0.75, m.critChance + 0.12 * s)) },
  { id: 'hollow_point', name: 'Hollow Point', desc: '+0.4x crit damage', rarity: 'common', maxStacks: 3, apply: (m, s) => (m.critMul += 0.4 * s) },
  { id: 'ricochet', name: 'Ricochet', desc: 'bullets bounce off walls +1', rarity: 'rare', maxStacks: 3, apply: (m, s) => (m.bounces += s) },
  { id: 'explosive_rounds', name: 'Explosive Rounds', desc: 'bullets burst on impact', rarity: 'rare', maxStacks: 3, apply: (m, s) => (m.explosiveRounds += s) },
  { id: 'cryo_rounds', name: 'Cryo Rounds', desc: 'hits slow enemies', rarity: 'common', maxStacks: 3, apply: (m, s) => (m.slowOnHit = Math.min(0.75, m.slowOnHit + 0.2 * s)) },
  { id: 'overpressure', name: 'Overpressure', desc: '+25% knockback', rarity: 'common', maxStacks: 4, apply: (m, s) => (m.knockbackMul *= 1 + 0.25 * s) },
  { id: 'velocity', name: 'High Velocity', desc: '+25% projectile speed', rarity: 'common', maxStacks: 3, apply: (m, s) => (m.projectileSpeedMul *= 1 + 0.25 * s) },
  { id: 'long_barrel', name: 'Long Barrel', desc: '+22% projectile range', rarity: 'common', maxStacks: 3, apply: (m, s) => (m.projectileLifeMul *= 1 + 0.22 * s) },
  { id: 'steady_aim', name: 'Steady Aim', desc: '-30% spread', rarity: 'common', maxStacks: 2, apply: (m, s) => (m.spreadMul *= Math.pow(0.7, s)) },
  { id: 'scavenger', name: 'Scavenger', desc: '+25% XP gained', rarity: 'common', maxStacks: 3, apply: (m, s) => (m.xpMul *= 1 + 0.25 * s) },
  { id: 'bulwark', name: 'Bulwark', desc: '-15% damage taken', rarity: 'rare', maxStacks: 3, apply: (m, s) => (m.damageReduction = Math.min(0.7, m.damageReduction + 0.15 * s)) },
  { id: 'thorns', name: 'Spiked Carapace', desc: 'enemies touching you take damage', rarity: 'rare', maxStacks: 3, apply: (m, s) => (m.thorns += 18 * s) },
  { id: 'dodge', name: 'Phase Step', desc: '+9% dodge chance', rarity: 'rare', maxStacks: 3, apply: (m, s) => (m.dodge = Math.min(0.6, m.dodge + 0.09 * s)) },
  { id: 'second_wind', name: 'Second Wind', desc: 'revive once at 50% HP', rarity: 'rare', maxStacks: 1, apply: (m, s) => (m.revives += s) },
  { id: 'berserker', name: 'Berserker', desc: 'fire faster as HP drops', rarity: 'rare', maxStacks: 1, apply: (m, s) => (m.berserker += s) },
  { id: 'glass_cannon', name: 'Glass Cannon', desc: '+45% damage, -25% max HP', rarity: 'rare', maxStacks: 1, apply: (m, s) => { m.damageMul *= 1 + 0.45 * s; m.hpMul *= Math.pow(0.75, s) } },
]

const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]))
export function perkById(id: string): PerkDef {
  const p = PERK_BY_ID.get(id)
  if (!p) throw new Error('unknown perk: ' + id)
  return p
}
