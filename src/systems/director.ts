import {
  BOSS_BUILD_MAX,
  BOSS_DPS_REF,
  BOSS_HP_EXP,
  BOSS_MARKER_LEAD,
  BOSS_MARKER_R,
  BOSS_MIN_GAP,
  BOSS_SPAWN_DIST,
  CAGE_OUTSIDE_MIN,
  CAGE_PLAYER_PAD,
  CAGE_R,
  CAGE_R_MIN,
  CAGE_SHOCK_PAD,
  CAGE_SPAWN_PAD,
  CAGE_WALL_PAD,
  DEFER_AFTER_KILL,
  DEFER_DROP_LATE,
  DEFER_GAP,
  DMG_RAMP_PER_MIN,
  ELITE_AFFIX_HP,
  ELITE_HP_MUL,
  ELITE_WARN_LEAD,
  EVENT_SLOTS,
  FRENZY_AFTER,
  FRENZY_CADENCE,
  FRENZY_CADENCE_MAX,
  FRENZY_CAGE_STEP,
  FRENZY_STEP,
  GRACE,
  MID2_LATEST,
  POST_BOSS_LULL,
  POST_BOSS_LULL_MIN,
  PRACTICAL_CAP,
  PURGE_RADIUS,
  PURGE_SEC,
  RING_NEAR,
  RING_NEAR_UNTIL,
  RING_STD,
  STALEMATE_AFTER,
  TOPUP_RATE,
  WARN_LEAD,
  WIN_PANEL_DELAY,
} from '../config.ts'
import { clamp } from '../core/vec.ts'
import { AFFIX_BIT, tagTitle } from '../content/affixes.ts'
import { BOSS_STAGES } from '../content/bosses.ts'
import { ENEMIES } from '../content/enemies.ts'
import { BEAT_DRAW_SLOTS, DEFER_SLOTS, MAX_BEATS, eventDef, type Beat, type BossStage, type MinuteRow } from '../content/runScripts.ts'
import { WEAPONS } from '../content/weapons.ts'
import { spawnPoof } from '../effects/fx.ts'
import { AlertKind, FF_BOSS, FF_ELITE, FeelKind } from '../effects/feelQueue.ts'
import type { Enemy } from '../game/enemy.ts'
import { scoreClear } from '../game/scoring.ts'
import { HZ_CIRCLE, type Hazard } from '../game/hazard.ts'
import type { World } from '../game/world.ts'
import { applyAffixes } from './ai.ts'
import { cancelBossTelegraph } from './bossAI.ts'
import { EventRun, FROM_WORD, clearEvents, eventAlert, fitSide, quadrant, rollEvent, startEvent, tickEvents } from './events.ts'
import { clearHazards, clearHazardsNear, spawnHazard } from './hazards.ts'
import { ringPointAt, ringSpawnPoint, ringOut, spawnEnemy } from './spawn.ts'

export type RunState = 'running' | 'won' | 'overtime' | 'stalemate'

const TAU = Math.PI * 2
const DEG = Math.PI / 180
/** Spawn points stay this far inside the arena wall. */
const EDGE_INSET = 24
const NEW_BUG = 'NEW BUG'

/**
 * Run-arc state (docs/NEXT-LEVEL.md 4.1, A7.3). Allocated once with the World
 * and reset per run; the tick never allocates.
 */
