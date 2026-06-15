import { spawnDamageNumber, spawnGibs, spawnHitSpark, spawnImpact } from '../effects/fx.ts'
import { distSq } from '../core/vec.ts'
import type { Enemy } from '../game/enemy.ts'
import type { Projectile } from '../game/projectile.ts'
import type { World } from '../game/world.ts'

/** Conservative upper bound on enemy radius, padding the broad-phase query so a
 *  fast bullet can't tunnel past a large enemy whose center is just outside the
 *  bullet's own radius. */
const ENEMY_MAX_RADIUS = 22

/**
 * All circle-overlap resolution for the tick:
 *   - projectile -> enemy: damage, knockback, hit FX, pierce/expire (broad-phase
 *     via the spatial hash, precise via squared distance),
 *   - enemy -> player: continuous contact damage,
 *   - player death: big juice + a hit-stop freeze, then a deferred restart.
 */
export function collisionSystem(world: World, dt: number): void {
  const projs = world.projectiles.active
  const buf = world.queryBuf

  for (let i = 0; i < projs.length; i++) {
    const p = projs[i]!
    if (!p.alive) continue
    const n = world.hash.query(p.x, p.y, p.radius + ENEMY_MAX_RADIUS, buf)
    for (let j = 0; j < n; j++) {
      const e = buf[j]!
      if (!e.alive) continue
      const rr = p.radius + e.radius
      if (distSq(p.x, p.y, e.x, e.y) < rr * rr) {
        applyHit(world, e, p)
        spawnImpact(world, p.x, p.y)
        if (p.pierce > 0) {
          p.pierce--
        } else {
          p.alive = false
          break
        }
      }
    }
  }

  // Enemy contact -> continuous player damage.
  const enemies = world.enemies.active
  const pl = world.player
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    const rr = e.radius + pl.radius
    if (distSq(e.x, e.y, pl.x, pl.y) < rr * rr) {
      pl.hp -= e.damage * dt
      world.hurtFlash = Math.min(0.7, world.hurtFlash + e.damage * dt * 0.05)
      world.juice.addTrauma(0.02)
    }
  }

  if (pl.hp <= 0 && !world.pendingRestart) {
    pl.hp = 0
    world.hurtFlash = 1
    world.juice.addTrauma(1)
    world.juice.addHitstop(0.14) // freeze-frame the death...
    world.pendingRestart = true // ...then the loop restarts once it drains.
  }
}

function applyHit(world: World, e: Enemy, p: Projectile): void {
  e.hp -= p.damage
  e.flash = 0.07

  // Knockback: a small position nudge along the bullet's travel direction.
  const sp = Math.hypot(p.vx, p.vy) || 1
  const k = p.knockback * 0.02
  e.x += (p.vx / sp) * k
  e.y += (p.vy / sp) * k

  spawnHitSpark(world, p.x, p.y, p.vx, p.vy)
  spawnDamageNumber(world, e.x, e.y, p.damage)

  if (e.hp <= 0) killEnemy(world, e)
}

function killEnemy(world: World, e: Enemy): void {
  e.alive = false
  world.kills++
  // SIGNATURE: stamp the floor with ichor at the kill site.
  world.ichor.queueStamp(e.x, e.y, world.rng)
  spawnGibs(world, e.x, e.y, world.rng.bool(0.5) ? 6 : 5)
  world.juice.addTrauma(0.05)
}
