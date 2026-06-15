import { COLORS, MAX_ENEMY_PROJECTILES } from '../config.ts'
import type { Enemy } from '../game/enemy.ts'
import type { World } from '../game/world.ts'

/** Separation strength relative to the seek drive. */
const SEPARATION = 0.9

/** Rebuild the enemy spatial hash from current positions. */
export function buildEnemyHash(world: World): void {
  world.hash.clear()
  const a = world.enemies.active
  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    world.hash.insert(e, e.x, e.y)
  }
}

/**
 * Per-behavior steering:
 *   - chaser/splitter: seek the player + separate from neighbors,
 *   - flyer: pure seek, no separation (dives through the swarm),
 *   - spitter: keep `preferRange`, strafe in the band, separate, and lob acid.
 * Snapshots prev-state for interpolation, then integrates.
 */
export function aiSystem(world: World, dt: number): void {
  const a = world.enemies.active
  const px = world.player.x
  const py = world.player.y
  const buf = world.queryBuf

  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    const def = e.def
    e.prevX = e.x
    e.prevY = e.y
    e.prevFacing = e.facing
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt)

    const dx = px - e.x
    const dy = py - e.y
    const d = Math.hypot(dx, dy) || 1
    const ux = dx / d
    const uy = dy / d

    let mx: number
    let my: number
    let faceTarget = true // face the player unless overridden to face movement

    if (def.behavior === 'spitter') {
      const range = def.preferRange ?? 260
      if (d > range * 1.12) {
        mx = ux
        my = uy
      } else if (d < range * 0.82) {
        mx = -ux
        my = -uy
      } else {
        mx = -uy // strafe perpendicular
        my = ux
      }
      e.fireTimer -= dt
      if (e.fireTimer <= 0) {
        e.fireTimer = def.fireCooldown ?? 2
        fireEnemyShot(world, e, ux, uy)
      }
    } else {
      mx = ux
      my = uy
      faceTarget = false
    }

    // Separation (everything except the diving flyer).
    if (def.behavior !== 'flyer') {
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
    }

    const ml = Math.hypot(mx, my) || 1
    e.vx = (mx / ml) * e.speed
    e.vy = (my / ml) * e.speed
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.facing = faceTarget ? Math.atan2(uy, ux) : Math.atan2(e.vy, e.vx)
  }
}

/** Spitter lobs an acid glob toward the player; it leaves a pool where it lands. */
function fireEnemyShot(world: World, e: Enemy, ux: number, uy: number): void {
  if (world.enemyProjectiles.size >= MAX_ENEMY_PROJECTILES) return
  const def = e.def
  const speed = def.projectileSpeed ?? 300
  const p = world.enemyProjectiles.acquire()
  p.x = p.prevX = e.x + ux * (e.radius + 4)
  p.y = p.prevY = e.y + uy * (e.radius + 4)
  p.vx = ux * speed
  p.vy = uy * speed
  p.facing = Math.atan2(uy, ux)
  p.damage = def.projectileDamage ?? 12
  p.radius = 7
  p.life = 3.5
  p.pierce = 0
  p.leavesAcid = true

  const s = p.sprite
  s.visible = true
  s.alpha = 1
  s.tint = COLORS.acid
  s.scale.set(1)
}
