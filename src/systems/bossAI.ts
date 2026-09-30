import { BOSS_EMERGE, BOSS_ROAR, BOSS_TELE_MIN, FRENZY_CADENCE, FRENZY_CADENCE_MAX, MAX_BROOD, MAX_ENEMIES, MAX_ENEMY_PROJECTILES } from '../config.ts'
import { clamp } from '../core/vec.ts'
import {
  ATK_EGG_CLUTCH,
  ATK_MOTHERS_CALL,
  ATK_ROYAL_LUNGE,
  BOSS_KITS,
  BOSS_STAGES,
  EGG_CLUTCH,
  MOTHERS_CALL,
  ROYAL_LUNGE,
  SLOT_A,
  SPORE_NOVA,
  type BossKit,
} from '../content/bosses.ts'
import { ENEMIES } from '../content/enemies.ts'
import type { BossStage } from '../content/runScripts.ts'
import { FF_BOSS, FF_RAM, FeelKind } from '../effects/feelQueue.ts'
import type { Enemy } from '../game/enemy.ts'
import { HZ_CIRCLE, HZ_LANE, type Hazard } from '../game/hazard.ts'
import { tickDown } from '../game/player.ts'
import type { World } from '../game/world.ts'
import { hurtPlayer } from './damage.ts'
import { spawnHazard } from './hazards.ts'
import { spawnEnemy } from './spawn.ts'

export const BS_EMERGE = 0
export const BS_IDLE = 1
export const BS_TELE = 2
export const BS_ACTIVE = 3
export const BS_RECOVER = 4
export const BS_ROAR = 5

const TAU = Math.PI * 2
/** Idle movement settles within this band around the kit's range. */
const RANGE_BAND = 20
/** Cryo slows a boss by at most this much (A2.2). */
const BOSS_SLOW_MAX = 0.3
/** Spawned bodies stay this far inside the arena wall. */
const EDGE_INSET = 24
const EGG_R = ENEMIES.egg!.radius

/**
 * The fight in progress: one boss at a time, allocated once with the World.
 * States EMERGE > IDLE > TELE > ACTIVE > RECOVER, plus ROAR at each phase
 * change (docs/NEXT-LEVEL.md 4.7).
 */
export class BossFight {
  stage: BossStage = 'mid1'
  state = BS_EMERGE
  /** Seconds left in the current state. */
  stateT = 0
  phase = 0
  /** Next index into the phase's rotation. */
  rot = 0
  attack = -1
  /** The attack's telegraph; `teleSeq` tells it from a recycled hazard. */
  tele: Hazard | null = null
  teleSeq = 0
  dirX = 1
  dirY = 0
  lungeHit = false
  /** Seconds until the second spore ring (0 = none pending), its aim and size. */
  ring2T = 0
  ring2Ang = 0
  ring2N = 0

  begin(stage: BossStage): void {
    this.stage = stage
    this.state = BS_EMERGE
    this.stateT = BOSS_EMERGE
    this.phase = 0
    this.rot = 0
    this.attack = -1
    this.tele = null
    this.teleSeq = 0
    this.lungeHit = false
    this.ring2T = 0
  }
}

/** aiSystem hands every 'boss' enemy here. Only the director's boss (world.boss)
 *  fights; any other boss body (a dev spawn) just walks its idle pattern. */
