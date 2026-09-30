export const enum TimePreset { BossIntro, BossKill, Resume, CloseCall, Revive }

const PRESET_COUNT = 5
const HITSTOP_COOLDOWN_MS = 250
const REDUCED_FLOOR = 0.5
const DEATH_SLOW = 0.3

/** Death sequence beats (ms since death): the freeze ends and the wreck
 *  visuals land, a fresh pointerdown may skip, the recap enters. */
export const DEATH_BEAT_MS = 90
export const DEATH_SKIP_MS = 300
export const DEATH_RECAP_MS = 1150

/** Per preset: level, delay, ramp in, hold, ramp back out (ms, real time).
 *  BossKill also serves the win; Resume serves level and pause resume. */
const SHAPE = new Float32Array([
  0.35, 0, 60, 450, 300, // BossIntro
  0.15, 0, 40, 300, 450, // BossKill
  0.3, 0, 0, 0, 300, // Resume
  0.4, 0, 0, 250, 150, // CloseCall
  0.4, 120, 0, 0, 400, // Revive: starts when its forced 120 ms hit-stop ends
])

/**
 * Render-side time: hit-stop, slow-motion presets and the death sequence. The
 * result only scales how fast real time fills the loop's accumulator; the sim
 * always steps FIXED_DT, so nothing here can change a run.
 */
export class TimeDirector {
  reduceMotion = false
  /** Ms since the death sequence began, or -1 when no death is playing. */
  deathMs = -1
  private hitstopMs = 0
  private cooldownMs = 0
  private readonly presetMs = new Float32Array(PRESET_COUNT).fill(-1)

  hitStop(ms: number, forced = false): void {
    if (this.reduceMotion) return
    if (!forced && this.cooldownMs > 0) return
    if (ms > this.hitstopMs) this.hitstopMs = ms
  }

  play(p: TimePreset): void {
    this.presetMs[p] = 0
  }

  startDeath(): void {
    if (this.deathMs < 0) this.deathMs = 0
  }

  /** Charge the frame that just played. Call before new triggers are added, so
   *  a hit-stop raised this frame starts with the next one. A remainder under
   *  half a frame ends a hit-stop, so frame jitter cannot add a whole frame. */
  advance(frameMs: number): void {
    if (this.hitstopMs > 0) {
      this.hitstopMs -= frameMs
      if (this.hitstopMs < frameMs * 0.5) {
        this.hitstopMs = 0
        this.cooldownMs = HITSTOP_COOLDOWN_MS
      }
    } else if (this.cooldownMs > 0) {
      this.cooldownMs -= frameMs
    }
    const pm = this.presetMs
    for (let p = 0; p < PRESET_COUNT; p++) {
      const t = pm[p]!
      if (t < 0) continue
      const o = p * 5
      const next = t + frameMs
      pm[p] = next >= SHAPE[o + 1]! + SHAPE[o + 2]! + SHAPE[o + 3]! + SHAPE[o + 4]! ? -1 : next
    }
    if (this.deathMs >= 0) this.deathMs += frameMs
  }

  /** The loop's time scale for the next frame. */
  scale(paused: boolean): number {
    if (paused) return 0
    let s = this.hitstopMs > 0 ? 0 : 1
    const pm = this.presetMs
    for (let p = 0; p < PRESET_COUNT; p++) {
      const t = pm[p]!
      if (t < 0) continue
      let v = presetValue(p, t)
      if (this.reduceMotion && v < REDUCED_FLOOR) v = REDUCED_FLOOR
      if (v < s) s = v
    }
    if (this.deathMs >= 0) {
      const d = this.deathMs < DEATH_BEAT_MS ? 0 : DEATH_SLOW
      if (d < s) s = d
    }
    return s
  }

  reset(): void {
    this.hitstopMs = 0
    this.cooldownMs = 0
    this.deathMs = -1
    this.presetMs.fill(-1)
  }
}

function presetValue(p: number, t: number): number {
  const o = p * 5
  const level = SHAPE[o]!
  let u = t - SHAPE[o + 1]!
  if (u < 0) return 1
  const inMs = SHAPE[o + 2]!
  if (u < inMs) return 1 + (level - 1) * (u / inMs)
  u -= inMs
  const hold = SHAPE[o + 3]!
  if (u < hold) return level
  u -= hold
  const out = SHAPE[o + 4]!
  if (u < out) return level + (1 - level) * (u / out)
  return 1
}
