import { MAX_THREAT } from '../core/rules.ts'
import { loadJSON, saveJSON } from '../platform/storage.ts'
import type { RunResult } from './runResult.ts'

/**
 * The THREAT ladder per world (docs/NEXT-LEVEL.md 4.8): key `threat` holds the
 * highest level unlocked per world id, key `sel:threat` the level the player
 * picked per world id, clamped to the unlocked one when read.
 */
type PerWorld = Record<string, number>

function read(key: string): PerWorld {
  const v = loadJSON<unknown>(key, {})
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as PerWorld) : {}
}

function level(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(MAX_THREAT, Math.floor(v))) : 0
}

export function unlockedThreat(worldId: string): number {
  return level(read('threat')[worldId])
}

/** The level a Standard run in this world starts at. */
export function selectedThreat(worldId: string): number {
  return Math.min(level(read('sel:threat')[worldId]), unlockedThreat(worldId))
}

export function selectThreat(worldId: string, t: number): void {
  const sel = read('sel:threat')
  sel[worldId] = Math.min(level(t), unlockedThreat(worldId))
  saveJSON('sel:threat', sel)
}

/** A Standard win at the world's highest unlocked level unlocks the next one
 *  (up to MAX_THREAT). The Daily never unlocks threat. Returns the level
 *  unlocked, or -1. */
export function recordThreatClear(r: RunResult): number {
  if (r.mode !== 'endless' || !r.cleared) return -1
  const top = unlockedThreat(r.arena)
  if (r.threat !== top || top >= MAX_THREAT) return -1
  const all = read('threat')
  all[r.arena] = top + 1
  saveJSON('threat', all)
  return top + 1
}
