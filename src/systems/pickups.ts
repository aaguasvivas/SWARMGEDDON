import {
  BASE_MAGNET_RADIUS,
  COLORS,
  GEM_LIFETIME,
  HEALTH_LIFETIME,
  MAX_PICKUPS,
  WEAPON_DROP_INTERVAL,
  WEAPON_DROP_LIFETIME,
} from '../config.ts'
import { PICKUP_WEAPON_IDS, WEAPONS } from '../content/weapons.ts'
import { announce } from '../effects/fx.ts'
import { saveJSON } from '../platform/storage.ts'
import type { Pickup } from '../game/pickup.ts'
import type { World } from '../game/world.ts'

/** Drop an XP crystal at a kill site (with a little scatter velocity). */
export function dropGem(world: World, x: number, y: number, xp: number): void {
  if (world.pickups.size >= MAX_PICKUPS) return
  const rng = world.rng
  const p = world.pickups.acquire()
  p.kind = 'xp'
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
  p.phase = rng.angle()

  world.texReg.applySprite(p.sprite, 'gem')
  const s = p.sprite
  s.visible = true
  s.tint = COLORS.gem
  s.alpha = 1
  s.scale.set(1.15)

  // One-time teaching moment: label the very first gem the player ever drops.
  if (world.showGemHint) {
    world.showGemHint = false
    announce(world, '✦ collect for XP', p.x, p.y - 18, COLORS.gem)
    saveJSON('seenGemHint', true)
  }
}

/** Drop a health medkit (perk-free sustain). Magnetizes in like a gem. */
export function dropHealth(world: World, x: number, y: number, heal: number): void {
  if (world.pickups.size >= MAX_PICKUPS) return
  const rng = world.rng
  const p = world.pickups.acquire()
  p.kind = 'health'
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
  p.phase = rng.angle()

  world.texReg.applySprite(p.sprite, 'health')
  const s = p.sprite
  s.visible = true
  s.tint = COLORS.health
  s.alpha = 1
  s.scale.set(1)
}

/** Drop a weapon pod (color-coded to the weapon). */
export function spawnWeaponDrop(world: World, x: number, y: number, weaponId: string): void {
  if (world.pickups.size >= MAX_PICKUPS) return
  const p = world.pickups.acquire()
  p.kind = 'weapon'
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
    const id = world.rng.pick(PICKUP_WEAPON_IDS)
    spawnWeaponDrop(world, b.x + world.rng.range(0.15, 0.85) * b.w, b.y + world.rng.range(0.15, 0.85) * b.h, id)
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
  if (p.kind === 'xp') {
    world.addXp(p.xp * world.mods.xpMul)
    world.audio.play('pickup')
  } else if (p.kind === 'health') {
    const before = world.player.hp
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + p.heal)
    const gained = Math.round(world.player.hp - before)
    world.audio.play('pickup')
    if (gained > 0) announce(world, `+${gained}`, world.player.x, world.player.y - 24, COLORS.health)
  } else {
    world.equipWeapon(p.weaponId)
    world.audio.play('weapon')
    announce(world, WEAPONS[p.weaponId]!.name, world.player.x, world.player.y - 26, WEAPONS[p.weaponId]!.tint)
  }
}
