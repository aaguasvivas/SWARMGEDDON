import { FIXED_DT, MAX_ENEMIES, SPAWN_ROOM } from '../config.ts'
import { clamp } from '../core/vec.ts'
import { partDraws, type EventPart, type SwarmEventDef } from '../content/runScripts.ts'
import { AlertKind, FeelKind } from '../effects/feelQueue.ts'
import type { Enemy } from '../game/enemy.ts'
import { HZ_CIRCLE, HZ_END_MAGMA, HZ_END_SPAWN } from '../game/hazard.ts'
import type { World } from '../game/world.ts'
import { spawnHazard } from './hazards.ts'
import { spawnEnemy } from './spawn.ts'

const TAU = Math.PI * 2
const QUARTER = Math.PI / 2
/** Event spawn points stay this far inside the arena wall. */
const EDGE_INSET = 24
/** Sides tried when S or G is fitted to the arena, in quarter turns from the
 *  roll: the roll, its opposite, then each quarter turn. */
const FIT_QUARTERS = [0, 2, 1, 3] as const
/** Unit vector of each side, indexed by quadrant(). Exact (not the cosine of
 *  a float32 angle), so all of a wall's slots share one coordinate. */
const SIDE_X = [1, 0, -1, 0] as const
const SIDE_Y = [0, 1, 0, -1] as const

/** Indexed by quadrant(): world up is screen up. */
export const FROM_WORD = ['FROM THE EAST', 'FROM THE SOUTH', 'FROM THE WEST', 'FROM THE NORTH'] as const
export const GAP_WORD = ['GAP TO THE EAST', 'GAP TO THE SOUTH', 'GAP TO THE WEST', 'GAP TO THE NORTH'] as const

/** 0 east, 1 south, 2 west, 3 north. */
export function quadrant(ang: number): number {
  return ((Math.round(Math.atan2(Math.sin(ang), Math.cos(ang)) / (Math.PI / 2)) % 4) + 4) % 4
}

/**
 * One swarm event part in emission (section 4.7, A8). The Director holds
 * EVENT_SLOTS of these, allocated once. A part waits out its delay, fixes its
 * geometry around the player's sim position, then emits its units (or drops)
 * spread over `dur` seconds.
 */
export class EventRun {
  active = false
  begun = false
  /** The script beat this part belongs to, and its event. */
  beat = -1
  def: SwarmEventDef | null = null
  part: EventPart | null = null
  /** First Director.beatAng slot of the part's own draws. */
  drawAt = 0
  /** The event's S (or G) plus the part's turn. */
  ang = 0
  /** Ticks until the part begins. */
  wait = 0
  /** Seconds since the part began. */
  t = 0
  emitted = 0
  total = 0
  dur = 0
  /** Stream origin or wall center, and the heading toward the player, fixed at begin. */
  ox = 0
  oy = 0
  hx = 0
  hy = 0
}

/** The first of the rolled side, its opposite and the quarter turns with
 *  room for a point `dist` out from the player, as that side's angle; with no
 *  such side, the side with the most room. No draws. */
export function fitSide(world: World, ang: number, dist: number): number {
  if (dist <= 0) return ang
  const q0 = quadrant(ang)
  let best = q0
  let bestRoom = -Infinity
  for (let k = 0; k < FIT_QUARTERS.length; k++) {
    const q = (q0 + FIT_QUARTERS[k]!) % 4
    const r = roomOn(world, q)
    if (r >= dist) return q * QUARTER
    if (r > bestRoom) {
      best = q
      bestRoom = r
    }
  }
  return best * QUARTER
}

/** Warn time (script stream, a fixed count per event): S or G, one of the
 *  four sides so the alert's direction word is exact, fitted to an open side;
 *  then BLINK STORM / CHARGER VOLLEY start angles and MORTAR BARRAGE offsets,
 *  into Director.beatAng from `off`. */
export function rollEvent(world: World, def: SwarmEventDef, off: number): void {
  const rng = world.rngs.script
  const ang = world.director.beatAng
  ang[off] = fitSide(world, quadrant(rng.angle()) * QUARTER, def.fit)
  let k = off + 1
  for (let i = 0; i < def.parts.length; i++) {
    const p = def.parts[i]!
    if (p.kind === 'blink' || p.kind === 'volley') {
      ang[k++] = rng.angle()
    } else if (p.kind === 'mortar') {
      for (let j = 0; j < p.count; j++) {
        ang[k++] = rng.angle()
        ang[k++] = p.spread * rng.float()
      }
    }
  }
}

