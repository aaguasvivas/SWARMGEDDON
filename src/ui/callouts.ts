import { Container, Text } from 'pixi.js'
import { lerpHex } from '../core/color.ts'
import { FONT, INK, T, ensureContrast } from './tokens.ts'

/** A15: priority and hold (seconds) of every callout. */
export const CALLOUT = {
  worldIntro: { prio: 1, hold: 2.2 },
  dailyIntro: { prio: 1, hold: 2.4 },
  alertBoss: { prio: 3, hold: 3.0 },
  alertEvent: { prio: 2, hold: 3.0 },
  alertElite: { prio: 2, hold: 2.0 },
  alertLull: { prio: 1, hold: 2.0 },
  bossPhase: { prio: 2, hold: 1.0 },
  frenzy: { prio: 2, hold: 1.2 },
  bossSlain: { prio: 3, hold: 2.0 },
  flawless: { prio: 3, hold: 1.2 },
  win: { prio: 3, hold: 2.0 },
  stalemate: { prio: 3, hold: 2.0 },
  overtime: { prio: 3, hold: 3.0 },
  newBest: { prio: 2, hold: 1.4 },
  multUp: { prio: 2, hold: 1.1 },
  closeCall: { prio: 2, hold: 0.9 },
  fusion: { prio: 3, hold: 1.6 },
  evolve: { prio: 3, hold: 1.8 },
  bonus: { prio: 2, hold: 1.0 },
  weaponPickup: { prio: 1, hold: 1.1 },
  outOfAmmo: { prio: 1, hold: 1.2 },
  revive: { prio: 3, hold: 1.4 },
  hint: { prio: 0, hold: 3.5 },
} as const
export type CalloutSpec = (typeof CALLOUT)[keyof typeof CALLOUT]

/** A15 colors that are not tokens. */
export const CALLOUT_COLOR = { boss: 0xff6aa8, event: 0xff5a6e, mint: 0x7dffd6, fusion: 0xff5ad1, evolve: 0xff9a4a, revive: 0x4dffa0 } as const

const QUEUE = 3
const TITLE_PX = 26
const SUB_PX = 14
const SUB_LINE_PX = 18
/** The sub never shrinks below this (effective px); a longer one takes two lines. */
const SUB_MIN_PX = 12
/** Where a two-line sub breaks when it has one. */
const SUB_SEPARATOR = ' \u00b7 '
const ENTER_S = 0.14
const EXIT_S = 0.2
const ENTER_SCALE = 1.25
const EXIT_RISE = 10
/** Title and sub centers relative to the lane center, with and without a sub. */
const TITLE_DY = -11
const SUB_DY = 18
/** The sub line sits this far from its title color toward text.hi, so it reads
 *  as the same line family but never as a second title. */
const SUB_LIGHTEN = 0.35

/**
 * The callout lane (A15): one centered title and sub line at a time, a queue
 * of 3, and a higher priority preempts the one showing. A queued line that
 * waited longer than its own hold is dropped, except a line that follows the
 * one before it (a boss kill's FLAWLESS and win lines), which waits its turn.
 * Text changes only when a line starts (event rate); runs on the real clock.
 */
export class Callouts {
  readonly view = new Container()
  reduceMotion = false
  private readonly title: Text
  private readonly sub: Text
  private readonly box = new Container()
  private cx = 0
  private laneY = 0
  private maxW = 300
  private base = 1
  private now = 0
  // The one showing: priority (-1 = none), seconds shown and total length.
  private prio = -1
  private age = 0
  private life = 0
  private subText = ''
  private seq = 0
  // The queue, as parallel slots (prio -1 = empty).
  private readonly qPrio = new Int8Array(QUEUE).fill(-1)
  private readonly qHold = new Float32Array(QUEUE)
  private readonly qAt = new Float64Array(QUEUE)
  private readonly qSeq = new Float64Array(QUEUE)
  private readonly qFollow = new Uint8Array(QUEUE)
  private readonly qColor = new Int32Array(QUEUE)
  private readonly qTitle: string[] = ['', '', '']
  private readonly qSub: string[] = ['', '', '']

