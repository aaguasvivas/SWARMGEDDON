import { BERSERK_MEDKIT, BONUS, COLORS, CORES, MAX_PICKUPS, PICKUP_RESERVE, PODS, XP } from '../config.ts'
import { clamp } from '../core/vec.ts'
import { BONUSES } from '../content/bonuses.ts'
import { WEAPONS, weaponIndex } from '../content/weapons.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import { PICKUP_SLOT, PICKUP_SLOTS, type Pickup, type PickupKind } from '../game/pickup.ts'
import type { World } from '../game/world.ts'
import { takeBonus } from './bonuses.ts'
import { takeHiveCore, takeShard } from './cores.ts'
import { healPlayer } from './damage.ts'

const R = PICKUP_RESERVE
/** Guaranteed slots per PICKUP_SLOT index. */
const RESERVE_BY_SLOT = new Int16Array([R.xp, R.bank, R.health, R.weapon, R.core, R.bonus])
const SHARED_SLOTS = MAX_PICKUPS - (R.xp + R.bank + R.health + R.weapon + R.core + R.bonus)
const BANK_TINT = 0xff4a6a

/** Whether a pickup of `kind` fits: its own reserved slots first, then the
 *  shared remainder. So a gem flood can never starve pods or medkits, and the
 *  pool never exceeds MAX_PICKUPS. */
function hasRoom(world: World, kind: PickupKind): boolean {
  const n = world.pickupN
  const slot = PICKUP_SLOT[kind]
  if (n[slot]! < RESERVE_BY_SLOT[slot]!) return true
  let sharedUsed = 0
  for (let i = 0; i < PICKUP_SLOTS; i++) {
    const over = n[i]! - RESERVE_BY_SLOT[i]!
    if (over > 0) sharedUsed += over
  }
  return sharedUsed < SHARED_SLOTS
}

/** Take a pickup of `kind` from the pool, or null when it has no room. */
function acquirePickup(world: World, kind: PickupKind): Pickup | null {
  if (!hasRoom(world, kind)) return null
  const p = world.pickups.acquire()
  p.kind = kind
  p.captured = false
  p.homeT = 0
  p.hold = 0
  p.timer = false
  p.sub = 0
  p.xp = 0
  p.heal = 0
  p.weaponId = ''
  p.vx = 0
  p.vy = 0
  world.pickupN[PICKUP_SLOT[kind]]!++
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

// --- weapon pods (docs/NEXT-LEVEL.md 4.5, A5.1) -------------------------------

/** Pod type candidates (scratch, reused). */
const podCand: string[] = []

/** The held pickup weapon's id, or '' on the base weapon. */
function heldPickupId(world: World): string {
  return world.weapon.id === world.baseWeaponId ? '' : world.weapon.id
}

function pairStacks(world: World, id: string): number {
  const pair = WEAPONS[id]!.pair
  return pair ? (world.perkStacks.get(pair) ?? 0) : 0
}

/** Timer and elite pods: with PODS.affinityChance a weapon whose paired perk
 *  is owned, else any weapon; never the held one. */
function pickPodType(world: World): string {
  const loot = world.rngs.loot
  const pool = world.weaponPool
  const held = heldPickupId(world)
  podCand.length = 0
  if (loot.float() < PODS.affinityChance) {
    for (let i = 0; i < pool.length; i++) if (pool[i] !== held && pairStacks(world, pool[i]!) > 0) podCand.push(pool[i]!)
    if (podCand.length > 0) return loot.pick(podCand)
  }
  for (let i = 0; i < pool.length; i++) if (pool[i] !== held) podCand.push(pool[i]!)
  return loot.pick(podCand)
}

/** Boss pods: a weapon whose paired perk has 2+ stacks, else 1+, else any. */
function pickBossPodType(world: World): string {
  const loot = world.rngs.loot
  const pool = world.weaponPool
  for (let min = 2; min >= 1; min--) {
    podCand.length = 0
    for (let i = 0; i < pool.length; i++) if (pairStacks(world, pool[i]!) >= min) podCand.push(pool[i]!)
    if (podCand.length > 0) return loot.pick(podCand)
  }
  return loot.pick(pool)
}

/** A live timer pod is on the field. */
function timerPodAlive(world: World): boolean {
  const a = world.pickups.active
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    if (p.alive && p.kind === 'weapon' && p.timer) return true
  }
  return false
}

