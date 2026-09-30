import {
  BERSERK_MEDKIT,
  COLORS,
  MAX_PICKUPS,
  PICKUP_RESERVE,
  WEAPON_DROP_INTERVAL,
  WEAPON_DROP_LIFETIME,
  XP,
} from '../config.ts'
import { WEAPONS, weaponIndex } from '../content/weapons.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import { PICKUP_SLOT, PICKUP_SLOTS, type Pickup, type PickupKind } from '../game/pickup.ts'
import type { World } from '../game/world.ts'

const R = PICKUP_RESERVE
/** Guaranteed slots per PICKUP_SLOT index. */
const RESERVE_BY_SLOT = new Int16Array([R.xp, R.bank, R.health, R.weapon, R.core, R.bonus])
const SHARED_SLOTS = MAX_PICKUPS - (R.xp + R.bank + R.health + R.weapon + R.core + R.bonus)
const BANK_TINT = 0xff4a6a

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
  p.captured = false
  p.homeT = 0
  n[slot]!++
  return p
}

/** Drop an XP crystal at a kill site (with a little scatter velocity). At
 *  XP.gemSoftCap gems on the field, the uncaptured gem farthest from the
 *  player merges into the bank gem and is reused here, so new XP still drops
 *  where the kill happened. With no such gem (or a bank already homing in),
 *  the new XP merges into the bank gem. */
export function dropGem(world: World, x: number, y: number, xp: number): void {
  world.xpDropped += xp
  if (world.firstGemAt < 0) {
    world.firstGemAt = world.time
    world.firstGemX = x
    world.firstGemY = y
  }
  let p: Pickup | null = null
  if (world.pickupN[PICKUP_SLOT.xp]! < XP.gemSoftCap) {
    p = acquirePickup(world, 'xp')
  } else if (!world.bankGem || !world.bankGem.captured) {
    p = farthestGem(world)
    if (p) {
      bankXp(world, p.x, p.y, p.xp)
      p.captured = false
      p.homeT = 0
    }
  }
  if (!p) {
    bankXp(world, x, y, xp)
    return
  }
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
  p.life = Infinity
  p.phase = world.rngs.fx.angle()

  world.texReg.applySprite(p.sprite, 'gem')
  const s = p.sprite
  s.visible = true
  s.tint = COLORS.gem
  s.alpha = 1
  s.scale.set(1.15)
}

/** The live, uncaptured XP gem farthest from the player (first on ties), or null. */
function farthestGem(world: World): Pickup | null {
  const a = world.pickups.active
  const pl = world.player
  let best: Pickup | null = null
  let bd = -1
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    if (!p.alive || p.kind !== 'xp' || p.captured) continue
    const dx = p.x - pl.x
    const dy = p.y - pl.y
    const d2 = dx * dx + dy * dy
    if (d2 > bd) {
      bd = d2
      best = p
    }
  }
  return best
}

/** Pull the bank gem in to XP.bankLeash from the player when it lies farther. */
function leashBank(world: World, b: Pickup): void {
  const pl = world.player
  const dx = b.x - pl.x
  const dy = b.y - pl.y
  const d2 = dx * dx + dy * dy
  if (d2 <= XP.bankLeash * XP.bankLeash) return
  const k = XP.bankLeash / Math.sqrt(d2)
  b.x = pl.x + dx * k
  b.y = pl.y + dy * k
}

/** Add `xp` to the bank gem, creating it at (x, y), leashed, when there is none. */
function bankXp(world: World, x: number, y: number, xp: number): void {
  let b = world.bankGem
  if (!b) {
    b = acquirePickup(world, 'bank')
    if (!b) return
    world.bankGem = b
    b.xp = 0
    b.heal = 0
    b.weaponId = ''
    b.x = x
    b.y = y
    leashBank(world, b)
    b.prevX = b.x
    b.prevY = b.y
    b.vx = 0
    b.vy = 0
    b.radius = 7
    b.life = Infinity
    b.phase = world.rngs.fx.angle()
    world.texReg.applySprite(b.sprite, 'gem')
    const s = b.sprite
    s.visible = true
    s.tint = BANK_TINT
    s.alpha = 1
  }
  b.xp += xp
}

