import { DASH, FALLBACK } from '../config.ts'

/**
 * Perks (A2), fusions (A3) and draft fallbacks (A2.4): pure data plus a pure
 * modifier fold. The whole build lives in one `Modifiers` struct; perks compose
 * into it by stack count and systems read the aggregate.
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
  /** Kill healing per second cap (HP/s). */
  killHealCap: number
  magnetMul: number
  critChance: number
  critMul: number
  xpMul: number
  /** Ricochet: turns toward the nearest enemy after the last pierce. */
  seekBounces: number
  /** Explosive Rounds: burst radius and its fraction of the final hit. */
  explodeRadius: number
  explodeFrac: number
  /** Arc Rounds: proc chance per hit and hop count. */
  arcChance: number
  arcHops: number
  /** 0..1 slow strength applied to hit enemies. */
  slowOnHit: number
  /** Incendiary burn dps before damageMul. */
  burnDps: number
  /** Overpressure stagger on non-elites (seconds). */
  staggerT: number
  /** dps to enemies touching the player. */
  thorns: number
  /** Max dash charges (capped at DASH.maxCharges). */
  dashCharges: number
  /** Seconds of i-frames per dash. */
  dashIframes: number
  /** Scales the per-charge recharge. */
  dashCooldownMul: number
  /** Adrenal Wake fire-rate bonus while its post-dash window runs. */
  adrenalWake: number
  /** Shock Step dash-end blast radius and damage before damageMul. */
  shockRadius: number
  shockDamage: number
  /** 0..1 incoming damage cut. */
  damageReduction: number
  revives: number
  /** Berserker: fire-rate bonus at 0 HP, scaled by missing HP. */
  berserker: number
  /** Bonus damage vs elites and bosses. */
  eliteDamageMul: number
  /** Instantly cull non-boss enemies below this HP fraction. */
  executeFrac: number
  /** Quartermaster: pickup magazine size, pod life bonus (s), pod hold cut (s). */
  ammoMul: number
  podLifeBonus: number
  podHoldCut: number
}

export function baseModifiers(): Modifiers {
  const m = {} as Modifiers
  resetModifiers(m)
  return m
}

/** Put every field back to its base value (no allocation). */
export function resetModifiers(m: Modifiers): void {
  m.fireRateMul = 1
  m.damageMul = 1
  m.extraProjectiles = 0
  m.extraPierce = 0
  m.spreadMul = 1
  m.knockbackMul = 1
  m.projectileSpeedMul = 1
  m.projectileLifeMul = 1
  m.moveSpeedMul = 1
  m.bonusHp = 0
  m.hpMul = 1
  m.regenPerSec = 0
  m.lifestealPerKill = 0
  m.killHealCap = 6
  m.magnetMul = 1
  m.critChance = 0
  m.critMul = 2
  m.xpMul = 1
  m.seekBounces = 0
  m.explodeRadius = 0
  m.explodeFrac = 0
  m.arcChance = 0
  m.arcHops = 0
  m.slowOnHit = 0
  m.burnDps = 0
  m.staggerT = 0
  m.thorns = 0
  m.dashCharges = 1
  m.dashIframes = DASH.iframes
  m.dashCooldownMul = 1
  m.adrenalWake = 0
  m.shockRadius = 0
  m.shockDamage = 0
  m.damageReduction = 0
  m.revives = 0
  m.berserker = 0
  m.eliteDamageMul = 1
  m.executeFrac = 0
  m.ammoMul = 1
  m.podLifeBonus = 0
  m.podHoldCut = 0
}

/** `b` to the integer power `n` by repeated multiplication, so every engine
 *  gets the same bits (Math.pow may differ in the last place). */
export function powi(b: number, n: number): number {
  let r = 1
  for (let i = 0; i < n; i++) r *= b
  return r
}

/** Two decimals, rounded half up from the third (1.445 shows as 1.45). */
export function x2(v: number): string {
  return (Math.round(v * 1000) / 1000).toFixed(2)
}
function pct(v: number): number {
  return Math.round(v * 100)
}
function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// --- families (A2.1) --------------------------------------------------------

export const FIREPOWER = 0
export const ELEMENTAL = 1
export const SURVIVAL = 2
export const MOBILITY = 3
export const HUNTER = 4

export interface FamilyDef {
  id: string
  name: string
  color: number
}

export const FAMILIES: readonly FamilyDef[] = [
  { id: 'firepower', name: 'FIREPOWER', color: 0xff9a3c },
  { id: 'elemental', name: 'ELEMENTAL', color: 0x9be7ff },
  { id: 'survival', name: 'SURVIVAL', color: 0x4dffa0 },
  { id: 'mobility', name: 'MOBILITY', color: 0xff6cf0 },
  { id: 'hunter', name: 'HUNTER', color: 0xffc24a },
]

