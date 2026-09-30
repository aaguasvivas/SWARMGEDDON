import type { RunResult } from '../state/runResult.ts'
import type { LifetimeStats } from '../state/stats.ts'
import { ARENAS } from './arenas.ts'
import { CHARACTERS } from './characters.ts'
import { PAINTS, paintById } from './paints.ts'
import { FAMILY_KEYSTONES, PERKS, findPerk } from './perks.ts'
import { PICKUP_WEAPON_IDS, WEAPONS } from './weapons.ts'

/**
 * The 48 feats (A12). A run feat reads one finished run; a total feat reads the
 * lifetime stats that already include the run. Each feat rewards one item: a
 * pilot or world by its bare id, or a perk, weapon or paint as `perk:<id>`,
 * `weapon:<id>` or `paint:<id>`. An item is locked if and only if a feat
 * rewards it.
 */
interface FeatBase {
  n: number
  id: string
  name: string
  desc: string
  target: number
  reward: string
  band: string
  /** Progress shows as m:ss. */
  time?: true
}
export type FeatDef = FeatBase & ({ kind: 'run'; value: (r: RunResult) => number } | { kind: 'total'; value: (L: LifetimeStats) => number })

function run(n: number, id: string, name: string, desc: string, target: number, reward: string, band: string, value: (r: RunResult) => number, time?: true): FeatDef {
  return { n, id, name, desc, target, reward, band, kind: 'run', value, ...(time ? { time } : {}) }
}

function total(n: number, id: string, name: string, desc: string, target: number, reward: string, band: string, value: (L: LifetimeStats) => number, time?: true): FeatDef {
  return { n, id, name, desc, target, reward, band, kind: 'total', value, ...(time ? { time } : {}) }
}

function killsOf(L: LifetimeStats, a: string, b: string): number {
  return (L.killsByEnemy[a] ?? 0) + (L.killsByEnemy[b] ?? 0)
}

/** Worlds with a counted run. A v1 import has only the best time. */
function worldsPlayed(L: LifetimeStats): number {
  let n = 0
  for (const id in L.perWorld) if (L.perWorld[id]!.runs > 0 || L.perWorld[id]!.bestTime > 0) n++
  return n
}

function worldsWithBestTime(L: LifetimeStats, s: number): number {
  let n = 0
  for (const id in L.perWorld) if (L.perWorld[id]!.bestTime >= s) n++
  return n
}

function worldsCleared(L: LifetimeStats): number {
  let n = 0
  for (const id in L.perWorld) if (L.perWorld[id]!.clears > 0) n++
  return n
}

function maxThreatCleared(L: LifetimeStats): number {
  let t = -1
  for (const id in L.perWorld) t = Math.max(t, L.perWorld[id]!.maxThreatCleared)
  return t
}

