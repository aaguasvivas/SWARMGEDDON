import {
  ARC_ROUNDS, BITE, BLAST_CRIT, BLAST_NO_BONUS, BONUS_FX, BOSS_SLOW_CAP, BURN_SEC, CLOSE_CALL, CORES, ENEMY_EMERGE, EVO,
  FUSION, GRACE, HEALTH_DROP_CHANCE, HEALTH_HEAL, HEALTH_HEAL_ELITE, MAX_ENEMIES, PODS, SEEK, SPAWN_ROOM,
} from '../config.ts'
import { distSq, hypot } from '../core/vec.ts'
import { AF_BROOD, AF_VOLATILE, BROOD, VOLATILE } from '../content/affixes.ts'
import { powi } from '../content/perks.ts'
import { SCARCITY } from '../content/threat.ts'
import {
  spawnChainArc,
  spawnExplosion,
  spawnGibs,
  spawnHitSpark,
  spawnImpact,
  spawnRing,
} from '../effects/fx.ts'
import { FF_AOE, FF_BOSS, FF_CRIT, FF_ELITE, FF_RAM, FeelKind } from '../effects/feelQueue.ts'
import { spawnAcidPool } from './acid.ts'
import { queueBlast, drainBlasts } from './blasts.ts'
import { bonusOnKill } from './bonuses.ts'
import { coreRow } from './cores.ts'
import { hurtPlayer, killHeal, refillKillHeal } from './damage.ts'
import { closeCall, closeCallArmed } from './dash.ts'
import { dropBossPod, dropGem, dropHealth, dropHiveCore, dropPod, dropShard } from './pickups.ts'
import { directorBossKilled } from './director.ts'
import { spawnHazard } from './hazards.ts'
import { spawnEnemy } from './spawn.ts'
import { HZ_CIRCLE } from '../game/hazard.ts'
import { KillSource, scoreKill } from '../game/scoring.ts'
import type { Enemy } from '../game/enemy.ts'
import { tickDown } from '../game/player.ts'
import type { Projectile } from '../game/projectile.ts'
import type { World } from '../game/world.ts'

const ENEMY_MAX_RADIUS = 58 // broad-phase padding: the largest body (EMBER TYRANT PRIME)
/** Section 6.5: a boss dies in this many gibs. */
const BOSS_KILL_GIBS = 40
/** world.time accumulates FIXED_DT, so 27 ticks can land a hair under ENEMY_EMERGE. */
const EMERGE_EPS = 1e-6
/** XP multiplier of the kill being resolved (GUILLOTINE culls drop double). */
let killXpMul = 1
/** The damage being resolved: a NUKE's outright kill (scores nothing), a NUKE
 *  hit (flat: no FREEZE or INFERNO multiplier), or damage from a NUKE or a
 *  FIREBLAST shot (its kills, and the blasts and burns they set off, drop no bonus). */
let killSrc = KillSource.Weapon
let flatHit = false
let killNoBonus = false

/** BLAST_NO_BONUS while the damage being resolved may drop no bonus. */
function noBonusFlag(): number {
  return killNoBonus ? BLAST_NO_BONUS : 0
}

/**
 * All circle-overlap resolution for the tick: player projectiles vs enemies
 * (crit, armor, slow, burn, stagger, chain, explosion, pierce, seek bounce,
 * evolved behaviors), burn ticks, RAM, enemy contact bites + rams + thorns,
 * enemy projectiles vs player, Close Calls, the blast queue, and player death
 * (with revives) -> game over. Submerged burrowers are intangible.
 */
