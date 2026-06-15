import { COLORS, MAX_ENEMY_PROJECTILES } from '../config.ts'
import { clamp } from '../core/vec.ts'
import { spawnPoof } from '../effects/fx.ts'
import { spawnEnemy } from './spawn.ts'
import type { Enemy } from '../game/enemy.ts'
import type { World } from '../game/world.ts'

const SEPARATION = 0.9
const AURA_SPEED_MUL = 1.35

/** Rebuild the enemy spatial hash from current positions. */
export function buildEnemyHash(world: World): void {
  world.hash.clear()
  const a = world.enemies.active
  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    world.hash.insert(e, e.x, e.y)
  }
}

/**
 * Per-behavior steering + special abilities. An aura pass first lets hive minds
 * buff neighbors; then each enemy seeks/strafes/dives/teleports per its tag,
 * separates from neighbors (where appropriate), and integrates. Tracks whether a
 * reality-warper is alive so the render layer can run its distortion gimmick.
 */
export function aiSystem(world: World, dt: number): void {
  const a = world.enemies.active
  const px = world.player.x
  const py = world.player.y
  const buf = world.queryBuf

  // Aura + warper pass.
  let warperActive = false
  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    if (e.def.aura && !e.submerged) applyAura(world, e, buf)
    if (e.def.warps && !e.submerged) warperActive = true
  }
  world.warperActive = warperActive

  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    const def = e.def
    e.prevX = e.x
    e.prevY = e.y
    e.prevFacing = e.facing
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt)
    if (e.slow > 0) e.slow = Math.max(0, e.slow - dt)
    if (e.buffed > 0) e.buffed = Math.max(0, e.buffed - dt)

    const dx = px - e.x
    const dy = py - e.y
    const d = Math.hypot(dx, dy) || 1
    const ux = dx / d
    const uy = dy / d

    let mx = ux
    let my = uy
    let faceTarget = false
    let separate = true

    switch (def.behavior) {
      case 'flyer':
        separate = false
        break

      case 'spitter': {
        const range = def.preferRange ?? 260
        if (d > range * 1.12) {
          mx = ux
          my = uy
        } else if (d < range * 0.82) {
          mx = -ux
          my = -uy
        } else {
          mx = -uy
          my = ux
        }
        faceTarget = true
        e.fireTimer -= dt
        if (e.fireTimer <= 0) {
          e.fireTimer = def.fireCooldown ?? 2
          fireEnemyShot(world, e, ux, uy)
        }
        break
      }

      case 'teleporter': {
        const range = def.preferRange ?? 280
        if (d > range * 1.1) {
          mx = ux
          my = uy
        } else if (d < range * 0.8) {
          mx = -ux
          my = -uy
        } else {
          mx = -uy
          my = ux
        }
        faceTarget = true
        e.fireTimer -= dt
        if (e.fireTimer <= 0) {
          e.fireTimer = def.fireCooldown ?? 2.4
          fireEnemyShot(world, e, ux, uy)
        }
        e.stateTimer -= dt
        if (e.stateTimer <= 0 && def.teleport) {
          e.stateTimer = def.teleport.cooldown
          teleport(world, e, def.teleport.range)
        }
        break
      }

      case 'burrower': {
        e.stateTimer -= dt
        if (e.stateTimer <= 0 && def.burrow) {
          if (e.submerged) {
            e.submerged = false
            e.stateTimer = def.burrow.surfaceTime
            e.sprite.visible = true
            spawnPoof(world, e.x, e.y, def.gibColor, 8)
          } else {
            e.submerged = true
            e.stateTimer = def.burrow.underTime
          }
        }
        separate = !e.submerged
        break
      }

      case 'queen': {
        faceTarget = true
        separate = false
        if (def.enrageAt && !e.enraged && e.hp <= e.maxHp * def.enrageAt) {
          e.enraged = true
          world.audio.play('boss')
          world.juice.addTrauma(0.6)
        }
        e.fireTimer -= dt
        if (e.fireTimer <= 0 && def.brood) {
          e.fireTimer = (e.enraged ? 0.6 : 1) * def.brood.cooldown
          spawnBrood(world, e, def.brood)
        }
        break
      }
      // 'chaser' and 'splitter' use the default seek + separation.
    }

    // Effective speed with slow / buff / burrow / enrage modifiers.
    let spd = e.speed
    if (e.slow > 0) spd *= 1 - e.slowFactor
    if (e.buffed > 0) spd *= AURA_SPEED_MUL
    if (def.behavior === 'burrower' && e.submerged && def.burrow) spd *= def.burrow.underSpeedMul
    if (def.behavior === 'queen' && e.enraged) spd *= 1.4

    if (separate) {
      const n = world.hash.query(e.x, e.y, e.radius * 2.2, buf)
      for (let j = 0; j < n; j++) {
        const o = buf[j]!
        if (o === e || o.submerged) continue
        const ox = e.x - o.x
        const oy = e.y - o.y
        const dd = ox * ox + oy * oy
        const minD = e.radius + o.radius
        if (dd > 1e-4 && dd < minD * minD) {
          const inv = 1 / Math.sqrt(dd)
          mx += ox * inv * SEPARATION
          my += oy * inv * SEPARATION
        }
      }
    }

    const ml = Math.hypot(mx, my) || 1
    e.vx = (mx / ml) * spd
    e.vy = (my / ml) * spd
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.facing = faceTarget ? Math.atan2(uy, ux) : Math.atan2(e.vy, e.vx)
  }
}

