import { doubleFields } from '../core/fields.ts'
import type { Poolable } from '../core/pool.ts'
import type { Quad } from '../render/quads.ts'

export type PickupKind = 'xp' | 'bank' | 'weapon' | 'health' | 'shard' | 'core' | 'bonus'

/** Pool reservation slot per kind, in PICKUP_RESERVE order (xp, bank, health,
 *  weapon, core, bonus). Shards and Hive Cores share the core slots. */
export const PICKUP_SLOT: Readonly<Record<PickupKind, number>> = { xp: 0, bank: 1, health: 2, weapon: 3, shard: 4, core: 4, bonus: 5 }
export const PICKUP_SLOTS = 6

/**
 * Field pickup: an XP crystal or medkit (magnetized), a weapon pod (hold to
 * take), or a core shard, Hive Core or bonus (contact only). One pool serves
 * all of them; the quad's frame and tint are set per kind on spawn.
 */
export class Pickup implements Poolable {
  alive = false

  x = 0
  y = 0
  prevX = 0
  prevY = 0
  vx = 0
  vy = 0

  kind: PickupKind = 'xp'
  xp = 0
  heal = 0
  weaponId = ''
  radius = 8
  /** Seconds until it despawns if uncollected. */
  life = 0
  /** Spin/bob phase for idle animation. */
  phase = 0
  /** Gems and medkits: once inside the capture radius they home in for good. */
  captured = false
  /** Seconds since capture (the homing speed ramps over XP.homeRamp). */
  homeT = 0
  /** Pods: hold-to-take fill, 0 to 1. */
  hold = 0
  /** Pods: spawned by the pod timer (one timer pod at a time). */
  timer = false
  /** Bonuses: the BONUSES index. Hive Cores: the CORES.table row (0 mid1, 1 mid2, 2 overtime). */
  sub = 0

  constructor(readonly quad: Quad) {
    doubleFields(this)
  }
}
