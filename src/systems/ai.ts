import { ENEMY_SPEED_CEIL, MAX_ENEMIES, MAX_ENEMY_PROJECTILES, STREAM_EXIT_PAD } from '../config.ts'
import { clamp, hypot } from '../core/vec.ts'
import { AF_HASTED, AF_MOLTEN, AF_SHIELDED, HASTED, MOLTEN_EVERY, SHIELDED } from '../content/affixes.ts'
import { spawnPoof } from '../effects/fx.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import { spawnAcidPool } from './acid.ts'
import { bossStep } from './bossAI.ts'
import { spawnEnemy } from './spawn.ts'
import type { Enemy } from '../game/enemy.ts'
import type { World } from '../game/world.ts'

const SEPARATION = 0.9
/** Total gravity-well drag on the player, units/sec, hard-capped well below
 *  the slowest pilot's speed so the move stick always wins (phone fairness). */
export const MAX_WELL_PULL = 140

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
 * Bosses run bossAI. While the cage is up, its fence keeps every enemy but the
 * fight's brood outside, and only the brood may shoot.
 */
export function aiSystem(world: World, dt: number): void {
  const a = world.enemies.active
  const px = world.player.x
  const py = world.player.y
  const buf = world.queryBuf
  const cage = world.director.cage
  const fight = world.bossFights
  const speedCeil = ENEMY_SPEED_CEIL * world.speedMul
  let brood = 0

  // Aura + warper + gravity-well pass. Well pull is a pure function of
  // positions (zero RNG) accumulated here and applied by player.update.
  let warperActive = false
  let pullX = 0
  let pullY = 0
  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    if (e.def.aura && !e.submerged) applyAura(world, e, buf)
    if (e.def.warps && !e.submerged) warperActive = true
    const well = e.def.wellPull
    if (well && !e.submerged) {
      const wx = e.x - px
      const wy = e.y - py
      const wd = hypot(wx, wy)
      if (wd > 1 && wd < well.radius) {
        const k = (well.strength * (1 - wd / well.radius)) / wd
        pullX += wx * k
        pullY += wy * k
      }
    }
  }
  const pullMag = hypot(pullX, pullY)
  if (pullMag > MAX_WELL_PULL) {
    const s = MAX_WELL_PULL / pullMag
    pullX *= s
    pullY *= s
  }
  world.pullX = pullX
  world.pullY = pullY
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
    if (e.staggerT > 0) e.staggerT = Math.max(0, e.staggerT - dt)
    if (def.behavior === 'boss') {
      bossStep(world, e, dt)
      continue
    }
    const inFight = cage.active && e.brood === fight
    const caged = cage.active && !inFight
    if (inFight) brood++
    // FREEZE: every non-boss enemy stands still and holds fire.
    if (world.freezeT > 0) {
      e.vx = 0
      e.vy = 0
      continue
    }
    if (e.stream) {
      if (streamStep(world, e, dt) && caged) fence(e, cage)
      continue
    }
    if (e.affix !== 0) affixStep(world, e, dt)

    const dx = px - e.x
    const dy = py - e.y
    const d = hypot(dx, dy) || 1
    const ux = dx / d
    const uy = dy / d

    let mx = ux
    let my = uy
    let faceTarget = false
    let separate = true
    let facingOverride = Number.NaN // set by phase-driven behaviors (charger)
    let speedOverride = Number.NaN

    switch (def.behavior) {
      case 'charger': {
        // Telegraphed line-dash: heading LOCKS at windup start (aims at the
        // player's exact position, zero RNG), so a perpendicular sidestep
        // always dodges; the slow recover is the punish window.
        const ch = def.charge!
        if (e.phase === 0) {
          // stalk: normal seek until in range
          if (d <= ch.triggerRange) {
            e.phase = 1
            e.stateTimer = ch.windup
            e.phaseDir = Math.atan2(uy, ux)
            world.feel.emit(FeelKind.ChargerWindup, 0, e.x, e.y, e.phaseDir, 0, e)
          }
        } else if (e.phase === 1) {
          mx = 0
          my = 0
          separate = false // coil firmly in place: neighbors can't shove the
          // telegraph off its locked line (else the sprite faces one way and
          // slides another, and the dash launches from a drifted origin).
          facingOverride = e.phaseDir
          e.stateTimer -= dt
          if (e.stateTimer <= 0) {
            e.phase = 2
            e.stateTimer = ch.dashTime
            e.dashHit = false // fresh dash -> one ram available
          }
        } else if (e.phase === 2) {
          mx = Math.cos(e.phaseDir)
          my = Math.sin(e.phaseDir)
          facingOverride = e.phaseDir
          speedOverride = ch.dashSpeed
          separate = false // a dash is a committed line
          e.stateTimer -= dt
          if (e.stateTimer <= 0) {
            e.phase = 3
            e.stateTimer = ch.recover
          }
        } else {
          speedOverride = e.speed * 0.3 // sluggish recover drift
          e.stateTimer -= dt
          if (e.stateTimer <= 0) e.phase = 0
        }
        break
      }

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
          e.fireTimer = (def.fireCooldown ?? 2) * cooldownMul(e)
          if (!caged) fireEnemyShot(world, e, ux, uy)
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
          e.fireTimer = (def.fireCooldown ?? 2.4) * cooldownMul(e)
          if (!caged) fireEnemyShot(world, e, ux, uy)
        }
        e.stateTimer -= dt
        if (e.stateTimer <= 0 && def.teleport) {
          e.stateTimer = def.teleport.cooldown * cooldownMul(e)
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
            spawnPoof(world, e.x, e.y, def.gibColor, 8)
          } else {
            e.submerged = true
            e.stateTimer = def.burrow.underTime
          }
        }
        separate = !e.submerged
        break
      }

      case 'egg':
        mx = 0
        my = 0
        separate = false
        if (world.time - e.bornAt >= def.hatch!.after) hatch(world, e)
        break
      // 'chaser' and 'splitter' use the default seek + separation.
    }

    // Effective speed with slow / buff / burrow / enrage modifiers. A phase
    // override (charger dash/recover) replaces the base but keeps modifiers,
    // so cryo slow still bites a dash.
    let spd = Number.isNaN(speedOverride) ? e.speed : speedOverride
    if (e.slow > 0) spd *= 1 - e.slowFactor
    if (e.buffed > 0) spd *= e.buffedMul
    if (def.behavior === 'burrower' && e.submerged && def.burrow) spd *= def.burrow.underSpeedMul
    // Math.min keeps `spd` a raw double: merging the imported constant itself
    // (an untyped module binding) into it would box it for every enemy.
    if (!(def.behavior === 'charger' && e.phase === 2)) spd = Math.min(spd, speedCeil)
    // Overpressure stagger stops the body in place, facing kept; its timers
    // keep running.
    if (e.staggerT > 0) {
      spd = 0
      if (Number.isNaN(facingOverride) && !faceTarget) facingOverride = e.facing
    }

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

    const ml = hypot(mx, my) || 1
    e.vx = (mx / ml) * spd
    e.vy = (my / ml) * spd
    e.x += e.vx * dt
    e.y += e.vy * dt
    e.facing = Number.isNaN(facingOverride)
      ? faceTarget
        ? Math.atan2(uy, ux)
        : Math.atan2(e.vy, e.vx)
      : facingOverride
    if ((e.affix & AF_SHIELDED) !== 0) e.facing = turnToward(e.prevFacing, e.facing, SHIELDED.turnRate * dt)

    if (caged) fence(e, cage)
  }
  world.director.broodCount = brood
}

