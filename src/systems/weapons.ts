import { weaponIndex } from '../content/weapons.ts'
import { TRACER_STRETCH_SPEED, spawnMuzzle } from '../effects/fx.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import type { InputManager } from '../input/input.ts'
import type { World } from '../game/world.ts'

/**
 * Player firing. Effective stats = weapon base * perk modifiers. Ammo depletes
 * per shot; an empty finite mag reverts to the pilot's infinite base weapon.
 * Berserker scales fire rate by missing HP. Crit/explosion/chain resolve at
 * hit time.
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

  const m = world.mods
  let fireRate = world.weapon.fireRate * m.fireRateMul
  if (m.berserker > 0) {
    const missing = 1 - world.player.hp / world.player.maxHp
    fireRate *= 1 + missing * 0.8
  }
  const interval = 1 / fireRate
  let guard = 0
  while (world.fireCooldown <= 0 && guard++ < 14) {
    world.fireCooldown += interval
    fire(world, ax, ay)
    if (world.ammo > 0) {
      world.ammo--
      const pl = world.player
      if (world.ammo <= 0) {
        world.feel.emit(FeelKind.WeaponEmpty, 0, pl.x, pl.y, 0, weaponIndex(world.weapon.id))
        world.equipWeapon(world.baseWeaponId)
      } else {
        const low = world.weapon.ammo * 0.2
        if (world.ammo < low && world.ammo + 1 >= low) world.feel.emit(FeelKind.LowAmmo, 0, pl.x, pl.y, world.ammo)
      }
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
  const speed = w.projectileSpeed * m.projectileSpeedMul
  const life = w.projectileLife * m.projectileLifeMul
  const scale = w.projectileRadius / 4
  const scaleX = w.tracer ? scale * (1 + speed / TRACER_STRETCH_SPEED) : scale

  // Explosion: from the weapon, or granted by the Explosive Rounds perk. Both
  // scale with the damage perks.
  const explodeRadius = w.explodeRadius ?? (m.explosiveRounds > 0 ? 60 : 0)
  const explodeDamage =
    w.explodeDamage !== undefined ? w.explodeDamage * m.damageMul : m.explosiveRounds > 0 ? damage * 0.5 * m.explosiveRounds : 0

  const rng = world.rngs.combat
  for (let i = 0; i < count; i++) {
    const ang = baseAng + rng.range(-spread, spread)
    const p = world.projectiles.acquire()
    p.x = p.prevX = mx
    p.y = p.prevY = my
    p.vx = Math.cos(ang) * speed
    p.vy = Math.sin(ang) * speed
    p.facing = ang
    p.damage = damage
    p.radius = w.projectileRadius
    p.knockback = knockback
    p.pierce = pierce
    p.life = life
    p.bounces = m.bounces
    p.explodeRadius = explodeRadius
    p.explodeDamage = explodeDamage
    p.chain = w.chain ?? 0
    p.chainRange = w.chainRange ?? 0
    p.hitN = 0
    const s = p.sprite
    s.visible = true
    s.alpha = 1
    s.tint = w.tint
    s.scale.set(scaleX, scale)
  }

  spawnMuzzle(world, mx, my, baseAng)
  world.feel.emit(FeelKind.Shot, 0, mx, my, baseAng, weaponIndex(w.id))
}
