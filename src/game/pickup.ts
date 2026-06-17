import type { Sprite } from 'pixi.js'
import type { Poolable } from '../core/pool.ts'

export type PickupKind = 'xp' | 'weapon' | 'health'

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

  constructor(readonly sprite: Sprite) {}
}
