import type { Rng } from '../core/rng.ts'

/**
 * Wave director — data-driven escalation. Regular enemies unlock over time and
 * are chosen by weight; spawn rate/batch curves ramp the pressure. Elites and
 * the queen boss spawn on their own cadences (handled by the spawn system using
 * these constants). Late game piles on the nasty types.
 */
export interface WaveEntry {
  id: string
  unlockAt: number // seconds
  weight: number
}

export const WAVE_TABLE: readonly WaveEntry[] = [
  { id: 'swarmer', unlockAt: 0, weight: 10 },
  { id: 'biter', unlockAt: 8, weight: 7 },
  { id: 'flyer', unlockAt: 16, weight: 5 },
  { id: 'spitter', unlockAt: 30, weight: 4 },
  { id: 'beetle', unlockAt: 40, weight: 3 },
  { id: 'splitter', unlockAt: 55, weight: 3 },
  { id: 'stinger', unlockAt: 65, weight: 3 },
  { id: 'wraith', unlockAt: 75, weight: 3 },
  { id: 'burrower', unlockAt: 90, weight: 3 },
  { id: 'brute', unlockAt: 105, weight: 2 },
  { id: 'hivemind', unlockAt: 120, weight: 2 },
  { id: 'psychic', unlockAt: 140, weight: 2 },
  { id: 'warper', unlockAt: 160, weight: 2 },
]

/** Elite (hive guardian) cadence. */
export const ELITE_FIRST = 55
export const ELITE_INTERVAL = 48

/** Queen boss cadence (one alive at a time). */
export const BOSS_FIRST = 175
export const BOSS_INTERVAL = 165

/** Seconds between spawn pulses — gentle opening (don't punish a slow start),
 *  tightening to a relentless late game. */
export function spawnInterval(time: number): number {
  return Math.max(0.08, 0.95 - time * 0.0072)
}

/** Enemies per pulse — grows over time so the screen fills into a sea of bodies. */
export function spawnBatch(time: number): number {
  return 1 + Math.floor(time / 20)
}

/** Weighted pick among all currently-unlocked regular enemy types. */
export function pickEnemy(rng: Rng, time: number): string {
  let total = 0
  for (const e of WAVE_TABLE) if (time >= e.unlockAt) total += e.weight
  let roll = rng.float() * total
  for (const e of WAVE_TABLE) {
    if (time < e.unlockAt) continue
    roll -= e.weight
    if (roll <= 0) return e.id
  }
  return 'swarmer'
}
