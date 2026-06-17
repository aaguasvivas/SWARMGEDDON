import { MAX_ENEMIES } from '../config.ts'
import { clamp } from '../core/vec.ts'
import { ENEMIES } from '../content/enemies.ts'
import {
  BOSS_INTERVAL,
  ELITE_FIRST,
  ELITE_INTERVAL,
  pickEnemy,
  spawnBatch,
  spawnInterval,
} from '../content/waveDirector.ts'
import { announce } from '../effects/fx.ts'
import type { Enemy } from '../game/enemy.ts'
import type { World } from '../game/world.ts'

/**
 * Wave director driver. Streams regular enemies from the edges per the data
 * curves, and layers in hive-guardian elites and the colossal queen boss on
 * their own cadences (one queen at a time).
 */
export function spawnSystem(world: World, dt: number): void {
  const t = world.time

  world.spawnTimer -= dt
  const interval = spawnInterval(t)
  const batch = spawnBatch(t)
  let guard = 0
  while (world.spawnTimer <= 0 && guard++ < 64) {
    world.spawnTimer += interval
    if (world.enemies.size >= MAX_ENEMIES) {
      world.spawnTimer = interval // at the cap: stop attempting, don't bank pulses
      break
    }
    for (let i = 0; i < batch; i++) {
      if (world.enemies.size >= MAX_ENEMIES) break
      spawnFromEdge(world, pickEnemy(world.rng, t))
    }
  }

  // Elites: one hive-guardian per cadence, intentionally stepping up to a small
  // pack deep into a run (+1 every 140s) as a late-game pressure ramp.
  if (t >= ELITE_FIRST) {
    world.eliteTimer -= dt
    if (world.eliteTimer <= 0) {
      world.eliteTimer = ELITE_INTERVAL
      const n = 1 + Math.floor((t - ELITE_FIRST) / 140)
      for (let i = 0; i < n; i++) spawnFromEdge(world, 'guardian')
      world.juice.addTrauma(0.3)
    }
  }

  // Boss.
  world.bossTimer -= dt
  if (world.bossTimer <= 0 && !world.bossAlive) {
    world.bossTimer = BOSS_INTERVAL
    spawnBoss(world)
  }
}

// FIXED spawn extents (NOT the actual viewport) — big enough to sit off-screen
// for any reasonable viewport, and constant so the Daily Challenge is truly
// device-independent (spawn positions never depend on screen size).
const SPAWN_HALF_W = 820
const SPAWN_HALF_H = 580

/**
 * A point just outside the visible window, around the player, so enemies stream
 * in from the screen edges and converge. Only picks sides that have off-screen
 * room inside the world, so they never pop in on-screen when the player hugs a
 * world wall.
 */
function viewportSpawnPoint(world: World): { x: number; y: number } {
  const rng = world.rng
  const b = world.arena.bounds
  const px = world.player.x
  const py = world.player.y

  // Sides (0=top,1=right,2=bottom,3=left) that have off-screen room in-arena.
  const sides: number[] = []
  if (py - SPAWN_HALF_H >= b.y) sides.push(0)
  if (px + SPAWN_HALF_W <= b.x + b.w) sides.push(1)
  if (py + SPAWN_HALF_H <= b.y + b.h) sides.push(2)
  if (px - SPAWN_HALF_W >= b.x) sides.push(3)
  // The huge arena always leaves at least two open sides; fall back just in case.
  const side = sides.length ? sides[rng.int(0, sides.length - 1)]! : rng.int(0, 3)

  let x = px
  let y = py
  switch (side) {
    case 0:
      x = px + rng.range(-SPAWN_HALF_W, SPAWN_HALF_W)
      y = py - SPAWN_HALF_H
      break
    case 1:
      x = px + SPAWN_HALF_W
      y = py + rng.range(-SPAWN_HALF_H, SPAWN_HALF_H)
      break
    case 2:
      x = px + rng.range(-SPAWN_HALF_W, SPAWN_HALF_W)
      y = py + SPAWN_HALF_H
      break
    default:
      x = px - SPAWN_HALF_W
      y = py + rng.range(-SPAWN_HALF_H, SPAWN_HALF_H)
  }
  return {
    x: clamp(x, b.x + 24, b.x + b.w - 24),
    y: clamp(y, b.y + 24, b.y + b.h - 24),
  }
}

function spawnFromEdge(world: World, defId: string): Enemy | null {
  const p = viewportSpawnPoint(world)
  return spawnEnemy(world, defId, p.x, p.y)
}

function spawnBoss(world: World): void {
  const p = viewportSpawnPoint(world)
  const queen = spawnEnemy(world, 'queen', p.x, p.y)
  if (!queen) return
  world.bossAlive = true
  world.boss = queen
  world.audio.play('boss')
  world.juice.addTrauma(0.8)
  announce(world, 'THE QUEEN AWAKENS', world.player.x, world.player.y - 40, 0xff3a8a)
}

/**
 * Spawn one enemy of `defId` at (x,y). Stats come from the registry; HP and
 * speed ramp with time. Returns the enemy (or null if at the cap). Also used for
 * splitter offspring and queen broods.
 */
export function spawnEnemy(world: World, defId: string, x: number, y: number): Enemy | null {
  if (world.enemies.size >= MAX_ENEMIES) return null
  const def = ENEMIES[defId]!
  const rng = world.rng
  const e = world.enemies.acquire()

  e.def = def
  e.x = e.prevX = x
  e.y = e.prevY = y
  e.vx = 0
  e.vy = 0
  e.facing = e.prevFacing = 0
  e.hp = e.maxHp = Math.round(def.hp + world.time * def.hpRamp)
  e.speed = def.speed * (1 + world.time * 0.0022)
  e.radius = def.radius
  e.damage = def.damage
  e.flash = 0
  e.buffed = 0
  e.slow = 0
  e.slowFactor = 0
  e.enraged = false
  e.submerged = false
  e.stateTimer = 0
  e.animPhase = rng.angle()

  // Behavior-specific init.
  if (def.behavior === 'burrower' && def.burrow) {
    e.submerged = true
    e.stateTimer = def.burrow.underTime
  } else if (def.behavior === 'teleporter' && def.teleport) {
    e.stateTimer = def.teleport.cooldown
  }
  if (def.brood) e.fireTimer = def.brood.cooldown
  else e.fireTimer = def.fireCooldown ? rng.range(0.4, def.fireCooldown) : 0

  world.texReg.applySprite(e.sprite, def.sprite)
  const s = e.sprite
  s.visible = true
  s.alpha = 1
  s.tint = def.tint
  s.scale.set(def.scale)
  return e
}

/** Dev-only stress helper. DCE'd from prod via the import.meta.env.DEV guard. */
export function debugFloodSwarmers(world: World, n: number): void {
  for (let i = 0; i < n; i++) spawnFromEdge(world, 'swarmer')
}
