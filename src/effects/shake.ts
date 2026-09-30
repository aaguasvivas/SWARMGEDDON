import { hash32 } from '../core/rng.ts'
import { hypot } from '../core/vec.ts'

const DECAY = 1.6
const MAX_ROT = 0.021
const OFFSET_FRAC = 0.045
const OFFSET_MIN = 14
const OFFSET_MAX = 24
const HZ_LO = 12
const HZ_HI = 27
const KICK_DECAY = 25
const KICK_MAX = 12

const SEED_X = 0x51a1
const SEED_Y = 0x51a2
const SEED_R = 0x51a3

/**
 * Screen shake: trauma² drives value noise sampled on the real clock, so the
 * shake has the same visual frequency at any refresh rate. Screen kicks are a
 * separate directional offset that springs back fast. Presentation only.
 */
export class Shake {
  trauma = 0
  offsetX = 0
  offsetY = 0
  rotation = 0
  private kickX = 0
  private kickY = 0
  private maxOffset = OFFSET_MIN

  resize(w: number, h: number): void {
    this.maxOffset = Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, OFFSET_FRAC * Math.min(w, h)))
  }

  /** Add trauma without pushing it past `ceiling`; trauma already above the
   *  ceiling is kept. */
  add(amount: number, ceiling: number): void {
    if (this.trauma >= ceiling) return
    this.trauma = Math.min(ceiling, this.trauma + amount)
  }

  kick(dx: number, dy: number): void {
    let kx = this.kickX + dx
    let ky = this.kickY + dy
    const m = hypot(kx, ky)
    if (m > KICK_MAX) {
      kx *= KICK_MAX / m
      ky *= KICK_MAX / m
    }
    this.kickX = kx
    this.kickY = ky
  }

  /** Compute this frame's offsets, then decay by the real frame seconds `fd`,
   *  so trauma and kicks added this frame show before they fade. `t` is the
   *  real clock in seconds. */
  update(fd: number, t: number): void {
    const s = this.trauma * this.trauma
    this.offsetX = this.maxOffset * s * octaves(t, SEED_X) + this.kickX
    this.offsetY = this.maxOffset * s * octaves(t, SEED_Y) + this.kickY
    this.rotation = MAX_ROT * s * octaves(t, SEED_R)
    this.trauma = Math.max(0, this.trauma - DECAY * fd)
    const k = Math.exp(-KICK_DECAY * fd)
    this.kickX *= k
    this.kickY *= k
  }

  reset(): void {
    this.trauma = 0
    this.kickX = 0
    this.kickY = 0
    this.offsetX = 0
    this.offsetY = 0
    this.rotation = 0
  }
}

/** Lattice value in [-1, 1]. */
function lattice(i: number, seed: number): number {
  return (hash32(i, seed) / 4294967295) * 2 - 1
}

function valueNoise(x: number, seed: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  const a = lattice(i, seed)
  return a + (lattice(i + 1, seed) - a) * u
}

function octaves(t: number, seed: number): number {
  return (valueNoise(t * HZ_LO, seed) + 0.5 * valueNoise(t * HZ_HI, seed + 7)) / 1.5
}