export function collisionSystem(world: World, dt: number): void {
  const buf = world.queryBuf
  const m = world.mods
  const pl = world.player
  refillKillHeal(world, dt)

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
        killNoBonus = p.noBonus
        const crit = applyHit(world, e, p)
        spawnImpact(world, p.x, p.y)
        if (p.pierce > 0) {
          p.pierce--
        } else if (p.bounces > 0 && seekBounce(world, p)) {
          break
        } else {
          if (p.explodeRadius > 0) {
            const dmg = crit ? p.explodeDamage * m.critMul : p.explodeDamage
            explode(world, p.x, p.y, p.explodeRadius, dmg)
            if (p.evo === 'bomblets') queueBomblets(world, p, dmg)
          }
          p.alive = false
          break
        }
      }
    }
  }
  killNoBonus = false

  // Enemy contact: one bite per BITE.window from the top 3 overlapping
  // enemies, charger rams as discrete hits, thorns back on every toucher.
  let armed = closeCallArmed(world)
  let b1 = 0
  let b2 = 0
  let b3 = 0
  let bx = 0
  let by = 0
  let bIdx = -1
  const ramming = m.ram > 0 && m.thorns > 0 && pl.dashTicks > 0
  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    // Skip enemies already killed by the projectile pass above (the pool isn't
    // swept until end of tick). Matters most for the charger's FLAT ram: you
    // shouldn't eat a 26-burst from a charger you killed on the same tick.
    if (!e.alive) continue
    if (e.burnT > 0) {
      burnTick(world, e, dt)
      if (!e.alive) continue
    }
    if (e.submerged) continue
    const d2 = distSq(e.x, e.y, pl.x, pl.y)
    const rr = e.radius + pl.radius
    if (ramming && e.ramStamp !== world.dashSeq) {
      const rp = rr + FUSION.ramPad
      if (d2 < rp * rp) {
        ramHit(world, e)
        if (!e.alive) continue
      }
    }
    // FREEZE: frozen enemies neither bite nor ram (thorns still hurt them).
    if (world.freezeT > 0 && !e.def.boss) {
      if (d2 < rr * rr && m.thorns > 0) thornsDamage(world, e, m.thorns * dt)
      continue
    }
    // Authored boss damage never takes the time ramp (docs/NEXT-LEVEL.md 4.1).
    const mul = e.def.boss ? world.runDmgMul : world.dmgMul
    if (d2 >= rr * rr) {
      if (armed && e.def.burrow && surfacedNear(e, d2)) {
        closeCall(world)
        armed = false
      }
      continue
    }
    // Charger windup/dash is NOT a bite: the telegraph (phase 1) is safe to
    // stand near, and the dash (phase 2) lands ONE solid ram if its locked
    // line catches you. That is the payoff for the tell. Stalk/recover bite.
    if (e.def.behavior === 'charger' && (e.phase === 1 || e.phase === 2)) {
      if (e.phase === 2 && !e.dashHit) {
        if (armed) {
          closeCall(world)
          armed = false
        }
        if (hurtPlayer(world, e.damage * mul, 'discrete', e.def.idx, e.x, e.y, FF_RAM) > 0) {
          e.dashHit = true
          if (m.thorns > 0) thornsDamage(world, e, m.thorns)
        }
      }
      continue
    }
    if (armed && (e.def.elite || e.def.boss || (e.def.burrow && surfacedNear(e, d2)))) {
      closeCall(world)
      armed = false
    }
    // Still emerging (decision 6): an arrival inside the view never bites before it has fully appeared.
    const v = world.time - e.bornAt + EMERGE_EPS >= ENEMY_EMERGE ? e.damage * BITE.scale * mul : 0
    if (v > b1) {
      b3 = b2
      b2 = b1
      b1 = v
      bx = e.x
      by = e.y
      bIdx = e.def.idx
    } else if (v > b2) {
      b3 = b2
      b2 = v
    } else if (v > b3) {
      b3 = v
    }
    if (m.thorns > 0) thornsDamage(world, e, m.thorns * dt)
  }
  if (b1 > 0 && pl.biteCd <= 0 && pl.invuln <= 0) {
    const bite = Math.min(b1 + BITE.w2 * b2 + BITE.w3 * b3, BITE.capFracOfMaxHp * pl.maxHp)
    hurtPlayer(world, bite, 'bite', bIdx, bx, by)
    pl.biteCd = BITE.window
  }

  // Enemy projectiles -> player. A shot the player's i-frames ignore flies on.
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    if (!p.alive) continue
    const rr = p.radius + pl.radius
    if (distSq(p.x, p.y, pl.x, pl.y) < rr * rr) {
      if (armed) {
        closeCall(world)
        armed = false
      }
      if (hurtPlayer(world, p.damage, 'discrete', p.ownerIdx, p.x, p.y) > 0) {
        if (p.leavesAcid) spawnAcidPool(world, p.x, p.y)
        p.alive = false
      }
    }
  }

  drainBlasts(world)
  handleDeath(world)
}

