import type { Sprite } from 'pixi.js'
import { doubleFields } from '../core/fields.ts'
import type { Poolable } from '../core/pool.ts'

export type PickupKind = 'xp' | 'bank' | 'weapon' | 'health'

/** Pool reservation slot per kind, in PICKUP_RESERVE order (xp, bank, health,
 *  weapon, core, bonus). Core and bonus slots belong to later kinds. */
export const PICKUP_SLOT: Readonly<Record<PickupKind, number>> = { xp: 0, bank: 1, health: 2, weapon: 3 }
export const PICKUP_SLOTS = 6

/**
 * Field pickup: an XP crystal (auto-magnetized, grants XP) or a weapon pod
 * (grants a weapon with ammo). One pool serves both; the sprite/tint are set
 * per kind on spawn. Magnetism pulls it toward the player once in range.
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

  constructor(readonly sprite: Sprite) {
    doubleFields(this)
  }
}
