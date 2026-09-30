import {
  BOSS_MIN_GAP,
  BOSS_SPAWN_DIST,
  BOSS_SPAWN_MIN_DIST,
  DEFER_AFTER_KILL,
  DEFER_DROP_LATE,
  DEFER_GAP,
  DMG_RAMP_PER_MIN,
  ELITE_WARN_LEAD,
  MID2_LATEST,
  PRACTICAL_CAP,
  RING_NEAR,
  RING_NEAR_UNTIL,
  RING_STD,
  TOPUP_RATE,
  WARN_LEAD,
} from '../config.ts'
import { clamp } from '../core/vec.ts'
import { ENEMIES } from '../content/enemies.ts'
import { AFFIX_BIT, BEAT_DRAW_SLOTS, type Beat, type MinuteRow } from '../content/runScripts.ts'
import { AlertKind, FF_BOSS, FF_ELITE, FeelKind } from '../effects/feelQueue.ts'
import type { World } from '../game/world.ts'
import { ringPointAt, ringSpawnPoint, ringOut, spawnEnemy } from './spawn.ts'

const TAU = Math.PI * 2
const DEG = Math.PI / 180
/** Spawn points stay this far inside the arena wall. */
const EDGE_INSET = 24
const DEFER_SLOTS = 4
const NEW_BUG = 'NEW BUG'
/** Indexed by the quadrant of the direction from the player (world up = screen up). */
const FROM_WORD = ['FROM THE EAST', 'FROM THE SOUTH', 'FROM THE WEST', 'FROM THE NORTH'] as const

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
  /** The boss cage (P6a raises it at arrival). While it is up, event and
   *  elite beats wait in `deferred` and lulls are skipped. */
  readonly cage = { active: false, x: 0, y: 0, r: 0, formingFrom: 0 }
  /** Held beat indices (-1 = empty slot); fire times are set when the cage
   *  drops (NaN until then). */
  readonly deferred = new Int16Array(DEFER_SLOTS)
  readonly deferredAt = new Float32Array(DEFER_SLOTS)

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
  }
}

function leadOf(b: Beat): number {
  if (b.kind === 'event' || b.kind === 'boss') return WARN_LEAD
  if (b.kind === 'elite') return ELITE_WARN_LEAD
  return 0
}

/**
 * One director step (stepSim slot: after the input sample, before the enemy
 * hash). Order: warnings, beats, deferred beats, boss arrival, then spawning.
 */
export function directorTick(world: World, dt: number): void {
  const d = world.director
  const s = world.script
  const beats = s.beats
  const t = world.time

  world.dmgMul = 1 + DMG_RAMP_PER_MIN * Math.min(t / 60, 12)

  while (d.warnCursor < beats.length && beats[d.warnCursor]!.at - leadOf(beats[d.warnCursor]!) <= t) {
    warnBeat(world, d.warnCursor)
    d.warnCursor++
  }
  while (d.beatCursor < beats.length && beats[d.beatCursor]!.at <= t) {
    fireOrDefer(world, d.beatCursor)
    d.beatCursor++
  }
  if (!d.cage.active) tickDeferred(world)
  tickBossArrival(world)

  const ri = Math.min(11, Math.floor(t / 60))
  const row = s.minutes[ri]!
  if (ri !== d.rowIndex) {
    d.rowIndex = ri
    if (row.debut) {
      world.alerts.push(world.feel, AlertKind.Debut, ENEMIES[row.debut]!.displayName, NEW_BUG, 0, 0, t, world.player.x, world.player.y)
    }
  }
  world.xpScale = row.xpScale

  const lull = t < d.lullUntil
  const minA = lull ? d.lullMin : row.minAlive
  const maxA = Math.min(PRACTICAL_CAP, row.maxAlive)
  d.topupAcc = Math.min(d.topupAcc + TOPUP_RATE * dt, 10)
  while (world.enemies.size < minA && d.topupAcc >= 1) {
    spawnPulseUnit(world, row)
    d.topupAcc -= 1
  }
  if (!lull) {
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
    case 'event':
      d.beatAng[off] = rng.angle()
      break
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
      break
    case 'lull':
      if (caged) break
      world.director.lullUntil = world.time + b.dur
      world.director.lullMin = world.script.minutes[Math.min(11, Math.floor(world.time / 60))]!.minAlive * b.minAliveMul
      if (b.alert) world.alerts.push(world.feel, AlertKind.Lull, b.alert.title, b.alert.sub, 0, 0, world.time, world.player.x, world.player.y)
      break
    case 'elite':
    case 'event':
      if (caged) defer(world, i)
      else fireBeat(world, i, false)
      break
    case 'boss':
      break
  }
}

/** Swarm events land in P7 (docs/NEXT-LEVEL.md 10.3); their S or G is already rolled. */
function fireBeat(world: World, i: number, late: boolean): void {
  const b = world.script.beats[i]!
  if (b.kind === 'elite') {
    if (late) pushEliteAlert(world, i)
    fireElites(world, i)
  }
}

