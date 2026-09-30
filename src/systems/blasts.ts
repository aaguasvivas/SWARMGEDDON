import { BLAST_CAP, BLAST_CRIT, BLAST_KNOCK, BLAST_KNOCK_PX } from '../config.ts'
import { spawnExplosion, spawnRing } from '../effects/fx.ts'
import { FF_AOE, FF_CRIT, FeelKind } from '../effects/feelQueue.ts'
import type { World } from '../game/world.ts'
import { blastHit } from './collision.ts'

const STRIDE = 6

/**
 * Queued area blasts (A3): SHATTER, HEADHUNTER, Shock Step, the PLAGUE BARRAGE
 * bomblets and the STORM LASH last hop. A preallocated ring of
 * x, y, r, dmg, readyAt, flags (BLAST_*); a full queue drops new blasts.
 */
export class BlastQueue {
  readonly buf = new Float32Array(BLAST_CAP * STRIDE)
  n = 0

  reset(): void {
    this.n = 0
  }
}

/** Queue a blast that detonates `delay` seconds from now (0 = this tick's drain). */
export function queueBlast(w: World, x: number, y: number, r: number, dmg: number, delay: number, flags: number): void {
  const q = w.blasts
  if (q.n >= BLAST_CAP) return
  const b = q.buf
  const o = q.n++ * STRIDE
  b[o] = x
  b[o + 1] = y
  b[o + 2] = r
  b[o + 3] = dmg
  b[o + 4] = w.time + delay
  b[o + 5] = flags
}

/** The last step of collisionSystem: detonate every due blast. Blasts queued
 *  by these detonations wait for the next tick. */
export function drainBlasts(w: World): void {
  const q = w.blasts
  const b = q.buf
  const n0 = q.n
  // readyAt is float32: the slack keeps a same-tick blast from slipping a tick.
  const now = w.time + 1e-3
  let wr = 0
  for (let i = 0; i < n0; i++) {
    const o = i * STRIDE
    if (b[o + 4]! > now) {
      if (wr !== i) b.copyWithin(wr * STRIDE, o, o + STRIDE)
      wr++
      continue
    }
    detonate(w, b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!, b[o + 5]!)
  }
  for (let i = n0; i < q.n; i++) {
    if (wr !== i) b.copyWithin(wr * STRIDE, i * STRIDE, i * STRIDE + STRIDE)
    wr++
  }
  q.n = wr
}

function detonate(w: World, x: number, y: number, r: number, dmg: number, flags: number): void {
  spawnExplosion(w, x, y, r)
  spawnRing(w, x, y, 0xffd27a, r / 22)
  w.feel.emit(FeelKind.Explosion, FF_AOE | (flags & BLAST_CRIT ? FF_CRIT : 0), x, y, r)
  w.lastHitVx = 0
  w.lastHitVy = 0
  const knock = (flags & BLAST_KNOCK) !== 0
  const buf = w.queryBuf
  const n = w.hash.query(x, y, r, buf)
  const r2 = r * r
  for (let k = 0; k < n; k++) {
    const e = buf[k]!
    if (!e.alive || e.submerged) continue
    const dx = e.x - x
    const dy = e.y - y
    const d2 = dx * dx + dy * dy
    if (d2 >= r2) continue
    blastHit(w, e, dmg)
    if (knock && e.alive && !e.def.elite && !e.def.boss) {
      const d = Math.sqrt(d2)
      if (d > 1e-6) {
        e.x += (dx / d) * BLAST_KNOCK_PX
        e.y += (dy / d) * BLAST_KNOCK_PX
      } else {
        e.x += BLAST_KNOCK_PX
      }
    }
  }
}
