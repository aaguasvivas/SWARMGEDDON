import { COLORS, MAX_ENEMIES } from '../config.ts'
import type { World } from '../game/world.ts'

/**
 * Wave director (Phase 1, single enemy). Swarmers stream in from all four edges.
 * Difficulty ramps purely with elapsed time: the spawn interval tightens and the
 * per-tick batch grows, so the arena slides from "a trickle" to "gloriously out
 * of control". Phase 3 replaces this with the full data-driven schedule.
 */
export function spawnSystem(world: World, dt: number): void {
  world.spawnTimer -= dt
  const t = world.time

  // Interval shrinks ~0.85s -> 0.10s over the first ~80s; batch grows every 25s.
  const interval = Math.max(0.1, 0.85 - t * 0.009)
  const batch = 1 + Math.floor(t / 25)

  // Guard bounds the catch-up if the loop hitched.
  let guard = 0
  while (world.spawnTimer <= 0 && guard++ < 64) {
    world.spawnTimer += interval
    for (let i = 0; i < batch; i++) spawnSwarmer(world, t)
  }
}

/** Dev-only stress helper: instantly spawn `n` swarmers. Guarded behind
 *  import.meta.env.DEV at the call site, so it's dead-code-eliminated in prod. */
export function debugFloodSwarmers(world: World, n: number): void {
  for (let i = 0; i < n; i++) spawnSwarmer(world, world.time)
}

function spawnSwarmer(world: World, t: number): void {
  if (world.enemies.size >= MAX_ENEMIES) return
  const b = world.arena.bounds
  const rng = world.rng
  const margin = 32

  // Pick an edge and a point just outside it, so they walk into the arena.
  let x = 0
  let y = 0
  switch (rng.int(0, 3)) {
    case 0:
      x = rng.range(b.x, b.x + b.w)
      y = b.y - margin
      break
    case 1:
      x = b.x + b.w + margin
      y = rng.range(b.y, b.y + b.h)
      break
    case 2:
      x = rng.range(b.x, b.x + b.w)
      y = b.y + b.h + margin
      break
    default:
      x = b.x - margin
      y = rng.range(b.y, b.y + b.h)
  }

  const e = world.enemies.acquire()
  e.x = e.prevX = x
  e.y = e.prevY = y
  e.vx = 0
  e.vy = 0
  e.facing = e.prevFacing = 0
  e.hp = e.maxHp = 3 + Math.floor(t / 30)
  e.speed = rng.range(58, 86) * (1 + t * 0.004)
  e.radius = 14
  e.damage = 22
  e.xp = 1
  e.flash = 0
  e.animPhase = rng.angle()

  const s = e.sprite
  s.visible = true
  s.alpha = 1
  s.tint = COLORS.swarmer
  s.scale.set(1)
}
