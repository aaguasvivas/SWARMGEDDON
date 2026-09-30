import { HEALTH_DROP_CHANCE, HEALTH_HEAL, HEALTH_HEAL_ELITE } from '../config.ts'
import { distSq } from '../core/vec.ts'
import { PICKUP_WEAPON_IDS } from '../content/weapons.ts'
import {
  spawnChainArc,
  spawnExplosion,
  spawnGibs,
  spawnHitSpark,
  spawnImpact,
  spawnRing,
} from '../effects/fx.ts'
import { FF_AOE, FF_BOSS, FF_CONTACT, FF_CRIT, FF_DISCRETE, FF_ELITE, FF_RAM, FeelKind } from '../effects/feelQueue.ts'
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
        if (hasHit(p, e.uid)) continue
        p.hitUids[p.hitN & 7] = e.uid
        p.hitN++
        const crit = applyHit(world, e, p)
        spawnImpact(world, p.x, p.y)
        if (p.pierce > 0) {
          p.pierce--
        } else {
          if (p.explodeRadius > 0) explode(world, p.x, p.y, p.explodeRadius, crit ? p.explodeDamage * m.critMul : p.explodeDamage)
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
    // Skip enemies already killed by the projectile pass above (the pool isn't
    // swept until end of tick). Matters most for the charger's FLAT ram: you
    // shouldn't eat a 26-burst from a charger you killed on the same tick.
    if (!e.alive || e.submerged) continue
    const rr = e.radius + pl.radius
    if (distSq(e.x, e.y, pl.x, pl.y) < rr * rr) {
      // Charger windup/dash is NOT a chip: the telegraph (phase 1) is safe to
      // stand near, and the dash (phase 2) lands ONE solid ram if its locked
      // line catches you. That is the payoff for the tell (a fast dt-scaled pass would
      // otherwise be nearly free). Stalk/recover use normal contact.
      if (e.def.behavior === 'charger' && (e.phase === 1 || e.phase === 2)) {
        if (e.phase === 2 && !e.dashHit) {
          e.dashHit = true
          const ram = e.damage * (1 - m.damageReduction)
          pl.hp -= ram
          world.feel.emit(FeelKind.PlayerHurt, FF_DISCRETE | FF_RAM, e.x, e.y, ram, 0, e.def)
          if (m.thorns > 0) thornsDamage(world, e, m.thorns)
        }
        continue
      }
      const bite = e.damage * dt * (1 - m.damageReduction)
      pl.hp -= bite
      world.feel.emit(FeelKind.PlayerHurt, FF_CONTACT, e.x, e.y, bite, 0, e.def)
      if (m.thorns > 0) thornsDamage(world, e, m.thorns * dt)
    }
  }

  // Enemy acid/blast projectiles -> player (dodge can negate).
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    if (!p.alive) continue
    const rr = p.radius + pl.radius
    if (distSq(p.x, p.y, pl.x, pl.y) < rr * rr) {
      if (m.dodge > 0 && world.rngs.combat.float() < m.dodge) {
        p.alive = false
        continue
      }
      const hit = p.damage * (1 - m.damageReduction)
      pl.hp -= hit
      world.feel.emit(FeelKind.PlayerHurt, FF_DISCRETE, p.x, p.y, hit)
      if (p.leavesAcid) spawnAcidPool(world, p.x, p.y)
      p.alive = false
    }
  }

  handleDeath(world)
}

/** Whether `p` already struck the enemy with this uid (last 8 hits). */
function hasHit(p: Projectile, uid: number): boolean {
  const n = p.hitN < 8 ? p.hitN : 8
  const h = p.hitUids
  for (let i = 0; i < n; i++) if (h[i] === uid) return true
  return false
}

function rankFlags(e: Enemy): number {
  return e.def.boss ? FF_BOSS : e.def.elite ? FF_ELITE : 0
}

/** Giant Slayer's multiplier applies to every damage source on elites and bosses. */
function vsTarget(world: World, e: Enemy, dmg: number): number {
  return e.def.elite || e.def.boss ? dmg * world.mods.eliteDamageMul : dmg
}

/** Resolve one bullet hit. Returns whether it crit, so the bullet's AoE and
 *  chain inherit the same roll. */
function applyHit(world: World, e: Enemy, p: Projectile): boolean {
  const m = world.mods
  let dmg = p.damage
  const crit = m.critChance > 0 && world.rngs.combat.float() < m.critChance
  if (crit) dmg *= m.critMul

  // Beetle-style frontal armor.
  if (e.def.frontArmor) {
    const sp = Math.hypot(p.vx, p.vy) || 1
    const dot = (p.vx / sp) * Math.cos(e.facing) + (p.vy / sp) * Math.sin(e.facing)
    if (dot < -0.25) dmg *= 1 - e.def.frontArmor
  }

  dmg = vsTarget(world, e, dmg)

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
  // Damage-number jitter comes from the fx stream here, drawn on every hit,
  // so the stream never depends on how presentation caps or skips numbers.
  const jx = world.rngs.fx.range(-6, 6)
  world.feel.emit(FeelKind.Hit, (crit ? FF_CRIT : 0) | rankFlags(e), e.x + jx, e.y, dmg, e.uid, e)
  world.lastHitVx = p.vx
  world.lastHitVy = p.vy

  dealDamage(world, e, dmg)

  // Executioner: cull badly-wounded non-boss enemies outright.
  if (m.executeFrac > 0 && e.alive && !e.def.boss && e.hp <= e.maxHp * m.executeFrac) {
    dealDamage(world, e, e.hp)
  }

  if (p.chain > 0) chainLightning(world, e, p, (crit ? p.damage * m.critMul : p.damage) * 0.6)
  return crit
}