/** The event's alert: its S or G as a direction word, or its fixed sub. */
export function eventAlert(world: World, def: SwarmEventDef, ang: number): void {
  const pl = world.player
  let sub = def.sub
  let dx = 0
  let dy = 0
  if (def.dir !== 'none') {
    const q = quadrant(ang)
    sub = def.dir === 'from' ? FROM_WORD[q]! : GAP_WORD[q]!
    dx = Math.cos(ang)
    dy = Math.sin(ang)
  }
  world.alerts.push(world.feel, AlertKind.Event, def.title, sub, dx, dy, world.time, pl.x, pl.y)
}

/** The beat fires: each part takes a free slot (a part with no slot is lost). */
export function startEvent(world: World, beat: number, def: SwarmEventDef, off: number): void {
  const runs = world.director.events
  const s = world.director.beatAng[off]!
  let drawAt = off + 1
  for (let p = 0; p < def.parts.length; p++) {
    const part = def.parts[p]!
    let run: EventRun | null = null
    for (let r = 0; r < runs.length && !run; r++) if (!runs[r]!.active) run = runs[r]!
    if (run) {
      run.active = true
      run.begun = false
      run.beat = beat
      run.def = def
      run.part = part
      run.drawAt = drawAt
      run.ang = s + part.turn
      run.wait = Math.round(part.delay / FIXED_DT)
      run.t = 0
      run.emitted = 0
    }
    drawAt += partDraws(part)
  }
}

/** Director step 3: count delays down, begin parts, emit what is due. */
export function tickEvents(world: World, dt: number): void {
  const runs = world.director.events
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!
    if (!run.active) continue
    if (!run.begun) {
      if (run.wait > 0) {
        run.wait--
        continue
      }
      begin(world, run)
    } else {
      run.t += dt
    }
    const want = run.dur > 0 ? Math.min(run.total, Math.floor((run.t / run.dur) * run.total + 1e-6) + 1) : run.total
    while (run.emitted < want) emit(world, run, run.emitted++)
    if (run.emitted >= run.total) {
      run.active = false
      run.def = null
      run.part = null
    }
  }
}

export function clearEvents(world: World): void {
  const runs = world.director.events
  for (let r = 0; r < runs.length; r++) {
    runs[r]!.active = false
    runs[r]!.def = null
    runs[r]!.part = null
  }
}

/**
 * A part fixes its geometry around where the player stands now. A stream keeps
 * its full authored distance: when its side has no room for it any more, it
 * turns to a side that has (fitSide), and an event that names its side plays
 * the alert again with the new one. A wall keeps its side and distance, so a
 * closing pair stays a pair: a wall that starts past the arena wall walks in,
 * and it slides along its own line to lie inside the arena from end to end.
 */
function begin(world: World, run: EventRun): void {
  const p = run.part!
  const pl = world.player
  run.begun = true
  run.t = 0
  run.total = p.count
  run.dur = p.kind === 'stream' ? p.dur : p.kind === 'mortar' ? p.count / p.perSec : 0
  if (p.kind === 'stream') {
    let q = quadrant(run.ang)
    if (roomOn(world, q) < p.dist) {
      const fit = quadrant(fitSide(world, run.ang, p.dist))
      if (fit !== q && run.def!.dir === 'from') eventAlert(world, run.def!, fit * QUARTER)
      q = fit
    }
    run.ox = pl.x + SIDE_X[q]! * p.dist
    run.oy = pl.y + SIDE_Y[q]! * p.dist
    run.hx = -SIDE_X[q]!
    run.hy = -SIDE_Y[q]!
  } else if (p.kind === 'wall') {
    const q = quadrant(run.ang)
    const b = world.arena.bounds
    const half = ((p.count - 1) / 2) * p.spacing
    run.hx = -SIDE_X[q]!
    run.hy = -SIDE_Y[q]!
    if (SIDE_X[q] !== 0) {
      run.ox = pl.x + SIDE_X[q]! * p.dist
      run.oy = clamp(pl.y, b.y + EDGE_INSET + half, b.y + b.h - EDGE_INSET - half)
    } else {
      run.ox = clamp(pl.x, b.x + EDGE_INSET + half, b.x + b.w - EDGE_INSET - half)
      run.oy = pl.y + SIDE_Y[q]! * p.dist
    }
  }
}