/** One timer pod at a time: at PODS.first, then every PODS.interval seconds,
 *  PODS.minDist to maxDist from the player, turned +90 degrees up to 3 times
 *  to land inside the arena inset. */
function podTimer(world: World, dt: number): void {
  world.weaponDropTimer -= dt
  if (world.weaponDropTimer > 1e-6) return
  world.weaponDropTimer += PODS.interval
  if (timerPodAlive(world) || !hasRoom(world, 'weapon')) return
  const loot = world.rngs.loot
  const pl = world.player
  const b = world.arena.bounds
  const inset = PODS.edgeInset
  let a = loot.angle()
  const r = loot.range(PODS.minDist, PODS.maxDist)
  let x = pl.x
  let y = pl.y
  for (let k = 0; k < 4; k++) {
    x = pl.x + Math.cos(a) * r
    y = pl.y + Math.sin(a) * r
    if (x >= b.x + inset && x <= b.x + b.w - inset && y >= b.y + inset && y <= b.y + b.h - inset) break
    a += Math.PI / 2
  }
  spawnPod(world, x, y, pickPodType(world), true)
}

/** An elite's pod, at its corpse. */
export function dropPod(world: World, x: number, y: number): void {
  if (!hasRoom(world, 'weapon')) return
  spawnPod(world, x, y, pickPodType(world), false)
}

/** A boss's pod, PODS.bossPodOffset from its Hive Core (the corpse). */
export function dropBossPod(world: World, x: number, y: number): void {
  if (!hasRoom(world, 'weapon')) return
  const a = world.rngs.loot.angle()
  spawnPod(world, x + Math.cos(a) * PODS.bossPodOffset, y + Math.sin(a) * PODS.bossPodOffset, pickBossPodType(world), false)
}

/** Put `p` at (x, y) inside the arena inset and, while the cage is up,
 *  inside cage.r - PODS.cageInset. */
function place(world: World, p: Pickup, x: number, y: number): void {
  const b = world.arena.bounds
  const inset = PODS.edgeInset
  x = clamp(x, b.x + inset, b.x + b.w - inset)
  y = clamp(y, b.y + inset, b.y + b.h - inset)
  const c = world.director.cage
  if (c.active) {
    const max = c.r - PODS.cageInset
    const dx = x - c.x
    const dy = y - c.y
    const d2 = dx * dx + dy * dy
    if (d2 > max * max) {
      const k = max / Math.sqrt(d2)
      x = c.x + dx * k
      y = c.y + dy * k
    }
  }
  p.x = p.prevX = x
  p.y = p.prevY = y
}

/** Place a pod (color-coded to the weapon). */
function spawnPod(world: World, x: number, y: number, weaponId: string, timer: boolean): void {
  const p = acquirePickup(world, 'weapon')
  if (!p) return
  place(world, p, x, y)
  p.timer = timer
  p.weaponId = weaponId
  p.radius = 15
  p.life = PODS.life + world.mods.podLifeBonus
  p.phase = 0

  world.texReg.applySprite(p.sprite, 'crate')
  const s = p.sprite
  s.visible = true
  s.tint = WEAPONS[weaponId]!.tint
  s.alpha = 1
  s.scale.set(1)
  world.feel.emit(FeelKind.PodSpawn, 0, p.x, p.y, 0, weaponIndex(weaponId))
}

// --- shards, Hive Cores, bonuses (docs/NEXT-LEVEL.md 4.6, A5.2, A5.3) -------

function contactPickup(world: World, kind: PickupKind, x: number, y: number, radius: number, life: number, key: string, tint: number): Pickup | null {
  const p = acquirePickup(world, kind)
  if (!p) return null
  place(world, p, x, y)
  p.radius = radius
  p.life = life
  p.phase = 0
  world.texReg.applySprite(p.sprite, key)
  const s = p.sprite
  s.visible = true
  s.tint = tint
  s.alpha = 1
  s.scale.set(1)
  return p
}

/** An elite's core shard, at its corpse. It lasts CORES.shardLife. */
export function dropShard(world: World, x: number, y: number): boolean {
  return contactPickup(world, 'shard', x, y, CORES.shardRadius, CORES.shardLife, 'shard', CORES.shardTint) !== null
}

