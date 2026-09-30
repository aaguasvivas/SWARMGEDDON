import { STATS_MIN_RUN_S } from '../config.ts'
import { ALREADY_YOURS, FEATS, rewardLine, rewardName, type FeatDef } from '../content/feats.ts'
import { loadJSON, saveJSON } from '../platform/storage.ts'
import type { RunResult } from './runResult.ts'
import type { LifetimeStats } from './stats.ts'
import { grant } from './unlocks.ts'

/** Feat progress under `feats` (section 7.4): the UTC day each feat was done,
 *  and the last value of every open one (a run feat keeps its best run). */
export interface FeatState {
  done: Record<string, string>
  prog: Record<string, number>
}

/** A feat finished by a run (or by the v2 migration). */
export interface FeatUnlock {
  feat: FeatDef
  /** The reward was new to the save; otherwise the line is `Already yours`. */
  fresh: boolean
  /** A12 reward line. */
  line: string
  /** Short item name, `EMBER` or `COBALT PAINT`. */
  name: string
}

const KEY = 'feats'

/** A stored JSON object, or {} for any other shape. */
export function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function loadFeats(): FeatState {
  const raw = asRecord(loadJSON<unknown>(KEY, null))
  const done: Record<string, string> = {}
  const prog: Record<string, number> = {}
  const d = asRecord(raw['done'])
  const p = asRecord(raw['prog'])
  for (const k in d) if (typeof d[k] === 'string') done[k] = d[k] as string
  for (const k in p) if (typeof p[k] === 'number' && Number.isFinite(p[k])) prog[k] = p[k] as number
  return { done, prog }
}

export function saveFeats(s: FeatState): void {
  saveJSON(KEY, s)
}

/** Mark `f` done on `date` and grant its reward. */
export function completeFeat(s: FeatState, f: FeatDef, date: string): FeatUnlock {
  s.done[f.id] = date
  delete s.prog[f.id]
  const fresh = grant(f.reward)
  return { feat: f, fresh, line: fresh ? rewardLine(f.reward) : ALREADY_YOURS, name: rewardName(f.reward) }
}

/**
 * Evaluate every open feat. Run feats read `r` (skipped when `r` is null or the
 * run was shorter than STATS_MIN_RUN_S); total feats read `L`, which already
 * holds the run. Completions are returned in table order.
 */
export function evaluateFeatState(s: FeatState, r: RunResult | null, L: LifetimeStats, date: string): FeatUnlock[] {
  const out: FeatUnlock[] = []
  const runCounts = r !== null && r.time >= STATS_MIN_RUN_S
  for (const f of FEATS) {
    if (s.done[f.id]) continue
    let v: number
    if (f.kind === 'run') {
      if (!runCounts) continue
      v = Math.max(s.prog[f.id] ?? 0, f.value(r!))
    } else {
      v = f.value(L)
    }
    s.prog[f.id] = v
    if (v >= f.target) out.push(completeFeat(s, f, date))
  }
  return out
}

/** The endRun step: evaluate, grant, save. */
export function evaluateFeats(r: RunResult, L: LifetimeStats): FeatUnlock[] {
  const s = loadFeats()
  const out = evaluateFeatState(s, r, L, r.date)
  saveFeats(s)
  return out
}
