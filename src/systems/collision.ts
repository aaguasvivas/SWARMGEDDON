import { HEALTH_DROP_CHANCE, HEALTH_HEAL, HEALTH_HEAL_ELITE } from '../config.ts'
import { distSq } from '../core/vec.ts'
import { PICKUP_WEAPON_IDS } from '../content/weapons.ts'
import {
  announce,
  spawnChainArc,
  spawnDamageNumber,
  spawnExplosion,
  spawnGibs,
  spawnHitSpark,
  spawnImpact,
  spawnRing,
} from '../effects/fx.ts'
import { spawnAcidPool } from './acid.ts'
import { dropGem, dropHealth, spawnWeaponDrop } from './pickups.ts'
import { spawnEnemy } from './spawn.ts'
import type { Enemy } from '../game/enemy.ts'
import type { Projectile } from '../game/projectile.ts'
import type { World } from '../game/world.ts'

const ENEMY_MAX_RADIUS = 48 // padding for broad-phase (queen is large)

/**
 * All circle-overlap resolution for the tick: player projectiles vs enemies
 * (crit, armor, slow, chain, explosion, pierce), enemy contact + thorns, enemy
 * acid projectiles vs player (dodge), and player death (with revives) -> game
 * over. Submerged burrowers are intangible.
 */
export function collisionSystem(world: World, dt: number): void {
  const buf = world.queryBuf
  const m = world.mods
  const pl = world.player

  // Player projectiles vs enemies.
  const projs = world.projectiles.active
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i]!
    if (!p.alive) continue
    const n = world.hash.query(p.x, p.y, p.radius + ENEMY_MAX_RADIUS, buf)
    for (let j = 0; j < n; j++) {
      const e = buf[j]!
      if (!e.alive || e.submerged) continue
      const rr = p.radius + e.radius
      if (distSq(p.x, p.y, e.x, e.y) < rr * rr) {
        applyHit(world, e, p)
        spawnImpact(world, p.x, p.y)
        if (p.pierce > 0) {
          p.pierce--
        } else {
          if (p.explodeRadius > 0) explode(world, p.x, p.y, p.explodeRadius, p.explodeDamage)
          p.alive = false
          break
        }
      }
    }
  }

  // Enemy contact -> continuous player damage (+ thorns back).
  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    if (e.submerged) continue
    const rr = e.radius + pl.radius
    if (distSq(e.x, e.y, pl.x, pl.y) < rr * rr) {
      pl.hp -= e.damage * dt * (1 - m.damageReduction)
      world.hurtFlash = Math.min(0.7, world.hurtFlash + e.damage * dt * 0.05)
      world.juice.addTrauma(0.02)
      if (m.thorns > 0) dealDamage(world, e, m.thorns * dt)
    }
  }

  // Enemy acid/blast projectiles -> player (dodge can negate).
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    if (!p.alive) continue
    const rr = p.radius + pl.radius
    if (distSq(p.x, p.y, pl.x, pl.y) < rr * rr) {
      if (m.dodge > 0 && world.rng.float() < m.dodge) {
        p.alive = false
        continue
      }
      pl.hp -= p.damage * (1 - m.damageReduction)
      world.hurtFlash = Math.min(0.85, world.hurtFlash + 0.3)
      world.juice.addTrauma(0.08)
      if (p.leavesAcid) spawnAcidPool(world, p.x, p.y)
      p.alive = false
    }
  }

  handleDeath(world)
}