/** The family each pilot's Keystone draft always offers. */
export const FAMILY_OF_PILOT: Readonly<Record<string, number>> = { nova: HUNTER, ember: MOBILITY, vesper: SURVIVAL }

// --- perks (A2.2) -----------------------------------------------------------

export type PerkRarity = 'common' | 'rare'

export interface PerkDef {
  id: string
  name: string
  family: number
  rarity: PerkRarity
  keystone: boolean
  max: number
  desc: string
  glyph: string
  apply: (m: Modifiers, s: number) => void
  /** The card's stat line, read from base modifiers with this perk applied. */
  stat: (m: Modifiers) => string
}

function perk(
  id: string, name: string, family: number, rarity: PerkRarity | 'key', max: number, desc: string, glyph: string,
  apply: PerkDef['apply'], stat: PerkDef['stat'],
): PerkDef {
  return { id, name, family, rarity: rarity === 'key' ? 'rare' : rarity, keystone: rarity === 'key', max, desc, glyph, apply, stat }
}

const F = FIREPOWER
const E = ELEMENTAL
const S = SURVIVAL
const M = MOBILITY
const H = HUNTER

export const PERKS: readonly PerkDef[] = [
  perk('adrenaline', 'Adrenaline', F, 'common', 5, 'Fire faster.', 'rate',
    (m, s) => { m.fireRateMul *= 1 + 0.14 * s }, (m) => `fire rate x${x2(m.fireRateMul)}`),
  perk('heavy_rounds', 'Heavy Rounds', F, 'common', 5, 'Every bullet hits harder.', 'damage',
    (m, s) => { m.damageMul *= 1 + 0.22 * s }, (m) => `damage x${x2(m.damageMul)}`),
  perk('twin_shot', 'Twin Shot', F, 'key', 3, 'Fire extra bullets in a wider fan.', 'multishot',
    (m, s) => { m.extraProjectiles += s; m.spreadMul *= 1 + 0.18 * s },
    (m) => `+${m.extraProjectiles} ${plural(m.extraProjectiles, 'projectile', 'projectiles')}`),
  perk('piercing', 'Piercing Rounds', F, 'common', 4, 'Bullets pass through more enemies.', 'pierce',
    (m, s) => { m.extraPierce += s }, (m) => `pierce +${m.extraPierce}`),
  perk('long_barrel', 'Long Barrel', F, 'common', 3, 'Longer range, faster bullets, tighter spread.', 'range',
    (m, s) => { m.projectileLifeMul *= 1 + 0.2 * s; m.projectileSpeedMul *= 1 + 0.2 * s; m.spreadMul *= powi(0.85, s) },
    (m) => `range and speed x${x2(m.projectileLifeMul)}`),
  perk('ricochet', 'Ricochet', F, 'key', 3, 'After its last hit, a bullet turns toward the nearest enemy.', 'bounce',
    (m, s) => { m.seekBounces += s }, (m) => `${m.seekBounces} seek ${plural(m.seekBounces, 'bounce', 'bounces')}`),
  perk('berserker', 'Berserker', F, 'rare', 1, 'Fire faster as HP drops. Medkits fuel a burst.', 'rate',
    (m) => { m.berserker = 0.8 }, (m) => `up to +${pct(m.berserker)}% fire rate`),
  perk('glass_cannon', 'Glass Cannon', F, 'rare', 1, 'Big damage, less health.', 'damage',
    (m) => { m.damageMul *= 1.45; m.hpMul *= 0.75 }, (m) => `damage x${x2(m.damageMul)}, max HP x${x2(m.hpMul)}`),
  perk('explosive_rounds', 'Explosive Rounds', E, 'key', 3, 'Bullets burst on their final hit.', 'explode',
    (m, s) => { m.explodeRadius = 45 + 15 * s; m.explodeFrac = 0.5 * s },
    (m) => `burst ${m.explodeRadius} u, ${pct(m.explodeFrac)}% damage`),
  perk('arc_rounds', 'Arc Rounds', E, 'key', 3, 'Some hits jump to nearby enemies.', 'arc',
    (m, s) => { m.arcChance = 0.2; m.arcHops = s + 1 }, (m) => `${pct(m.arcChance)}% of hits arc to ${m.arcHops}`),
  perk('cryo_rounds', 'Cryo Rounds', E, 'common', 3, 'Hits slow enemies.', 'cryo',
    (m, s) => { m.slowOnHit = 0.2 * s }, (m) => `slow ${pct(m.slowOnHit)}% for 1.2 s`),
  perk('incendiary', 'Incendiary', E, 'common', 3, 'Hits set enemies on fire.', 'burn',
    (m, s) => { m.burnDps = 6 * s }, (m) => `burn ${m.burnDps} dps for 2 s`),
  perk('overpressure', 'Overpressure', E, 'common', 3, 'Hits shove enemies and stop them briefly.', 'knockback',
    (m, s) => { m.knockbackMul *= 1 + 0.4 * s; m.staggerT = 0.04 + 0.04 * s },
    (m) => `knockback x${x2(m.knockbackMul)}, stagger ${x2(m.staggerT)} s`),
  perk('vitality', 'Vitality', S, 'common', 5, 'More health, healed now.', 'hp',
    (m, s) => { m.bonusHp += 25 * s }, (m) => `max HP +${m.bonusHp}`),
  perk('regrowth', 'Regrowth', S, 'common', 4, 'Regenerate health over time.', 'regen',
    (m, s) => { m.regenPerSec += 1.4 * s }, (m) => `+${m.regenPerSec.toFixed(1)} HP/s`),
  perk('vampiric', 'Vampiric', S, 'key', 3, 'Kills heal you, up to a cap.', 'lifesteal',
    (m, s) => { m.lifestealPerKill += s; m.killHealCap += 4 * s },
    (m) => `+${m.lifestealPerKill} HP per kill, max ${m.killHealCap} HP/s`),
  perk('bulwark', 'Bulwark', S, 'rare', 3, 'Take less damage from everything.', 'shield',
    (m, s) => { m.damageReduction += 0.15 * s }, (m) => `damage taken -${pct(m.damageReduction)}%`),
  perk('thorns', 'Spiked Carapace', S, 'key', 3, 'Enemies touching you take damage.', 'knockback',
    (m, s) => { m.thorns += 18 * s }, (m) => `${m.thorns} dps to touching enemies`),
  perk('second_wind', 'Second Wind', S, 'rare', 1, 'Survive one death.', 'hp',
    (m, s) => { m.revives += s }, () => 'revive once at 50% HP'),
  perk('fleet_footed', 'Fleet Footed', M, 'common', 5, 'Move faster.', 'speed',
    (m, s) => { m.moveSpeedMul *= 1 + 0.08 * s }, (m) => `move speed x${x2(m.moveSpeedMul)}`),
  perk('phase_step', 'Phase Step', M, 'key', 3, 'More dash charges and longer invulnerability.', 'dash',
    (m, s) => { m.dashCharges += s >= 3 ? 2 : 1; if (s >= 2) m.dashIframes = 0.3 },
    (m) => `dash charges ${m.dashCharges}, i-frames ${m.dashIframes.toFixed(2)} s`),
  perk('slipstream', 'Slipstream', M, 'common', 3, 'Dash recharges faster.', 'dash',
    (m, s) => { m.dashCooldownMul *= powi(0.85, s) }, (m) => `dash recharge ${x2(DASH.cooldown * m.dashCooldownMul)} s`),
  perk('adrenal_wake', 'Adrenal Wake', M, 'common', 3, 'Dashing speeds up your trigger.', 'rate',
    (m, s) => { m.adrenalWake += 0.15 * s }, (m) => `+${pct(m.adrenalWake)}% fire rate for 2 s after a dash`),
  perk('shock_step', 'Shock Step', M, 'key', 3, 'Your dash ends in a shockwave.', 'explode',
    (m, s) => { m.shockRadius = 70 + 20 * s; m.shockDamage = 10 + 15 * s },
    (m) => `dash blast ${m.shockRadius} u, ${m.shockDamage} damage`),
  perk('deadeye', 'Deadeye', H, 'key', 3, 'Chance to deal critical hits.', 'crit',
    (m, s) => { m.critChance = Math.min(0.75, m.critChance + 0.12 * s) }, (m) => `crit chance +${pct(m.critChance)}%`),
  perk('hollow_point', 'Hollow Point', H, 'common', 3, 'More crits that hit harder.', 'crit',
    (m, s) => { m.critChance += 0.06 * s; m.critMul += 0.4 * s },
    (m) => `crit +${pct(m.critChance)}%, crit damage +${(m.critMul - 2).toFixed(1)}x`),
  perk('giant_slayer', 'Giant Slayer', H, 'rare', 3, 'Extra damage to elites and bosses.', 'damage',
    (m, s) => { m.eliteDamageMul *= 1 + 0.35 * s }, (m) => `x${x2(m.eliteDamageMul)} vs elites and bosses`),
  perk('executioner', 'Executioner', H, 'key', 2, 'Finish off badly hurt enemies instantly.', 'reaper',
    (m, s) => { m.executeFrac = 0.12 * s }, (m) => `cull below ${pct(m.executeFrac)}% HP`),
  perk('magnetic', 'Magnetic', H, 'common', 3, 'Pull XP from farther away.', 'magnet',
    (m, s) => { m.magnetMul *= 1 + 0.6 * s }, (m) => `pickup range x${x2(m.magnetMul)}`),
  perk('scavenger', 'Scavenger', H, 'common', 3, 'Gain more XP.', 'magnet',
    (m, s) => { m.xpMul *= 1 + 0.2 * s }, (m) => `XP x${x2(m.xpMul)}`),
  perk('quartermaster', 'Quartermaster', H, 'common', 3, 'Pickup weapons carry more ammo and wait longer.', 'range',
    (m, s) => { m.ammoMul *= 1 + 0.3 * s; m.podLifeBonus += 5 * s; m.podHoldCut += 0.1 * s },
    (m) => `ammo x${x2(m.ammoMul)}, pods last +${m.podLifeBonus} s`),
]