function emit(world: World, run: EventRun, k: number): void {
  const p = run.part!
  const pl = world.player
  const ang = world.director.beatAng
  switch (p.kind) {
    case 'stream': {
      if (!room(world)) return
      const lat = world.rngs.spawn.range(-p.band, p.band)
      const e = spawnEnemy(world, p.unit, clampX(world, run.ox - run.hy * lat), clampY(world, run.oy + run.hx * lat))
      if (e) makeStream(e, run, p.speed, p.ttl, p.wobble * p.wobbleFreq, p.wobbleFreq, p.wobbleStep * k)
      return
    }
    case 'wall': {
      if (!room(world)) return
      const off = (k - (p.count - 1) / 2) * p.spacing
      const e = spawnEnemy(world, p.unit, run.ox - run.hy * off, run.oy + run.hx * off)
      if (e) makeStream(e, run, p.speed, p.ttl, 0, 0, 0)
      return
    }
    case 'ring': {
      const gap = p.slots - p.count
      const a = run.ang + (gap + k - (gap - 1) / 2) * (TAU / p.slots)
      const x = pl.x + Math.cos(a) * p.r
      const y = pl.y + Math.sin(a) * p.r
      if (!inside(world, x, y) || !room(world)) return
      const e = spawnEnemy(world, p.unit, x, y)
      if (!e) return
      e.eventUnit = true
      e.hp = e.maxHp = Math.round(e.maxHp * p.hpMul)
      return
    }
    case 'blink': {
      const a = ang[run.drawAt]! + k * (TAU / p.count)
      const h = spawnHazard(world, HZ_CIRCLE, clampX(world, pl.x + Math.cos(a) * p.r), clampY(world, pl.y + Math.sin(a) * p.r), p.markerR, p.tele, 0, 0)
      if (!h) return
      h.onEnd = HZ_END_SPAWN
      h.unit = p.unit
      return
    }
    case 'volley': {
      if (!room(world)) return
      const a = ang[run.drawAt]! + k * (TAU / p.count)
      const e = spawnEnemy(world, p.unit, clampX(world, pl.x + Math.cos(a) * p.r), clampY(world, pl.y + Math.sin(a) * p.r))
      if (!e) return
      e.eventUnit = true
      e.phase = 1
      e.stateTimer = p.windup
      e.phaseDir = e.facing = e.prevFacing = Math.atan2(pl.y - e.y, pl.x - e.x)
      world.feel.emit(FeelKind.ChargerWindup, 0, e.x, e.y, e.phaseDir, 0, e)
      return
    }
    case 'mortar': {
      const a = ang[run.drawAt + 2 * k]!
      const r = ang[run.drawAt + 2 * k + 1]!
      const h = spawnHazard(world, HZ_CIRCLE, clampX(world, pl.x + Math.cos(a) * r), clampY(world, pl.y + Math.sin(a) * r), p.r, p.tele, 0, p.dmg)
      if (h && (k + 1) % p.magmaEvery === 0) h.onEnd = HZ_END_MAGMA
      return
    }
  }
}

function makeStream(e: Enemy, run: EventRun, speed: number, ttl: number, wobAmp: number, wobFreq: number, wobPhase: number): void {
  e.eventUnit = true
  e.stream = true
  e.speed = speed
  e.ttl = ttl
  e.phaseDir = e.facing = e.prevFacing = Math.atan2(run.hy, run.hx)
  e.wobAmp = wobAmp
  e.wobFreq = wobFreq
  e.wobPhase = wobPhase
}

function room(world: World): boolean {
  return world.enemies.size < MAX_ENEMIES - SPAWN_ROOM
}

/** How far the player can reach toward side `q` and stay EDGE_INSET inside the wall. */
function roomOn(world: World, q: number): number {
  const b = world.arena.bounds
  const pl = world.player
  if (q === 0) return b.x + b.w - EDGE_INSET - pl.x
  if (q === 1) return b.y + b.h - EDGE_INSET - pl.y
  if (q === 2) return pl.x - b.x - EDGE_INSET
  return pl.y - b.y - EDGE_INSET
}

function inside(world: World, x: number, y: number): boolean {
  const b = world.arena.bounds
  return x >= b.x + EDGE_INSET && x <= b.x + b.w - EDGE_INSET && y >= b.y + EDGE_INSET && y <= b.y + b.h - EDGE_INSET
}

function clampX(world: World, x: number): number {
  const b = world.arena.bounds
  return clamp(x, b.x + EDGE_INSET, b.x + b.w - EDGE_INSET)
}

function clampY(world: World, y: number): number {
  const b = world.arena.bounds
  return clamp(y, b.y + EDGE_INSET, b.y + b.h - EDGE_INSET)
}
