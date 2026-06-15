import type { World } from '../game/world.ts'

/** Separation strength relative to the seek-the-player drive. */
const SEPARATION = 0.9

/** Rebuild the enemy spatial hash from current positions. Call once per tick
 *  before AI/collision query it. */
export function buildEnemyHash(world: World): void {
  world.hash.clear()
  const a = world.enemies.active
  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    world.hash.insert(e, e.x, e.y)
  }
}

/**
 * Boids-lite steering: every enemy seeks the player and pushes off overlapping
 * neighbors (via the spatial hash) so a horde flows around obstacles and the
 * player instead of stacking into one pixel. Snapshots prev-state for render
 * interpolation, then integrates movement.
 */
export function aiSystem(world: World, dt: number): void {
  const a = world.enemies.active
  const px = world.player.x
  const py = world.player.y
  const buf = world.queryBuf

  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    e.prevX = e.x
    e.prevY = e.y
    e.prevFacing = e.facing
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt)

    // Seek the player.
    const dx = px - e.x
    const dy = py - e.y
    const d = Math.hypot(dx, dy) || 1
    let mx = dx / d
    let my = dy / d

    // Separation from overlapping neighbors.
    const n = world.hash.query(e.x, e.y, e.radius * 2.4, buf)
    for (let j = 0; j < n; j++) {
      const o = buf[j]!
      if (o === e) continue
      const ox = e.x - o.x
      const oy = e.y - o.y
      const dd = ox * ox + oy * oy
      const minD = e.radius + o.radius
      if (dd > 1e-4 && dd < minD * minD) {
        const inv = 1 / Math.sqrt(dd)
        mx += ox * inv * SEPARATION
        my += oy * inv * SEPARATION
      }
    }

    const ml = Math.hypot(mx, my) || 1
    mx /= ml
    my /= ml
    e.vx = mx * e.speed
    e.vy = my * e.speed
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.facing = Math.atan2(e.vy, e.vx)
  }
}
