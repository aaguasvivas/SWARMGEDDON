import { doubleFields } from '../core/fields.ts'
import type { Poolable } from '../core/pool.ts'
import type { Quad } from '../render/quads.ts'
import type { EvoBehavior } from '../content/weapons.ts'

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
  /** Enemy (spitter) projectile drops an acid pool where it lands. */
  leavesAcid = false
  /** Ricochet seek bounces remaining. */
  bounces = 0
  /** Seconds since it was fired. */
  age = 0
  /** Behavior of the evolved weapon that fired it, or '' (A4.2). */
  evo: EvoBehavior | '' = ''
  /** AoE on impact (rocket / explosive rounds); 0 = none. */
  explodeRadius = 0
  explodeDamage = 0
  /** Chain lightning: extra targets + jump range. */
  chain = 0
  chainRange = 0
  /** Uids of enemies this bullet already hit (ring of the last 8), so a
   *  piercing bullet damages each enemy once. */
  readonly hitUids = new Int32Array(8)
  hitN = 0
  /** EnemyDef.idx of the enemy that fired this shot (-1 for the player's own). */
  ownerIdx = -1
  /** FIREBLAST shot: its kills (and the blasts they set off) drop no bonus. */
  noBonus = false

  constructor(readonly quad: Quad) {
    doubleFields(this)
  }
}