export class Director {
  pulseT = 2
  topupAcc = 0
  /** Next beat to fire, and next beat to warn (roll its script draws). */
  beatCursor = 0
  warnCursor = 0
  lullUntil = 0
  lullMin = 0
  rowIndex = 0
  /** Per-beat script draws (radians, or a pack radius), at ResolvedScript.drawOff. */
  readonly beatAng = new Float32Array(BEAT_DRAW_SLOTS)
  /** Affix mask per elite, at the same slot as that elite's side in beatAng. */
  readonly beatAffix = new Uint8Array(BEAT_DRAW_SLOTS)
  /** Boss beat waiting for its arrival (-1 = none), and whether its alert played. */
  bossBeat = -1
  bossWarned = false
  bossTitle = ''
  lastBossKillAt = -1e9
  /** The boss cage, raised at arrival (`formingFrom` = that sim time). While
   *  it is up, event and elite beats wait in `deferred` and lulls are skipped. */
  readonly cage = { active: false, x: 0, y: 0, r: 0, formingFrom: 0 }
  /** Held beat indices (-1 = empty slot); fire times are set when the cage
   *  drops (NaN until then). A held beat's alert plays its lead before it fires. */
  readonly deferred = new Int16Array(DEFER_SLOTS)
  readonly deferredAt = new Float32Array(DEFER_SLOTS)
  readonly deferWarned = new Uint8Array(DEFER_SLOTS)
  /** Swarm event parts in emission (section 4.7). */
  readonly events: EventRun[] = []
  /** Sim time each beat fired: NaN until it does, -1 when the rules dropped
   *  or skipped it (an event too late, a lull in the cage, mid2 too late). */
  readonly firedAt = new Float32Array(MAX_BEATS)
  /** The coming boss's arrival marker and its seq (a recycled hazard has another). */
  marker: Hazard | null = null
  markerSeq = 0
  fightStart = 0
  nextFrenzyAt = 0
  /** FRENZY steps taken this fight. */
  frenzy = 0
  runState: RunState = 'running'
  clearTime = 0
  /** Win purge: seconds since the PRIME died, and where it died. */
  purgeT = 0
  purgeX = 0
  purgeY = 0
  /** The current fight's brood alive (aiSystem counts it each tick). */
  broodCount = 0
  bossesKilled = 0

  constructor() {
    for (let i = 0; i < EVENT_SLOTS; i++) this.events.push(new EventRun())
  }

  reset(): void {
    this.pulseT = 2
    this.topupAcc = 0
    this.beatCursor = 0
    this.warnCursor = 0
    this.lullUntil = 0
    this.lullMin = 0
    this.rowIndex = 0
    this.beatAng.fill(0)
    this.beatAffix.fill(0)
    this.bossBeat = -1
    this.bossWarned = false
    this.bossTitle = ''
    this.lastBossKillAt = -1e9
    this.cage.active = false
    this.deferred.fill(-1)
    this.deferredAt.fill(Number.NaN)
    this.deferWarned.fill(0)
    for (let i = 0; i < this.events.length; i++) {
      this.events[i]!.active = false
      this.events[i]!.part = null
    }
    this.firedAt.fill(Number.NaN)
    this.marker = null
    this.markerSeq = 0
    this.fightStart = 0
    this.nextFrenzyAt = 0
    this.frenzy = 0
    this.runState = 'running'
    this.clearTime = 0
    this.purgeT = 0
    this.broodCount = 0
    this.bossesKilled = 0
  }
}

function leadOf(b: Beat): number {
  if (b.kind === 'event' || b.kind === 'boss') return WARN_LEAD
  if (b.kind === 'elite') return ELITE_WARN_LEAD
  return 0
}

/**
 * One director step (stepSim slot: after the input sample, before the enemy
 * hash). Order: warnings, beats, deferred beats, boss arrival, the fight
 * (frenzy, stalemate), then spawning. After the win it only runs the purge.
 */
export function directorTick(world: World, dt: number): void {
  const d = world.director
  const s = world.script
  const beats = s.beats
  const t = world.time

  world.dmgMul = 1 + DMG_RAMP_PER_MIN * Math.min(t / 60, 12)
  if (d.runState === 'won') {
    tickWin(world, dt)
    return
  }
  if (d.runState === 'stalemate') return

  while (d.warnCursor < beats.length && beats[d.warnCursor]!.at - leadOf(beats[d.warnCursor]!) <= t) {
    warnBeat(world, d.warnCursor)
    d.warnCursor++
  }
  while (d.beatCursor < beats.length && beats[d.beatCursor]!.at <= t) {
    fireOrDefer(world, d.beatCursor)
    d.beatCursor++
  }
  if (!d.cage.active) tickDeferred(world)
  tickEvents(world, dt)
  tickBossArrival(world)
  tickFight(world)
  if (d.runState !== 'running' && d.runState !== 'overtime') return

  const ri = Math.min(11, Math.floor(t / 60))
  const row = s.minutes[ri]!
  if (ri !== d.rowIndex) {
    d.rowIndex = ri
    if (row.debut) {
      world.alerts.push(world.feel, AlertKind.Debut, ENEMIES[row.debut]!.displayName, NEW_BUG, 0, 0, t, world.player.x, world.player.y)
    }
  }
  world.xpScale = row.xpScale

  // Inside a cage the floor counts only the swarm outside it (not the boss or its brood).
  const caged = d.cage.active
  const lull = !caged && t < d.lullUntil
  let alive = world.enemies.size
  let minA = lull ? d.lullMin : row.minAlive
  if (caged) {
    alive -= d.broodCount + (world.bossAlive ? 1 : 0)
    minA = CAGE_OUTSIDE_MIN[s.arenaId]!
  }
  const maxA = Math.min(PRACTICAL_CAP, row.maxAlive)
  d.topupAcc = Math.min(d.topupAcc + TOPUP_RATE * dt, 10)
  while (alive < minA && d.topupAcc >= 1) {
    spawnPulseUnit(world, row)
    alive++
    d.topupAcc -= 1
  }
  if (!lull && !caged) {
    d.pulseT -= dt
    if (d.pulseT <= 0) {
      d.pulseT += row.every
      for (let n = Math.min(row.batch, maxA - world.enemies.size); n > 0; n--) spawnPulseUnit(world, row)
    }
  }
}

