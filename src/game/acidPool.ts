import { doubleFields } from '../core/fields.ts'
import type { Poolable } from '../core/pool.ts'
import type { Quad } from '../render/quads.ts'

/**
 * Lingering acid pool left by spitters: a ground hazard that damages the
 * player while standing in it. Visually it lives on top of the ichor terrain
 * and fades over its lifetime.
 */
export class AcidPool implements Poolable {
  alive = false

  x = 0
  y = 0
  radius = 28
  damage = 16 // dps while the player overlaps
  life = 0
  maxLife = 1

  constructor(readonly quad: Quad) {
    doubleFields(this)
  }
}