/** Apply raw damage and resolve death. Safe to call on the same enemy twice. */
function dealDamage(world: World, e: Enemy, dmg: number): void {
  if (!e.alive) return
  e.hp -= dmg
  e.flash = 0.07
  if (e.hp <= 0) killEnemy(world, e)
}

/** Thorns has no shot, so a thorns kill must not carry the last bullet's
 *  direction: a zero vector tells presentation to spray gibs radially. */
function thornsDamage(world: World, e: Enemy, dmg: number): void {
  world.lastHitVx = 0
  world.lastHitVy = 0
  dealDamage(world, e, dmg)
}

/** Chain lightning hops to nearby enemies (separate scratch buffer so it can run
 *  inside the projectile loop without clobbering its query). Each enemy is
 *  struck at most once per chain. */
function chainLightning(world: World, from: Enemy, p: Projectile, dmg: number): void {
  const buf2 = world.queryBuf2
  const seen = world.chainSeen
  seen[0] = from.uid
  let seenN = 1
  const hops = p.chain < seen.length - 1 ? p.chain : seen.length - 1
  const range2 = p.chainRange * p.chainRange
  let cx = from.x
  let cy = from.y
  for (let jump = 0; jump < hops; jump++) {
    const n = world.hash.query(cx, cy, p.chainRange, buf2)
    let best: Enemy | null = null
    let bestD = range2
    for (let k = 0; k < n; k++) {
      const o = buf2[k]!
      if (!o.alive || o.submerged) continue
      const dd = distSq(cx, cy, o.x, o.y)
      if (dd >= bestD) continue
      let dup = false
      for (let q = 0; q < seenN; q++) {
        if (seen[q] === o.uid) {
          dup = true
          break
        }
      }
      if (dup) continue
      bestD = dd
      best = o
    }
    if (!best) break
    seen[seenN++] = best.uid
    spawnChainArc(world, cx, cy, best.x, best.y)
    cx = best.x
    cy = best.y
    dealDamage(world, best, vsTarget(world, best, dmg))
  }
}

/** AoE explosion (rockets / explosive rounds). */
function explode(world: World, x: number, y: number, radius: number, dmg: number): void {
  spawnExplosion(world, x, y, radius)
  spawnRing(world, x, y, 0xffd27a, radius / 22)
  world.ichor.queueStamp(x, y, world.rngs.fx)
  world.feel.emit(FeelKind.Explosion, FF_AOE, x, y, radius)
  const buf2 = world.queryBuf2
  const n = world.hash.query(x, y, radius, buf2)
  for (let k = 0; k < n; k++) {
    const o = buf2[k]!
    if (!o.alive || o.submerged) continue
    if (distSq(x, y, o.x, o.y) < radius * radius) dealDamage(world, o, vsTarget(world, o, dmg))
  }
}

function killEnemy(world: World, e: Enemy): void {
  if (!e.alive) return
  e.alive = false
  world.kills++
  const def = e.def

  world.ichor.queueStamp(e.x, e.y, world.rngs.fx)
  spawnGibs(world, e.x, e.y, def.gibCount, e.gibTint, world.lastHitVx, world.lastHitVy)
  world.feel.emit(FeelKind.Kill, rankFlags(e), e.x, e.y, world.lastHitVx, world.lastHitVy, def)

  // Death-pop shockwave ring. Skip the xp-1 chaff so a swarm wipe stays clean
  // and cheap.
  if (def.boss) spawnRing(world, e.x, e.y, e.gibTint, 5.5)
  else if (def.elite) spawnRing(world, e.x, e.y, e.gibTint, 3)
  else if (def.xp >= 2) spawnRing(world, e.x, e.y, e.gibTint, 1.4)

  if (world.mods.lifestealPerKill > 0) {
    world.player.hp = Math.min(world.player.maxHp, world.player.hp + world.mods.lifestealPerKill)
  }

  dropGem(world, e.x, e.y, def.xp)

  // Perk-free sustain: kills can drop a medkit, biased toward HARD MOMENTS. The
  // lower your HP, the likelier a kill coughs one up, so a horde that's chipping
  // you down also feeds you the medkits to survive it, while a healthy player
  // gets almost none (the difficulty stays intact). Roll the RNG always (keeps
  // the daily stream deterministic), then gate on a danger-scaled threshold.
  const loot = world.rngs.loot
  const roll = loot.float()
  if (def.boss) {
    for (let i = 0; i < 5; i++) {
      const a = loot.angle()
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
    const rng = world.rngs.spawn
    for (let i = 0; i < count; i++) {
      const a = rng.angle()
      spawnEnemy(world, def.splitInto, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14)
    }
  }

  if (def.boss) {
    world.bossAlive = false
    world.boss = null
    explode(world, e.x, e.y, 140, 0)
    spawnWeaponDrop(world, e.x, e.y, loot.pick(PICKUP_WEAPON_IDS))
    for (let i = 0; i < 6; i++) {
      const a = loot.angle()
      dropGem(world, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, 20)
    }
    world.feel.emit(FeelKind.BossKill, FF_BOSS, e.x, e.y, 0, 0, def)
  } else if (def.elite && loot.bool(0.5)) {
    spawnWeaponDrop(world, e.x, e.y, loot.pick(PICKUP_WEAPON_IDS))
  }
}

/** Player death -> revive if available, else trigger the deferred game over. */
function handleDeath(world: World): void {
  const pl = world.player
  if (pl.hp > 0 || world.pendingGameOver) return

  if (world.mods.revives > world.revivesUsed) {
    world.revivesUsed++
    pl.hp = pl.maxHp * 0.5
    world.feel.emit(FeelKind.Revive, 0, pl.x, pl.y)
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
  world.feel.emit(FeelKind.PlayerDeath, 0, pl.x, pl.y)
  world.pendingGameOver = true
}
