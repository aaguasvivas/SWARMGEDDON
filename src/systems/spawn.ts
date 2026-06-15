import { MAX_ENEMIES } from '../config.ts'
import { ENEMIES } from '../content/enemies.ts'
import { pickEnemy, spawnBatch, spawnInterval } from '../content/waveDirector.ts'
import type { World } from '../game/world.ts'

/**
 * Wave director driver. Pulls the spawn-rate/batch curves and the weighted enemy
 * pick from the data-driven wave table, and streams the chosen enemies in from
 * the arena edges. Difficulty escalation is entirely in the wave-table data.
 */
export function spawnSystem(world: World, dt: number): void {
  world.spawnTimer -= dt
  const t = world.time
  const interval = spawnInterval(t)
  const batch = spawnBatch(t)

  let guard = 0
  while (world.spawnTimer <= 0 && guard++ < 64) {
    world.spawnTimer += interval
    for (let i = 0; i < batch; i++) spawnFromEdge(world, pickEnemy(world.rng, t))
  }
}

function spawnFromEdge(world: World, defId: string): void {
  const b = world.arena.bounds
  const rng = world.rng
  const margin = 34
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
  spawnEnemy(world, defId, x, y)
}

/**
 * Spawn one enemy of `defId` at (x,y). Stats come from the registry; HP and
 * speed ramp with elapsed time. Also used for splitter offspring (death-time).
 */
export function spawnEnemy(world: World, defId: string, x: number, y: number): void {
  if (world.enemies.size >= MAX_ENEMIES) return
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
  e.speed = def.speed * (1 + world.time * 0.0025)
  e.radius = def.radius
  e.damage = def.damage
  e.fireTimer = def.fireCooldown ? rng.range(0.4, def.fireCooldown) : 0
  e.flash = 0
  e.animPhase = rng.angle()

  world.texReg.applySprite(e.sprite, def.sprite)
  const s = e.sprite
  s.visible = true
  s.alpha = 1
  s.tint = def.tint
  s.scale.set(def.scale)
}

/** Dev-only stress helper: instantly spawn `n` swarmers from the edges.
 *  Guarded behind import.meta.env.DEV at the call site -> DCE'd in prod. */
export function debugFloodSwarmers(world: World, n: number): void {
  for (let i = 0; i < n; i++) spawnFromEdge(world, 'swarmer')
}
