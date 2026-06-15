import type { Sprite } from 'pixi.js'
import type { Poolable } from '../core/pool.ts'

/** Gibs, sparks, muzzle flashes — short-lived visual confetti. Fades by
 *  life/maxLife; `drag` bleeds velocity; `grow` scales size over life. */
export class Particle implements Poolable {
  alive = false

  x = 0
  y = 0
  prevX = 0
  prevY = 0
  vx = 0
  vy = 0

  life = 0
  maxLife = 1
  size = 1
  /** Size delta per second (negative shrinks). */
  grow = 0
  rotation = 0
  spin = 0
  /** Per-second velocity damping factor (0 = none, higher = faster stop). */
  drag = 0
  tint = 0xffffff
  /** 'normal' for chunky gibs, 'add' for glowing sparks. */
  additive = false

  constructor(readonly sprite: Sprite) {}
}
