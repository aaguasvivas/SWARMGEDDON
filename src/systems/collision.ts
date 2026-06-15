import { distSq } from '../core/vec.ts'
import { spawnAcidPool } from './acid.ts'
import { spawnEnemy } from './spawn.ts'
import { dropGem } from './pickups.ts'
import { spawnDamageNumber, spawnGibs, spawnHitSpark, spawnImpact } from '../effects/fx.ts'
import type { Enemy } from '../game/enemy.ts'
import type { Projectile } from '../game/projectile.ts'
import type { World } from '../game/world.ts'

/** Padding for the broad-phase query so a fast bullet can't tunnel past a large
 *  enemy whose center sits just outside the bullet radius. */
const ENEMY_MAX_RADIUS = 24

/**
 * All circle-overlap resolution for the tick:
 *   - player projectile -> enemy: crit roll, beetle frontal armor, damage,
 *     knockback, hit FX, pierce/expire,
 *   - enemy contact -> continuous player damage,
 *   - enemy acid projectile -> player: chunk damage + a pool,
 *   - player death -> juice + hit-stop -> deferred restart.
 */
export function collisionSystem(world: World, dt: number): void {
  const buf = world.queryBuf

  // Player projectiles vs enemies.
  const projs = world.projectiles.active
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

  const pl = world.player

  // Enemy contact -> continuous player damage.
  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    const rr = e.radius + pl.radius
    if (distSq(e.x, e.y, pl.x, pl.y) < rr * rr) {
      pl.hp -= e.damage * dt
      world.hurtFlash = Math.min(0.7, world.hurtFlash + e.damage * dt * 0.05)
      world.juice.addTrauma(0.02)
    }
  }

  // Enemy acid projectiles -> player.
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    if (!p.alive) continue
    const rr = p.radius + pl.radius
    if (distSq(p.x, p.y, pl.x, pl.y) < rr * rr) {
      pl.hp -= p.damage
      world.hurtFlash = Math.min(0.85, world.hurtFlash + 0.3)
      world.juice.addTrauma(0.08)
      spawnAcidPool(world, p.x, p.y)
      p.alive = false
    }
  }

  if (pl.hp <= 0 && !world.pendingRestart) {
    pl.hp = 0
    world.hurtFlash = 1
    world.juice.addTrauma(1)
    world.juice.addHitstop(0.14)
    world.pendingRestart = true
  }
}

function applyHit(world: World, e: Enemy, p: Projectile): void {
  const m = world.mods
  let dmg = p.damage
  const crit = m.critChance > 0 && world.rng.float() < m.critChance
  if (crit) dmg *= m.critMul

  // Beetle-style frontal armor: a bullet travelling roughly opposite the enemy's
  // facing is hitting its armored front.
  if (e.def.frontArmor) {
    const sp = Math.hypot(p.vx, p.vy) || 1
    const dot = (p.vx / sp) * Math.cos(e.facing) + (p.vy / sp) * Math.sin(e.facing)
    if (dot < -0.25) dmg *= 1 - e.def.frontArmor
  }

  e.hp -= dmg
  e.flash = 0.07

  // Knockback: position nudge along bullet travel.
  const sp = Math.hypot(p.vx, p.vy) || 1
  const k = (p.knockback * 0.02) / (e.radius / 14) // heavier enemies shrug it off
  e.x += (p.vx / sp) * k
  e.y += (p.vy / sp) * k

  spawnHitSpark(world, p.x, p.y, p.vx, p.vy)
  spawnDamageNumber(world, e.x, e.y, dmg, crit)

  if (e.hp <= 0) killEnemy(world, e)
}

function killEnemy(world: World, e: Enemy): void {
  e.alive = false
  world.kills++

  // SIGNATURE: stamp the floor with ichor, colored toward the enemy's gore.
  world.ichor.queueStamp(e.x, e.y, world.rng)
  spawnGibs(world, e.x, e.y, e.def.gibCount, e.def.gibColor)
  world.juice.addTrauma(0.05)

  if (world.mods.lifestealPerKill > 0) {
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + world.mods.lifestealPerKill)
  }

  dropGem(world, e.x, e.y, e.def.xp)

  // Splitters burst into offspring.
  if (e.def.behavior === 'splitter' && e.def.splitInto) {
    const count = e.def.splitCount ?? 2
    for (let i = 0; i < count; i++) {
      const a = world.rng.angle()
      spawnEnemy(world, e.def.splitInto, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14)
    }
  }
}
