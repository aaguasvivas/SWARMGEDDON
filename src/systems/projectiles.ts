import type { World } from '../game/world.ts'

/** Integrate projectile motion and cull on lifetime / leaving the arena. */
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