export const FEATS: readonly FeatDef[] = [
  total(1, 'first_contact', 'FIRST CONTACT', 'Finish your first run', 1, 'paint:static', 'S1', (L) => L.runs),
  run(2, 'field_promotion', 'FIELD PROMOTION', 'Reach Lv 5 in one run', 5, 'weapon:lightning', 'S1', (r) => r.level),
  total(3, 'big_game', 'BIG GAME', 'Slay an elite', 1, 'perk:giant_slayer', 'S1', (L) => L.elites),
  run(4, 'overcharged', 'OVERCHARGED', 'Reach Lv 8 in one run', 8, 'ember', 'S1', (r) => r.level),
  run(5, 'rampage', 'RAMPAGE', 'Reach a x3 multiplier', 3, 'perk:berserker', 'S1', (r) => r.peakTier),
  run(6, 'swatter', 'SWATTER', 'Kill 300 in one run', 300, 'paint:hazard', 'S1', (r) => r.kills),
  total(7, 'pest_control', 'PEST CONTROL', 'Kill 1,000 in total', 1000, 'weapon:hailstorm', 'S1', (L) => L.kills),
  total(8, 'back_for_more', 'BACK FOR MORE', 'Finish 5 runs', 5, 'perk:overpressure', 'S1', (L) => L.runs),
  total(9, 'thick_hide', 'THICK HIDE', 'Take 1,000 damage in total', 1000, 'vesper', 'S2', (L) => L.damage),
  run(10, 'deep_dive', 'DEEP DIVE', 'Survive 2:30 in Hive Meadow', 150, 'depths', 'S2', (r) => (r.arena === 'hive' ? r.time : 0), true),
  total(11, 'near_miss', 'NEAR MISS', 'Make 10 close calls', 10, 'weapon:railgun', 'S2', (L) => L.closeCalls),
  total(12, 'culler', 'CULLER', 'Kill 5,000 in total', 5000, 'perk:incendiary', 'S2', (L) => L.kills),
  run(13, 'arsenal', 'ARSENAL', 'Use 4 pickup weapons in one run', 4, 'paint:gunmetal', 'S2', (r) => r.weapons.length),
  total(14, 'queenslayer', 'QUEENSLAYER', 'Slay THE QUEEN', 1, 'perk:hollow_point', 'S3', (L) => killsOf(L, 'queen', 'queenPrime')),
  total(15, 'world_tour', 'WORLD TOUR', 'Finish a run in all 3 worlds', 3, 'paint:atlas', 'S3', worldsPlayed),
  total(16, 'on_shift', 'ON SHIFT', 'Play for 30 minutes', 1800, 'paint:cobalt', 'S3', (L) => L.seconds, true),
  run(17, 'mayhem', 'MAYHEM', 'Reach a x5 multiplier', 5, 'perk:adrenal_wake', 'S3', (r) => r.peakTier),
  total(18, 'daybreak', 'DAYBREAK', 'Finish a ranked Daily', 1, 'paint:daybreak', 'S3', (L) => L.dailyRanked),
  run(19, 'untouchable', 'UNTOUCHABLE', 'Go 2:00 without being hit', 120, 'perk:slipstream', 'S4', (r) => r.longestNoHit, true),
  total(20, 'void_walker', 'VOID WALKER', 'Slay THE VOID MATRON', 1, 'wastes', 'S4', (L) => killsOf(L, 'voidMatron', 'voidMatronPrime')),
  run(21, 'five_alive', 'FIVE ALIVE', 'Survive 5:00 in one run', 300, 'weapon:beam', 'S4', (r) => r.time, true),
  total(22, 'regular', 'REGULAR', 'Finish 15 runs', 15, 'perk:quartermaster', 'S4', (L) => L.runs),
  total(23, 'exterminator', 'EXTERMINATOR', 'Kill 12,000 in total', 12000, 'paint:magma', 'S4', (L) => L.kills),
  run(24, 'back_to_back', 'BACK TO BACK', 'Slay 2 bosses in one run', 2, 'perk:second_wind', 'S5', (r) => r.bossesSlain),
  run(25, 'purist', 'PURIST', 'Survive 3:00 with no weapon pickup', 180, 'paint:bone', 'S5', (r) => (r.podsEquipped === 0 ? r.time : 0), true),
  total(26, 'long_watch', 'LONG WATCH', 'Play for 60 minutes', 3600, 'paint:chrome', 'S5', (L) => L.seconds, true),
  total(27, 'flawless', 'FLAWLESS', 'Slay a boss without being hit', 1, 'paint:ghost', 'S5', (L) => L.bossesFlawless),
  run(28, 'fused', 'FUSED', 'Take a fusion perk', 1, 'paint:overclock', 'S5', (r) => r.fusions.length),
  total(29, 'nova_ace', 'NOVA ACE', 'Slay a boss as NOVA', 1, 'paint:nova_prime', 'S5', (L) => L.perPilot['nova']?.bosses ?? 0),
  run(30, 'ember_ace', 'EMBER ACE', 'Reach Lv 12 as EMBER', 12, 'paint:wildfire', 'S5', (r) => (r.character === 'ember' ? r.level : 0)),
  total(31, 'tyrantfall', 'TYRANTFALL', 'Slay THE EMBER TYRANT', 1, 'weapon:vortex', 'S6', (L) => killsOf(L, 'emberTyrant', 'emberTyrantPrime')),
  total(32, 'plague', 'PLAGUE', 'Kill 18,000 in total', 18000, 'perk:glass_cannon', 'S6', (L) => L.kills),
  run(33, 'vesper_ace', 'VESPER ACE', 'Survive 5:00 as VESPER', 300, 'paint:nightshade', 'S6', (r) => (r.character === 'vesper' ? r.time : 0), true),
  total(34, 'hive_breaker', 'HIVE BREAKER', 'Slay 10 bosses in total', 10, 'paint:royal_jelly', 'S6', (L) => L.bosses),
  total(35, 'infestation', 'INFESTATION', 'Kill 24,000 in total', 24000, 'paint:sunset', 'S7', (L) => L.kills),
  run(36, 'high_score', 'HIGH SCORE', 'Score 250,000 in one run', 250000, 'paint:gilded', 'S7', (r) => r.score),
  run(37, 'evolved', 'EVOLVED', 'Evolve a weapon', 1, 'paint:ultraviolet', 'S6', (r) => r.evolutions.length),
  total(38, 'devoted', 'DEVOTED', 'Finish 30 runs', 30, 'paint:rust', 'S8', (L) => L.runs),
  total(39, 'creature_of_habit', 'CREATURE OF HABIT', 'Finish 7 ranked Dailies', 7, 'paint:dusk', 'S8', (L) => L.dailyRanked),
  total(40, 'five_everywhere', 'FIVE EVERYWHERE', 'Survive 5:00 in all 3 worlds', 3, 'paint:tricolor', 'S8', (L) => worldsWithBestTime(L, 300)),
  total(41, 'dedicated', 'DEDICATED', 'Play for 2 hours', 7200, 'paint:ice', 'S9', (L) => L.seconds, true),
  total(42, 'first_clear', 'FIRST CLEAR', 'Clear any world', 1, 'paint:purged', 'S6+', (L) => L.clears),
  total(43, 'veteran', 'VETERAN', 'Finish 40 runs', 40, 'paint:veteran', 'S10', (L) => L.runs),
  run(44, 'swarmgeddon', 'SWARMGEDDON', 'Reach the x8 multiplier', 8, 'paint:swarmgeddon', 'S8+', (r) => r.peakTier),
  total(45, 'clean_sweep', 'CLEAN SWEEP', 'Clear all 3 worlds', 3, 'paint:sweep', 'S10+', worldsCleared),
  total(46, 'under_pressure', 'UNDER PRESSURE', 'Clear a world at Threat 3', 3, 'paint:pressure', 'S12+', maxThreatCleared),
  total(47, 'apex', 'APEX', 'Clear a world at Threat 4', 4, 'paint:apex', 'late', maxThreatCleared),
  total(48, 'extinction', 'EXTINCTION EVENT', 'Kill 100,000 in total', 100000, 'paint:extinction', 'late', (L) => L.kills),
]