/** Roll a beat's script draws (fixed count per beat, A7.1) and push its alert. */
function warnBeat(world: World, i: number): void {
  const b = world.script.beats[i]!
  const d = world.director
  const rng = world.rngs.script
  const off = world.script.drawOff[i]!
  switch (b.kind) {
    case 'pack':
      if (b.arc >= 360) for (let k = 0; k < b.count; k++) d.beatAng[off + k] = b.rMin + (b.rMax - b.rMin) * rng.float()
      else d.beatAng[off] = rng.angle()
      break
    case 'elite': {
      const pool = world.script.affixPool
      for (let k = 0; k < b.count; k++) {
        d.beatAng[off + k] = sideAngle(world, rng.angle())
        let mask = 0
        for (let a = 0; a < b.affixes; a++) {
          let left = 0
          for (let p = 0; p < pool.length; p++) if ((mask & AFFIX_BIT[pool[p]!]) === 0) left++
          let pick = Math.floor(rng.float() * left)
          for (let p = 0; p < pool.length; p++) {
            const bit = AFFIX_BIT[pool[p]!]
            if ((mask & bit) !== 0) continue
            if (pick-- === 0) {
              mask |= bit
              break
            }
          }
        }
        d.beatAffix[off + k] = mask
      }
      if (!d.cage.active) pushEliteAlert(world, i)
      break
    }
    case 'event': {
      const def = eventDef(world.script, b.id)
      rollEvent(world, def, off)
      if (!d.cage.active) eventAlert(world, def, d.beatAng[off]!)
      break
    }
    case 'boss':
      d.beatAng[off] = rng.angle()
      d.bossBeat = i
      d.bossWarned = false
      break
    case 'lull':
      break
  }
}

function fireOrDefer(world: World, i: number): void {
  const b = world.script.beats[i]!
  const caged = world.director.cage.active
  switch (b.kind) {
    case 'pack':
      firePack(world, i)
      world.director.firedAt[i] = world.time
      break
    case 'lull':
      if (caged) {
        world.director.firedAt[i] = -1
        break
      }
      world.director.firedAt[i] = world.time
      world.director.lullUntil = world.time + b.dur
      world.director.lullMin = world.script.minutes[Math.min(11, Math.floor(world.time / 60))]!.minAlive * b.minAliveMul
      if (b.alert) world.alerts.push(world.feel, AlertKind.Lull, b.alert.title, b.alert.sub, 0, 0, world.time, world.player.x, world.player.y)
      break
    case 'elite':
    case 'event':
      if (caged) defer(world, i)
      else fireBeat(world, i)
      break
    case 'boss':
      break
  }
}

/** An elite or event beat fires; its draws were rolled at warn time. */
function fireBeat(world: World, i: number): void {
  const b = world.script.beats[i]!
  world.director.firedAt[i] = world.time
  if (b.kind === 'elite') fireElites(world, i)
  else if (b.kind === 'event') startEvent(world, i, eventDef(world.script, b.id), world.script.drawOff[i]!)
}

/** resolveScript guarantees a slot for every event and elite beat, so a held
 *  beat is never dropped for room and never fires inside the cage. */