  constructor() {
    this.title = new Text({
      text: '',
      style: { fontFamily: FONT.display, fontWeight: '900', fontSize: TITLE_PX, letterSpacing: 2, fill: 0xffffff, stroke: { color: INK, width: 6, join: 'round' } },
    })
    this.title.anchor.set(0.5)
    this.sub = new Text({
      text: '',
      style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: SUB_PX, lineHeight: SUB_LINE_PX, letterSpacing: 1, align: 'center', fill: 0xffffff, stroke: { color: INK, width: 5, join: 'round' } },
    })
    this.sub.anchor.set(0.5)
    this.box.addChild(this.title, this.sub)
    this.view.addChild(this.box)
    this.view.eventMode = 'none'
    this.box.visible = false
  }

  /** `laneY` = the lane center (screen px); lines fit inside the safe width at `scale`. */
  layout(w: number, left: number, right: number, laneY: number, scale: number): void {
    this.cx = left + (w - left - right) / 2
    this.laneY = laneY
    this.base = scale
    this.maxW = (w - left - right - 32) / scale
    this.box.position.set(this.cx, laneY)
    if (this.prio >= 0) this.fit()
  }

  /** `follows`: the line belongs to the one queued or showing before it, so it
   *  shows when that one ends however long it waits. */
  show(spec: CalloutSpec, title: string, sub: string, color: number, follows = false): void {
    if (this.prio < 0 || spec.prio > this.prio) {
      this.start(spec.prio, spec.hold, title, sub, color)
      return
    }
    let slot = -1
    let low = -1
    for (let i = 0; i < QUEUE; i++) {
      if (this.qPrio[i]! < 0) {
        slot = i
        break
      }
      if (low < 0 || this.qPrio[i]! < this.qPrio[low]!) low = i
    }
    if (slot < 0) {
      if (spec.prio <= this.qPrio[low]!) return
      slot = low
    }
    this.qPrio[slot] = spec.prio
    this.qHold[slot] = spec.hold
    this.qAt[slot] = this.now
    this.qSeq[slot] = this.seq++
    this.qFollow[slot] = follows ? 1 : 0
    this.qColor[slot] = color
    this.qTitle[slot] = title
    this.qSub[slot] = sub
  }

  /** No line shows and none waits (a hint may start). */
  idle(): boolean {
    if (this.prio >= 0) return false
    for (let i = 0; i < QUEUE; i++) if (this.qPrio[i]! >= 0) return false
    return true
  }

  /** Screen box of the line showing now, into `out` (x0, y0, x1, y1); false when none shows. */
  bounds(out: Float32Array): boolean {
    if (this.prio < 0 || !this.box.visible) return false
    const k = this.base
    const hw = (Math.max(this.title.visible ? this.title.width : 0, this.sub.visible ? this.sub.width : 0) / 2) * k
    out[0] = this.cx - hw
    out[1] = this.laneY + (this.title.visible ? (this.sub.visible ? TITLE_DY : 0) - TITLE_PX / 2 - 4 : this.sub.y - this.sub.height / 2 - 4) * k
    out[2] = this.cx + hw
    out[3] = this.laneY + ((this.sub.visible ? this.sub.y + this.sub.height / 2 : TITLE_PX / 2) + 4) * k
    return true
  }

  clear(): void {
    this.prio = -1
    this.box.visible = false
    this.qPrio.fill(-1)
  }

  /** Advance by `dt` real seconds (0 while the run is paused). */
  update(dt: number): void {
    this.now += dt
    if (this.prio < 0) return
    this.age += dt
    if (this.age >= this.life) {
      this.prio = -1
      this.box.visible = false
      this.next()
      return
    }
    const a = this.age
    const left = this.life - a
    const box = this.box
    if (a < ENTER_S) {
      const k = a / ENTER_S
      box.alpha = k
      box.scale.set(this.base * (this.reduceMotion ? 1 : ENTER_SCALE + (1 - ENTER_SCALE) * outBack(k)))
      box.y = this.laneY
    } else if (left < EXIT_S) {
      const k = left / EXIT_S
      box.alpha = k
      box.scale.set(this.base)
      box.y = this.laneY - (this.reduceMotion ? 0 : (1 - k) * EXIT_RISE)
    } else {
      box.alpha = 1
      box.scale.set(this.base)
      box.y = this.laneY
    }
  }

  private next(): void {
    let best = -1
    for (let i = 0; i < QUEUE; i++) {
      const p = this.qPrio[i]!
      if (p < 0) continue
      if (this.qFollow[i] === 0 && this.now - this.qAt[i]! > this.qHold[i]!) {
        this.qPrio[i] = -1
        continue
      }
      if (best < 0 || p > this.qPrio[best]! || (p === this.qPrio[best]! && this.qSeq[i]! < this.qSeq[best]!)) best = i
    }
    if (best < 0) return
    const p = this.qPrio[best]!
    this.qPrio[best] = -1
    this.start(p, this.qHold[best]!, this.qTitle[best]!, this.qSub[best]!, this.qColor[best]!)
  }

  private start(prio: number, hold: number, title: string, sub: string, color: number): void {
    this.prio = prio
    this.age = 0
    this.life = hold + EXIT_S
    const c = ensureContrast(color, INK)
    this.title.text = title
    this.title.style.fill = c
    // A hint line (A15) has no title: its sub sits on the lane center.
    this.title.visible = title !== ''
    this.subText = sub
    this.sub.style.fill = this.title.visible ? lerpHex(c, T.textHi, SUB_LIGHTEN) : c
    this.sub.visible = sub !== ''
    this.title.y = sub ? TITLE_DY : 0
    this.fit()
    this.box.visible = true
    this.box.alpha = 0
  }

  private fit(): void {
    fitWidth(this.title, this.maxW, 0)
    const sub = this.sub
    const minK = SUB_MIN_PX / (SUB_PX * this.base)
    sub.text = this.subText
    fitWidth(sub, this.maxW, 0)
    if (sub.scale.x < minK) {
      sub.text = twoLines(this.subText)
      fitWidth(sub, this.maxW, minK)
    }
    // A second line grows downward, so the title keeps its place.
    sub.y = this.title.visible ? SUB_DY + (sub.text.indexOf('\n') >= 0 ? (SUB_LINE_PX * sub.scale.y) / 2 : 0) : 0
  }
}

/** Shrink `t` to `maxW`, but never below scale `minK`. */
function fitWidth(t: Text, maxW: number, minK: number): void {
  t.scale.set(1)
  if (t.width > maxW) t.scale.set(Math.max(minK, maxW / t.width))
}

/** A sub too long for one line at the minimum size: break it at its separator,
 *  or at the space nearest the middle. */
function twoLines(s: string): string {
  const sep = s.indexOf(SUB_SEPARATOR)
  if (sep >= 0) return s.slice(0, sep) + '\n' + s.slice(sep + SUB_SEPARATOR.length)
  const mid = s.length / 2
  let at = -1
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i
  return at < 0 ? s : s.slice(0, at) + '\n' + s.slice(at + 1)
}

function outBack(t: number): number {
  const c = 1.70158
  const u = t - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}