/** The cage fence: an enemy outside the fight stays outside the ring. */
function fence(e: Enemy, cage: { x: number; y: number; r: number }): void {
  const fx = e.x - cage.x
  const fy = e.y - cage.y
  const min = cage.r + e.radius
  const d2 = fx * fx + fy * fy
  if (d2 >= min * min) return
  const fd = Math.sqrt(d2)
  if (fd > 1e-6) {
    e.x = cage.x + (fx / fd) * min
    e.y = cage.y + (fy / fd) * min
  } else {
    e.x = cage.x + min
    e.y = cage.y
  }
}

/**
 * STREAM mode (section 4.7): the locked heading at the authored speed plus the
 * lateral wobble; only cryo slows it, and the speed ceiling does not apply. At
 * its TTL, or STREAM_EXIT_PAD past the arena wall it heads through, the unit
 * leaves with no credit (a wall that starts past the arena walks in). Returns
 * false when it left.
 */
function streamStep(world: World, e: Enemy, dt: number): boolean {
  const b = world.arena.bounds
  e.ttl -= dt
  if (e.ttl <= 0) {
    e.alive = false
    spawnPoof(world, e.x, e.y, e.gibTint, 4)
    return false
  }
  const hx = Math.cos(e.phaseDir)
  const hy = Math.sin(e.phaseDir)
  if (
    (hx < -1e-6 && e.x < b.x - STREAM_EXIT_PAD) || (hx > 1e-6 && e.x > b.x + b.w + STREAM_EXIT_PAD) ||
    (hy < -1e-6 && e.y < b.y - STREAM_EXIT_PAD) || (hy > 1e-6 && e.y > b.y + b.h + STREAM_EXIT_PAD)
  ) {
    e.alive = false
    return false
  }
  const lat = e.wobAmp !== 0 ? e.wobAmp * Math.cos(e.wobFreq * (world.time - e.bornAt) + e.wobPhase) : 0
  const k = e.slow > 0 ? 1 - e.slowFactor : 1
  e.vx = (hx * e.speed - hy * lat) * k
  e.vy = (hy * e.speed + hx * lat) * k
  e.x += e.vx * dt
  e.y += e.vy * dt
  e.facing = e.phaseDir
  return true
}

