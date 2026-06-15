import type { Sprite } from 'pixi.js'
import type { EnemyDef } from '../content/enemies.ts'
import { ENEMIES } from '../content/enemies.ts'
import type { Poolable } from '../core/pool.ts'

/**
 * A hive creature. Pure data + a persistent Sprite (texture swapped per type on
 * spawn). `def` points at the registry entry the AI/render/death code reads, so
 * one pool serves every enemy type. Systems mutate the live fields.
 */
export class Enemy implements Poolable {
  alive = false

  /** Registry definition for this enemy's type (set on spawn). */
  def: EnemyDef = ENEMIES.swarmer!

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
  damage = 22

  /** Ranged cooldown / brood cooldown (seconds until next shot/spawn). */
  fireTimer = 0
  /** Generic behavior timer (burrow phase, teleport cooldown). */
  stateTimer = 0
  /** Hit-flash timer (seconds remaining). */
  flash = 0
  /** Aura buff remaining (seconds); set by nearby hive minds. */
  buffed = 0
  /** Cryo slow remaining (seconds) + its strength (0..1). */
  slow = 0
  slowFactor = 0
  /** Burrower is underground: invulnerable + no contact damage. */
  submerged = false
  /** Boss enrage phase active. */
  enraged = false
  /** Per-enemy phase offset so the swarm doesn't wobble in lockstep. */
  animPhase = 0

  constructor(readonly sprite: Sprite) {}
}
