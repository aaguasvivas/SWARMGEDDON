import type { Sprite } from 'pixi.js'
import type { Poolable } from '../core/pool.ts'

/** A fired bullet. Travels in a straight line; dies on lifetime, leaving the
 *  arena, or its last pierce. */
export class Projectile implements Poolable {
  alive = false

  x = 0
  y = 0
  prevX = 0
  prevY = 0
  vx = 0
  vy = 0

  facing = 0
  damage = 0
  radius = 4
  knockback = 0
  /** Remaining enemies it can pass through (0 = stops on first hit). */
  pierce = 0
  /** Seconds of life remaining. */
  life = 0

  constructor(readonly sprite: Sprite) {}
}
