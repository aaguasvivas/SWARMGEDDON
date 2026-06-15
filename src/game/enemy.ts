import type { Sprite } from 'pixi.js'
import type { Poolable } from '../core/pool.ts'

/**
 * A hive creature. Pure data + a persistent Sprite (created once, reused across
 * pool cycles, toggled via `alive`/visibility). Systems mutate the fields;
 * the render system reads prev/current for interpolation and drives procedural
 * animation. From Phase 2 the stat block is populated from the enemy registry.
 */
export class Enemy implements Poolable {
  alive = false

  x = 0
  y = 0
  prevX = 0
  prevY = 0
  vx = 0
  vy = 0

  facing = 0
  prevFacing = 0

  hp = 1
  maxHp = 1
  radius = 14
  speed = 70
  damage = 22 // contact damage per second
  xp = 1

  /** Hit-flash timer (seconds remaining). */
  flash = 0
  /** Per-enemy phase offset so the swarm doesn't wobble in lockstep. */
  animPhase = 0

  constructor(readonly sprite: Sprite) {}
}
