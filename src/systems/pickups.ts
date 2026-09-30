import {
  BASE_MAGNET_RADIUS,
  COLORS,
  GEM_LIFETIME,
  HEALTH_LIFETIME,
  MAX_PICKUPS,
  PICKUP_RESERVE,
  WEAPON_DROP_INTERVAL,
  WEAPON_DROP_LIFETIME,
} from '../config.ts'
import { PICKUP_WEAPON_IDS, WEAPONS, weaponIndex } from '../content/weapons.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import { PICKUP_SLOT, PICKUP_SLOTS, type Pickup, type PickupKind } from '../game/pickup.ts'
import type { World } from '../game/world.ts'

const R = PICKUP_RESERVE
/** Guaranteed slots per PICKUP_SLOT index. */
const RESERVE_BY_SLOT = new Int16Array([R.xp, R.bank, R.health, R.weapon, R.core, R.bonus])
const SHARED_SLOTS = MAX_PICKUPS - (R.xp + R.bank + R.health + R.weapon + R.core + R.bonus)

/**
 * Take a pickup from the pool if `kind` has room: its own reserved slots
 * first, then the shared remainder. So a gem flood can never starve pods or
 * medkits, and the pool never exceeds MAX_PICKUPS.
 */
function acquirePickup(world: World, kind: PickupKind): Pickup | null {
  const n = world.pickupN
  const slot = PICKUP_SLOT[kind]
  if (n[slot]! >= RESERVE_BY_SLOT[slot]!) {
    let sharedUsed = 0
    for (let i = 0; i < PICKUP_SLOTS; i++) {
      const over = n[i]! - RESERVE_BY_SLOT[i]!
      if (over > 0) sharedUsed += over
    }
    if (sharedUsed >= SHARED_SLOTS) return null
  }
  const p = world.pickups.acquire()
  p.kind = kind
  n[slot]!++
  return p
}

/** Drop an XP crystal at a kill site (with a little scatter velocity). */
export function dropGem(world: World, x: number, y: number, xp: number): void {
  const p = acquirePickup(world, 'xp')
  if (!p) return
  const rng = world.rngs.loot
  p.xp = xp
  p.weaponId = ''
  p.x = p.prevX = x + rng.range(-6, 6)
  p.y = p.prevY = y + rng.range(-6, 6)
  const a = rng.angle()
  const sp = rng.range(30, 90)
  p.vx = Math.cos(a) * sp
  p.vy = Math.sin(a) * sp
  p.radius = 7
  p.life = GEM_LIFETIME
  p.phase = world.rngs.fx.angle()

  world.texReg.applySprite(p.sprite, 'gem')
  const s = p.sprite
  s.visible = true
  s.tint = COLORS.gem
  s.alpha = 1
  s.scale.set(1.15)

  if (world.firstGemAt < 0) {
    world.firstGemAt = world.time
    world.firstGemX = p.x
    world.firstGemY = p.y
  }
}

/** Drop a health medkit (perk-free sustain). Magnetizes in like a gem. */
export function dropHealth(world: World, x: number, y: number, heal: number): void {
  const p = acquirePickup(world, 'health')
  if (!p) return
  const rng = world.rngs.loot
  p.heal = heal
  p.xp = 0
  p.weaponId = ''
  p.x = p.prevX = x + rng.range(-6, 6)
  p.y = p.prevY = y + rng.range(-6, 6)
  const a = rng.angle()
  const sp = rng.range(30, 90)
  p.vx = Math.cos(a) * sp
  p.vy = Math.sin(a) * sp
  p.radius = 9
  p.life = HEALTH_LIFETIME
  p.phase = world.rngs.fx.angle()

  world.texReg.applySprite(p.sprite, 'health')
  const s = p.sprite
  s.visible = true
  s.tint = COLORS.health
  s.alpha = 1
  s.scale.set(1)
}

/** Drop a weapon pod (color-coded to the weapon). */
export function spawnWeaponDrop(world: World, x: number, y: number, weaponId: string): void {
  const p = acquirePickup(world, 'weapon')
  if (!p) return
  p.weaponId = weaponId
  p.xp = 0
  p.x = p.prevX = x
  p.y = p.prevY = y
  p.vx = 0
  p.vy = 0
  p.radius = 15
  p.life = WEAPON_DROP_LIFETIME
  p.phase = 0

  world.texReg.applySprite(p.sprite, 'crate')
  const s = p.sprite
  s.visible = true
  s.tint = WEAPONS[weaponId]!.tint
  s.alpha = 1
  s.scale.set(1)
  world.feel.emit(FeelKind.PodSpawn, 0, x, y, 0, weaponIndex(weaponId))
}

/**
 * Periodically drop a weapon pod; magnetize pickups toward the player when in
 * range (scaled by the Magnetic perk); collect on contact. XP gems feed the
 * level-up flow; weapon pods swap the active weapon.
 */
export function pickupSystem(world: World, dt: number): void {
  world.weaponDropTimer -= dt
  if (world.weaponDropTimer <= 0) {
    world.weaponDropTimer = WEAPON_DROP_INTERVAL
    const b = world.arena.bounds
    const rng = world.rngs.loot
    const id = rng.pick(PICKUP_WEAPON_IDS)
    spawnWeaponDrop(world, b.x + rng.range(0.15, 0.85) * b.w, b.y + rng.range(0.15, 0.85) * b.h, id)
  }

  const a = world.pickups.active
  const pl = world.player
  const magnet = BASE_MAGNET_RADIUS * world.mods.magnetMul

  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    p.prevX = p.x
    p.prevY = p.y
    p.life -= dt
    if (p.life <= 0) {
      p.alive = false
      continue
    }

    const dx = pl.x - p.x
    const dy = pl.y - p.y
    const d2 = dx * dx + dy * dy

    const reach = p.kind === 'weapon' ? magnet * 0.7 : magnet
    if (d2 < reach * reach) {
      const d = Math.sqrt(d2) || 1
      const pull = p.kind === 'weapon' ? 320 : 540
      p.vx += (dx / d) * pull * dt
      p.vy += (dy / d) * pull * dt
    }
    // Friction so they settle rather than orbit.
    const fric = 1 - 3 * dt
    p.vx *= fric
    p.vy *= fric
    p.x += p.vx * dt
    p.y += p.vy * dt

    // Collection test against the UPDATED position (magnetism just moved it).
    const cdx = pl.x - p.x
    const cdy = pl.y - p.y
    const rr = p.radius + pl.radius
    if (cdx * cdx + cdy * cdy < rr * rr) {
      collect(world, p)
      p.alive = false
    }
  }
}

function collect(world: World, p: Pickup): void {
  const pl = world.player
  if (p.kind === 'xp') {
    world.addXp(p.xp * world.mods.xpMul)
    world.feel.emit(FeelKind.GemCollect, 0, p.x, p.y, p.xp)
  } else if (p.kind === 'health') {
    const before = pl.hp
    pl.hp = Math.min(pl.maxHp, pl.hp + p.heal)
    world.feel.emit(FeelKind.HealCollect, 0, pl.x, pl.y, pl.hp - before)
  } else {
    const wi = weaponIndex(p.weaponId)
    world.equipWeapon(p.weaponId)
    world.podsEquipped++
    world.weaponsUsed[wi] = 1
    world.feel.emit(FeelKind.WeaponPickup, 0, pl.x, pl.y, 0, wi)
  }
}
