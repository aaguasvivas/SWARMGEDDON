import { spawnMuzzle } from '../effects/fx.ts'
import { DEFAULT_WEAPON_ID } from '../content/weapons.ts'
import type { InputManager } from '../input/input.ts'
import type { World } from '../game/world.ts'

/**
 * Player firing. Effective stats = weapon base * perk modifiers. Ammo depletes
 * per shot (not per pellet); when a finite magazine empties, we revert to the
 * infinite default Sidearm. Crit is rolled at hit time, not here.
 */
export function weaponSystem(world: World, dt: number, input: InputManager): void {
  world.fireCooldown -= dt

  if (!input.firing) {
    if (world.fireCooldown < 0) world.fireCooldown = 0
    return
  }
  const ax = input.aimDir.x
  const ay = input.aimDir.y
  if (ax === 0 && ay === 0) return

  const fireRate = world.weapon.fireRate * world.mods.fireRateMul
  const interval = 1 / fireRate
  let guard = 0
  while (world.fireCooldown <= 0 && guard++ < 12) {
    world.fireCooldown += interval
    fire(world, ax, ay)
    if (world.ammo > 0) {
      world.ammo--
      if (world.ammo <= 0) world.equipWeapon(DEFAULT_WEAPON_ID)
    }
  }
}

function fire(world: World, ax: number, ay: number): void {
  const w = world.weapon
  const m = world.mods
  const pl = world.player
  const baseAng = Math.atan2(ay, ax)
  const mx = pl.x + Math.cos(baseAng) * (pl.radius + 8)
  const my = pl.y + Math.sin(baseAng) * (pl.radius + 8)

  const count = w.projectilesPerShot + m.extraProjectiles
  const spread = w.spread * m.spreadMul
  const damage = w.damage * m.damageMul
  const pierce = w.pierce + m.extraPierce
  const knockback = w.knockback * m.knockbackMul
  const scale = w.projectileRadius / 4

  for (let i = 0; i < count; i++) {
    const ang = baseAng + world.rng.range(-spread, spread)
    const p = world.projectiles.acquire()
    p.x = p.prevX = mx
    p.y = p.prevY = my
    p.vx = Math.cos(ang) * w.projectileSpeed
    p.vy = Math.sin(ang) * w.projectileSpeed
    p.facing = ang
    p.damage = damage
    p.radius = w.projectileRadius
    p.knockback = knockback
    p.pierce = pierce
    p.life = w.projectileLife
    const s = p.sprite
    s.visible = true
    s.alpha = 1
    s.tint = w.tint
    s.scale.set(scale)
  }

  spawnMuzzle(world, mx, my, baseAng)
  world.juice.addTrauma(w.shake)
}