/** A burrower that surfaced within CLOSE_CALL.surfacedWithin with its body
 *  within CLOSE_CALL.surfacedDist of the player (d2 = center distance²). */
function surfacedNear(e: Enemy, d2: number): boolean {
  const b = e.def.burrow!
  if (e.stateTimer <= b.surfaceTime - CLOSE_CALL.surfacedWithin) return false
  const r = e.radius + CLOSE_CALL.surfacedDist
  return d2 < r * r
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

/** Giant Slayer's multiplier applies to every damage source on elites and
 *  bosses, and COLD BLOOD adds its bonus while they are slowed. */
function vsTarget(world: World, e: Enemy, dmg: number): number {
  if (!e.def.elite && !e.def.boss) return dmg
  const m = world.mods
  const d = dmg * m.eliteDamageMul
  return m.coldBlood > 0 && e.slow > 0 ? d * FUSION.coldBloodMul : d
}

/** Resolve one bullet hit. Returns whether it crit, so the bullet's AoE and
 *  chain inherit the same roll. */
function applyHit(world: World, e: Enemy, p: Projectile): boolean {
  const m = world.mods
  let dmg = p.damage
  const crit = p.evo === 'firstHitCrit' && p.hitN === 1 ? true : m.critChance > 0 && world.rngs.combat.float() < m.critChance
  if (crit) dmg *= m.critMul
  const sp = hypot(p.vx, p.vy) || 1

  switch (p.evo) {
    case 'pointBlank':
      if (p.age < EVO.pointBlankSec) dmg *= EVO.pointBlankMul
      break
    case 'pierceRamp': {
      const r = powi(EVO.pierceRampMul, p.hitN - 1)
      dmg *= r < EVO.pierceRampMax ? r : EVO.pierceRampMax
      break
    }
    case 'rangeRamp': {
      const r = (EVO.rangeRampPer100 * p.age * sp) / 100
      dmg *= 1 + (r < EVO.rangeRampMax ? r : EVO.rangeRampMax)
      break
    }
    case 'lockOn':
      dmg *= lockOnMul(world, e.uid)
      break
  }

  // Frontal armor (beetles, SHIELDED elites); HEADHUNTER crits ignore it.
  if (e.armor > 0 && !(crit && m.headhunter > 0)) {
    const dot = (p.vx / sp) * Math.cos(e.facing) + (p.vy / sp) * Math.sin(e.facing)
    if (dot < -0.25) dmg *= 1 - e.armor
  }

  // HEADHUNTER's blast takes the elite multipliers at each of its own targets.
  const blastBase = dmg
  dmg = vsTarget(world, e, dmg)

  // Knockback nudge (heavier enemies shrug it off).
  const k = (p.knockback * 0.02) / (e.radius / 14)
  e.x += (p.vx / sp) * k
  e.y += (p.vy / sp) * k

  spawnHitSpark(world, p.x, p.y, p.vx, p.vy)
  // Damage-number jitter comes from the fx stream here, drawn on every hit,
  // so the stream never depends on how presentation caps or skips numbers.
  const jx = world.rngs.fx.range(-6, 6)
  world.feel.emit(FeelKind.Hit, (crit ? FF_CRIT : 0) | rankFlags(e), e.x + jx, e.y, dmg, e.uid, e)
  world.lastHitVx = p.vx
  world.lastHitVy = p.vy

  dealDamage(world, e, dmg)

  // Executioner culls badly hurt non-elites; GUILLOTINE adds elites at half
  // the threshold, and its culls drop double XP.
  if (m.executeFrac > 0 && e.alive && !e.def.boss) {
    const frac = !e.def.elite ? m.executeFrac : m.guillotine > 0 ? m.executeFrac * FUSION.guillotineEliteFrac : 0
    if (e.hp <= e.maxHp * frac) {
      killXpMul = m.guillotine > 0 ? FUSION.guillotineXpMul : 1
      dealDamage(world, e, e.hp)
      killXpMul = 1
    }
  }

  // On-hit effects land after the damage, so a kill resolves against the
  // state before this hit (SHATTER needs an enemy slowed before it dies).
  if (!e.alive) {
    if (p.evo === 'pierceOnKill') p.pierce++
    if (crit && m.headhunter > 0) queueBlast(world, e.x, e.y, FUSION.headhunterR, blastBase * FUSION.headhunterFrac, 0, BLAST_CRIT | noBonusFlag())
  } else {
    if (m.slowOnHit > 0) {
      e.slow = 1.2
      e.slowFactor = e.def.boss && m.slowOnHit > BOSS_SLOW_CAP ? BOSS_SLOW_CAP : m.slowOnHit
    }
    if (m.staggerT > e.staggerT && !e.def.elite && !e.def.boss) e.staggerT = m.staggerT
    if (m.burnDps > 0) ignite(e, m.burnDps * m.damageMul)
    if (p.evo === 'ignite') ignite(e, EVO.igniteDps * m.damageMul)
  }

  const hit = crit ? p.damage * m.critMul : p.damage
  if (p.chain > 0) {
    const storm = p.evo === 'stormChain'
    chainLightning(world, e, p.chain, p.chainRange, hit * (storm ? EVO.stormChainFrac : 0.6), storm ? hit * EVO.stormBlastFrac : 0)
  } else if (m.arcChance > 0 && world.rngs.combat.float() < m.arcChance) {
    chainLightning(world, e, m.arcHops, ARC_ROUNDS.range, hit * ARC_ROUNDS.dmgFrac, 0)
  }
  return crit
}

/** HIVE REAPER: +lockStep per consecutive hit on the same enemy, up to
 *  lockMax; a gap over lockResetSec starts over. */
function lockOnMul(world: World, uid: number): number {
  if (uid === world.lockUid && world.time - world.lockAt <= EVO.lockResetSec + 1e-9) world.lockN++
  else world.lockN = 0
  world.lockUid = uid
  world.lockAt = world.time
  const b = EVO.lockStep * world.lockN
  return 1 + (b < EVO.lockMax ? b : EVO.lockMax)
}

/** Set a burn; it refreshes and does not stack (the stronger dps wins). The
 *  latest ignite decides whether its kill may drop a bonus. */
function ignite(e: Enemy, dps: number): void {
  if (e.burnT <= 0 || dps > e.burnDps) e.burnDps = dps
  e.burnT = BURN_SEC
  e.burnNoBonus = killNoBonus
}

function burnTick(world: World, e: Enemy, dt: number): void {
  e.burnT = tickDown(e.burnT, dt)
  if (e.submerged) return
  world.lastHitVx = 0
  world.lastHitVy = 0
  killNoBonus = e.burnNoBonus
  damageEnemy(world, e, vsTarget(world, e, e.burnDps * dt))
  killNoBonus = false
}

/** RAM: once per dash, an enemy the dash passes takes thorns x ramThornsMul,
 *  and a non-elite is thrown sideways off the dash line. */
function ramHit(world: World, e: Enemy): void {
  const m = world.mods
  const pl = world.player
  e.ramStamp = world.dashSeq
  const dmg = vsTarget(world, e, FUSION.ramThornsMul * m.thorns * m.damageMul)
  world.feel.emit(FeelKind.Hit, rankFlags(e), e.x, e.y, dmg, e.uid, e)
  thornsDamage(world, e, dmg)
  if (!e.alive || e.def.elite || e.def.boss) return
  const nx = -pl.dashDirY
  const ny = pl.dashDirX
  const side = (e.x - pl.x) * nx + (e.y - pl.y) * ny >= 0 ? FUSION.ramPush : -FUSION.ramPush
  e.x += nx * side
  e.y += ny * side
}

/** Ricochet: a spent bullet turns toward the nearest enemy it has not hit
 *  within SEEK.radius. PINBALL restores 1 pierce and raises its damage. */
function seekBounce(world: World, p: Projectile): boolean {
  const buf2 = world.queryBuf2
  const n = world.hash.query(p.x, p.y, SEEK.radius, buf2)
  let best: Enemy | null = null
  let bd = SEEK.radius * SEEK.radius
  for (let k = 0; k < n; k++) {
    const o = buf2[k]!
    if (!o.alive || o.submerged || hasHit(p, o.uid)) continue
    const dd = distSq(p.x, p.y, o.x, o.y)
    if (dd < bd) {
      bd = dd
      best = o
    }
  }
  if (!best) return false
  const sp = hypot(p.vx, p.vy)
  const d = Math.sqrt(bd) || 1
  p.vx = ((best.x - p.x) / d) * sp
  p.vy = ((best.y - p.y) / d) * sp
  p.facing = Math.atan2(p.vy, p.vx)
  p.bounces--
  if (p.life < SEEK.minLife) p.life = SEEK.minLife
  if (world.mods.pinball > 0) {
    p.pierce++
    p.damage *= FUSION.pinballDmgMul
  }
  return true
}

/** PLAGUE BARRAGE: bombletCount blasts around the impact, bombletDelay later. */
function queueBomblets(world: World, p: Projectile, dmg: number): void {
  const a0 = Math.atan2(p.vy, p.vx)
  for (let k = 0; k < EVO.bombletCount; k++) {
    const a = a0 + (k / EVO.bombletCount) * Math.PI * 2
    queueBlast(world, p.x + Math.cos(a) * EVO.bombletDist, p.y + Math.sin(a) * EVO.bombletDist,
      EVO.bombletR, dmg * EVO.bombletFrac, EVO.bombletDelay, noBonusFlag())
  }
}

/** Apply raw damage with a hit flash and resolve death. Safe to call on the
 *  same enemy twice. */
function dealDamage(world: World, e: Enemy, dmg: number): void {
  if (!e.alive) return
  e.flash = 0.07
  damageEnemy(world, e, dmg)
}

/** Remove HP and resolve death; burning enemies take more while INFERNO is
 *  held and frozen ones while FREEZE runs (neither from the NUKE, whose hits
 *  are exact), and a BROOD elite bursts once when it drops to half HP. */
function damageEnemy(world: World, e: Enemy, dmg: number): void {
  if (!e.alive) return
  if (!flatHit) {
    if (world.freezeT > 0 && !e.def.boss) dmg *= BONUS_FX.freezeDmgMul
    if (e.burnT > 0 && world.weapon.evo === 'ignite') dmg *= EVO.infernoBurnMul
  }
  e.hp -= dmg
  if ((e.affix & AF_BROOD) !== 0 && !e.halfBurst && e.hp <= e.maxHp * BROOD.atHpFrac) {
    e.halfBurst = true
    broodBurst(world, e)
  }
  if (e.hp <= 0) killEnemy(world, e)
}

/** A queued blast hits `e` (blasts.ts); AoE takes the elite and boss
 *  multipliers. A BLAST_NO_BONUS blast's kills drop no bonus. */
export function blastHit(world: World, e: Enemy, dmg: number, noBonus: boolean): void {
  killNoBonus = noBonus
  dealDamage(world, e, vsTarget(world, e, dmg))
  killNoBonus = false
}

/** A NUKE hit: flat damage, no multipliers, and its kills drop no bonus. The
 *  enemies it kills outright give kills and XP but no score; an elite or boss
 *  its fraction finishes scores like any kill. */
export function nukeHit(world: World, e: Enemy, dmg: number): void {
  if (!e.def.elite && !e.def.boss) killSrc = KillSource.NoScore
  flatHit = true
  killNoBonus = true
  world.lastHitVx = 0
  world.lastHitVy = 0
  dealDamage(world, e, dmg)
  killSrc = KillSource.Weapon
  flatHit = false
  killNoBonus = false
}

/** BROOD: world fodder around the elite, one spawn draw for the ring's turn. */
function broodBurst(world: World, e: Enemy): void {
  if (world.enemies.size >= MAX_ENEMIES - SPAWN_ROOM) return
  const a0 = world.rngs.spawn.angle()
  for (let i = 0; i < BROOD.count; i++) {
    const a = a0 + (i * Math.PI * 2) / BROOD.count
    spawnEnemy(world, world.script.fodderId, e.x + Math.cos(a) * BROOD.r, e.y + Math.sin(a) * BROOD.r)
  }
}

/** Affix effects of an elite's death: BROOD bursts again, VOLATILE leaves its blast. */
function affixDeath(world: World, e: Enemy): void {
  if ((e.affix & AF_BROOD) !== 0) broodBurst(world, e)
  if ((e.affix & AF_VOLATILE) !== 0) spawnHazard(world, HZ_CIRCLE, e.x, e.y, VOLATILE.r, VOLATILE.tele, 0, VOLATILE.dmg)
}

/** Thorns has no shot, so a thorns kill must not carry the last bullet's
 *  direction: a zero vector tells presentation to spray gibs radially. */
function thornsDamage(world: World, e: Enemy, dmg: number): void {
  world.lastHitVx = 0
  world.lastHitVy = 0
  dealDamage(world, e, dmg)
}

/** Chain lightning (and Arc Rounds) hops to nearby enemies (separate scratch
 *  buffer so it can run inside the projectile loop without clobbering its
 *  query). Each enemy is struck at most once per chain. FIRESTORM hops hit
 *  burning targets harder and ignite them; `lastBlast` > 0 queues a blast of
 *  that damage on the last target (STORM LASH). */
function chainLightning(world: World, from: Enemy, chain: number, range: number, dmg: number, lastBlast: number): void {
  const m = world.mods
  const buf2 = world.queryBuf2
  const seen = world.chainSeen
  seen[0] = from.uid
  let seenN = 1
  const hops = chain < seen.length - 1 ? chain : seen.length - 1
  const range2 = range * range
  let cx = from.x
  let cy = from.y
  for (let jump = 0; jump < hops; jump++) {
    const n = world.hash.query(cx, cy, range, buf2)
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
    let hd = vsTarget(world, best, dmg)
    if (m.firestorm > 0 && best.burnT > 0) hd *= FUSION.firestormArcMul
    dealDamage(world, best, hd)
    if (m.firestorm > 0 && best.alive) ignite(best, m.burnDps * m.damageMul)
  }
  if (lastBlast > 0 && seenN > 1) queueBlast(world, cx, cy, EVO.stormBlastR, lastBlast, 0, noBonusFlag())
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
  const def = e.def
  scoreKill(world, def, killSrc)

  world.ichor.queueStamp(e.x, e.y, world.rngs.fx)
  spawnGibs(world, e.x, e.y, def.boss ? BOSS_KILL_GIBS : def.gibCount, e.gibTint, world.lastHitVx, world.lastHitVy)
  world.feel.emit(FeelKind.Kill, rankFlags(e), e.x, e.y, world.lastHitVx, world.lastHitVy, def)

  // Death-pop shockwave ring. Skip the xp-1 chaff so a swarm wipe stays clean
  // and cheap. A boss gets a second, white ring (section 6.5).
  if (def.boss) {
    spawnRing(world, e.x, e.y, e.gibTint, 5.5)
    spawnRing(world, e.x, e.y, 0xffffff, 9)
  }
  else if (def.elite) spawnRing(world, e.x, e.y, e.gibTint, 3)
  else if (def.xp >= 2) spawnRing(world, e.x, e.y, e.gibTint, 1.4)

  const m = world.mods
  if (m.lifestealPerKill > 0) killHeal(world, m.lifestealPerKill)
  if (m.shatter > 0 && e.slow > 0 && !def.boss) {
    queueBlast(world, e.x, e.y, FUSION.shatterR, (FUSION.shatterBase + FUSION.shatterFrac * e.maxHp) * m.damageMul, 0, noBonusFlag())
  }

  dropGem(world, e.x, e.y, (def.elite || def.boss ? def.xp : def.xp * world.xpScale) * killXpMul)

  // Perk-free sustain: kills can drop a medkit, biased toward HARD MOMENTS. The
  // lower your HP, the likelier a kill coughs one up, so a horde that's chipping
  // you down also feeds you the medkits to survive it, while a healthy player
  // gets almost none (the difficulty stays intact). Roll the RNG always (keeps
  // the daily stream deterministic), then gate on a danger-scaled threshold.
  // VESPER's rolls happen too; only her drops are skipped.
  // THREAT 4 SCARCITY: only elites and bosses drop medkits, fewer and weaker.
  const loot = world.rngs.loot
  const roll = loot.float()
  const rules = world.character.rules
  const scarce = world.threatDef.scarcity
  const bigHeal = scarce ? HEALTH_HEAL_ELITE * SCARCITY.healMul : HEALTH_HEAL_ELITE
  if (def.boss) {
    const n = scarce ? SCARCITY.bossMedkits : 5
    for (let i = 0; i < n; i++) {
      const a = loot.angle()
      if (rules.medkits) dropHealth(world, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, bigHeal)
    }
  } else if (def.elite) {
    if (rules.medkits) dropHealth(world, e.x, e.y, bigHeal)
  } else if (!scarce) {
    const hpFrac = world.player.hp / world.player.maxHp
    if (hpFrac < 0.985) {
      // ~1x base at full HP up to ~4x near death.
      const chance = HEALTH_DROP_CHANCE * (1 + (1 - hpFrac) * 3)
      if (roll < chance && rules.medkits) dropHealth(world, e.x, e.y, HEALTH_HEAL)
    }
  }
  if (def.boss) reaperGrow(world, rules.bossMaxHp)
  else if (def.elite) reaperGrow(world, rules.eliteMaxHp)

  if (e.affix !== 0) affixDeath(world, e)

  if (def.behavior === 'splitter' && def.splitInto) {
    const count = def.splitCount ?? 2
    const rng = world.rngs.spawn
    for (let i = 0; i < count; i++) {
      const a = rng.angle()
      spawnEnemy(world, def.splitInto, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14)
    }
  }

  if (def.boss) {
    const stage = world.bossFight.stage
    directorBossKilled(world, e)
    explode(world, e.x, e.y, 140, 0)
    // The PRIME's core comes with OVERTIME (grantPrimeCore), not at the corpse.
    if (stage !== 'final') dropHiveCore(world, e.x, e.y, coreRow(stage))
    dropBossPod(world, e.x, e.y)
    world.feel.emit(FeelKind.BossKill, FF_BOSS, e.x, e.y, 0, 0, def)
  } else if (def.elite) {
    if (loot.bool(PODS.eliteChance)) dropPod(world, e.x, e.y)
    if (world.time >= world.eliteCoreReadyAt && dropShard(world, e.x, e.y)) world.eliteCoreReadyAt = world.time + CORES.shardCooldown
  }
  bonusOnKill(world, def, e.x, e.y, killNoBonus)
}

/** VESPER: an elite or boss kill adds max HP and heals the same. */
function reaperGrow(world: World, hp: number): void {
  if (hp <= 0) return
  const pl = world.player
  world.reaperHp += hp
  pl.maxHp += hp
  pl.hp = Math.min(pl.maxHp, pl.hp + hp)
}

/** Player death -> revive if available, else trigger the deferred game over. */
function handleDeath(world: World): void {
  const pl = world.player
  if (pl.hp > 0 || world.pendingGameOver) return

  if (world.mods.revives > world.revivesUsed) {
    world.revivesUsed++
    pl.hp = pl.maxHp * 0.5
    pl.grantInvuln(GRACE.revive, 2)
    world.feel.emit(FeelKind.Revive, 0, pl.x, pl.y)
    // Shove nearby enemies back so the revive isn't instant death.
    const enemies = world.enemies.active
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!
      const dx = e.x - pl.x
      const dy = e.y - pl.y
      const d = hypot(dx, dy) || 1
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