/** Each family's two keystones, in A2 order. */
export const FAMILY_KEYSTONES: readonly (readonly PerkDef[])[] = FAMILIES.map((_, f) => PERKS.filter((p) => p.family === f && p.keystone))

// --- fusions (A3) -----------------------------------------------------------

export interface FusionDef {
  id: string
  name: string
  /** Both parents, each with 1+ stack, make the fusion eligible. */
  a: string
  b: string
  desc: string
}

/** Offer priority is table order. The effects arrive with P8 (section 10.3). */
export const FUSIONS: readonly FusionDef[] = [
  { id: 'f_shatter', name: 'SHATTER', a: 'cryo_rounds', b: 'explosive_rounds', desc: 'Enemies that die while slowed burst.' },
  { id: 'f_firestorm', name: 'FIRESTORM', a: 'arc_rounds', b: 'incendiary', desc: 'Arcs ignite. Burning targets take +50% arc damage.' },
  { id: 'f_pinball', name: 'PINBALL', a: 'ricochet', b: 'piercing', desc: 'Each seek bounce restores pierce and adds 15% damage.' },
  { id: 'f_headhunter', name: 'HEADHUNTER', a: 'deadeye', b: 'hollow_point', desc: 'Crits ignore front armor. Crit kills burst.' },
  { id: 'f_guillotine', name: 'GUILLOTINE', a: 'executioner', b: 'giant_slayer', desc: 'Executioner also culls elites. Culls drop double XP.' },
  { id: 'f_bloodrush', name: 'BLOODRUSH', a: 'vampiric', b: 'berserker', desc: 'Below 50% HP: double kill healing, faster movement.' },
  { id: 'f_living_armor', name: 'LIVING ARMOR', a: 'regrowth', b: 'bulwark', desc: 'Overhealing becomes a shield, up to 25% of max HP.' },
  { id: 'f_ram', name: 'RAM', a: 'phase_step', b: 'thorns', desc: 'Dashing through enemies deals heavy thorns damage.' },
  { id: 'f_salvo', name: 'SALVO STEP', a: 'adrenal_wake', b: 'twin_shot', desc: 'Every dash fires a ring of 12 shots.' },
  { id: 'f_cold_blood', name: 'COLD BLOOD', a: 'cryo_rounds', b: 'giant_slayer', desc: 'Slowed elites and bosses take +30% damage.' },
]

