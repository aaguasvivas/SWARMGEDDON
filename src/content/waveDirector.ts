import type { Rng } from '../core/rng.ts'

/**
 * Wave director — data-driven spawn schedule. Each entry unlocks an enemy at a
 * time and weights how often it's chosen once unlocked. The spawn rate/batch
 * curves drive the escalation. Phase 3 layers elites/bosses on top of this.
 */
export interface WaveEntry {
  id: string
  unlockAt: number // seconds
  weight: number
}

export const WAVE_TABLE: readonly WaveEntry[] = [
  { id: 'swarmer', unlockAt: 0, weight: 10 },
  { id: 'flyer', unlockAt: 16, weight: 4 },
  { id: 'beetle', unlockAt: 38, weight: 3 },
  { id: 'spitter', unlockAt: 58, weight: 3 },
  { id: 'splitter', unlockAt: 85, weight: 2 },
]

/** Seconds between spawn pulses — tightens from ~0.85s toward 0.12s. */
export function spawnInterval(time: number): number {
  return Math.max(0.12, 0.85 - time * 0.0085)
}

/** Enemies per spawn pulse — grows every 28s. */
export function spawnBatch(time: number): number {
  return 1 + Math.floor(time / 28)
}

/** Weighted pick among all currently-unlocked enemy types. */
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