function defer(world: World, i: number): void {
  const d = world.director
  for (let k = 0; k < DEFER_SLOTS; k++) {
    if (d.deferred[k] === -1) {
      d.deferred[k] = i
      d.deferredAt[k] = Number.NaN
      d.deferWarned[k] = 0
      return
    }
  }
}

function tickDeferred(world: World): void {
  const d = world.director
  const t = world.time
  for (let k = 0; k < DEFER_SLOTS; k++) {
    const i = d.deferred[k]!
    if (i < 0) continue
    const at = d.deferredAt[k]!
    const b = world.script.beats[i]!
    const dropped = b.kind === 'event' && at - b.at > DEFER_DROP_LATE
    if (d.deferWarned[k] === 0 && t >= at - leadOf(b)) {
      d.deferWarned[k] = 1
      if (!dropped) warnLate(world, i)
    }
    if (!(t >= at)) continue
    d.deferred[k] = -1
    if (dropped) d.firedAt[i] = -1
    else fireBeat(world, i)
  }
}

/** A held beat's alert, its lead before it fires. An event's side is fitted
 *  again around where the player now stands (no draw). */
function warnLate(world: World, i: number): void {
  const b = world.script.beats[i]!
  if (b.kind === 'elite') {
    pushEliteAlert(world, i)
  } else if (b.kind === 'event') {
    const def = eventDef(world.script, b.id)
    const off = world.script.drawOff[i]!
    const ang = world.director.beatAng
    ang[off] = fitSide(world, ang[off]!, def.fit)
    eventAlert(world, def, ang[off]!)
  }
}

/** collisionSystem killed the boss. A mid boss drops the cage, starts the
 *  post-boss lull and schedules the held beats in beat order; the PRIME wins
 *  the run. */
export function directorBossKilled(world: World, e: Enemy): void {
  const d = world.director
  const t = world.time
  cancelBossTelegraph(world)
  world.bossAlive = false
  world.boss = null
  d.bossesKilled++
  d.cage.active = false
  if (world.bossFight.stage === 'final') {
    win(world, e)
    return
  }
  d.lastBossKillAt = t
  d.lullUntil = t + POST_BOSS_LULL
  d.lullMin = world.script.minutes[Math.min(11, Math.floor(t / 60))]!.minAlive * POST_BOSS_LULL_MIN
  let at = t + DEFER_AFTER_KILL
  let prev = -1
  for (;;) {
    let slot = -1
    for (let k = 0; k < DEFER_SLOTS; k++) {
      const i = d.deferred[k]!
      if (i > prev && (slot < 0 || i < d.deferred[slot]!)) slot = k
    }
    if (slot < 0) break
    prev = d.deferred[slot]!
    d.deferredAt[slot] = at
    at += DEFER_GAP
  }
}

/** The PRIME died: the run is cleared. Enemy shots and hazards go at once, the
 *  swarm is purged outward from the kill point, and the panel hand-off follows. */
function win(world: World, e: Enemy): void {
  const d = world.director
  d.runState = 'won'
  d.clearTime = world.time
  world.cleared = true
  scoreClear(world)
  world.player.grantInvuln(GRACE.win, 2)
  clearEvents(world)
  d.purgeT = 0
  d.purgeX = e.x
  d.purgeY = e.y
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) eps[i]!.alive = false
  clearHazards(world)
  world.feel.emit(FeelKind.Win, 0, e.x, e.y)
}

/** Purged enemies give no credit, XP, drops or score. */
function tickWin(world: World, dt: number): void {
  const d = world.director
  if (d.purgeT < PURGE_SEC) {
    d.purgeT = Math.min(PURGE_SEC, d.purgeT + dt)
    const r = (PURGE_RADIUS * d.purgeT) / PURGE_SEC
    const a = world.enemies.active
    for (let i = 0; i < a.length; i++) {
      const e = a[i]!
      if (!e.alive || e.def.boss) continue
      const dx = e.x - d.purgeX
      const dy = e.y - d.purgeY
      if (dx * dx + dy * dy > r * r) continue
      e.alive = false
      spawnPoof(world, e.x, e.y, e.gibTint, 3)
    }
  }
  if (!world.pendingWin && world.time >= d.clearTime + WIN_PANEL_DELAY) world.pendingWin = true
}