// --- fallbacks (A2.4) -------------------------------------------------------

export interface FallbackDef {
  id: string
  name: string
  desc: string
  glyph: string
}

/** Fill order for empty draft slots. */
export const FALLBACKS: readonly FallbackDef[] = [
  { id: 'sharpen', name: 'Sharpen', desc: 'A little more damage. Take it as often as you like.', glyph: 'damage' },
  { id: 'field_repair', name: 'Field Repair', desc: 'Patch the hull right now.', glyph: 'hp' },
  { id: 'spare_parts', name: 'Spare Parts', desc: 'One more reroll for later drafts.', glyph: 'regen' },
]

// --- the build fold ---------------------------------------------------------

const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]))
const FUSION_IDS = new Set(FUSIONS.map((f) => f.id))

export function findPerk(id: string): PerkDef | undefined {
  return PERK_BY_ID.get(id)
}

/** Fold one owned build entry (perk, fusion or SHARPEN stacks) into `m`. */
export function applyBuild(m: Modifiers, id: string, stacks: number): void {
  const p = PERK_BY_ID.get(id)
  if (p) p.apply(m, stacks)
  else if (id === 'sharpen') m.damageMul *= powi(FALLBACK.sharpenMul, stacks)
  else if (!FUSION_IDS.has(id)) throw new Error('unknown build id: ' + id)
}

const statScratch = baseModifiers()

/** The stat line of `p` at `stacks` stacks (stacks >= 1). */
export function perkStat(p: PerkDef, stacks: number): string {
  resetModifiers(statScratch)
  p.apply(statScratch, stacks)
  return p.stat(statScratch)
}