/** MOLTEN drops a pool on its cadence (acid.ts checks MAX_ACID before any draw). */
function affixStep(world: World, e: Enemy, dt: number): void {
  if ((e.affix & AF_MOLTEN) !== 0) {
    e.affixT -= dt
    if (e.affixT <= 0) {
      e.affixT += MOLTEN_EVERY
      spawnAcidPool(world, e.x, e.y)
    }
  }
}

function cooldownMul(e: Enemy): number {
  return (e.affix & AF_HASTED) !== 0 ? HASTED.cooldownMul : 1
}

/** `from` turned toward `to` by at most `max` radians, the short way round. */
function turnToward(from: number, to: number, max: number): number {
  let d = to - from
  d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2
  return d > max ? from + max : d < -max ? from - max : to
}

/**
 * An elite's affixes, set once at spawn (A9): HASTED speed and cooldowns,
 * SHIELDED front armor, the first MOLTEN pool a full cadence away.
 */
export function applyAffixes(e: Enemy, mask: number): void {
  e.affix = mask
  e.affixT = MOLTEN_EVERY
  if ((mask & AF_HASTED) !== 0) {
    e.speed *= HASTED.speedMul
    e.fireTimer *= HASTED.cooldownMul
    if (e.def.teleport) e.stateTimer *= HASTED.cooldownMul
  }
  if ((mask & AF_SHIELDED) !== 0) e.armor = Math.max(e.armor, SHIELDED.armor)
}

/** An egg hatches into its brood where it lies; the egg itself gives no credit. */
function hatch(world: World, e: Enemy): void {
  const h = e.def.hatch!
  e.alive = false
  if (world.enemies.size >= MAX_ENEMIES - 20) return
  const rng = world.rngs.spawn
  for (let i = 0; i < h.count; i++) {
    const a = rng.angle()
    const s = spawnEnemy(world, h.into, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14)
    if (s) s.brood = e.brood
  }
  spawnPoof(world, e.x, e.y, e.gibTint, 6)
}

/** Aura source: refresh a short buff on all enemies within its radius, stamping
 *  its OWN speed multiplier (per-def: hivemind 1.35, deep caller 1.5). When
 *  auras overlap within a frame, the stronger multiplier wins. */
function applyAura(world: World, src: Enemy, buf: Enemy[]): void {
  const radius = src.def.aura!.radius
  const mul = src.def.aura!.speedMul
  const n = world.hash.query(src.x, src.y, radius, buf)
  for (let j = 0; j < n; j++) {
    const o = buf[j]!
    if (o === src) continue
    const dx = o.x - src.x
    const dy = o.y - src.y
    if (dx * dx + dy * dy <= radius * radius) {
      o.buffedMul = o.buffed > 0 ? Math.max(o.buffedMul, mul) : mul
      o.buffed = Math.max(o.buffed, 0.3)
    }
  }
}

/** Teleporter blinks to a fresh spot at `range` around the player. */
function teleport(world: World, e: Enemy, range: number): void {
  const b = world.arena.bounds
  spawnPoof(world, e.x, e.y, e.def.tint, 12)
  const rng = world.rngs.spawn
  const a = rng.angle()
  const r = range * rng.range(0.7, 1.05)
  e.x = e.prevX = clamp(world.player.x + Math.cos(a) * r, b.x + e.radius, b.x + b.w - e.radius)
  e.y = e.prevY = clamp(world.player.y + Math.sin(a) * r, b.y + e.radius, b.y + b.h - e.radius)
  spawnPoof(world, e.x, e.y, e.def.tint, 12)
  world.feel.emit(FeelKind.Teleport, 0, e.x, e.y, 0, 0, e.def)
}

/** Enemy ranged shot (spitter acid / stinger / psychic blast). None once the
 *  player's death sequence starts: projectileSystem is off then, so a new shot
 *  would hang frozen in the air (the boss idles in it too, bossStep). */
function fireEnemyShot(world: World, e: Enemy, ux: number, uy: number): void {
  if (world.pendingGameOver || world.enemyProjectiles.size >= MAX_ENEMY_PROJECTILES) return
  const def = e.def
  const speed = def.projectileSpeed ?? 300
  const p = world.enemyProjectiles.acquire()
  p.x = p.prevX = e.x + ux * (e.radius + 4)
  p.y = p.prevY = e.y + uy * (e.radius + 4)
  p.vx = ux * speed
  p.vy = uy * speed
  p.facing = Math.atan2(uy, ux)
  p.damage = (def.projectileDamage ?? 12) * (def.boss ? world.runDmgMul : world.dmgMul)
  p.radius = 7
  p.life = 3.5
  p.pierce = 0
  p.leavesAcid = def.leavesAcid ?? false
  p.ownerIdx = def.idx

  const q = p.quad
  q.alpha = 1
  // Hazard projectiles wear the ARENA's hazard color (acid green / magma
  // orange); others keep their body tint. Presentation only.
  q.tint = def.leavesAcid ? world.arenaTheme.hazardTint : def.tint
  q.scaleX = q.scaleY = 1
  world.feel.emit(FeelKind.EnemyShot, 0, p.x, p.y, p.facing, 0, def)
}