/** FRENZY steps and the PRIME's stalemate. */
function tickFight(world: World): void {
  const d = world.director
  const boss = world.boss
  if (!world.bossAlive || !boss) return
  const t = world.time
  if (world.bossFight.stage === 'final' && t >= d.fightStart + STALEMATE_AFTER) {
    cancelBossTelegraph(world)
    boss.alive = false
    spawnPoof(world, boss.x, boss.y, boss.gibTint, 16)
    world.bossAlive = false
    world.boss = null
    d.cage.active = false
    d.runState = 'stalemate'
    world.pendingEnd = true
    world.feel.emit(FeelKind.Stalemate, 0, boss.x, boss.y)
    return
  }
  if (t >= d.nextFrenzyAt) {
    d.nextFrenzyAt += FRENZY_STEP
    // Past both caps a step changes nothing, so it is not announced.
    if (d.cage.r > CAGE_R_MIN || Math.pow(FRENZY_CADENCE, d.frenzy) < FRENZY_CADENCE_MAX) {
      d.frenzy++
      d.cage.r = Math.max(CAGE_R_MIN, d.cage.r - FRENZY_CAGE_STEP)
      world.feel.emit(FeelKind.BossFrenzy, FF_BOSS, boss.x, boss.y, d.frenzy)
    }
  }
}

/** Boss arrival (section 4.7): the alert at WARN_LEAD, the marker at
 *  BOSS_MARKER_LEAD, then the cage and the boss on the same tick. The final
 *  beat arriving while a mid boss lives makes that boss ascend instead. */
function tickBossArrival(world: World): void {
  const d = world.director
  if (d.bossBeat < 0) return
  const b = world.script.beats[d.bossBeat]!
  if (b.kind !== 'boss') return
  if (world.bossAlive && b.stage !== 'final') return
  const t = world.time
  const arrive = Math.max(b.at, d.lastBossKillAt + BOSS_MIN_GAP)
  if (b.stage === 'mid2' && arrive > MID2_LATEST) {
    d.firedAt[d.bossBeat] = -1
    d.bossBeat = -1
    return
  }
  const text = world.script.text[b.stage]
  const ang = d.beatAng[world.script.drawOff[d.bossBeat]!]!
  const pl = world.player
  if (!d.bossWarned && t >= arrive - WARN_LEAD) {
    d.bossWarned = true
    const boss = world.boss
    if (world.bossAlive && boss) {
      bossOut.x = boss.x
      bossOut.y = boss.y
    } else {
      bossPoint(world, ang)
    }
    const len = Math.hypot(bossOut.x - pl.x, bossOut.y - pl.y) || 1
    const kind = b.stage === 'final' ? AlertKind.Final : AlertKind.Boss
    world.alerts.push(world.feel, kind, text.title, text.sub, (bossOut.x - pl.x) / len, (bossOut.y - pl.y) / len, t, pl.x, pl.y)
  }
  if (world.bossAlive) {
    if (t >= arrive && ascend(world)) {
      d.bossTitle = text.title
      d.firedAt[d.bossBeat] = t
      d.bossBeat = -1
    }
    return
  }
  if (t >= arrive - BOSS_MARKER_LEAD && t < arrive) {
    bossPoint(world, ang)
    const m = d.marker
    if (m && m.alive && m.seq === d.markerSeq) {
      m.x = bossOut.x
      m.y = bossOut.y
    } else if (!m) {
      const h = spawnHazard(world, HZ_CIRCLE, bossOut.x, bossOut.y, BOSS_MARKER_R, arrive - t, 0, 0)
      if (h) d.markerSeq = h.seq
      d.marker = h
    }
  }
  if (t >= arrive && spawnBoss(world, b.stage, ang)) {
    d.bossTitle = text.title
    d.firedAt[d.bossBeat] = t
    d.bossBeat = -1
    d.marker = null
  }
}

const bossOut = { x: 0, y: 0 }
const cageOut = { x: 0, y: 0, r: 0 }

/** The cage for a fight starting now (section 4.7): the center keeps the ring
 *  CAGE_WALL_PAD inside the arena walls, and the radius grows until the ring
 *  clears the player by CAGE_PLAYER_PAD. */