export function bossStep(w: World, e: Enemy, dt: number): void {
  const kit = BOSS_KITS[e.def.id]!
  const f = w.bossFight
  if (e !== w.boss || w.pendingGameOver) {
    idleMove(w, e, kit, dt)
    return
  }
  const st = BOSS_STAGES[f.stage]
  const cad = st.cadence[f.phase]! * Math.min(FRENZY_CADENCE_MAX, Math.pow(FRENZY_CADENCE, w.director.frenzy))

  if (f.ring2T > 0) {
    f.ring2T = tickDown(f.ring2T, dt)
    if (f.ring2T === 0) sporeRing(w, e, f.ring2Ang, f.ring2N)
  }
  if (
    (f.state === BS_IDLE || f.state === BS_TELE || f.state === BS_RECOVER) &&
    f.phase < st.phases.length &&
    e.hp <= e.maxHp * st.phases[f.phase]!
  ) {
    cancelBossTelegraph(w)
    f.phase++
    f.rot = 0
    f.state = BS_ROAR
    f.stateT = BOSS_ROAR
    w.feel.emit(FeelKind.BossPhase, FF_BOSS, e.x, e.y, f.phase, 0, e.def)
  }

  switch (f.state) {
    case BS_EMERGE:
      hold(w, e)
      f.stateT = tickDown(f.stateT, dt)
      if (f.stateT === 0) {
        e.submerged = false
        f.state = BS_IDLE
        f.stateT = kit.idleGap / cad
      }
      break
    case BS_ROAR:
      hold(w, e)
      f.stateT = tickDown(f.stateT, dt)
      if (f.stateT === 0) {
        if (st.rotations[f.phase]!.loopFrom > 0) startAttack(w, e, kit)
        else {
          f.state = BS_IDLE
          f.stateT = kit.idleGap / cad
        }
      }
      break
    case BS_IDLE:
      idleMove(w, e, kit, dt)
      f.stateT = tickDown(f.stateT, dt)
      if (f.stateT === 0) startAttack(w, e, kit)
      break
    case BS_TELE:
      hold(w, e)
      if (f.attack === ATK_ROYAL_LUNGE) e.facing = Math.atan2(f.dirY, f.dirX)
      f.stateT = tickDown(f.stateT, dt)
      if (f.stateT === 0) cast(w, e, cad)
      break
    case BS_ACTIVE:
      lungeStep(w, e, dt, cad)
      break
    case BS_RECOVER:
      hold(w, e)
      f.stateT = tickDown(f.stateT, dt)
      if (f.stateT === 0) {
        f.state = BS_IDLE
        f.stateT = kit.idleGap / cad
      }
      break
  }
  keepInCage(w, e)
}

/** End the current attack's telegraph early (phase change, boss gone). */
export function cancelBossTelegraph(w: World): void {
  const f = w.bossFight
  const h = f.tele
  if (h && h.alive && h.seq === f.teleSeq) h.alive = false
  f.tele = null
}

function startAttack(w: World, e: Enemy, kit: BossKit): void {
  const f = w.bossFight
  const st = BOSS_STAGES[f.stage]
  const rotation = st.rotations[f.phase]!
  const slot = rotation.slots[f.rot]!
  f.rot = f.rot + 1 < rotation.slots.length ? f.rot + 1 : rotation.loopFrom
  let kind = kit.attacks[slot]!
  if (kind === ATK_EGG_CLUTCH && w.director.broodCount >= MAX_BROOD) kind = kit.attacks[SLOT_A]
  f.attack = kind

  let base: number
  switch (kind) {
    case ATK_ROYAL_LUNGE:
      base = ROYAL_LUNGE.tele
      break
    case ATK_EGG_CLUTCH:
      base = EGG_CLUTCH.tele
      break
    case ATK_MOTHERS_CALL:
      base = MOTHERS_CALL.tele
      break
    default: // ATK_SPORE_NOVA
      base = SPORE_NOVA.tele
  }
  const tele = Math.max(BOSS_TELE_MIN, base * st.teleMul[f.phase]!)

  let h: Hazard | null
  if (kind === ATK_ROYAL_LUNGE) {
    const pl = w.player
    const d = Math.hypot(pl.x - e.x, pl.y - e.y) || 1
    f.dirX = (pl.x - e.x) / d
    f.dirY = (pl.y - e.y) / d
    h = spawnHazard(w, HZ_LANE, e.x, e.y, ROYAL_LUNGE.halfW, tele, ROYAL_LUNGE.active, 0)
    if (h) {
      h.ang = Math.atan2(f.dirY, f.dirX)
      h.len = Math.min(ROYAL_LUNGE.speed * ROYAL_LUNGE.active, reachInCage(w, e, f.dirX, f.dirY)) + e.radius
    }
  } else if (kind === ATK_EGG_CLUTCH) {
    h = spawnHazard(w, HZ_CIRCLE, e.x, e.y, EGG_CLUTCH.ringR + EGG_R, tele, 0, 0)
  } else if (kind === ATK_MOTHERS_CALL) {
    const c = w.director.cage
    h = spawnHazard(w, HZ_CIRCLE, c.x, c.y, c.r - MOTHERS_CALL.inset, tele, 0, 0)
  } else {
    h = spawnHazard(w, HZ_CIRCLE, e.x, e.y, SPORE_NOVA.decal, tele, 0, 0)
  }
  if (h) {
    h.boss = true
    f.teleSeq = h.seq
  }
  f.tele = h
  f.state = BS_TELE
  f.stateT = tele
  w.feel.emit(FeelKind.BossTele, FF_BOSS, e.x, e.y, kind, tele, e.def)
}

