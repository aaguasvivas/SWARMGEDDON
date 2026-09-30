import { BOSS_EMERGE, BOSS_ROAR, BOSS_TELE_MIN, FRENZY_CADENCE, FRENZY_CADENCE_MAX, MAX_BROOD, MAX_ENEMIES, MAX_ENEMY_PROJECTILES } from '../config.ts'
import { lerpHex } from '../core/color.ts'
import { doubleFields } from '../core/fields.ts'
import { clamp, hypot } from '../core/vec.ts'
import {
  ATK_CINDERFALL,
  ATK_EGG_CLUTCH,
  ATK_FLAK_TURRETS,
  ATK_MAGMA_MORTAR,
  ATK_MOTHERS_CALL,
  ATK_PSI_LANCE,
  ATK_RIFT_BLINK,
  ATK_RIFT_STORM,
  ATK_ROYAL_LUNGE,
  ATK_SCORCH_SWEEP,
  ATK_SPORE_NOVA,
  ATK_UNDERTOW,
  BOSS_KITS,
  BOSS_STAGES,
  CINDERFALL,
  EGG_CLUTCH,
  FLAK_TURRETS,
  MAGMA_MORTAR,
  MOTHERS_CALL,
  PSI_LANCE,
  RIFT_BLINK,
  RIFT_STORM,
  ROYAL_LUNGE,
  SCORCH_SWEEP,
  SLOT_A,
  SPORE_NOVA,
  UNDERTOW,
  type BossKit,
} from '../content/bosses.ts'
import { ENEMIES } from '../content/enemies.ts'
import type { BossStage } from '../content/runScripts.ts'
import { spawnPoof } from '../effects/fx.ts'
import { FF_BOSS, FF_RAM, FeelKind } from '../effects/feelQueue.ts'
import type { Enemy } from '../game/enemy.ts'
import { HZ_CIRCLE, HZ_END_MAGMA, HZ_END_SPAWN, HZ_LANE, HZ_SWEEP, type Hazard } from '../game/hazard.ts'
import { tickDown } from '../game/player.ts'
import type { World } from '../game/world.ts'
import { MAX_WELL_PULL } from './ai.ts'
import { hurtPlayer } from './damage.ts'
import { closeCall, closeCallArmed } from './dash.ts'
import { spawnHazard } from './hazards.ts'
import { spawnEnemy } from './spawn.ts'
import { setTint } from '../render/textures.ts'

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
const TURRET = ENEMIES[FLAK_TURRETS.unit]!

