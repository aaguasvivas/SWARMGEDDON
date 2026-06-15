import type { World } from '../game/world.ts'
import { spawnAcidPool } from './acid.ts'

/** Integrate player projectile motion and cull on lifetime / leaving the arena. */
export function projectileSystem(world: World, dt: number): void {
  const a = world.projectiles.active
  const b = world.arena.bounds
  const pad = 24
  const minX = b.x - pad
  const maxX = b.x + b.w + pad
  const minY = b.y - pad
  const maxY = b.y + b.h + pad

  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    p.prevX = p.x
    p.prevY = p.y
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt
    if (p.life <= 0 || p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
      p.alive = false
    }
  }
}

/** Integrate enemy (spitter) projectiles; on expiry they leave an acid pool. */
export function enemyProjectileSystem(world: World, dt: number): void {
  const a = world.enemyProjectiles.active
  const b = world.arena.bounds
  const pad = 20

  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    p.prevX = p.x
    p.prevY = p.y
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.life -= dt
    const out = p.x < b.x - pad || p.x > b.x + b.w + pad || p.y < b.y - pad || p.y > b.y + b.h + pad
    if (p.life <= 0 || out) {
      if (p.leavesAcid && !out) spawnAcidPool(world, p.x, p.y)
      p.alive = false
    }
  }
}