/** The telegraph ran out: the attack lands. */
function cast(w: World, e: Enemy, cad: number): void {
  const f = w.bossFight
  const p3prime = f.stage === 'final' && f.phase === 2
  switch (f.attack) {
    case ATK_ROYAL_LUNGE:
      f.state = BS_ACTIVE
      f.stateT = ROYAL_LUNGE.active
      f.lungeHit = false
      return
    case ATK_EGG_CLUTCH:
      layEggs(w, e, p3prime ? EGG_CLUTCH.primeP3Count : EGG_CLUTCH.count)
      recover(w, EGG_CLUTCH.recover / cad)
      return
    case ATK_MOTHERS_CALL:
      mothersCall(w, e)
      recover(w, MOTHERS_CALL.recover / cad)
      return
    default: {
      // ATK_SPORE_NOVA
      const n = p3prime ? SPORE_NOVA.primeP3Count : SPORE_NOVA.count
      const aim = Math.atan2(w.player.y - e.y, w.player.x - e.x)
      sporeRing(w, e, aim, n)
      if (f.phase >= 1) {
        f.ring2T = SPORE_NOVA.ring2Delay
        f.ring2Ang = aim + SPORE_NOVA.ring2Rot
        f.ring2N = n
      }
      recover(w, SPORE_NOVA.recover / cad)
    }
  }
}

function recover(w: World, sec: number): void {
  const f = w.bossFight
  cancelBossTelegraph(w)
  f.state = BS_RECOVER
  f.stateT = sec
}

/** Royal lunge: a locked line at ROYAL_LUNGE.speed that stops at the cage edge
 *  and hits the player at most once. */
function lungeStep(w: World, e: Enemy, dt: number, cad: number): void {
  const f = w.bossFight
  const c = w.director.cage
  const sp = ROYAL_LUNGE.speed
  let nx = e.x + f.dirX * sp * dt
  let ny = e.y + f.dirY * sp * dt
  let stop = false
  if (c.active) {
    const max = c.r - e.radius
    const dx = nx - c.x
    const dy = ny - c.y
    const d2 = dx * dx + dy * dy
    if (d2 > max * max) {
      const k = max / Math.sqrt(d2)
      nx = c.x + dx * k
      ny = c.y + dy * k
      stop = true
    }
  }
  e.vx = (nx - e.x) / dt
  e.vy = (ny - e.y) / dt
  e.x = nx
  e.y = ny
  e.facing = Math.atan2(f.dirY, f.dirX)
  const pl = w.player
  const rr = e.radius + pl.radius
  if (!f.lungeHit && (pl.x - e.x) ** 2 + (pl.y - e.y) ** 2 < rr * rr) {
    if (hurtPlayer(w, ROYAL_LUNGE.damage, 'discrete', -1, e.x, e.y, FF_RAM) > 0) f.lungeHit = true
  }
  f.stateT = tickDown(f.stateT, dt)
  if (stop || f.stateT === 0) recover(w, ROYAL_LUNGE.recover / cad)
}

/** How far the body can travel along (ux, uy) before it meets the cage edge. */
function reachInCage(w: World, e: Enemy, ux: number, uy: number): number {
  const c = w.director.cage
  const r = c.r - e.radius
  const ox = e.x - c.x
  const oy = e.y - c.y
  const b = ox * ux + oy * uy
  const disc = b * b - (ox * ox + oy * oy - r * r)
  return disc > 0 ? Math.max(0, -b + Math.sqrt(disc)) : 0
}

/** One ring of spore globs; the first flies at `aim`. */
function sporeRing(w: World, e: Enemy, aim: number, n: number): void {
  const N = SPORE_NOVA
  for (let k = 0; k < n; k++) {
    if (w.enemyProjectiles.size >= MAX_ENEMY_PROJECTILES) break
    const a = aim + (k * TAU) / n
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    const p = w.enemyProjectiles.acquire()
    p.x = p.prevX = e.x + cx * (e.radius + 4)
    p.y = p.prevY = e.y + cy * (e.radius + 4)
    p.vx = cx * N.speed
    p.vy = cy * N.speed
    p.facing = a
    p.damage = N.damage
    p.radius = N.radius
    p.life = N.life
    p.pierce = 0
    p.leavesAcid = false
    const s = p.sprite
    s.visible = true
    s.alpha = 1
    s.tint = e.tint
    s.scale.set(N.radius / 7)
  }
  w.feel.emit(FeelKind.EnemyShot, FF_BOSS, e.x, e.y, aim, 0, e.def)
}

