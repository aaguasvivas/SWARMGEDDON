import { HP_RAMP_T_CAP, MAX_ENEMIES, RING_STD, SPEED_RAMP, SPEED_RAMP_CAP_T } from '../config.ts'
import { doubleFields } from '../core/fields.ts'
import { clamp } from '../core/vec.ts'
import { ENEMIES } from '../content/enemies.ts'
import type { Enemy } from '../game/enemy.ts'
import type { World } from '../game/world.ts'

export interface RingHalf {
  readonly halfW: number
  readonly halfH: number
}

/** Result slot of ringSpawnPoint / ringPointAt (read it before the next call). */
export const ringOut = { x: 0, y: 0 }
doubleFields(ringOut)
const openSides = new Int8Array(4)

/**
 * A point on the ring rectangle around the player, on a side that has room
 * inside the arena, so arrivals come from off screen and never pop in against
 * a wall. Two spawn draws: the side, then the position along it.
 */
export function ringSpawnPoint(world: World, half: RingHalf): void {
  const rng = world.rngs.spawn
  const b = world.arena.bounds
  const px = world.player.x
  const py = world.player.y
  const hw = half.halfW
  const hh = half.halfH

  let n = 0
  if (py - hh >= b.y) openSides[n++] = 0
  if (px + hw <= b.x + b.w) openSides[n++] = 1
  if (py + hh <= b.y + b.h) openSides[n++] = 2
  if (px - hw >= b.x) openSides[n++] = 3
  const side = n > 0 ? openSides[rng.int(0, n - 1)]! : rng.int(0, 3)

  let x = px
  let y = py
  switch (side) {
    case 0:
      x = px + rng.range(-hw, hw)
      y = py - hh
      break
    case 1:
      x = px + hw
      y = py + rng.range(-hh, hh)
      break
    case 2:
      x = px + rng.range(-hw, hw)
      y = py + hh
      break
    default:
      x = px - hw
      y = py + rng.range(-hh, hh)
  }
  ringOut.x = clamp(x, b.x + 24, b.x + b.w - 24)
  ringOut.y = clamp(y, b.y + 24, b.y + b.h - 24)
}

/** Where the ray from the player at angle `ang` meets the ring rectangle (unclamped). */
export function ringPointAt(world: World, ang: number, half: RingHalf): void {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const k = Math.min(half.halfW / Math.max(Math.abs(c), 1e-6), half.halfH / Math.max(Math.abs(s), 1e-6))
  ringOut.x = world.player.x + c * k
  ringOut.y = world.player.y + s * k
}

/**
 * Spawn one enemy of `defId` at (x,y). Stats come from the registry; HP and
 * speed ramp with time. Returns the enemy (or null if at the cap). Also used for
 * splitter offspring and boss brood.
 */
export function spawnEnemy(world: World, defId: string, x: number, y: number): Enemy | null {
  if (world.enemies.size >= MAX_ENEMIES) return null
  const def = ENEMIES[defId]!
  const rng = world.rngs.spawn
  const e = world.enemies.acquire()

  e.uid = world.enemyUidSeq++
  e.def = def
  e.x = e.prevX = x
  e.y = e.prevY = y
  e.vx = 0
  e.vy = 0
  e.facing = e.prevFacing = 0
  e.hp = e.maxHp = Math.round((def.hp + Math.min(world.time, HP_RAMP_T_CAP) * def.hpRamp) * world.hpMul)
  e.speed = def.speed * (1 + SPEED_RAMP * Math.min(world.time, SPEED_RAMP_CAP_T)) * (def.boss ? 1 : world.speedMul)
  e.radius = def.radius
  e.damage = def.damage
  e.flash = 0
  e.buffed = 0
  e.slow = 0
  e.slowFactor = 0
  e.burnT = 0
  e.burnDps = 0
  e.staggerT = 0
  e.ramStamp = 0
  e.submerged = false
  e.brood = 0
  e.stateTimer = 0
  e.animPhase = world.rngs.fx.angle()
  e.bornAt = world.time
  e.phase = 0
  e.phaseDir = 0
  e.dashHit = false
  e.buffedMul = 1
  e.armor = def.frontArmor ?? 0
  e.affix = 0
  e.affixT = 0
  e.halfBurst = false
  e.eventUnit = false
  e.stream = false
  e.ttl = 0
  e.wobAmp = 0
  e.wobFreq = 0
  e.wobPhase = 0
  // Faction skin: the arena's paired brood hue-shifts every enemy's palette.
  // Pure presentation (no RNG, cached per color); the sim never reads tints.
  e.tint = world.broodTint(def.tint)
  e.gibTint = world.broodTint(def.gibColor)

  // Behavior-specific init.
  if (def.behavior === 'burrower' && def.burrow) {
    e.submerged = true
    e.stateTimer = def.burrow.underTime
  } else if (def.behavior === 'teleporter' && def.teleport) {
    e.stateTimer = def.teleport.cooldown
  }
  e.fireTimer = def.fireCooldown ? rng.range(0.4, def.fireCooldown) : 0

  world.texReg.applyQuad(e.quad, def.sprite)
  return e
}

/** Dev-only stress helper. DCE'd from prod via the import.meta.env.DEV guard. */
export function debugFloodSwarmers(world: World, n: number): void {
  for (let i = 0; i < n; i++) {
    ringSpawnPoint(world, RING_STD)
    spawnEnemy(world, 'swarmer', ringOut.x, ringOut.y)
  }
}