function cageFor(world: World): void {
  const pl = world.player
  const b = world.arena.bounds
  const pad = CAGE_R + CAGE_WALL_PAD
  cageOut.x = b.w > 2 * pad ? clamp(pl.x, b.x + pad, b.x + b.w - pad) : b.x + b.w / 2
  cageOut.y = b.h > 2 * pad ? clamp(pl.y, b.y + pad, b.y + b.h - pad) : b.y + b.h / 2
  cageOut.r = Math.max(CAGE_R, Math.hypot(pl.x - cageOut.x, pl.y - cageOut.y) + CAGE_PLAYER_PAD)
}

/** Turns tried from the rolled spawn angle, in order: the roll, its opposite,
 *  then 30 degree steps either side. Near a wall or a corner only some of them
 *  land inside both the arena and the cage. */
const SPAWN_TURNS = [0, 180, 30, -30, 210, 150, 60, -60, 240, 120, 90, 270].map((d) => d * DEG)

/** Where the boss emerges, the arrival marker's spot: BOSS_SPAWN_DIST from the
 *  player along the first turn of `ang` that keeps the body inside the arena
 *  and the cage. No draws, so every tick of the marker lead agrees with the spawn. */
function bossPoint(world: World, ang: number): void {
  cageFor(world)
  const pl = world.player
  const r = ENEMIES[world.script.boss.primeId]!.radius
  for (let k = 0; k < SPAWN_TURNS.length; k++) {
    const a = ang + SPAWN_TURNS[k]!
    bossOut.x = pl.x + Math.cos(a) * BOSS_SPAWN_DIST
    bossOut.y = pl.y + Math.sin(a) * BOSS_SPAWN_DIST
    if (inArena(world, bossOut.x, bossOut.y, r + EDGE_INSET) && inCage(bossOut.x, bossOut.y, r + 20)) return
  }
  // Toward the cage center always fits: the ring clears the player by
  // CAGE_PLAYER_PAD and its center sits CAGE_R + CAGE_WALL_PAD inside the walls.
  const dx = cageOut.x - pl.x
  const dy = cageOut.y - pl.y
  const len = Math.hypot(dx, dy) || 1
  bossOut.x = pl.x + (dx / len) * BOSS_SPAWN_DIST
  bossOut.y = pl.y + (dy / len) * BOSS_SPAWN_DIST
}

function inArena(world: World, x: number, y: number, inset: number): boolean {
  const b = world.arena.bounds
  return x >= b.x + inset && x <= b.x + b.w - inset && y >= b.y + inset && y <= b.y + b.h - inset
}

function inCage(x: number, y: number, inset: number): boolean {
  const r = cageOut.r - inset
  const dx = x - cageOut.x
  const dy = y - cageOut.y
  return dx * dx + dy * dy <= r * r
}

/** The boss arrives: cage up, shockwave, then the boss in EMERGE, all on one tick. */
function spawnBoss(world: World, stage: BossStage, ang: number): boolean {
  bossPoint(world, ang)
  const id = stage === 'final' ? world.script.boss.primeId : world.script.boss.midId
  const boss = spawnEnemy(world, id, bossOut.x, bossOut.y)
  if (!boss) return false
  const c = world.director.cage
  c.active = true
  c.x = cageOut.x
  c.y = cageOut.y
  c.r = cageOut.r
  c.formingFrom = world.time
  shockwave(world)
  beginFight(world, boss, stage)
  return true
}

/** The mid boss still alive at the final beat becomes the PRIME: it leaves with
 *  no credit and the PRIME takes its place at full HP in the same cage. */
function ascend(world: World): boolean {
  const old = world.boss
  if (!old) return false
  const boss = spawnEnemy(world, world.script.boss.primeId, old.x, old.y)
  if (!boss) return false
  cancelBossTelegraph(world)
  old.alive = false
  spawnPoof(world, old.x, old.y, old.gibTint, 16)
  beginFight(world, boss, 'final')
  return true
}

