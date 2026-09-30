import { doubleFields } from './fields.ts'

/**
 * Seeded, deterministic PRNG. ALL gameplay randomness must flow through an
 * instance of this so a given seed reproduces a run bit-for-bit: that's what
 * makes the Daily Challenge "same run for everyone today" possible.
 *
 * Algorithm: mulberry32. Tiny, fast, good statistical quality for games.
 * String seeds come from seedFromString in core/rules.ts.
 */

/** Mix up to four 32-bit words into one well-spread 32-bit seed. */
export function hash32(a: number, b: number, c = 0, d = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 16) ^ c, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13) ^ d, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Per-stream salts: each run stream is seeded with hash32(runSeed, SALT.x). */
export const SALT = {
  spawn: 0x51a7e001, script: 0x5c417006, boss: 0xb055e007, loot: 0x10c7a002,
  draft: 0xd4af7003, combat: 0xc0b7a004, fx: 0xf00dfe05,
} as const

export class Rng {
  private a: number

  constructor(seed: number) {
    this.a = seed >>> 0
    doubleFields(this)
  }

  /** Reset the stream to a new seed (used on run restart for determinism). */
  reseed(seed: number): void {
    this.a = seed >>> 0
  }

  /** Raw 32-bit stream state (determinism probes hash it). */
  get state(): number {
    return this.a >>> 0
  }

  /** Next float in [0, 1). */
  float(): number {
    let t = (this.a = (this.a + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /**
   * The next `n` floats into `out`: the draws of n float() calls, bit for bit.
   * For code that must not allocate: a float() (or range()) call that V8 does
   * not inline returns its number boxed on the heap, and the particle
   * emitters run too rarely per frame to be inlined reliably. The steps are
   * float()'s, repeated so this loop makes no call at all.
   */
  fill(out: Float64Array, n: number): void {
    let a = this.a
    for (let i = 0; i < n; i++) {
      let t = (a = (a + 0x6d2b79f5) | 0)
      t = Math.imul(t ^ (t >>> 15), 1 | t)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      out[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    this.a = a
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min)
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1))
  }

  /** True with probability p (default 0.5). */
  bool(p = 0.5): boolean {
    return this.float() < p
  }

  /** Uniform angle in [0, TAU). */
  angle(): number {
    return this.float() * Math.PI * 2
  }

  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.float() * arr.length)]!
  }
}

/**
 * The run's seven independent streams. Each system draws only from the stream
 * that owns its decision (docs/NEXT-LEVEL.md 3.1), so adding draws to one
 * stream never shifts another. `fx` is cosmetic: reproducible, never read by
 * the sim.
 */
export class RunRngs {
  readonly spawn = new Rng(0)
  readonly script = new Rng(0)
  readonly boss = new Rng(0)
  readonly loot = new Rng(0)
  readonly draft = new Rng(0)
  readonly combat = new Rng(0)
  readonly fx = new Rng(0)

  /** Reseed every stream for a fresh run. */
  begin(seed: number): void {
    this.spawn.reseed(hash32(seed, SALT.spawn))
    this.script.reseed(hash32(seed, SALT.script))
    this.boss.reseed(hash32(seed, SALT.boss))
    this.loot.reseed(hash32(seed, SALT.loot))
    this.draft.reseed(hash32(seed, SALT.draft))
    this.combat.reseed(hash32(seed, SALT.combat))
    this.fx.reseed(hash32(seed, SALT.fx))
  }
}
