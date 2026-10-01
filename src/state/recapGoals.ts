import { FEATS, rewardName, type FeatDef } from '../content/feats.ts'
import type { FeatState } from './feats.ts'

/** A NEXT UP row on the recap: a feat this run moved closer. */
export interface Goal {
  name: string
  desc: string
  /** `6 / 8`, `2:31 / 5:00` or `3,212 / 5,000`. */
  progress: string
  frac: number
  /** Short reward name: `EMBER`, `COBALT PAINT`. */
  reward: string
}

const RUN_FEAT_MIN = 0.5

/** Pilots, worlds, perks and weapons; paints are cosmetic. */
function isContent(f: FeatDef): boolean {
  return !f.reward.startsWith('paint:')
}

function amount(v: number, time: boolean): string {
  if (time) {
    const s = Math.floor(v)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  return Math.floor(v).toLocaleString('en-US')
}

/**
 * The recap's NEXT UP goals (section 9.6) from the feat state before and after
 * the run: only unfinished feats the run advanced, a run feat only at 50% or
 * more, at most one total feat, and the best content reward when one exists.
 * Ordered nearest first.
 */
export function nearestGoals(before: FeatState, after: FeatState, max = 3): Goal[] {
  const cands: { f: FeatDef; frac: number; v: number }[] = []
  for (const f of FEATS) {
    if (after.done[f.id]) continue
    const v = after.prog[f.id] ?? 0
    if (!(v > (before.prog[f.id] ?? 0))) continue
    const frac = Math.min(1, v / f.target)
    if (f.kind === 'run' && frac < RUN_FEAT_MIN) continue
    cands.push({ f, frac, v })
  }
  cands.sort((a, b) => b.frac - a.frac)
  const picked: typeof cands = []
  const content = cands.find((c) => isContent(c.f))
  if (content) picked.push(content)
  let totals = content && content.f.kind === 'total' ? 1 : 0
  for (const c of cands) {
    if (picked.length >= max) break
    if (picked.includes(c)) continue
    if (c.f.kind === 'total') {
      if (totals >= 1) continue
      totals++
    }
    picked.push(c)
  }
  picked.sort((a, b) => b.frac - a.frac)
  return picked.map(({ f, frac, v }) => ({
    name: f.name,
    desc: f.desc,
    progress: `${amount(v, !!f.time)} / ${amount(f.target, !!f.time)}`,
    frac,
    reward: rewardName(f.reward),
  }))
}