function applyHit(world: World, e: Enemy, p: Projectile): void {
  const m = world.mods
  let dmg = p.damage
  const crit = m.critChance > 0 && world.rng.float() < m.critChance
  if (crit) dmg *= m.critMul

  // Beetle-style frontal armor.
  if (e.def.frontArmor) {
    const sp = Math.hypot(p.vx, p.vy) || 1
    const dot = (p.vx / sp) * Math.cos(e.facing) + (p.vy / sp) * Math.sin(e.facing)
    if (dot < -0.25) dmg *= 1 - e.def.frontArmor
  }

  // Giant Slayer: bonus damage vs elites & bosses.
  if (m.eliteDamageMul !== 1 && (e.def.elite || e.def.boss)) dmg *= m.eliteDamageMul

  // Knockback nudge (heavier enemies shrug it off).
  const sp = Math.hypot(p.vx, p.vy) || 1
  const k = (p.knockback * 0.02) / (e.radius / 14)
  e.x += (p.vx / sp) * k
  e.y += (p.vy / sp) * k

  if (m.slowOnHit > 0) {
    e.slow = 1.2
    e.slowFactor = m.slowOnHit
  }

  spawnHitSpark(world, p.x, p.y, p.vx, p.vy)
  spawnDamageNumber(world, e.x, e.y, dmg, crit)
  world.audio.play('hit')

  dealDamage(world, e, dmg)

  // Executioner: cull badly-wounded non-boss enemies outright.
  if (m.executeFrac > 0 && e.alive && !e.def.boss && e.hp <= e.maxHp * m.executeFrac) {
    dealDamage(world, e, e.hp)
  }

  if (p.chain > 0) chainLightning(world, e, p, dmg * 0.6)
}

/** Apply raw damage and resolve death. Safe to call on the same enemy twice. */
function dealDamage(world: World, e: Enemy, dmg: number): void {
  if (!e.alive) return
  e.hp -= dmg
  e.flash = 0.07
  if (e.hp <= 0) killEnemy(world, e)
}

/** Chain lightning hops to nearby enemies (separate scratch buffer so it can run
 *  inside the projectile loop without clobbering its query). */
function chainLightning(world: World, from: Enemy, p: Projectile, dmg: number): void {
  const buf2 = world.queryBuf2
  let cx = from.x
  let cy = from.y
  let prev: Enemy = from
  for (let jump = 0; jump < p.chain; jump++) {
    const n = world.hash.query(cx, cy, p.chainRange, buf2)
    let best: Enemy | null = null
    let bestD = Infinity
    for (let k = 0; k < n; k++) {
      const o = buf2[k]!
      if (!o.alive || o.submerged || o === from || o === prev) continue
      const dd = distSq(cx, cy, o.x, o.y)
      if (dd < bestD) {
        bestD = dd
        best = o
      }
    }
    if (!best) break
    spawnChainArc(world, cx, cy, best.x, best.y)
    cx = best.x
    cy = best.y
    prev = best
    dealDamage(world, best, dmg)
  }
}

/** AoE explosion (rockets / explosive rounds). */
function explode(world: World, x: number, y: number, radius: number, dmg: number): void {
  spawnExplosion(world, x, y, radius)
  spawnRing(world, x, y, 0xffd27a, radius / 22)
  world.ichor.queueStamp(x, y, world.rng)
  world.juice.addTrauma(0.18)
  world.audio.play('heavy')
  const buf2 = world.queryBuf2
  const n = world.hash.query(x, y, radius, buf2)
  for (let k = 0; k < n; k++) {
    const o = buf2[k]!
    if (!o.alive || o.submerged) continue
    if (distSq(x, y, o.x, o.y) < radius * radius) dealDamage(world, o, dmg)
  }
}