/** A boss's Hive Core, at its corpse, from CORES.table row `row`. It never expires. */
export function dropHiveCore(world: World, x: number, y: number, row: number): void {
  const p = contactPickup(world, 'core', x, y, CORES.coreRadius, Infinity, 'core', CORES.coreTint)
  if (p) p.sub = row
}

/** A bonus of BONUSES index `type`. It lasts BONUS.life. */
export function dropBonus(world: World, x: number, y: number, type: number): boolean {
  const p = contactPickup(world, 'bonus', x, y, BONUS.radius, BONUS.life, 'bonus', BONUSES[type]!.tint)
  if (p) p.sub = type
  return p !== null
}

/** VACUUM (A5.3): every gem, bank gem and medkit on the field is captured. */
export function vacuumPickups(world: World): void {
  const a = world.pickups.active
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    if (p.alive && (p.kind === 'xp' || p.kind === 'bank' || p.kind === 'health') && !p.captured) {
      p.captured = true
      p.homeT = 0
    }
  }
}

/**
 * The pod timer, then every pickup. Pods are taken by standing on them for the
 * pilot's hold time (less Quartermaster's cut); the fill decays off the pod.
 * Gems and medkits (and NOVA's pods) that enter the capture radius (scaled by
 * Magnetic) are captured and home in at XP.homeStart to XP.homeMax u/s, never
 * letting go. Gems never expire; medkits last XP.medkitLife until captured.
 * The uncaptured bank gem trails the player at XP.bankLeash at most. Shards,
 * Hive Cores and bonuses are taken on contact only; a Hive Core waits while
 * another one's reveal is pending.
 */
export function pickupSystem(world: World, dt: number): void {
  podTimer(world, dt)

  const a = world.pickups.active
  const pl = world.player
  const capture = XP.captureRadius * world.mods.magnetMul
  const capture2 = capture * capture
  const rules = world.character.rules
  const holdTime = Math.max(0, rules.podHold - world.mods.podHoldCut)

  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    p.prevX = p.x
    p.prevY = p.y
    const kind = p.kind
    if (kind === 'shard' || kind === 'core' || kind === 'bonus') {
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      if (kind === 'core' && world.core.pending) continue
      const dx = pl.x - p.x
      const dy = pl.y - p.y
      const rr = p.radius + pl.radius
      if (dx * dx + dy * dy < rr * rr) {
        collect(world, p)
        p.alive = false
      }
      continue
    }
    if (kind === 'weapon' && !(rules.podHoming && p.captured)) {
      p.life -= dt
      if (p.life <= 0) {
        p.alive = false
        continue
      }
      if (rules.podHoming) {
        const hx = pl.x - p.x
        const hy = pl.y - p.y
        if (hx * hx + hy * hy < capture2) {
          p.captured = true
          p.homeT = 0
        }
      }
      const dx = pl.x - p.x
      const dy = pl.y - p.y
      const rr = p.radius + pl.radius + PODS.holdRadiusPad
      if (dx * dx + dy * dy < rr * rr) {
        p.hold = holdTime > 0 ? p.hold + dt / holdTime : 1
        if (p.hold >= 1 - 1e-9) {
          collect(world, p)
          p.alive = false
        }
      } else if (p.hold > 0) {
        p.hold = Math.max(0, p.hold - PODS.holdDecayPerSec * dt)
      }
      continue
    }
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

    if (!p.captured && d2 < capture2) {
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
      // Friction so the drop scatter settles rather than orbits.
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
    const gained = healPlayer(world, p.heal)
    if (world.mods.berserker > 0) world.berserkT = BERSERK_MEDKIT.sec
    world.feel.emit(FeelKind.HealCollect, 0, pl.x, pl.y, gained)
  } else if (p.kind === 'shard') {
    takeShard(world)
  } else if (p.kind === 'core') {
    takeHiveCore(world, p.sub)
  } else if (p.kind === 'bonus') {
    takeBonus(world, p.sub)
  } else {
    const wi = weaponIndex(p.weaponId)
    world.equipWeapon(p.weaponId)
    world.podsEquipped++
    world.weaponsUsed[wi] = 1
    world.feel.emit(FeelKind.WeaponPickup, 0, pl.x, pl.y, 0, wi)
  }
}