/** Hive mind: refresh a short buff on all enemies within its aura radius. */
function applyAura(world: World, src: Enemy, buf: Enemy[]): void {
  const radius = src.def.aura!.radius
  const n = world.hash.query(src.x, src.y, radius, buf)
  for (let j = 0; j < n; j++) {
    const o = buf[j]!
    if (o === src) continue
    const dx = o.x - src.x
    const dy = o.y - src.y
    if (dx * dx + dy * dy <= radius * radius) o.buffed = Math.max(o.buffed, 0.3)
  }
}

/** Teleporter blinks to a fresh spot at `range` around the player. */
function teleport(world: World, e: Enemy, range: number): void {
  const b = world.arena.bounds
  spawnPoof(world, e.x, e.y, e.def.tint, 12)
  const a = world.rng.angle()
  const r = range * world.rng.range(0.7, 1.05)
  e.x = e.prevX = clamp(world.player.x + Math.cos(a) * r, b.x + e.radius, b.x + b.w - e.radius)
  e.y = e.prevY = clamp(world.player.y + Math.sin(a) * r, b.y + e.radius, b.y + b.h - e.radius)
  spawnPoof(world, e.x, e.y, e.def.tint, 12)
}

/** Queen spawns a brood burst of random offspring around herself. */
function spawnBrood(world: World, e: Enemy, brood: { ids: readonly string[]; count: number }): void {
  for (let i = 0; i < brood.count; i++) {
    const id = world.rng.pick(brood.ids)
    const a = world.rng.angle()
    const r = e.radius + world.rng.range(8, 30)
    spawnEnemy(world, id, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r)
  }
  spawnPoof(world, e.x, e.y, e.def.gibColor, 10)
}

/** Enemy ranged shot (spitter acid / stinger / psychic blast). */
function fireEnemyShot(world: World, e: Enemy, ux: number, uy: number): void {
  if (world.enemyProjectiles.size >= MAX_ENEMY_PROJECTILES) return
  const def = e.def
  const speed = def.projectileSpeed ?? 300
  const p = world.enemyProjectiles.acquire()
  p.x = p.prevX = e.x + ux * (e.radius + 4)
  p.y = p.prevY = e.y + uy * (e.radius + 4)
  p.vx = ux * speed
  p.vy = uy * speed
  p.facing = Math.atan2(uy, ux)
  p.damage = def.projectileDamage ?? 12
  p.radius = 7
  p.life = 3.5
  p.pierce = 0
  p.leavesAcid = def.leavesAcid ?? false

  const s = p.sprite
  s.visible = true
  s.alpha = 1
  s.tint = def.leavesAcid ? COLORS.acid : def.tint
  s.scale.set(1)
}
