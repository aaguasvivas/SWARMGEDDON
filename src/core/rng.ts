/**
 * Seeded, deterministic PRNG. ALL gameplay randomness must flow through an
 * instance of this so a given seed reproduces a run bit-for-bit — that's what
 * makes the Daily Challenge "same run for everyone today" possible.
 *
 * Algorithm: mulberry32 — tiny, fast, good statistical quality for games.
 */

/**
 * Hash an arbitrary string into a 32-bit seed (xmur3). Used to derive a seed
 * from e.g. a date string ("2026-06-13") for the daily challenge.
 */
export function seedFromString(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export class Rng {
  private a: number

  constructor(seed: number) {
    this.a = seed >>> 0
  }

  /** Reset the stream to a new seed (used on run restart for determinism). */
  reseed(seed: number): void {
    this.a = seed >>> 0
  }

  /** Next float in [0, 1). */
  float(): number {
    let t = (this.a = (this.a + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
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