function defer(world: World, i: number): void {
  const d = world.director
  for (let k = 0; k < DEFER_SLOTS; k++) {
    if (d.deferred[k] === -1) {
      d.deferred[k] = i
      d.deferredAt[k] = Number.NaN
      return
    }
  }
  fireBeat(world, i, true)
}

function tickDeferred(world: World): void {
  const d = world.director
  const t = world.time
  for (let k = 0; k < DEFER_SLOTS; k++) {
    const i = d.deferred[k]!
    if (i < 0 || !(t >= d.deferredAt[k]!)) continue
    d.deferred[k] = -1
    const b = world.script.beats[i]!
    if (b.kind === 'event' && t - b.at > DEFER_DROP_LATE) continue
    fireBeat(world, i, true)
  }
}

/** A boss died: the cage drops and the held beats are scheduled in beat order. */
export function directorBossKilled(world: World): void {
  const d = world.director
  world.bossAlive = false
  world.boss = null
  d.lastBossKillAt = world.time
  d.cage.active = false
  let at = world.time + DEFER_AFTER_KILL
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

function tickBossArrival(world: World): void {
  const d = world.director
  if (d.bossBeat < 0 || world.bossAlive) return
  const b = world.script.beats[d.bossBeat]!
  if (b.kind !== 'boss') return
  const t = world.time
  const arrive = Math.max(b.at, d.lastBossKillAt + BOSS_MIN_GAP)
  if (b.stage === 'mid2' && arrive > MID2_LATEST) {
    d.bossBeat = -1
    return
  }
  const text = world.script.text[b.stage]
  const ang = d.beatAng[world.script.drawOff[d.bossBeat]!]!
  if (!d.bossWarned && t >= arrive - WARN_LEAD) {
    d.bossWarned = true
    const kind = b.stage === 'final' ? AlertKind.Final : AlertKind.Boss
    world.alerts.push(world.feel, kind, text.title, text.sub, Math.cos(ang), Math.sin(ang), t, world.player.x, world.player.y)
  }
  if (t >= arrive && spawnBossAt(world, ang)) {
    d.bossTitle = text.title
    d.bossBeat = -1
  }
}

/** The boss appears BOSS_SPAWN_DIST from the player along its rolled angle,
 *  flipped when the arena wall would pull it too close. P6a spawns
 *  `boss.primeId` for the final stage once the PRIME defs exist. */
function spawnBossAt(world: World, ang: number): boolean {
  const id = world.script.boss.midId
  const def = ENEMIES[id]!
  const pl = world.player
  const b = world.arena.bounds
  const inset = def.radius + EDGE_INSET
  let x = clamp(pl.x + Math.cos(ang) * BOSS_SPAWN_DIST, b.x + inset, b.x + b.w - inset)
  let y = clamp(pl.y + Math.sin(ang) * BOSS_SPAWN_DIST, b.y + inset, b.y + b.h - inset)
  const dx = x - pl.x
  const dy = y - pl.y
  if (dx * dx + dy * dy < BOSS_SPAWN_MIN_DIST * BOSS_SPAWN_MIN_DIST) {
    x = clamp(pl.x - Math.cos(ang) * BOSS_SPAWN_DIST, b.x + inset, b.x + b.w - inset)
    y = clamp(pl.y - Math.sin(ang) * BOSS_SPAWN_DIST, b.y + inset, b.y + b.h - inset)
  }
  const boss = spawnEnemy(world, id, x, y)
  if (!boss) return false
  world.beginBossFight()
  world.bossAlive = true
  world.boss = boss
  world.feel.emit(FeelKind.BossSpawn, FF_BOSS, boss.x, boss.y, 0, 0, boss.def)
  return true
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
    if (e) world.feel.emit(FeelKind.EliteSpawn, FF_ELITE, e.x, e.y, 0, 0, e.def)
  }
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

function pushEliteAlert(world: World, i: number): void {
  const d = world.director
  const ang = d.beatAng[world.script.drawOff[i]!]!
  const dx = Math.cos(ang)
  const dy = Math.sin(ang)
  const q = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 2)) % 4) + 4) % 4
  const name = ENEMIES[world.script.eliteId]!.displayName
  world.alerts.push(world.feel, AlertKind.Elite, name, FROM_WORD[q]!, dx, dy, world.time, world.player.x, world.player.y)
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
  spawnEnemy(world, id, ringOut.x, ringOut.y)
}

/** DEV: jump the run to `t` with nothing earlier fired; the beat at `t`
 *  (FINAL SWARM for 600) fires on the next step. */
export function directorJumpTo(world: World, t: number): void {
  const d = world.director
  const beats = world.script.beats
  let i = 0
  while (i < beats.length && beats[i]!.at < t) i++
  world.time = t
  d.beatCursor = i
  d.warnCursor = i
  d.lullUntil = 0
  d.pulseT = 0
  d.rowIndex = Math.min(11, Math.floor(t / 60))
  d.bossBeat = -1
  d.bossWarned = false
  d.cage.active = false
  d.deferred.fill(-1)
  d.deferredAt.fill(Number.NaN)
}
