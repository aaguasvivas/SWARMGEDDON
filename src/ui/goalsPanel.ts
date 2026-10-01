import { Container, Graphics, Text } from 'pixi.js'
import { FEATS, type FeatDef } from '../content/feats.ts'
import { loadFeats } from '../state/feats.ts'
import type { LifetimeStats } from '../state/stats.ts'
import { FONT, T } from './tokens.ts'

const HEAD_H = 18
const GAP = 10
export const GOAL_ROW_H = 26

export interface Goal {
  feat: FeatDef
  value: number
  frac: number
}

/** `1,287` or `2:30`. */
export function featNumber(f: FeatDef, v: number): string {
  const n = Math.max(0, Math.floor(v))
  if (f.time) return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0')
  return n.toLocaleString('en-US')
}

/** `1,287 / 5,000` or `1:12 / 2:30`. */
export function featProgress(f: FeatDef, v: number): string {
  return featNumber(f, Math.min(v, f.target)) + ' / ' + featNumber(f, f.target)
}

/** A feat's progress now: a run feat keeps its best run, a total feat reads the stats. */
export function featValue(f: FeatDef, prog: Record<string, number>, L: LifetimeStats): number {
  return f.kind === 'run' ? (prog[f.id] ?? 0) : f.value(L)
}

/** The rewards a player chases first: a new pilot or a new world. */
function contentReward(f: FeatDef): boolean {
  return f.reward.indexOf(':') < 0
}

/**
 * The menu's NEXT GOALS: the unfinished feats closest to done, and the nearest
 * pilot or world reward when the closest ones are all items.
 */
export function nextGoals(n: number, L: LifetimeStats): Goal[] {
  const s = loadFeats()
  const open: Goal[] = []
  for (const f of FEATS) {
    if (s.done[f.id]) continue
    const value = featValue(f, s.prog, L)
    open.push({ feat: f, value, frac: Math.min(1, value / f.target) })
  }
  open.sort((a, b) => b.frac - a.frac || a.feat.n - b.feat.n)
  const out = open.slice(0, n)
  if (n > 0 && !out.some((g) => contentReward(g.feat))) {
    const c = open.find((g) => contentReward(g.feat))
    if (c) out[out.length - 1] = c
  }
  return out
}

/** NEXT GOALS: a header and one row per goal (the feat's task, its progress and a bar). */
export class GoalsPanel {
  readonly view = new Container()
  private readonly head: Text
  private readonly rows: { desc: Text; prog: Text; bar: Graphics }[] = []
  private w = 0

  constructor() {
    this.head = new Text({ text: 'NEXT GOALS', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, letterSpacing: 1, fill: T.textMuted } })
    this.view.addChild(this.head)
    for (let i = 0; i < 3; i++) {
      const desc = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, fill: T.textHi } })
      const prog = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, fill: T.textMuted } })
      prog.anchor.set(1, 0)
      const bar = new Graphics()
      this.rows.push({ desc, prog, bar })
      this.view.addChild(desc, prog, bar)
    }
  }

  /** Height for `n` rows. */
  static height(n: number): number {
    return HEAD_H + n * GOAL_ROW_H
  }

  set(goals: Goal[], w: number): void {
    this.w = w
    this.rows.forEach((r, i) => {
      const g = goals[i]
      r.desc.visible = r.prog.visible = r.bar.visible = !!g
      if (!g) return
      const y = HEAD_H + i * GOAL_ROW_H
      r.prog.text = featProgress(g.feat, g.value)
      r.prog.position.set(w, y)
      r.desc.text = g.feat.desc
      r.desc.position.set(0, y)
      // Text never shrinks under 12 px: a long row shows a percentage, then cuts the task.
      if (r.desc.width + GAP + r.prog.width > w) r.prog.text = Math.floor(g.frac * 100) + '%'
      clip(r.desc, w - GAP - r.prog.width)
      r.bar.clear()
      r.bar.roundRect(0, y + 17, w, 3, 1.5).fill(T.lineFaint)
      if (g.frac > 0) r.bar.roundRect(0, y + 17, Math.max(3, w * g.frac), 3, 1.5).fill(T.accentPlayer)
    })
    this.head.visible = goals.length > 0
  }

  get width(): number {
    return this.w
  }
}

/** Cut `t` to `maxW` with a trailing `...` (event rate only). */
export function clip(t: Text, maxW: number): void {
  const full = t.text
  if (t.width <= maxW) return
  let n = full.length
  while (n > 1 && t.width > maxW) {
    n--
    t.text = full.slice(0, n).trimEnd() + '...'
  }
}
