import { spawnMuzzle } from '../effects/fx.ts'
import type { InputManager } from '../input/input.ts'
import type { World } from '../game/world.ts'

/**
 * Firing. While the trigger is held and aimed, drains a cooldown at the weapon's
 * fire rate, spawning pooled projectiles per shot (with spread). Carrying the
 * cooldown remainder across frames keeps the rate frame-rate independent. A
 * guard caps catch-up so a hitch can't dump a magazine in one tick.
 */
export function weaponSystem(world: World, dt: number, input: InputManager): void {
  world.fireCooldown -= dt

  if (!input.firing) {
    if (world.fireCooldown < 0) world.fireCooldown = 0 // don't bank shots while idle
    return
  }
  const ax = input.aimDir.x
  const ay = input.aimDir.y
  if (ax === 0 && ay === 0) return // held trigger but no aim yet

  const interval = 1 / world.weapon.fireRate
  let guard = 0
  while (world.fireCooldown <= 0 && guard++ < 8) {
    world.fireCooldown += interval
    fire(world, ax, ay)
  }
}

function fire(world: World, ax: number, ay: number): void {
  const w = world.weapon
  const pl = world.player
  const baseAng = Math.atan2(ay, ax)
  const mx = pl.x + Math.cos(baseAng) * (pl.radius + 8)
  const my = pl.y + Math.sin(baseAng) * (pl.radius + 8)

  for (let i = 0; i < w.projectilesPerShot; i++) {
    const ang = baseAng + world.rng.range(-w.spread, w.spread)
    const p = world.projectiles.acquire()
    p.x = p.prevX = mx
    p.y = p.prevY = my
    p.vx = Math.cos(ang) * w.projectileSpeed
    p.vy = Math.sin(ang) * w.projectileSpeed
    p.facing = ang
    p.damage = w.damage
    p.radius = w.projectileRadius
    p.knockback = w.knockback
    p.pierce = w.pierce
    p.life = w.projectileLife
    const s = p.sprite
    s.visible = true
    s.alpha = 1
    s.tint = w.tint
  }

  spawnMuzzle(world, mx, my, baseAng)
  world.juice.addTrauma(0.035)
}