function beginFight(world: World, boss: Enemy, stage: BossStage): void {
  const d = world.director
  boss.hp = boss.maxHp = Math.round(BOSS_STAGES[stage].hpBase * world.script.boss.worldMul * buildHpScale(world))
  boss.submerged = true
  world.beginBossFight()
  world.bossFight.begin(stage)
  world.bossAlive = true
  world.boss = boss
  d.fightStart = world.time
  d.nextFrenzyAt = world.time + FRENZY_AFTER
  d.frenzy = 0
  world.feel.emit(FeelKind.BossSpawn, FF_BOSS, boss.x, boss.y, 0, 0, boss.def)
}

/** Arrival shockwave: the swarm is thrown clear of the ring, and enemy shots,
 *  acid and hazards inside it are removed. */
function shockwave(world: World): void {
  const c = world.director.cage
  const r2 = c.r * c.r
  const a = world.enemies.active
  for (let i = 0; i < a.length; i++) {
    const e = a[i]!
    if (!e.alive || e.def.boss) continue
    const dx = e.x - c.x
    const dy = e.y - c.y
    const min = c.r + CAGE_SHOCK_PAD + e.radius
    const d2 = dx * dx + dy * dy
    if (d2 >= min * min) continue
    const dd = Math.sqrt(d2)
    e.x = e.prevX = dd > 1e-6 ? c.x + (dx / dd) * min : c.x + min
    e.y = e.prevY = dd > 1e-6 ? c.y + (dy / dd) * min : c.y
  }
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 < r2) p.alive = false
  }
  const acid = world.acid.active
  for (let i = 0; i < acid.length; i++) {
    const ap = acid[i]!
    if ((ap.x - c.x) ** 2 + (ap.y - c.y) ** 2 < r2) ap.alive = false
  }
  clearHazardsNear(world, c.x, c.y, c.r)
}

/** Base weapon DPS with the build's multipliers (section 4.7); crits, Giant
 *  Slayer, AoE and pickup weapons stay out of it. */
function estimateBaseDps(world: World): number {
  const wd = WEAPONS[world.baseWeaponId]!
  const m = world.mods
  return wd.fireRate * m.fireRateMul * wd.damage * m.damageMul * (wd.projectilesPerShot + m.extraProjectiles)
}

/** Boss and elite HP scale with the build: clamp(dps / 88, 1, 12) ** 0.75. */
function buildHpScale(world: World): number {
  return Math.pow(clamp(estimateBaseDps(world) / BOSS_DPS_REF, 1, BOSS_BUILD_MAX), BOSS_HP_EXP)
}

/** stepSim, right after player.update: the player stays inside the ring. */
export function clampPlayerToCage(world: World): void {
  const c = world.director.cage
  if (!c.active) return
  const pl = world.player
  const max = c.r - pl.radius
  const dx = pl.x - c.x
  const dy = pl.y - c.y
  const d2 = dx * dx + dy * dy
  if (d2 <= max * max) return
  const k = max / Math.sqrt(d2)
  pl.x = c.x + dx * k
  pl.y = c.y + dy * k
}

function firePack(world: World, i: number): void {
  const b = world.script.beats[i]!
  if (b.kind !== 'pack') return
  const d = world.director
  const off = world.script.drawOff[i]!
  const pl = world.player
  const full = b.arc >= 360
  const span = b.arc * DEG
  for (let k = 0; k < b.count; k++) {
    let a: number
    let r: number
    if (full) {
      a = (k / b.count) * TAU
      r = d.beatAng[off + k]!
    } else {
      const f = b.count > 1 ? k / (b.count - 1) : 0.5
      a = d.beatAng[off]! + (f - 0.5) * span
      r = b.rMin + (b.rMax - b.rMin) * f
    }
    spawnInside(world, b.unit, pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r)
  }
}

function fireElites(world: World, i: number): void {
  const b = world.script.beats[i]!
  if (b.kind !== 'elite') return
  const d = world.director
  const off = world.script.drawOff[i]!
  const half = world.time < RING_NEAR_UNTIL ? RING_NEAR : RING_STD
  for (let k = 0; k < b.count; k++) {
    ringPointAt(world, d.beatAng[off + k]!, half)
    const e = spawnInside(world, world.script.eliteId, ringOut.x, ringOut.y)
    if (!e) continue
    const mask = d.beatAffix[off + k]!
    e.hp = e.maxHp = Math.round(e.maxHp * b.hpMul * ELITE_HP_MUL * buildHpScale(world) * (1 + ELITE_AFFIX_HP * bitCount(mask)))
    applyAffixes(e, mask)
    world.feel.emit(FeelKind.EliteSpawn, FF_ELITE, e.x, e.y, 0, 0, e.def)
  }
}