/** Every reward key: exactly the locked set. */
export const FEAT_REWARDS: ReadonlySet<string> = new Set(FEATS.map((f) => f.reward))

export function featById(id: string): FeatDef | undefined {
  return FEATS.find((f) => f.id === id)
}

export function featForReward(key: string): FeatDef | undefined {
  return FEATS.find((f) => f.reward === key)
}

export const ALREADY_YOURS = 'Already yours'

/** The recap line for a fresh reward (A12). */
export function rewardLine(key: string): string {
  const i = key.indexOf(':')
  const kind = i < 0 ? '' : key.slice(0, i)
  const id = key.slice(i + 1)
  if (kind === 'perk') return `Added to your perk pool: ${findPerk(id)!.name.toUpperCase()}`
  if (kind === 'weapon') return `Added to the weapon drops: ${WEAPONS[id]!.name.toUpperCase()}`
  if (kind === 'paint') return `New paint: ${paintById(id)!.name}`
  const pilot = CHARACTERS.find((c) => c.id === id)
  if (pilot) return `New pilot: ${pilot.name}`
  return `New world: ${ARENAS.find((a) => a.id === id)!.name}`
}

/** Short item name for a reward key: `EMBER`, `RAIL SPIKE`, `COBALT PAINT`. */
export function rewardName(key: string): string {
  const i = key.indexOf(':')
  const kind = i < 0 ? '' : key.slice(0, i)
  const id = key.slice(i + 1)
  if (kind === 'perk') return findPerk(id)!.name.toUpperCase()
  if (kind === 'weapon') return WEAPONS[id]!.name.toUpperCase()
  if (kind === 'paint') return `${paintById(id)!.name} PAINT`
  return (CHARACTERS.find((c) => c.id === id) ?? ARENAS.find((a) => a.id === id))!.name
}