/** Drop a health medkit (perk-free sustain). Homes in like a gem. */
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
  p.life = XP.medkitLife
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

/** VACUUM (A5.3): every gem, bank gem and medkit on the field is captured. */
export function vacuumPickups(world: World): void {
  const a = world.pickups.active
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    if (p.alive && p.kind !== 'weapon' && !p.captured) {
      p.captured = true
      p.homeT = 0
    }
  }
}

/**
 * Periodically drop a weapon pod; collect on contact. Gems and medkits that
 * enter the capture radius (scaled by Magnetic) are captured and home in at
 * XP.homeStart to XP.homeMax u/s, never letting go. Gems never expire;
 * medkits last XP.medkitLife until captured. The uncaptured bank gem trails
 * the player at XP.bankLeash at most. Pods drift in inside 0.7 x the capture
 * radius.
 */
export function pickupSystem(world: World, dt: number): void {
  world.weaponDropTimer -= dt
  if (world.weaponDropTimer <= 0) {
    world.weaponDropTimer = WEAPON_DROP_INTERVAL
    const b = world.arena.bounds
    const rng = world.rngs.loot
    const id = rng.pick(world.weaponPool)
    spawnWeaponDrop(world, b.x + rng.range(0.15, 0.85) * b.w, b.y + rng.range(0.15, 0.85) * b.h, id)
  }

  const a = world.pickups.active
  const pl = world.player
  const capture = XP.captureRadius * world.mods.magnetMul
  const capture2 = capture * capture
  const podReach2 = capture2 * 0.49

  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    p.prevX = p.x
    p.prevY = p.y
    if (!p.captured) {
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      if (p === world.bankGem) leashBank(world, p)
    }

    const dx = pl.x - p.x
    const dy = pl.y - p.y
    const d2 = dx * dx + dy * dy

    if (p.kind !== 'weapon' && !p.captured && d2 < capture2) {
      p.captured = true
      p.homeT = 0
    }
    if (p.captured) {
      p.homeT += dt
      const ramp = p.homeT >= XP.homeRamp ? 1 : p.homeT / XP.homeRamp
      const sp = XP.homeStart + (XP.homeMax - XP.homeStart) * ramp
      const d = Math.sqrt(d2)
      if (sp * dt >= d) {
        p.x = pl.x
        p.y = pl.y
        p.vx = 0
        p.vy = 0
      } else {
        p.vx = (dx / d) * sp
        p.vy = (dy / d) * sp
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
    } else {
      if (p.kind === 'weapon' && d2 < podReach2) {
        const d = Math.sqrt(d2) || 1
        p.vx += (dx / d) * 320 * dt
        p.vy += (dy / d) * 320 * dt
      }
      // Friction so scatter and pod drift settle rather than orbit.
      const fric = 1 - 3 * dt
      p.vx *= fric
      p.vy *= fric
      p.x += p.vx * dt
      p.y += p.vy * dt
    }

    // Collection test against the UPDATED position (homing just moved it).
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
  if (p.kind === 'xp' || p.kind === 'bank') {
    if (p === world.bankGem) world.bankGem = null
    world.xpCollected += p.xp
    const surge = world.time - world.lastLevelAt >= XP.surgeAfter ? XP.surgeMul : 1
    world.addXp(p.xp * world.mods.xpMul * surge)
    world.feel.emit(FeelKind.GemCollect, 0, p.x, p.y, p.xp)
  } else if (p.kind === 'health') {
    const before = pl.hp
    pl.hp = Math.min(pl.maxHp, pl.hp + p.heal)
    if (world.mods.berserker > 0) world.berserkT = BERSERK_MEDKIT.sec
    world.feel.emit(FeelKind.HealCollect, 0, pl.x, pl.y, pl.hp - before)
  } else {
    const wi = weaponIndex(p.weaponId)
    world.equipWeapon(p.weaponId)
    world.podsEquipped++
    world.weaponsUsed[wi] = 1
    world.feel.emit(FeelKind.WeaponPickup, 0, pl.x, pl.y, 0, wi)
  }
}