/**
 * The fight in progress: one boss at a time, allocated once with the World.
 * States EMERGE > IDLE > TELE > ACTIVE > RECOVER, plus ROAR at each phase
 * change (docs/NEXT-LEVEL.md 4.7). One attack runs at a time, so one boss
 * telegraph is live at a time; a multi-part attack (rift storm, cinderfall)
 * holds the boss until its last part lands.
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
  /** Heading locked at the telegraph start (lunge, lance). */
  dirX = 1
  dirY = 0
  /** Where the lunge lane starts (the boss at its telegraph start). */
  lungeX = 0
  lungeY = 0
  lungeHit = false
  /** A second volley of the last cast (spore ring, lance bolts) fires when
   *  `echoT` runs out (0 = none pending): its attack, aim and ring size. */
  echoT = 0
  echoKind = -1
  echoAng = 0
  echoN = 0
  /** Parts of a multi-part attack still to come (rift storm blinks, cinderfall
   *  circles), the next part's index, and seconds until it (cinderfall). */
  partsLeft = 0
  partK = 0
  partT = 0
  /** Cinderfall spiral center (the player's spot at the cast start) and turn. */
  partX = 0
  partY = 0
  partAng = 0
  /** Scorch sweep turn direction (+1 or -1); it flips every cast. */
  sweepSign = 1
  /** Where the rift blink lands: the player's spot at its telegraph start.
   *  `blinkOk` is false when no circle was drawn (the hazard pool was full). */
  blinkX = 0
  blinkY = 0
  blinkOk = false

  constructor() {
    doubleFields(this)
  }

  begin(stage: BossStage): void {
    this.stage = stage
    this.state = BS_EMERGE
    this.stateT = BOSS_EMERGE
    this.phase = 0
    this.rot = 0
    this.attack = -1
    this.lungeHit = false
    this.echoT = 0
    this.partsLeft = 0
    this.sweepSign = 1
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

  if (f.echoT > 0) {
    f.echoT = tickDown(f.echoT, dt)
    if (f.echoT === 0) echo(w, e)
  }
  if (f.partsLeft > 0 && f.attack === ATK_CINDERFALL) {
    f.partT = tickDown(f.partT, dt)
    if (f.partT === 0) cinderCircle(w)
  }
  if (
    (f.state === BS_IDLE || f.state === BS_TELE || f.state === BS_RECOVER) &&
    f.phase < st.phases.length &&
    e.hp <= e.maxHp * st.phases[f.phase]!
  ) {
    cancelBossWarnings(w)
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
      if (f.attack === ATK_ROYAL_LUNGE || f.attack === ATK_PSI_LANCE) e.facing = Math.atan2(f.dirY, f.dirX)
      f.stateT = tickDown(f.stateT, dt)
      if (f.stateT === 0) cast(w, e, cad)
      break
    case BS_ACTIVE:
      if (f.attack === ATK_ROYAL_LUNGE) lungeStep(w, e, dt, cad)
      else channel(w, e, dt, cad)
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

/** The fight is over (kill, stalemate, ascend): its hazards and pending parts
 *  end, and its flak turrets collapse with no credit. */
export function cancelBossTelegraph(w: World): void {
  const f = w.bossFight
  f.echoT = 0
  f.partsLeft = 0
  const hz = w.hazards.active
  for (let i = 0; i < hz.length; i++) {
    const h = hz[i]!
    if (h.alive && h.boss) h.alive = false
  }
  const a = w.enemies.active
  for (let i = 0; i < a.length; i++) {
    const t = a[i]!
    if (!t.alive || t.def !== TURRET || t.brood !== w.bossFights) continue
    t.alive = false
    spawnPoof(w, t.x, t.y, t.gibTint, 6)
  }
}

/** A phase change or the end of a lunge: every boss telegraph still warning,
 *  and every boss marker, goes, and so do the attack's parts still to come.
 *  Damage already live finishes. */
function cancelBossWarnings(w: World): void {
  w.bossFight.partsLeft = 0
  const hz = w.hazards.active
  for (let i = 0; i < hz.length; i++) {
    const h = hz[i]!
    if (h.alive && h.boss && (h.tele > 0 || h.damage === 0)) h.alive = false
  }
}

function startAttack(w: World, e: Enemy, kit: BossKit): void {
  const f = w.bossFight
  const st = BOSS_STAGES[f.stage]
  const rotation = st.rotations[f.phase]!
  const slot = rotation.slots[f.rot]!
  f.rot = f.rot + 1 < rotation.slots.length ? f.rot + 1 : rotation.loopFrom
  let kind = kit.attacks[slot]!
  if (
    (kind === ATK_EGG_CLUTCH && w.director.broodCount >= MAX_BROOD) ||
    (kind === ATK_FLAK_TURRETS && turretsAlive(w) + FLAK_TURRETS.count > FLAK_TURRETS.maxAlive)
  ) {
    kind = kit.attacks[SLOT_A]
  }
  f.attack = kind

  const tele = teleFor(w, baseTele(kind))
  let busy = tele
  const pl = w.player
  switch (kind) {
    case ATK_ROYAL_LUNGE: {
      aimAtPlayer(w, e)
      f.lungeX = e.x
      f.lungeY = e.y
      const h = bossHazard(w, HZ_LANE, e.x, e.y, ROYAL_LUNGE.halfW, tele, ROYAL_LUNGE.active, 0)
      if (h) {
        h.ang = Math.atan2(f.dirY, f.dirX)
        h.len = Math.min(ROYAL_LUNGE.speed * ROYAL_LUNGE.active, reachInCage(w, e, f.dirX, f.dirY), reachInArena(w, e, f.dirX, f.dirY)) + e.radius
      }
      break
    }
    case ATK_EGG_CLUTCH:
      bossHazard(w, HZ_CIRCLE, e.x, e.y, EGG_CLUTCH.ringR + EGG_R, tele, 0, 0)
      break
    case ATK_MOTHERS_CALL: {
      const c = w.director.cage
      bossHazard(w, HZ_CIRCLE, c.x, c.y, c.r - MOTHERS_CALL.inset, tele, 0, 0)
      break
    }
    case ATK_RIFT_BLINK:
      riftCircle(w, RIFT_BLINK.r, tele, RIFT_BLINK.active, RIFT_BLINK.damage)
      break
    case ATK_RIFT_STORM:
      riftCircle(w, RIFT_STORM.r, tele, RIFT_STORM.active, RIFT_STORM.damage)
      f.partsLeft = RIFT_STORM.count - 1
      break
    case ATK_PSI_LANCE: {
      aimAtPlayer(w, e)
      const aim = Math.atan2(f.dirY, f.dirX)
      for (let k = 0; k < PSI_LANCE.lanes; k++) {
        const h = bossHazard(w, HZ_LANE, e.x, e.y, PSI_LANCE.halfW, tele, 0, 0)
        if (!h) break
        h.ang = aim + (k - (PSI_LANCE.lanes - 1) / 2) * PSI_LANCE.spread
        h.len = PSI_LANCE.len
      }
      break
    }
    case ATK_UNDERTOW:
      bossHazard(w, HZ_CIRCLE, e.x, e.y, UNDERTOW.decal, tele, UNDERTOW.active, 0)
      break
    case ATK_MAGMA_MORTAR: {
      const M = MAGMA_MORTAR
      const a0 = w.rngs.boss.angle()
      const h = bossHazard(w, HZ_CIRCLE, pl.x, pl.y, M.r, tele, M.active, M.damage)
      if (h) h.onEnd = HZ_END_MAGMA
      for (let k = 0; k < M.ring; k++) {
        const a = a0 + (k * TAU) / M.ring
        bossHazard(w, HZ_CIRCLE, pl.x + Math.cos(a) * M.ringR, pl.y + Math.sin(a) * M.ringR, M.r, tele, M.active, M.damage)
      }
      break
    }
    case ATK_FLAK_TURRETS: {
      const T = FLAK_TURRETS
      const a0 = w.rngs.boss.angle()
      for (let k = 0; k < T.count; k++) {
        const a = a0 + (k * TAU) / T.count
        spot.x = e.x + Math.cos(a) * T.ringR
        spot.y = e.y + Math.sin(a) * T.ringR
        clampSpot(w, TURRET.radius, EDGE_INSET)
        const h = bossHazard(w, HZ_CIRCLE, spot.x, spot.y, T.decal, tele, 0, 0)
        if (!h) break
        h.onEnd = HZ_END_SPAWN
        h.unit = T.unit
      }
      break
    }
    case ATK_SCORCH_SWEEP: {
      const S = SCORCH_SWEEP
      const aim = Math.atan2(pl.y - e.y, pl.x - e.x)
      const h = bossHazard(w, HZ_SWEEP, e.x, e.y, S.halfW, tele, S.active, S.damage)
      if (h) {
        h.len = S.reach
        h.ang = aim - (f.sweepSign * S.arc) / 2
        h.arc = f.sweepSign * S.arc
      }
      f.sweepSign = -f.sweepSign
      break
    }
    case ATK_CINDERFALL:
      f.partX = pl.x
      f.partY = pl.y
      f.partAng = w.rngs.boss.angle()
      f.partK = 0
      f.partsLeft = CINDERFALL.count
      cinderCircle(w)
      busy = tele + CINDERFALL.gap * (CINDERFALL.count - 1)
      break
    default: // ATK_SPORE_NOVA
      bossHazard(w, HZ_CIRCLE, e.x, e.y, SPORE_NOVA.decal, tele, 0, 0)
  }
  f.state = BS_TELE
  f.stateT = busy
  w.feel.emit(FeelKind.BossTele, FF_BOSS, e.x, e.y, kind, tele, e.def)
}

/** The telegraph ran out: the attack lands. */
function cast(w: World, e: Enemy, cad: number): void {
  const f = w.bossFight
  const p3prime = f.stage === 'final' && f.phase === 2
  switch (f.attack) {
    case ATK_ROYAL_LUNGE:
      f.lungeHit = false
      active(w, ROYAL_LUNGE.active)
      return
    case ATK_EGG_CLUTCH:
      layEggs(w, e, p3prime ? EGG_CLUTCH.primeP3Count : EGG_CLUTCH.count)
      recover(w, EGG_CLUTCH.recover / cad)
      return
    case ATK_MOTHERS_CALL:
      mothersCall(w, e)
      recover(w, MOTHERS_CALL.recover / cad)
      return
    case ATK_PSI_LANCE: {
      const aim = Math.atan2(f.dirY, f.dirX)
      lanceVolley(w, e, aim)
      if (f.phase >= 1) {
        f.echoT = PSI_LANCE.echoDelay
        f.echoKind = ATK_PSI_LANCE
        f.echoAng = aim
      }
      recover(w, PSI_LANCE.recover / cad)
      return
    }
    case ATK_FLAK_TURRETS:
      // The turrets rise from their markers (hazard onEnd).
      recover(w, FLAK_TURRETS.recover / cad)
      return
    case ATK_UNDERTOW:
      callWraiths(w, e)
      active(w, UNDERTOW.active)
      return
    case ATK_RIFT_BLINK:
      riftLand(w, e)
      active(w, RIFT_BLINK.active)
      return
    case ATK_RIFT_STORM:
      riftLand(w, e)
      active(w, RIFT_STORM.active)
      return
    case ATK_MAGMA_MORTAR:
      active(w, MAGMA_MORTAR.active)
      return
    case ATK_SCORCH_SWEEP:
      active(w, SCORCH_SWEEP.active)
      return
    case ATK_CINDERFALL:
      active(w, CINDERFALL.active)
      return
    default: {
      // ATK_SPORE_NOVA
      const n = p3prime ? SPORE_NOVA.primeP3Count : SPORE_NOVA.count
      const aim = Math.atan2(w.player.y - e.y, w.player.x - e.x)
      sporeRing(w, e, aim, n)
      if (f.phase >= 1) {
        f.echoT = SPORE_NOVA.ring2Delay
        f.echoKind = ATK_SPORE_NOVA
        f.echoAng = aim + SPORE_NOVA.ring2Rot
        f.echoN = n
      }
      recover(w, SPORE_NOVA.recover / cad)
    }
  }
}

function active(w: World, sec: number): void {
  const f = w.bossFight
  f.state = BS_ACTIVE
  f.stateT = sec
}

function recover(w: World, sec: number): void {
  const f = w.bossFight
  f.state = BS_RECOVER
  f.stateT = sec
}

/** ACTIVE for every attack but the lunge: the boss holds while its hazards
 *  burn (the undertow pulls). A rift storm then telegraphs its next blink at
 *  the player's new spot. */
function channel(w: World, e: Enemy, dt: number, cad: number): void {
  const f = w.bossFight
  hold(w, e)
  if (f.attack === ATK_UNDERTOW) undertowPull(w, e)
  f.stateT = tickDown(f.stateT, dt)
  if (f.stateT > 0) return
  if (f.attack === ATK_RIFT_STORM && f.partsLeft > 0) {
    f.partsLeft--
    const tele = teleFor(w, RIFT_STORM.tele)
    riftCircle(w, RIFT_STORM.r, tele, RIFT_STORM.active, RIFT_STORM.damage)
    f.state = BS_TELE
    f.stateT = tele
    w.feel.emit(FeelKind.BossTele, FF_BOSS, e.x, e.y, ATK_RIFT_STORM, tele, e.def)
    return
  }
  recover(w, recoverOf(f.attack) / cad)
}

function echo(w: World, e: Enemy): void {
  const f = w.bossFight
  if (f.echoKind === ATK_PSI_LANCE) lanceVolley(w, e, f.echoAng)
  else sporeRing(w, e, f.echoAng, f.echoN)
}

function baseTele(kind: number): number {
  switch (kind) {
    case ATK_ROYAL_LUNGE:
      return ROYAL_LUNGE.tele
    case ATK_EGG_CLUTCH:
      return EGG_CLUTCH.tele
    case ATK_MOTHERS_CALL:
      return MOTHERS_CALL.tele
    case ATK_RIFT_BLINK:
      return RIFT_BLINK.tele
    case ATK_PSI_LANCE:
      return PSI_LANCE.tele
    case ATK_UNDERTOW:
      return UNDERTOW.tele
    case ATK_RIFT_STORM:
      return RIFT_STORM.tele
    case ATK_MAGMA_MORTAR:
      return MAGMA_MORTAR.tele
    case ATK_FLAK_TURRETS:
      return FLAK_TURRETS.tele
    case ATK_SCORCH_SWEEP:
      return SCORCH_SWEEP.tele
    case ATK_CINDERFALL:
      return CINDERFALL.tele
    default:
      return SPORE_NOVA.tele
  }
}

/** Recover after an ACTIVE window (the casts that recover at once pass theirs). */
function recoverOf(kind: number): number {
  switch (kind) {
    case ATK_RIFT_BLINK:
      return RIFT_BLINK.recover
    case ATK_UNDERTOW:
      return UNDERTOW.recover
    case ATK_RIFT_STORM:
      return RIFT_STORM.recover
    case ATK_MAGMA_MORTAR:
      return MAGMA_MORTAR.recover
    case ATK_SCORCH_SWEEP:
      return SCORCH_SWEEP.recover
    case ATK_CINDERFALL:
      return CINDERFALL.recover
    default:
      return ROYAL_LUNGE.recover
  }
}

/** The stage's phase telegraph multiplier, floored at BOSS_TELE_MIN. */
function teleFor(w: World, base: number): number {
  const f = w.bossFight
  return Math.max(BOSS_TELE_MIN, base * BOSS_STAGES[f.stage].teleMul[f.phase]!)
}

function bossHazard(w: World, shape: number, x: number, y: number, r: number, tele: number, live: number, damage: number): Hazard | null {
  const h = spawnHazard(w, shape, x, y, r, tele, live, damage)
  if (h) h.boss = true
  return h
}

function aimAtPlayer(w: World, e: Enemy): void {
  const f = w.bossFight
  const pl = w.player
  const d = hypot(pl.x - e.x, pl.y - e.y) || 1
  f.dirX = (pl.x - e.x) / d
  f.dirY = (pl.y - e.y) / d
}

/** A rift blink: a slam circle on the player's spot. The boss lands in it on
 *  its cast tick, the tick after the circle detonates (riftLand). */
function riftCircle(w: World, r: number, tele: number, live: number, damage: number): void {
  const f = w.bossFight
  const pl = w.player
  f.blinkX = pl.x
  f.blinkY = pl.y
  f.blinkOk = bossHazard(w, HZ_CIRCLE, pl.x, pl.y, r, tele, live, damage) !== null
}

/** The boss teleports into its rift circle as it slams. */
function riftLand(w: World, e: Enemy): void {
  const f = w.bossFight
  if (!f.blinkOk) return
  spawnPoof(w, e.x, e.y, e.gibTint, 12)
  spot.x = f.blinkX
  spot.y = f.blinkY
  clampSpot(w, e.radius, e.radius)
  e.x = e.prevX = spot.x
  e.y = e.prevY = spot.y
  spawnPoof(w, e.x, e.y, e.gibTint, 12)
  w.feel.emit(FeelKind.Teleport, FF_BOSS, e.x, e.y, 0, 0, e.def)
}

/** The next cinderfall circle on the spiral. A circle that lies wholly outside
 *  the cage cannot reach the caged player and is not cast. */
function cinderCircle(w: World): void {
  const f = w.bossFight
  const C = CINDERFALL
  const k = f.partK++
  f.partsLeft--
  f.partT = C.gap
  const a = f.partAng + k * C.angStep
  const rr = C.r0 + k * C.rStep
  const x = f.partX + Math.cos(a) * rr
  const y = f.partY + Math.sin(a) * rr
  const c = w.director.cage
  const reach = c.r + C.r
  const dx = x - c.x
  const dy = y - c.y
  if (dx * dx + dy * dy > reach * reach) return
  bossHazard(w, HZ_CIRCLE, x, y, C.r, teleFor(w, C.tele), C.active, C.damage)
}

/** Undertow: drag the player toward the boss, on top of any gravity well,
 *  within the shared MAX_WELL_PULL clamp. No pull once the bodies touch. */
function undertowPull(w: World, e: Enemy): void {
  const pl = w.player
  const dx = e.x - pl.x
  const dy = e.y - pl.y
  const d = hypot(dx, dy)
  if (d <= e.radius + pl.radius) return
  let px = w.pullX + (dx / d) * UNDERTOW.pull
  let py = w.pullY + (dy / d) * UNDERTOW.pull
  const m = hypot(px, py)
  if (m > MAX_WELL_PULL) {
    px *= MAX_WELL_PULL / m
    py *= MAX_WELL_PULL / m
  }
  w.pullX = px
  w.pullY = py
}

function turretsAlive(w: World): number {
  let n = 0
  const a = w.enemies.active
  for (let i = 0; i < a.length; i++) {
    const t = a[i]!
    if (t.alive && t.def === TURRET && t.brood === w.bossFights) n++
  }
  return n
}

/** Royal lunge: a locked line at ROYAL_LUNGE.speed that stops at the cage edge
 *  or the arena wall. It hits the player at most once, and only inside the
 *  drawn lane: the stretch the body's front has swept, ROYAL_LUNGE.halfW wide. */
function lungeStep(w: World, e: Enemy, dt: number, cad: number): void {
  const f = w.bossFight
  const sp = ROYAL_LUNGE.speed
  spot.x = e.x + f.dirX * sp * dt
  spot.y = e.y + f.dirY * sp * dt
  const stop = clampSpot(w, e.radius, e.radius)
  e.vx = (spot.x - e.x) / dt
  e.vy = (spot.y - e.y) / dt
  e.x = spot.x
  e.y = spot.y
  e.facing = Math.atan2(f.dirY, f.dirX)
  if (!f.lungeHit && inSweptLane(w, e)) {
    if (closeCallArmed(w)) closeCall(w)
    if (hurtPlayer(w, ROYAL_LUNGE.damage, 'discrete', e.def.idx, e.x, e.y, FF_RAM) > 0) f.lungeHit = true
  }
  f.stateT = tickDown(f.stateT, dt)
  if (stop || f.stateT === 0) {
    cancelBossWarnings(w)
    recover(w, ROYAL_LUNGE.recover / cad)
  }
}

/** The player's body overlaps the lane rectangle from the lunge start to the
 *  body's front: along [0, travelled + radius], across [-halfW, halfW]. */
function inSweptLane(w: World, e: Enemy): boolean {
  const f = w.bossFight
  const pl = w.player
  const front = (e.x - f.lungeX) * f.dirX + (e.y - f.lungeY) * f.dirY + e.radius
  const rx = pl.x - f.lungeX
  const ry = pl.y - f.lungeY
  const along = rx * f.dirX + ry * f.dirY
  const across = ry * f.dirX - rx * f.dirY
  const du = along - clamp(along, 0, front)
  const dv = across - clamp(across, -ROYAL_LUNGE.halfW, ROYAL_LUNGE.halfW)
  return du * du + dv * dv < pl.radius * pl.radius
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

/** How far the body can travel along (ux, uy) before it meets an arena wall. */
function reachInArena(w: World, e: Enemy, ux: number, uy: number): number {
  const b = w.arena.bounds
  const r = e.radius
  let t = Infinity
  if (ux > 0) t = Math.min(t, (b.x + b.w - r - e.x) / ux)
  else if (ux < 0) t = Math.min(t, (b.x + r - e.x) / ux)
  if (uy > 0) t = Math.min(t, (b.y + b.h - r - e.y) / uy)
  else if (uy < 0) t = Math.min(t, (b.y + r - e.y) / uy)
  return Math.max(0, t)
}

/** One boss projectile from the body's edge along angle `a`. */
function bossShot(w: World, e: Enemy, a: number, speed: number, damage: number, radius: number, life: number, tint: number): void {
  const cx = Math.cos(a)
  const cy = Math.sin(a)
  const p = w.enemyProjectiles.acquire()
  p.x = p.prevX = e.x + cx * (e.radius + 4)
  p.y = p.prevY = e.y + cy * (e.radius + 4)
  p.vx = cx * speed
  p.vy = cy * speed
  p.facing = a
  p.damage = damage
  p.radius = radius
  p.life = life
  p.pierce = 0
  p.leavesAcid = false
  p.ownerIdx = e.def.idx
  const s = p.sprite
  s.visible = true
  s.alpha = 1
  setTint(s, tint)
  s.scale.set(radius / 7)
}

/** One ring of spore globs; the first flies at `aim`. */
function sporeRing(w: World, e: Enemy, aim: number, n: number): void {
  const N = SPORE_NOVA
  for (let k = 0; k < n; k++) {
    if (w.enemyProjectiles.size >= MAX_ENEMY_PROJECTILES) break
    bossShot(w, e, aim + (k * TAU) / n, N.speed, N.damage, N.radius, N.life, e.tint)
  }
  w.feel.emit(FeelKind.EnemyShot, FF_BOSS, e.x, e.y, aim, 0, e.def)
}

/** One psi bolt down each lance lane; a bolt ends where its lane is drawn.
 *  Bolts are lighter than her body so they read against the violet floor. */
function lanceVolley(w: World, e: Enemy, aim: number): void {
  const L = PSI_LANCE
  const life = (L.len - e.radius - 4) / L.speed
  const tint = lerpHex(e.tint, 0xffffff, L.boltLighten)
  for (let k = 0; k < L.lanes; k++) {
    if (w.enemyProjectiles.size >= MAX_ENEMY_PROJECTILES) break
    bossShot(w, e, aim + (k - (L.lanes - 1) / 2) * L.spread, L.speed, L.damage, L.radius, life, tint)
  }
  w.feel.emit(FeelKind.EnemyShot, FF_BOSS, e.x, e.y, aim, 0, e.def)
}

const spot = { x: 0, y: 0 }
doubleFields(spot)

/** Clamp `spot` inside the cage (by `cagePad`) and inside the arena walls (by
 *  `wallPad`). Returns whether it moved. */
function clampSpot(w: World, cagePad: number, wallPad: number): boolean {
  const x0 = spot.x
  const y0 = spot.y
  const c = w.director.cage
  if (c.active) {
    const max = c.r - cagePad
    const dx = spot.x - c.x
    const dy = spot.y - c.y
    const d2 = dx * dx + dy * dy
    if (d2 > max * max) {
      const k = max / Math.sqrt(d2)
      spot.x = c.x + dx * k
      spot.y = c.y + dy * k
    }
  }
  const b = w.arena.bounds
  spot.x = clamp(spot.x, b.x + wallPad, b.x + b.w - wallPad)
  spot.y = clamp(spot.y, b.y + wallPad, b.y + b.h - wallPad)
  return spot.x !== x0 || spot.y !== y0
}

/** Egg clutch: eggs evenly on a ring around the boss, turned by one boss draw. */
function layEggs(w: World, e: Enemy, n: number): void {
  if (w.enemies.size >= MAX_ENEMIES - 20) return
  const a0 = w.rngs.boss.angle()
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * TAU) / n
    spot.x = e.x + Math.cos(a) * EGG_CLUTCH.ringR
    spot.y = e.y + Math.sin(a) * EGG_CLUTCH.ringR
    clampSpot(w, EGG_R, EDGE_INSET)
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
    clampSpot(w, unitR, EDGE_INSET)
    const s = spawnEnemy(w, M.unit, spot.x, spot.y)
    if (!s) continue
    s.hp = s.maxHp = Math.round(s.maxHp * M.hpMul)
    s.brood = w.bossFights
  }
}

/** Undertow: wraiths evenly on a ring around the boss, the first toward the
 *  player. No draws. */
function callWraiths(w: World, e: Enemy): void {
  if (w.enemies.size >= MAX_ENEMIES - 20) return
  const U = UNDERTOW
  const a0 = Math.atan2(w.player.y - e.y, w.player.x - e.x)
  const unitR = ENEMIES[U.unit]!.radius
  for (let k = 0; k < U.count; k++) {
    const a = a0 + (k * TAU) / U.count
    spot.x = e.x + Math.cos(a) * U.ringR
    spot.y = e.y + Math.sin(a) * U.ringR
    clampSpot(w, unitR, EDGE_INSET)
    const s = spawnEnemy(w, U.unit, spot.x, spot.y)
    if (s) s.brood = w.bossFights
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
  const d = hypot(dx, dy) || 1
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

/** The boss body never leaves the cage (the frenzy shrinks it around her) or
 *  the arena: near a wall the ring reaches past it. */
function keepInCage(w: World, e: Enemy): void {
  if (!w.director.cage.active) return
  spot.x = e.x
  spot.y = e.y
  if (!clampSpot(w, e.radius, e.radius)) return
  e.x = spot.x
  e.y = spot.y
}