function bitCount(v: number): number {
  let n = 0
  for (; v !== 0; v &= v - 1) n++
  return n
}

/** The elite's side as rolled, or its opposite when the ring point on that side
 *  falls outside the arena from where the player stands now. */
function sideAngle(world: World, ang: number): number {
  const half = world.time + ELITE_WARN_LEAD < RING_NEAR_UNTIL ? RING_NEAR : RING_STD
  ringPointAt(world, ang, half)
  const b = world.arena.bounds
  const inside = ringOut.x >= b.x && ringOut.x <= b.x + b.w && ringOut.y >= b.y && ringOut.y <= b.y + b.h
  return inside ? ang : ang + Math.PI
}

/** The alert names the first elite's side; its title is that elite's name
 *  tag, or the elite's name and the count when several come at once. */
function pushEliteAlert(world: World, i: number): void {
  const d = world.director
  const b = world.script.beats[i]!
  const off = world.script.drawOff[i]!
  const ang = d.beatAng[off]!
  const def = ENEMIES[world.script.eliteId]!
  const count = b.kind === 'elite' ? b.count : 1
  const title = count > 1 ? def.displayName + ' x' + count : tagTitle(def.idx, d.beatAffix[off]!)
  world.alerts.push(world.feel, AlertKind.Elite, title, FROM_WORD[quadrant(ang)]!, Math.cos(ang), Math.sin(ang), world.time, world.player.x, world.player.y)
}

function spawnInside(world: World, id: string, x: number, y: number) {
  const b = world.arena.bounds
  return spawnEnemy(world, id, clamp(x, b.x + EDGE_INSET, b.x + b.w - EDGE_INSET), clamp(y, b.y + EDGE_INSET, b.y + b.h - EDGE_INSET))
}

/** One weighted pick from the row mix plus a ring point: three spawn draws. */
function spawnPulseUnit(world: World, row: MinuteRow): void {
  const mix = row.mix
  let total = 0
  for (let k = 0; k < mix.length; k++) total += mix[k]![1]
  const rng = world.rngs.spawn
  let roll = rng.float() * total
  let id = mix[0]![0]
  for (let k = 0; k < mix.length; k++) {
    roll -= mix[k]![1]
    if (roll <= 0) {
      id = mix[k]![0]
      break
    }
  }
  ringSpawnPoint(world, world.time < RING_NEAR_UNTIL ? RING_NEAR : RING_STD)
  const c = world.director.cage
  if (c.active) {
    // Keep arrivals clear of the ring: project outward from the cage center.
    const min = c.r + CAGE_SPAWN_PAD
    const dx = ringOut.x - c.x
    const dy = ringOut.y - c.y
    const d2 = dx * dx + dy * dy
    if (d2 < min * min) {
      const dd = Math.sqrt(d2)
      ringOut.x = dd > 1e-6 ? c.x + (dx / dd) * min : c.x + min
      ringOut.y = dd > 1e-6 ? c.y + (dy / dd) * min : c.y
    }
  }
  spawnEnemy(world, id, ringOut.x, ringOut.y)
}

/** DEV: jump the run to `t` with nothing earlier fired; the beat at `t`
 *  (FINAL SWARM for 600) fires on the next step. A boss still alive keeps its
 *  cage and its fight clocks move with the jump. */
export function directorJumpTo(world: World, t: number): void {
  const d = world.director
  const beats = world.script.beats
  let i = 0
  while (i < beats.length && beats[i]!.at < t) i++
  if (world.bossAlive) {
    d.fightStart += t - world.time
    d.nextFrenzyAt += t - world.time
  } else {
    d.cage.active = false
  }
  world.time = t
  d.beatCursor = i
  d.warnCursor = i
  d.lullUntil = 0
  d.pulseT = 0
  d.rowIndex = Math.min(11, Math.floor(t / 60))
  d.bossBeat = -1
  d.bossWarned = false
  d.marker = null
  d.deferred.fill(-1)
  d.deferredAt.fill(Number.NaN)
  d.deferWarned.fill(0)
  clearEvents(world)
}