/**
 * The boot assertion: every reward names a real item, each item has one feat,
 * the unlock metadata of every pilot, world and paint agrees with the table,
 * keystones stay unlocked (C21), and the start pools are 21 perks and 6
 * weapons (A2, A4). Returns every problem found.
 */
export function validateFeats(): string[] {
  const err: string[] = []
  if (FEATS.length !== 48) err.push(`${FEATS.length} feats, expected 48`)
  const ids = new Set<string>()
  FEATS.forEach((f, i) => {
    if (f.n !== i + 1) err.push(`${f.id}: number ${f.n}, expected ${i + 1}`)
    if (ids.has(f.id)) err.push(`${f.id}: duplicate id`)
    ids.add(f.id)
    if (f.name.length > 18) err.push(`${f.id}: name over 18 characters`)
    if (f.desc.length > 34) err.push(`${f.id}: desc over 34 characters`)
    if (!(f.target > 0)) err.push(`${f.id}: target ${f.target}`)
    if (FEATS.findIndex((g) => g.reward === f.reward) !== i) err.push(`${f.id}: reward ${f.reward} is also another feat's`)
    const k = f.reward.indexOf(':')
    const kind = k < 0 ? '' : f.reward.slice(0, k)
    const id = f.reward.slice(k + 1)
    const ok =
      kind === 'perk' ? !!findPerk(id)
      : kind === 'weapon' ? PICKUP_WEAPON_IDS.includes(id)
      : kind === 'paint' ? !!paintById(id)
      : kind === '' ? CHARACTERS.some((c) => c.id === id) || ARENAS.some((a) => a.id === id)
      : false
    if (!ok) err.push(`${f.id}: reward ${f.reward} does not exist`)
  })
  const items: [string, { how: string; feat?: string }][] = [
    ...CHARACTERS.map((c) => [c.id, c.unlock] as [string, { how: string; feat?: string }]),
    ...ARENAS.map((a) => [a.id, a.unlock] as [string, { how: string; feat?: string }]),
    ...PAINTS.map((p) => ['paint:' + p.id, p.unlock] as [string, { how: string; feat?: string }]),
  ]
  for (const [key, meta] of items) {
    const f = featForReward(key)
    if (meta.how === 'earn' && (!f || f.id !== meta.feat)) err.push(`${key}: unlock names ${meta.feat}, the table says ${f?.id}`)
    if (meta.how !== 'earn' && f) err.push(`${key}: rewarded by ${f.id} but not an earn item`)
  }
  for (const fam of FAMILY_KEYSTONES) for (const p of fam) if (FEAT_REWARDS.has('perk:' + p.id)) err.push(`keystone ${p.id} is locked`)
  const startPerks = PERKS.filter((p) => !FEAT_REWARDS.has('perk:' + p.id)).length
  const startWeapons = PICKUP_WEAPON_IDS.filter((id) => !FEAT_REWARDS.has('weapon:' + id)).length
  if (startPerks !== 21) err.push(`start perk pool ${startPerks}, expected 21`)
  if (startWeapons !== 6) err.push(`start weapon pool ${startWeapons}, expected 6`)
  return err
}
