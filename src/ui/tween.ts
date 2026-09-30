import type { Container } from 'pixi.js'
import { MOTION } from './tokens.ts'

export const enum Prop { Alpha, Scale, X, Y, Rotation }
export const enum Ease { Linear, OutCubic, OutBack, InOutSine }

const CAP = 96

function ease(kind: number, t: number): number {
  switch (kind) {
    case Ease.OutCubic: {
      const u = 1 - t
      return 1 - u * u * u
    }
    case Ease.OutBack: {
      const c = 1.70158
      const u = t - 1
      return 1 + (c + 1) * u * u * u + c * u * u
    }
    case Ease.InOutSine:
      return 0.5 - 0.5 * Math.cos(Math.PI * t)
    default:
      return t
  }
}

function read(c: Container, p: number): number {
  switch (p) {
    case Prop.Alpha: return c.alpha
    case Prop.Scale: return c.scale.x
    case Prop.X: return c.x
    case Prop.Y: return c.y
    default: return c.rotation
  }
}

function write(c: Container, p: number, v: number): void {
  switch (p) {
    case Prop.Alpha: c.alpha = v; break
    case Prop.Scale: c.scale.set(v); break
    case Prop.X: c.x = v; break
    case Prop.Y: c.y = v; break
    default: c.rotation = v
  }
}

/**
 * UI tweens: a fixed pool of 96 slots in typed arrays, advanced once per render
 * frame on the real clock (menus and buttons keep moving through hit-stop and
 * slow motion). Starting a tween on a target and prop that already has one
 * replaces it. Under reduce motion only fades run, capped at 120 ms; every
 * other prop jumps to its end value.
 */
export class TweenPool {
  reduceMotion = false
  private now = 0
  private readonly target: (Container | null)[] = new Array<Container | null>(CAP).fill(null)
  private readonly prop = new Uint8Array(CAP)
  private readonly kind = new Uint8Array(CAP)
  private readonly from = new Float32Array(CAP)
  private readonly end = new Float32Array(CAP)
  private readonly start = new Float64Array(CAP)
  private readonly dur = new Float32Array(CAP)

  to(c: Container, p: Prop, value: number, durMs: number, e: Ease = Ease.OutCubic, delayMs = 0): void {
    let slot = -1
    for (let i = 0; i < CAP; i++) {
      const t = this.target[i]
      if (t === c && this.prop[i] === p) {
        slot = i
        break
      }
      if (t === null && slot < 0) slot = i
    }
    const d = this.reduceMotion ? (p === Prop.Alpha ? Math.min(durMs, MOTION.reducedMs) : 0) : durMs
    if (slot < 0 || (d <= 0 && delayMs <= 0)) {
      if (slot >= 0 && this.target[slot] === c) this.target[slot] = null
      write(c, p, value)
      return
    }
    this.target[slot] = c
    this.prop[slot] = p
    this.kind[slot] = e
    this.from[slot] = read(c, p)
    this.end[slot] = value
    this.start[slot] = this.now + delayMs
    this.dur[slot] = d
  }

  kill(c: Container): void {
    for (let i = 0; i < CAP; i++) if (this.target[i] === c) this.target[i] = null
  }

  update(nowMs: number): void {
    this.now = nowMs
    for (let i = 0; i < CAP; i++) {
      const c = this.target[i]
      if (!c) continue
      const el = nowMs - this.start[i]!
      if (el < 0) continue
      const d = this.dur[i]!
      const t = d > 0 ? el / d : 1
      if (t >= 1) {
        write(c, this.prop[i]!, this.end[i]!)
        this.target[i] = null
      } else {
        const a = this.from[i]!
        write(c, this.prop[i]!, a + (this.end[i]! - a) * ease(this.kind[i]!, t))
      }
    }
  }
}

export const tweens = new TweenPool()
