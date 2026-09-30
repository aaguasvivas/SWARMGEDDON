import { BERSERK_MEDKIT } from '../config.ts'
import { weaponIndex } from '../content/weapons.ts'
import { TRACER_STRETCH_SPEED, spawnMuzzle } from '../effects/fx.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import type { InputManager } from '../input/input.ts'
import { tickDown } from '../game/player.ts'
import type { World } from '../game/world.ts'

const TAU = Math.PI * 2
/** An emptied magazine may keep a float remainder this small. */
const AMMO_EPS = 1e-6

/**
 * Player firing. Effective stats = weapon base * perk modifiers. Ammo is
 * time based: a trigger pull costs weapon.fireRate / effective fire rate, so a
 * magazine lasts ammo / fireRate seconds whatever the fire-rate perks. An
 * empty magazine reverts to the base weapon. Berserker scales fire rate by
 * missing HP and bursts after a medkit; Adrenal Wake speeds it up after a
 * dash. Crit, explosion and chain resolve at hit time.
 */
export function weaponSystem(world: World, dt: number, input: InputManager): void {
  world.fireCooldown -= dt
  world.adrenalT = tickDown(world.adrenalT, dt)
  world.berserkT = tickDown(world.berserkT, dt)

  if (!input.firing) {
    if (world.fireCooldown < 0) world.fireCooldown = 0
    return
  }
  const ax = input.aimDir.x
  const ay = input.aimDir.y
  if (ax === 0 && ay === 0) return

  const m = world.mods
  let fireRate = world.weapon.fireRate * m.fireRateMul
  if (m.berserker > 0) fireRate *= 1 + (1 - world.player.hp / world.player.maxHp) * m.berserker
  if (world.berserkT > 0) fireRate *= 1 + BERSERK_MEDKIT.fireRate
  if (world.adrenalT > 0) fireRate *= 1 + m.adrenalWake
  const interval = 1 / fireRate
  const cost = world.weapon.fireRate * interval
  let guard = 0
  while (world.fireCooldown <= 0 && guard++ < 14) {
    world.fireCooldown += interval
    fire(world, ax, ay)
    if (world.ammo < 0) continue
    const before = world.ammo
    world.ammo -= cost
    const pl = world.player
    if (world.ammo <= AMMO_EPS) {
      world.feel.emit(FeelKind.WeaponEmpty, 0, pl.x, pl.y, 0, weaponIndex(world.weapon.id))
      world.equipWeapon(world.baseWeaponId)
      break
    }
    const low = world.ammoMax * 0.2
    if (world.ammo < low && before >= low) world.feel.emit(FeelKind.LowAmmo, 0, pl.x, pl.y, world.ammo)
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
  const rng = world.rngs.combat
  for (let i = 0; i < count; i++) launch(world, mx, my, baseAng + rng.range(-spread, spread), 1, 0)

  spawnMuzzle(world, mx, my, baseAng)
  world.feel.emit(FeelKind.Shot, 0, mx, my, baseAng, weaponIndex(w.id))
}

/** A ring of `n` evenly spaced shots of the current weapon around the player,
 *  starting at `ang0`, at `dmgFrac` of its damage (its explosion included)
 *  with `extraPierce` more pierce. No ammo cost and no draws. */
export function fireRing(world: World, n: number, dmgFrac: number, extraPierce: number, ang0: number): void {
  const w = world.weapon
  const pl = world.player
  const off = pl.radius + 8
  for (let i = 0; i < n; i++) {
    const a = ang0 + (i / n) * TAU
    launch(world, pl.x + Math.cos(a) * off, pl.y + Math.sin(a) * off, a, dmgFrac, extraPierce)
  }
  world.feel.emit(FeelKind.Shot, 0, pl.x, pl.y, ang0, weaponIndex(w.id))
}

/** One bullet of the current weapon with the build's modifiers. `dmgMul`
 *  scales both its hit and the weapon's own explosion. */
function launch(world: World, x: number, y: number, ang: number, dmgMul: number, extraPierce: number): void {
  const w = world.weapon
  const m = world.mods
  const damage = w.damage * m.damageMul * dmgMul
  const speed = w.projectileSpeed * m.projectileSpeedMul
  const scale = w.projectileRadius / 4
  const p = world.projectiles.acquire()
  p.x = p.prevX = x
  p.y = p.prevY = y
  p.vx = Math.cos(ang) * speed
  p.vy = Math.sin(ang) * speed
  p.facing = ang
  p.damage = damage
  p.radius = w.projectileRadius
  p.knockback = w.knockback * m.knockbackMul
  p.pierce = w.pierce + m.extraPierce + extraPierce
  p.life = w.projectileLife * m.projectileLifeMul
  p.age = 0
  p.bounces = m.seekBounces
  p.evo = w.evo ?? ''
  // Explosion: from the weapon, or granted by Explosive Rounds. Both scale
  // with the damage perks.
  p.explodeRadius = w.explodeRadius ?? m.explodeRadius
  p.explodeDamage = w.explodeDamage !== undefined ? w.explodeDamage * m.damageMul * dmgMul : damage * m.explodeFrac
  // Arc Rounds on a chain weapon adds hops instead of its proc.
  p.chain = w.chain ? w.chain + (m.arcHops > 0 ? m.arcHops - 1 : 0) : 0
  p.chainRange = w.chainRange ?? 0
  p.hitN = 0
  const s = p.sprite
  s.visible = true
  s.alpha = 1
  s.tint = w.id === world.character.startWeapon ? world.baseBulletTint : w.tint
  s.scale.set(w.tracer ? scale * (1 + speed / TRACER_STRETCH_SPEED) : scale, scale)
}
