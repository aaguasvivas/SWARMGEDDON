import { MAX_ENEMIES } from '../config.ts'
import { clamp } from '../core/vec.ts'
import { ENEMIES } from '../content/enemies.ts'
import { pickEnemy, spawnBatch, spawnInterval } from '../content/waveDirector.ts'
import { announce } from '../effects/fx.ts'
import type { Enemy } from '../game/enemy.ts'
import type { World } from '../game/world.ts'

/**
 * Wave director driver. Streams the ARENA's roster from the edges per its own
 * rhythm curves, and layers in the arena's elite and boss on their cadences
 * (one boss at a time). All config comes from world.waveCfg, resolved once per
 * run in beginRun — per-world rosters/rhythm are what make each arena play as
 * a different world (docs/WORLDS-SPEC.md).
 */
export function spawnSystem(world: World, dt: number): void {
  const t = world.time
  const cfg = world.waveCfg

  world.spawnTimer -= dt
  const interval = spawnInterval(cfg, t)
  const batch = spawnBatch(cfg, t)
  let guard = 0
  while (world.spawnTimer <= 0 && guard++ < 64) {
    world.spawnTimer += interval
    if (world.enemies.size >= MAX_ENEMIES) {
      world.spawnTimer = interval // at the cap: stop attempting, don't bank pulses
      break
    }
    for (let i = 0; i < batch; i++) {
      if (world.enemies.size >= MAX_ENEMIES) break
      spawnFromEdge(world, pickEnemy(cfg, world.rng, t))
    }
  }

  // Elites: one per cadence, stepping up to a small pack deep into a run as a
  // late-game pressure ramp. At the enemy cap (the NORMAL late-game state),
  // don't burn the cadence — retry shortly, once kills open room. Capacity is
  // checked BEFORE any RNG draw so the failed path stays deterministic.
  if (t >= cfg.elite.first) {
    world.eliteTimer -= dt
    if (world.eliteTimer <= 0) {
      if (world.enemies.size >= MAX_ENEMIES) {
        world.eliteTimer = RETRY_AT_CAP
      } else {
        world.eliteTimer = cfg.elite.interval
        const n = 1 + Math.floor((t - cfg.elite.first) / cfg.elite.packEvery)
        for (let i = 0; i < n; i++) spawnFromEdge(world, cfg.elite.id)
        world.juice.addTrauma(0.3)
      }
    }
  }

  // Boss — same retry-at-cap rule: the boss must never be silently skipped
  // for a whole interval just because the pool was momentarily full.
  world.bossTimer -= dt
  if (world.bossTimer <= 0 && !world.bossAlive) {
    if (world.enemies.size >= MAX_ENEMIES) {
      world.bossTimer = RETRY_AT_CAP
    } else {
      world.bossTimer = cfg.boss.interval
      spawnBoss(world)
    }
  }
}

/** Seconds before re-attempting an elite/boss spawn that hit the enemy cap. */
const RETRY_AT_CAP = 2

// FIXED spawn extents (NOT the actual viewport) — constant so the Daily
// Challenge is truly device-independent (spawn positions never depend on screen
// size). Sized to clear the visible half-extents of a maximized 1440p window
// (half 1280x720); on rarer, even larger viewports (4K/ultrawide, where the
// whole 2800x1900 arena fits on screen anyway) spawns can land in view — the
// cosmetic emerge fade in entityRenderer makes those read as intentional.
const SPAWN_HALF_W = 1300
const SPAWN_HALF_H = 760

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
  const cfg = world.waveCfg
  const p = viewportSpawnPoint(world)
  const boss = spawnEnemy(world, cfg.boss.id, p.x, p.y)
  if (!boss) return
  world.bossAlive = true
  world.boss = boss
  world.audio.play('boss')
  world.juice.addTrauma(0.8)
  announce(world, cfg.boss.announce, world.player.x, world.player.y - 40, world.broodTint(boss.def.tint))
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
  e.bornAt = world.time
  e.phase = 0
  e.phaseDir = 0
  e.dashHit = false
  e.buffedMul = 1
  // Faction skin: the arena's paired brood hue-shifts every enemy's palette.
  // Pure presentation (no RNG, cached per color) — the sim never reads tints.
  e.tint = world.broodTint(def.tint)
  e.gibTint = world.broodTint(def.gibColor)

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
