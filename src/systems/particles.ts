import type { World } from '../game/world.ts'

/** Integrate particles (gibs/sparks) and floating damage numbers; expire them
 *  by lifetime. Snapshots prev-position for render interpolation. */
export function particleSystem(world: World, dt: number): void {
  const parts = world.particles.active
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    p.prevX = p.x
    p.prevY = p.y
    if (p.drag > 0) {
      const f = 1 - p.drag * dt
      const damp = f > 0 ? f : 0
      p.vx *= damp
      p.vy *= damp
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.rotation += p.spin * dt
    p.size += p.grow * dt
    p.life -= dt
    if (p.life <= 0 || p.size <= 0.02) p.alive = false
  }

  const floaters = world.floaters.active
  for (let i = 0; i < floaters.length; i++) {
    const ft = floaters[i]!
    ft.prevY = ft.y
    ft.y += ft.vy * dt
    ft.vy *= 1 - 2.5 * dt // ease the rise
    ft.life -= dt
    if (ft.life <= 0) ft.alive = false
  }
}