const spot = { x: 0, y: 0 }

/** Clamp `spot` inside the cage (by `pad`) and inside the arena. */
function clampSpot(w: World, pad: number): void {
  const c = w.director.cage
  const max = c.r - pad
  const dx = spot.x - c.x
  const dy = spot.y - c.y
  const d2 = dx * dx + dy * dy
  if (d2 > max * max) {
    const k = max / Math.sqrt(d2)
    spot.x = c.x + dx * k
    spot.y = c.y + dy * k
  }
  const b = w.arena.bounds
  spot.x = clamp(spot.x, b.x + EDGE_INSET, b.x + b.w - EDGE_INSET)
  spot.y = clamp(spot.y, b.y + EDGE_INSET, b.y + b.h - EDGE_INSET)
}

/** Egg clutch: eggs evenly on a ring around the boss, turned by one boss draw. */
function layEggs(w: World, e: Enemy, n: number): void {
  if (w.enemies.size >= MAX_ENEMIES - 20) return
  const a0 = w.rngs.boss.angle()
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * TAU) / n
    spot.x = e.x + Math.cos(a) * EGG_CLUTCH.ringR
    spot.y = e.y + Math.sin(a) * EGG_CLUTCH.ringR
    clampSpot(w, EGG_R)
    const egg = spawnEnemy(w, 'egg', spot.x, spot.y)
    if (egg) egg.brood = w.bossFights
  }
}

/** Mother's call: a ring of brood just inside the cage with a three-slot gap
 *  on the side facing away from the queen. No draws. */
function mothersCall(w: World, e: Enemy): void {
  if (w.enemies.size >= MAX_ENEMIES - 20) return
  const M = MOTHERS_CALL
  const c = w.director.cage
  const rr = c.r - M.inset
  const away = Math.atan2(c.y - e.y, c.x - e.x)
  const step = TAU / M.slots
  const unitR = ENEMIES[M.unit]!.radius
  // Slots 0, 1 and slots - 1 stay empty: the gap is centered on `away`.
  for (let k = 2; k < M.slots - 1; k++) {
    const a = away + k * step
    spot.x = c.x + Math.cos(a) * rr
    spot.y = c.y + Math.sin(a) * rr
    clampSpot(w, unitR)
    const s = spawnEnemy(w, M.unit, spot.x, spot.y)
    if (!s) continue
    s.hp = s.maxHp = Math.round(s.maxHp * M.hpMul)
    s.brood = w.bossFights
  }
}

function hold(w: World, e: Enemy): void {
  e.vx = 0
  e.vy = 0
  e.facing = Math.atan2(w.player.y - e.y, w.player.x - e.x)
}

/** Close to the kit's range from the player; a strafing kit circles there. */
function idleMove(w: World, e: Enemy, kit: BossKit, dt: number): void {
  const pl = w.player
  const dx = pl.x - e.x
  const dy = pl.y - e.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  let spd = e.speed * kit.speedMul
  if (e.slow > 0) spd *= 1 - Math.min(e.slowFactor, BOSS_SLOW_MAX)
  let mx = 0
  let my = 0
  if (d > kit.range + RANGE_BAND) {
    mx = ux
    my = uy
  } else if (kit.strafe) {
    if (d < kit.range - RANGE_BAND) {
      mx = -ux
      my = -uy
    } else {
      mx = -uy
      my = ux
    }
  }
  e.vx = mx * spd
  e.vy = my * spd
  e.x += e.vx * dt
  e.y += e.vy * dt
  e.facing = Math.atan2(uy, ux)
}

/** The boss body never leaves the cage (the frenzy shrinks it around her). */
function keepInCage(w: World, e: Enemy): void {
  const c = w.director.cage
  if (!c.active) return
  const max = c.r - e.radius
  const dx = e.x - c.x
  const dy = e.y - c.y
  const d2 = dx * dx + dy * dy
  if (d2 > max * max) {
    const k = max / Math.sqrt(d2)
    e.x = c.x + dx * k
    e.y = c.y + dy * k
  }
}
