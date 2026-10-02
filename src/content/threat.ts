/**
 * THREAT levels (docs/NEXT-LEVEL.md 4.8, A11). Effects are cumulative: each
 * level carries every rule of the levels below it. A run reads its level once
 * in beginRun; resolveScript applies the beat rules, the director and the
 * kill hooks read the rest.
 */
export interface ThreatLevel {
  readonly level: number
  readonly name: string
  /** UI rule line, at most 48 characters. */
  readonly rule: string
  readonly hpMul: number
  readonly dmgMul: number
  readonly aliveMul: number
  /** The 1:30 teaching elite's affixes and HP multiplier. */
  readonly teachAffixes: number
  readonly teachHpMul: number
  /** Affixes on every other elite. */
  readonly eliteAffixes: number
  /** Extra elites on every elite beat from ELITE_PACK_FROM on. */
  readonly elitePlus: number
  /** Events 1 to 3 strike again MIRROR_DELAY later, from the opposite side. */
  readonly mirror: boolean
  /** Multiplies the boss's base cadence; FRENZY stacks on top. */
  readonly bossCadence: number
  /** Only elites and bosses drop medkits (SCARCITY). */
  readonly scarcity: boolean
}

export const THREAT_LEVELS: readonly ThreatLevel[] = [
  {
    level: 0, name: 'STANDARD', rule: 'The hive as designed.',
    hpMul: 1.0, dmgMul: 1.0, aliveMul: 1.0,
    teachAffixes: 0, teachHpMul: 0.6, eliteAffixes: 1, elitePlus: 0, mirror: false, bossCadence: 1, scarcity: false,
  },
  {
    level: 1, name: 'HUNTERS', rule: 'Elites hunt in packs and carry an affix sooner.',
    hpMul: 1.1, dmgMul: 1.0, aliveMul: 1.0,
    teachAffixes: 1, teachHpMul: 1.0, eliteAffixes: 1, elitePlus: 1, mirror: false, bossCadence: 1, scarcity: false,
  },
  {
    level: 2, name: 'BROOD TIDE', rule: 'Every swarm event strikes twice.',
    hpMul: 1.3, dmgMul: 1.05, aliveMul: 1.1,
    teachAffixes: 1, teachHpMul: 1.0, eliteAffixes: 1, elitePlus: 1, mirror: true, bossCadence: 1, scarcity: false,
  },
  {
    level: 3, name: 'CHAMPIONS', rule: 'Elites carry 2 affixes. Bosses attack faster.',
    hpMul: 1.3, dmgMul: 1.1, aliveMul: 1.1,
    teachAffixes: 1, teachHpMul: 1.0, eliteAffixes: 2, elitePlus: 1, mirror: true, bossCadence: 1.2, scarcity: false,
  },
  {
    level: 4, name: 'SCARCITY', rule: 'Only elites and bosses drop medkits.',
    hpMul: 1.4, dmgMul: 1.15, aliveMul: 1.15,
    teachAffixes: 1, teachHpMul: 1.0, eliteAffixes: 2, elitePlus: 1, mirror: true, bossCadence: 1.2, scarcity: true,
  },
]

/** HUNTERS: elite beats at or after 6:15 bring one more elite. */
export const ELITE_PACK_FROM = 375
/** BROOD TIDE: the mirror copy fires this long after its event. */
export const MIRROR_DELAY = 8
/** SCARCITY: medkits per boss kill (an elite drops one at every level), and
 *  the heal multiplier of both. */
export const SCARCITY = { bossMedkits: 2, healMul: 0.5 } as const

/** The level for `t`, clamped to the table. */
export function threatLevel(t: number): ThreatLevel {
  return THREAT_LEVELS[Math.max(0, Math.min(THREAT_LEVELS.length - 1, Math.floor(t) || 0))]!
}
