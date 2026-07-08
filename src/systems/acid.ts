import { MAX_ACID } from '../config.ts'
import { distSq } from '../core/vec.ts'
import { spawnAcidSplash } from '../effects/fx.ts'
import type { World } from '../game/world.ts'

/** Drop a lingering acid pool (spitter projectile landed). Also stamps the
 *  ichor terrain so the hazard reads as part of the floor. */
export function spawnAcidPool(world: World, x: number, y: number): void {
  if (world.acid.size >= MAX_ACID) return
  const rng = world.rng
  const ap = world.acid.acquire()
  ap.x = x
  ap.y = y
  ap.radius = rng.range(24, 34)
  ap.damage = 16
  ap.life = ap.maxLife = rng.range(3.5, 5)

  world.ichor.queueStamp(x, y, rng)
  spawnAcidSplash(world, x, y)

  const s = ap.sprite
  s.visible = true
  s.tint = world.arenaTheme.hazardTint // acid green / magma orange per world
  s.x = x
  s.y = y
  s.scale.set(ap.radius / 14)
  s.alpha = 0.5
}

/** Tick acid pools (fade by lifetime) and apply damage to a standing player. */
export function acidSystem(world: World, dt: number): void {
  const a = world.acid.active
  const pl = world.player
  for (let i = 0; i < a.length; i++) {
    const ap = a[i]!
    ap.life -= dt
    if (ap.life <= 0) {
      ap.alive = false
      continue
    }
    const rr = ap.radius + pl.radius * 0.4
    if (distSq(ap.x, ap.y, pl.x, pl.y) < rr * rr) {
      pl.hp -= ap.damage * dt
      world.hurtFlash = Math.min(0.6, world.hurtFlash + ap.damage * dt * 0.04)
    }
  }
}