function killEnemy(world: World, e: Enemy): void {
  if (!e.alive) return
  e.alive = false
  world.kills++
  const def = e.def

  world.ichor.queueStamp(e.x, e.y, world.rng)
  spawnGibs(world, e.x, e.y, def.gibCount, def.gibColor)
  world.audio.play('kill')

  // Big-kill juice (hit-stop freeze + heavy shake) only lands when the death is
  // actually VISIBLE. An elite dying off-screen (ricochets, explosions, the wide
  // spawn ring) used to freeze the sim for 3 frames with no visible cause —
  // which players feel as an unexplained movement stutter, not as impact.
  // camX/viewW are render state, but they only gate cosmetic time/shake here —
  // never sim content or the sim RNG stream.
  const onScreen =
    e.x > world.camX - 90 && e.x < world.camX + world.viewW + 90 &&
    e.y > world.camY - 90 && e.y < world.camY + world.viewH + 90
  world.juice.addTrauma(def.boss ? 0.6 : def.elite && onScreen ? 0.2 : 0.05)

  // Death-pop shockwave ring (+ a punchy hit-stop on the big ones). Skip the
  // xp-1 chaff so a swarm wipe stays clean and cheap.
  if (def.boss) {
    spawnRing(world, e.x, e.y, def.gibColor, 5.5)
    world.juice.addHitstop(0.12)
  } else if (def.elite) {
    spawnRing(world, e.x, e.y, def.gibColor, 3)
    if (onScreen) world.juice.addHitstop(0.05)
  } else if (def.xp >= 2) {
    spawnRing(world, e.x, e.y, def.gibColor, 1.4)
  }

  if (world.mods.lifestealPerKill > 0) {
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + world.mods.lifestealPerKill)
  }

  dropGem(world, e.x, e.y, def.xp)

  // Perk-free sustain: kills can drop a medkit, biased toward HARD MOMENTS. The
  // lower your HP, the likelier a kill coughs one up — so a horde that's chipping
  // you down also feeds you the medkits to survive it, while a healthy player
  // gets almost none (the difficulty stays intact). Roll the RNG always (keeps
  // the daily stream deterministic), then gate on a danger-scaled threshold.
  const roll = world.rng.float()
  if (def.boss) {
    for (let i = 0; i < 5; i++) {
      const a = world.rng.angle()
      dropHealth(world, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, HEALTH_HEAL_ELITE)
    }
  } else if (def.elite) {
    dropHealth(world, e.x, e.y, HEALTH_HEAL_ELITE)
  } else {
    const hpFrac = world.player.hp / world.player.maxHp
    if (hpFrac < 0.985) {
      // ~1x base at full HP up to ~4x near death.
      const chance = HEALTH_DROP_CHANCE * (1 + (1 - hpFrac) * 3)
      if (roll < chance) dropHealth(world, e.x, e.y, HEALTH_HEAL)
    }
  }

  if (def.behavior === 'splitter' && def.splitInto) {
    const count = def.splitCount ?? 2
    for (let i = 0; i < count; i++) {
      const a = world.rng.angle()
      spawnEnemy(world, def.splitInto, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14)
    }
  }

  if (def.boss) {
    world.bossAlive = false
    world.boss = null
    explode(world, e.x, e.y, 140, 0)
    world.juice.addTrauma(1)
    spawnWeaponDrop(world, e.x, e.y, world.rng.pick(PICKUP_WEAPON_IDS))
    for (let i = 0; i < 6; i++) {
      const a = world.rng.angle()
      dropGem(world, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, 20)
    }
    announce(world, 'QUEEN SLAIN', e.x, e.y - 36, 0xffe066)
  } else if (def.elite && world.rng.bool(0.5)) {
    spawnWeaponDrop(world, e.x, e.y, world.rng.pick(PICKUP_WEAPON_IDS))
  }
}

/** Player death -> revive if available, else trigger the deferred game over. */
function handleDeath(world: World): void {
  const pl = world.player
  if (pl.hp > 0 || world.pendingGameOver) return

  if (world.mods.revives > world.revivesUsed) {
    world.revivesUsed++
    pl.hp = pl.maxHp * 0.5
    world.hurtFlash = 1
    world.juice.addTrauma(0.8)
    world.audio.play('levelup')
    announce(world, 'SECOND WIND', pl.x, pl.y - 30, 0x7dffd6)
    // Shove nearby enemies back so the revive isn't instant death.
    const enemies = world.enemies.active
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      const dx = e.x - pl.x
      const dy = e.y - pl.y
      const d = Math.hypot(dx, dy) || 1
      if (d < 220) {
        e.x += (dx / d) * (220 - d)
        e.y += (dy / d) * (220 - d)
      }
    }
    return
  }

  pl.hp = 0
  world.hurtFlash = 1
  world.juice.addTrauma(1)
  world.juice.addHitstop(0.16)
  world.audio.play('death')
  world.pendingGameOver = true
}
