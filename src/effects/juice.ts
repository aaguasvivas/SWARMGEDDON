import { HITSTOP_MAX } from '../config.ts'

/**
 * Screen shake (trauma model) + hit-stop.
 *
 * Trauma is added by impacts and decays linearly; the actual offset uses
 * trauma² (Squirrel Eiserloh's trick) so small hits barely nudge while big ones
 * really kick. Shake is purely cosmetic, so it uses Math.random and real frame
 * time — it never touches the deterministic sim RNG.
 *
 * Hit-stop freezes the fixed-step sim for a few frames on a big event; the loop
 * checks `hitstop` and skips simulation while it drains.
 */
export class Juice {
  trauma = 0
  hitstop = 0
  offsetX = 0
  offsetY = 0

  constructor(
    private readonly maxOffset: number,
    private readonly decay: number,
  ) {}

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount)
  }

  addHitstop(seconds: number): void {
    // Take the longer of current/new, clamped — overlapping hits don't stack
    // into a long freeze.
    this.hitstop = Math.min(HITSTOP_MAX, Math.max(this.hitstop, seconds))
  }

  /** Advance shake by real frame seconds and recompute the camera offset. */
  updateShake(frameDt: number): void {
    this.trauma = Math.max(0, this.trauma - this.decay * frameDt)
    const s = this.trauma * this.trauma
    this.offsetX = (Math.random() * 2 - 1) * this.maxOffset * s
    this.offsetY = (Math.random() * 2 - 1) * this.maxOffset * s
  }
}
