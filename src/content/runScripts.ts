import { ELITE_WARN_LEAD, OVERTIME, WARN_LEAD } from '../config.ts'
import type { AffixId } from './affixes.ts'
import { ENEMIES } from './enemies.ts'
import { ELITE_PACK_FROM, MIRROR_DELAY, threatLevel } from './threat.ts'

/**
 * The three world scripts (docs/NEXT-LEVEL.md A7). Every world shares one beat
 * skeleton; the minute rows, events, elite and bosses make each world differ.
 * Pure data plus `resolveScript`, which applies the run's THREAT and builds
 * the OVERTIME cycle once per run in beginRun.
 */

export type SwarmEventId =
  | 'stampede' | 'broodRing' | 'hiveWall'
  | 'riptide' | 'shoalRun' | 'blinkStorm'
  | 'cinderWall' | 'chargerVolley' | 'mortarBarrage'
  | 'finalSwarm'

/**
 * One part of a swarm event (A8). Geometry is relative to the player's sim
 * position when the part starts: `turn` rotates it from the event's drawn S
 * (or G), `delay` is its start after the beat (FINAL SWARM components).
 *
 * - stream: `count` units emitted over `dur` from `dist` toward the side, each
 *   at a lateral offset in +-`band`, all on one heading locked toward the
 *   player; `wobble` is the lateral amplitude, `wobbleFreq` its rate and
 *   `wobbleStep` the phase step per unit.
 * - wall: a line of `count` stream units `spacing` apart, `dist` toward the
 *   side, perpendicular to it, heading at the player.
 * - ring: `count` of `slots` evenly spaced slots on radius `r`, the empty
 *   slots centered on the gap; normal AI.
 * - blink: `count` marker hazards on radius `r` (from one drawn start angle);
 *   a unit spawns at each when its telegraph ends.
 * - volley: `count` chargers on radius `r` (one drawn start angle), spawned in
 *   windup aimed at the player.
 * - mortar: `count` hazard circles, `perSec` per second, each on the player's
 *   position plus a drawn offset (angle, radius 0 to `spread`); every
 *   `magmaEvery`th leaves a magma pool.
 */
export type EventPart =
  | { kind: 'stream'; delay: number; turn: number; unit: string; count: number; speed: number; ttl: number; dist: number; band: number; dur: number; wobble: number; wobbleFreq: number; wobbleStep: number }
  | { kind: 'wall'; delay: number; turn: number; unit: string; count: number; speed: number; ttl: number; dist: number; spacing: number }
  | { kind: 'ring'; delay: number; turn: number; unit: string; slots: number; count: number; r: number; hpMul: number }
  | { kind: 'blink'; delay: number; turn: number; unit: string; count: number; r: number; markerR: number; tele: number }
  | { kind: 'volley'; delay: number; turn: number; unit: string; count: number; r: number; windup: number }
  | { kind: 'mortar'; delay: number; turn: number; count: number; r: number; dmg: number; tele: number; perSec: number; spread: number; magmaEvery: number }

export interface SwarmEventDef {
  title: string
  /** The alert sub: 'from' names the side S, 'gap' names the gap G, 'none' shows `sub`. */
  dir: 'from' | 'gap' | 'none'
  sub: string
  /** At warn time S (or G) turns to an open side, so that the point this far
   *  along it from the player lies inside the arena (0 = any side). */
  fit: number
  parts: readonly EventPart[]
}

const STAMPEDE = { kind: 'stream', delay: 0, turn: 0, unit: 'swarmer', count: 40, speed: 200, ttl: 9, dist: 720, band: 110, dur: 2.0, wobble: 0, wobbleFreq: 0, wobbleStep: 0 } as const
const BROOD_RING = { kind: 'ring', delay: 0, turn: 0, unit: 'swarmer', slots: 36, count: 33, r: 460, hpMul: 1.5 } as const
const HIVE_WALL = { kind: 'wall', delay: 0, turn: 0, unit: 'beetle', count: 22, speed: 64, ttl: 16, dist: 640, spacing: 44 } as const
const RIPTIDE = { kind: 'ring', delay: 0, turn: 0, unit: 'wraith', slots: 30, count: 27, r: 480, hpMul: 1.3 } as const
const SHOAL_RUN = { kind: 'stream', delay: 0, turn: 0, unit: 'flyer', count: 48, speed: 230, ttl: 8, dist: 760, band: 100, dur: 2.0, wobble: 60, wobbleFreq: 5.2, wobbleStep: 0.7 } as const
const BLINK_STORM = { kind: 'blink', delay: 0, turn: 0, unit: 'psychic', count: 10, r: 280, markerR: 34, tele: 1.0 } as const
const CINDER_WALL = { kind: 'wall', delay: 0, turn: 0, unit: 'beetle', count: 18, speed: 60, ttl: 16, dist: 600, spacing: 46 } as const
const CHARGER_VOLLEY = { kind: 'volley', delay: 0, turn: 0, unit: 'cinderCharger', count: 10, r: 220, windup: 0.9 } as const
const MORTAR_BARRAGE = { kind: 'mortar', delay: 0, turn: 0, count: 18, r: 70, dmg: 22, tele: 1.0, perSec: 3, spread: 160, magmaEvery: 3 } as const

/** A8, the nine world events. Each world's FINAL SWARM is its WorldScript.finalSwarm. */
export const SWARM_EVENTS: Readonly<Record<Exclude<SwarmEventId, 'finalSwarm'>, SwarmEventDef>> = {
  stampede: { title: 'STAMPEDE', dir: 'from', sub: '', fit: STAMPEDE.dist, parts: [STAMPEDE] },
  broodRing: { title: 'BROOD RING', dir: 'gap', sub: '', fit: BROOD_RING.r, parts: [BROOD_RING] },
  hiveWall: { title: 'HIVE WALL', dir: 'from', sub: '', fit: HIVE_WALL.dist, parts: [HIVE_WALL] },
  riptide: { title: 'RIPTIDE', dir: 'gap', sub: '', fit: RIPTIDE.r, parts: [RIPTIDE] },
  shoalRun: { title: 'SHOAL RUN', dir: 'from', sub: '', fit: SHOAL_RUN.dist, parts: [SHOAL_RUN] },
  blinkStorm: { title: 'BLINK STORM', dir: 'none', sub: 'ALL AROUND YOU', fit: 0, parts: [BLINK_STORM] },
  cinderWall: { title: 'CINDER WALL', dir: 'from', sub: '', fit: CINDER_WALL.dist, parts: [CINDER_WALL] },
  chargerVolley: { title: 'CHARGER VOLLEY', dir: 'none', sub: 'SIDESTEP THE RAMS', fit: 0, parts: [CHARGER_VOLLEY] },
  mortarBarrage: { title: 'MORTAR BARRAGE', dir: 'none', sub: 'KEEP MOVING', fit: 0, parts: [MORTAR_BARRAGE] },
}

const HALF_TURN = Math.PI
const QUARTER_TURN = Math.PI / 2

/** The event's own draw (S or G) plus each part's extra draws (A7.1). */
export function eventDraws(def: SwarmEventDef): number {
  let n = 1
  for (let i = 0; i < def.parts.length; i++) n += partDraws(def.parts[i]!)
  return n
}

/** Script draws a part takes after the event's S: BLINK STORM and CHARGER
 *  VOLLEY one start angle, MORTAR BARRAGE an angle and a radius per drop. */
export function partDraws(p: EventPart): number {
  return p.kind === 'blink' || p.kind === 'volley' ? 1 : p.kind === 'mortar' ? 2 * p.count : 0
}

export interface MinuteRow {
  /** [enemy id, weight] pairs for pulse and top-up picks. */
  mix: readonly (readonly [string, number])[]
  minAlive: number
  maxAlive: number
  /** Seconds between pulses, and spawns per pulse. */
  every: number
  batch: number
  /** Gem XP multiplier for non-elite, non-boss kills. */
  xpScale: number
  /** Enemy announced when this row starts. */
  debut?: string
}

/** `overtime`: the OT boss of each OVERTIME cycle (the mid boss, mid2 kit). */
export type BossStage = 'mid1' | 'mid2' | 'final' | 'overtime'

export interface AlertText {
  title: string
  sub: string
}

/** `arc` is in degrees: 360 places units evenly on a circle with one radius
 *  draw each; a smaller arc spreads them around one drawn center angle.
 *  An elite beat with `perCycle` brings `count + c` elites in OVERTIME cycle c
 *  (at most OVERTIME.eliteMax). An event beat with `mirror` is the mirror copy
 *  of that beat (its S or G turned 180 degrees, no draws of its own); from
 *  OVERTIME cycle `fromCycle` on when set. */
export type Beat =
  | { at: number; kind: 'pack'; unit: string; count: number; rMin: number; rMax: number; arc: number }
  | { at: number; kind: 'lull'; dur: number; minAliveMul: number; alert?: AlertText }
  | { at: number; kind: 'elite'; count: number; affixes: number; hpMul: number; perCycle?: boolean }
  | { at: number; kind: 'event'; id: SwarmEventId; mirror?: number; fromCycle?: number }
  | { at: number; kind: 'boss'; stage: BossStage }

export interface WorldScript {
  arenaId: string
  /** Exactly 12 rows; the row in force is rows[min(11, floor(t / 60))]. */
  minutes: readonly MinuteRow[]
  /** Sorted by `at`, and by warn time (`at` minus the beat's lead). */
  beats: readonly Beat[]
  eliteId: string
  affixPool: readonly AffixId[]
  fodderId: string
  /** The world's FINAL SWARM (A8): its parts are the world's own events. */
  finalSwarm: SwarmEventDef
  /** Boss HP factors (A7.2, A10.2): worldMul scales every boss of the world
   *  (OVERTIME's too); primeHpMul scales only the PRIME (the final stage). */
  boss: { midId: string; primeId: string; worldMul: number; primeHpMul: number }
  text: { mid1: AlertText; mid2: AlertText; final: AlertText; slain: string; win: string; stalemate: string }
}

export const MARKER_EVENT = 0, MARKER_ELITE = 1, MARKER_BOSS = 2, MARKER_FINAL = 3

export interface ResolvedScript extends WorldScript {
  /** The THREAT level applied. `beats` are the run's beats at that level. */
  threat: number
  /** One OVERTIME cycle, `at` from the cycle start. Beat index
   *  `beats.length + k` is otBeats[k] (beatOf). */
  otBeats: readonly Beat[]
  /** Per beat index (main, then OVERTIME): first slot in Director.beatAng /
   *  beatAffix for its script draws. */
  drawOff: Int16Array
  /** HUD timeline and the "next was" line. */
  markers: { at: Float32Array; kind: Uint8Array; label: readonly string[] }
}

/** Director.beatAng / beatAffix capacity: the T4 Wastes script takes 70 and
 *  its OVERTIME cycle 49. */
export const BEAT_DRAW_SLOTS = 160
/** Director.firedAt capacity: main beats plus one OVERTIME cycle. */
export const MAX_BEATS = 32
/** Director.deferred capacity: every event and elite beat of a script fits
 *  (T2 and up add three mirror events to the T0 ten). */
export const DEFER_SLOTS = 16
/** The teaching elite's beat time (A7.1); THREAT sets its affixes and HP. */
export const TEACH_AT = 90

export const EVENT_TITLE: Readonly<Record<SwarmEventId, string>> = {
  stampede: 'STAMPEDE',
  broodRing: 'BROOD RING',
  hiveWall: 'HIVE WALL',
  riptide: 'RIPTIDE',
  shoalRun: 'SHOAL RUN',
  blinkStorm: 'BLINK STORM',
  cinderWall: 'CINDER WALL',
  chargerVolley: 'CHARGER VOLLEY',
  mortarBarrage: 'MORTAR BARRAGE',
  finalSwarm: 'FINAL SWARM',
}

function row(
  mix: readonly (readonly [string, number])[],
  minAlive: number,
  maxAlive: number,
  every: number,
  batch: number,
  xpScale: number,
  debut?: string,
): MinuteRow {
  return debut ? { mix, minAlive, maxAlive, every, batch, xpScale, debut } : { mix, minAlive, maxAlive, every, batch, xpScale }
}

/** A7.1 beat skeleton (THREAT 0). */
function skeleton(
  packA: string,
  packB: string,
  packBCount: number,
  events: readonly [SwarmEventId, SwarmEventId, SwarmEventId],
): Beat[] {
  return [
    { at: 0.3, kind: 'pack', unit: packA, count: 8, rMin: 250, rMax: 300, arc: 360 },
    { at: 6, kind: 'pack', unit: packB, count: packBCount, rMin: 420, rMax: 460, arc: 100 },
    { at: TEACH_AT, kind: 'elite', count: 1, affixes: 0, hpMul: 0.6 },
    { at: 150, kind: 'event', id: events[0] },
    { at: 180, kind: 'lull', dur: 15, minAliveMul: 0.5 },
    { at: 195, kind: 'elite', count: 1, affixes: 1, hpMul: 1 },
    { at: 240, kind: 'boss', stage: 'mid1' },
    { at: 310, kind: 'elite', count: 1, affixes: 1, hpMul: 1 },
    { at: 330, kind: 'event', id: events[1] },
    { at: 375, kind: 'elite', count: 2, affixes: 1, hpMul: 1 },
    { at: 450, kind: 'boss', stage: 'mid2' },
    { at: 495, kind: 'elite', count: 2, affixes: 1, hpMul: 1 },
    { at: 525, kind: 'event', id: events[2] },
    { at: 550, kind: 'elite', count: 3, affixes: 1, hpMul: 1 },
    { at: 580, kind: 'lull', dur: 20, minAliveMul: 0.5, alert: { title: 'FINAL SWARM', sub: 'IN 20 SECONDS' } },
    { at: 600, kind: 'event', id: 'finalSwarm' },
    { at: 630, kind: 'boss', stage: 'final' },
  ]
}

const HIVE_R3 = [['swarmer', 8], ['biter', 5], ['flyer', 4], ['spitter', 3], ['splitter', 3]] as const
const HIVE_R4 = [...HIVE_R3, ['beetle', 2]] as const
const HIVE_R5 = [...HIVE_R4, ['hivemind', 2]] as const
const HIVE_R6 = [...HIVE_R5, ['broodmother', 2]] as const
const HIVE_R7 = [['swarmer', 8], ['biter', 5], ['flyer', 4], ['spitter', 3], ['splitter', 3], ['beetle', 3], ['hivemind', 2], ['broodmother', 2], ['brute', 2]] as const
const HIVE_R8 = [['swarmer', 8], ['biter', 5], ['flyer', 4], ['spitter', 3], ['splitter', 3], ['beetle', 3], ['hivemind', 2], ['broodmother', 2], ['brute', 3]] as const

const DEPTHS_R2 = [['biter', 6], ['flyer', 5], ['wraith', 8], ['psychic', 3]] as const
const DEPTHS_R3 = [...DEPTHS_R2, ['abyssalMaw', 2]] as const
const DEPTHS_R5 = [...DEPTHS_R3, ['deepCaller', 2]] as const
const DEPTHS_R6 = [...DEPTHS_R5, ['warper', 3]] as const
const DEPTHS_R7 = [...DEPTHS_R6, ['brute', 2]] as const
const DEPTHS_R8 = [['biter', 6], ['flyer', 5], ['wraith', 8], ['psychic', 4], ['abyssalMaw', 2], ['deepCaller', 3], ['warper', 3], ['brute', 3]] as const

const WASTES_R1 = [['biter', 6], ['beetle', 6], ['cinderCharger', 4]] as const
const WASTES_R2 = [['biter', 5], ['beetle', 6], ['cinderCharger', 4], ['stinger', 3]] as const
const WASTES_R3 = [...WASTES_R2, ['burrower', 4]] as const
const WASTES_R5 = [...WASTES_R3, ['cinderMortarch', 3]] as const
const WASTES_R6 = [...WASTES_R5, ['brute', 3]] as const
const WASTES_R8 = [['biter', 5], ['beetle', 6], ['cinderCharger', 5], ['stinger', 4], ['burrower', 4], ['cinderMortarch', 3], ['brute', 3]] as const

export const WORLD_SCRIPTS: Readonly<Record<string, WorldScript>> = {
  hive: {
    arenaId: 'hive',
    minutes: [
      row([['swarmer', 10], ['biter', 4]], 16, 40, 1.0, 2, 1.0),
      row([['swarmer', 10], ['biter', 6], ['flyer', 3]], 24, 80, 0.8, 3, 0.51),
      row([['swarmer', 9], ['biter', 6], ['flyer', 4], ['spitter', 3]], 40, 120, 0.75, 4, 0.47),
      row(HIVE_R3, 40, 140, 0.8, 4, 0.38),
      row(HIVE_R4, 55, 180, 0.7, 5, 0.36),
      row(HIVE_R5, 70, 210, 0.65, 5, 0.32),
      row(HIVE_R6, 85, 250, 0.6, 6, 0.22, 'broodmother'),
      row(HIVE_R7, 100, 280, 0.55, 6, 0.19),
      row(HIVE_R8, 120, 320, 0.5, 7, 0.16),
      row(HIVE_R8, 140, 360, 0.45, 7, 0.14),
      row(HIVE_R8, 170, 420, 0.4, 8, 0.17),
      row([['swarmer', 8], ['biter', 5], ['flyer', 4], ['spitter', 3]], 40, 160, 0.8, 4, 0.26),
    ],
    beats: skeleton('swarmer', 'biter', 6, ['stampede', 'broodRing', 'hiveWall']),
    eliteId: 'guardian',
    affixPool: ['molten', 'hasted', 'brood', 'volatile'],
    fodderId: 'swarmer',
    finalSwarm: {
      title: 'FINAL SWARM', dir: 'none', sub: 'HOLD ON', fit: STAMPEDE.dist,
      parts: [STAMPEDE, { ...STAMPEDE, delay: 2.5, turn: QUARTER_TURN }, { ...BROOD_RING, delay: 6, turn: HALF_TURN }],
    },
    boss: { midId: 'queen', primeId: 'queenPrime', worldMul: 1.0, primeHpMul: 1.0 },
    text: {
      mid1: { title: 'THE QUEEN', sub: 'AWAKENS' },
      mid2: { title: 'THE QUEEN', sub: 'RETURNS' },
      final: { title: 'QUEEN PRIME', sub: 'THE FINAL FIGHT' },
      slain: 'QUEEN SLAIN',
      win: 'HIVE PURGED',
      stalemate: 'THE QUEEN ESCAPED',
    },
  },
  depths: {
    arenaId: 'depths',
    minutes: [
      row([['biter', 8], ['flyer', 3]], 14, 40, 3.0, 6, 1.0),
      row([['biter', 8], ['flyer', 5], ['wraith', 6]], 20, 70, 3.0, 9, 0.51),
      row(DEPTHS_R2, 30, 100, 3.0, 12, 0.44),
      row(DEPTHS_R3, 30, 110, 3.2, 14, 0.36, 'abyssalMaw'),
      row(DEPTHS_R3, 40, 140, 3.0, 16, 0.34),
      row(DEPTHS_R5, 50, 170, 3.0, 18, 0.34, 'deepCaller'),
      row(DEPTHS_R6, 60, 200, 2.8, 20, 0.31),
      row(DEPTHS_R7, 70, 230, 2.8, 22, 0.27),
      row(DEPTHS_R8, 80, 260, 2.6, 24, 0.26),
      row(DEPTHS_R8, 90, 290, 2.6, 26, 0.23),
      row(DEPTHS_R8, 110, 330, 2.5, 30, 0.3),
      row([['biter', 8], ['flyer', 5], ['wraith', 6]], 35, 140, 3.0, 12, 0.34),
    ],
    beats: skeleton('biter', 'flyer', 5, ['riptide', 'shoalRun', 'blinkStorm']),
    eliteId: 'abyssalWarden',
    affixPool: ['hasted', 'volatile', 'shielded', 'brood'],
    fodderId: 'biter',
    finalSwarm: {
      title: 'FINAL SWARM', dir: 'none', sub: 'HOLD ON', fit: SHOAL_RUN.dist,
      parts: [{ ...RIPTIDE, slots: 36, count: 32, turn: HALF_TURN }, { ...SHOAL_RUN, delay: 3 }, { ...BLINK_STORM, delay: 8 }],
    },
    boss: { midId: 'voidMatron', primeId: 'voidMatronPrime', worldMul: 1.0, primeHpMul: 1.0 },
    text: {
      mid1: { title: 'THE VOID MATRON', sub: 'STIRS' },
      mid2: { title: 'THE VOID MATRON', sub: 'RETURNS' },
      final: { title: 'MATRON PRIME', sub: 'THE FINAL FIGHT' },
      slain: 'MATRON SLAIN',
      win: 'DEPTHS SILENCED',
      stalemate: 'THE MATRON ESCAPED',
    },
  },
  wastes: {
    arenaId: 'wastes',
    minutes: [
      row([['biter', 6], ['beetle', 3]], 14, 35, 1.4, 2, 1.0),
      row(WASTES_R1, 16, 60, 1.3, 2, 0.47),
      row(WASTES_R2, 22, 80, 1.2, 3, 0.44),
      row(WASTES_R3, 26, 100, 1.1, 3, 0.41),
      row(WASTES_R3, 30, 115, 1.0, 3, 0.38),
      row(WASTES_R5, 36, 135, 0.9, 3, 0.43, 'cinderMortarch'),
      row(WASTES_R6, 44, 155, 0.9, 4, 0.4),
      row(WASTES_R6, 50, 175, 0.8, 4, 0.36),
      row(WASTES_R8, 58, 195, 0.75, 4, 0.38),
      row(WASTES_R8, 66, 215, 0.7, 5, 0.3),
      row(WASTES_R8, 80, 250, 0.6, 5, 0.38),
      row(WASTES_R1, 30, 110, 1.2, 3, 0.43),
    ],
    beats: skeleton('biter', 'beetle', 3, ['cinderWall', 'chargerVolley', 'mortarBarrage']),
    eliteId: 'duneLeviathan',
    affixPool: ['molten', 'shielded', 'volatile', 'brood'],
    fodderId: 'biter',
    finalSwarm: {
      title: 'FINAL SWARM', dir: 'none', sub: 'HOLD ON', fit: CINDER_WALL.dist,
      parts: [{ ...CINDER_WALL, ttl: 12 }, { ...CINDER_WALL, ttl: 12, turn: HALF_TURN }, { ...CHARGER_VOLLEY, delay: 6 }],
    },
    boss: { midId: 'emberTyrant', primeId: 'emberTyrantPrime', worldMul: 0.9, primeHpMul: 0.95 },
    text: {
      mid1: { title: 'THE EMBER TYRANT', sub: 'RISES' },
      mid2: { title: 'THE EMBER TYRANT', sub: 'RETURNS' },
      final: { title: 'TYRANT PRIME', sub: 'THE FINAL FIGHT' },
      slain: 'TYRANT SLAIN',
      win: 'WASTES QUENCHED',
      stalemate: 'THE TYRANT ESCAPED',
    },
  },
}

/** The event a beat fires: one of the nine, or the world's FINAL SWARM. */
export function eventDef(s: WorldScript, id: SwarmEventId): SwarmEventDef {
  return id === 'finalSwarm' ? s.finalSwarm : SWARM_EVENTS[id]
}

/** Beat `i` of the run: a main beat, or OVERTIME beat `i - beats.length`. */
export function beatOf(s: ResolvedScript, i: number): Beat {
  return i < s.beats.length ? s.beats[i]! : s.otBeats[i - s.beats.length]!
}

/** Alert text of a boss stage: the OT boss returns with mid2's lines. */
export function stageText(s: WorldScript, stage: BossStage): AlertText {
  return stage === 'overtime' ? s.text.mid2 : s.text[stage]
}

/** Script-stream slots a beat fills at warn time: one per pack unit on a full
 *  circle (radius), one pack center angle otherwise, one side per elite (the
 *  OVERTIME maximum for a per-cycle beat), the event's draws (eventDraws; a
 *  mirror copy keeps only its own S), one spawn angle per boss. */
function drawSlots(s: WorldScript, b: Beat): number {
  switch (b.kind) {
    case 'pack':
      return b.arc >= 360 ? b.count : 1
    case 'elite':
      return b.perCycle ? OVERTIME.eliteMax : b.count
    case 'event':
      return b.mirror !== undefined ? 1 : eventDraws(eventDef(s, b.id))
    case 'boss':
      return 1
    case 'lull':
      return 0
  }
}

/** How long before its time a beat warns (rolls its draws, plays its alert). */
export function leadOf(b: Beat): number {
  if (b.kind === 'event' || b.kind === 'boss') return WARN_LEAD
  if (b.kind === 'elite') return ELITE_WARN_LEAD
  return 0
}

/**
 * The run's beats at `threat` (A11): the teaching elite takes the level's
 * affixes and HP, later elites its affix count and, from ELITE_PACK_FROM,
 * its extra elites; with `mirror`, events 1 to 3 get a mirror copy
 * MIRROR_DELAY later. Sorted by time (a mirror copy follows its event).
 */
function threatBeats(s: WorldScript, threat: number): Beat[] {
  const T = threatLevel(threat)
  const out: Beat[] = []
  const src: (Beat | null)[] = []
  for (const b of s.beats) {
    if (b.kind === 'elite') {
      out.push(
        b.at === TEACH_AT
          ? { ...b, affixes: T.teachAffixes, hpMul: T.teachHpMul }
          : { ...b, affixes: T.eliteAffixes, count: b.count + (b.at >= ELITE_PACK_FROM ? T.elitePlus : 0) },
      )
    } else {
      out.push(b)
    }
    src.push(null)
    if (T.mirror && b.kind === 'event' && b.id !== 'finalSwarm') {
      out.push({ at: b.at + MIRROR_DELAY, kind: 'event', id: b.id, mirror: -1 })
      src.push(out[out.length - 2]!)
    }
  }
  const order = out.map((_, i) => i).sort((a, b) => out[a]!.at - out[b]!.at || a - b)
  const sorted = order.map((i) => out[i]!)
  for (let k = 0; k < order.length; k++) {
    const from = src[order[k]!]
    const b = sorted[k]!
    if (from && b.kind === 'event') sorted[k] = { ...b, mirror: sorted.indexOf(from) }
  }
  return sorted
}

/** One OVERTIME cycle (section 4.1), `at` from the cycle start. EVENT 1's
 *  mirror copy plays from cycle OVERTIME.mirrorFrom on (every cycle with the
 *  THREAT mirror rule), EVENT 3's only with the rule. `base` is the global
 *  index of the first OVERTIME beat. */
function overtimeBeats(s: WorldScript, threat: number, base: number): Beat[] {
  const T = threatLevel(threat)
  const ev: SwarmEventId[] = []
  for (const b of s.beats) if (b.kind === 'event' && b.id !== 'finalSwarm') ev.push(b.id)
  const out: Beat[] = [
    { at: OVERTIME.event1, kind: 'event', id: ev[0]! },
    { at: OVERTIME.event1 + MIRROR_DELAY, kind: 'event', id: ev[0]!, mirror: base, fromCycle: T.mirror ? 1 : OVERTIME.mirrorFrom },
    { at: OVERTIME.elites, kind: 'elite', count: OVERTIME.eliteBase + T.elitePlus, affixes: OVERTIME.eliteAffixes, hpMul: 1, perCycle: true },
    { at: OVERTIME.event3, kind: 'event', id: ev[2]! },
  ]
  if (T.mirror) out.push({ at: OVERTIME.event3 + MIRROR_DELAY, kind: 'event', id: ev[2]!, mirror: base + 3 })
  out.push({ at: OVERTIME.boss, kind: 'boss', stage: 'overtime' })
  return out
}

/** Resolve an arena's script for one run at `threat`. Allocates; beginRun only. */
export function resolveScript(arenaId: string, threat = 0): ResolvedScript {
  const s = WORLD_SCRIPTS[arenaId]
  if (!s) throw new Error(`no run script for arena '${arenaId}'`)
  const beats = threatBeats(s, threat)
  const otBeats = overtimeBeats(s, threat, beats.length)
  const total = beats.length + otBeats.length
  const drawOff = new Int16Array(total)
  let off = 0
  let held = 0
  let otHeld = 0
  const at: number[] = []
  const kind: number[] = []
  const label: string[] = []
  for (let i = 0; i < total; i++) {
    const main = i < beats.length
    const b = main ? beats[i]! : otBeats[i - beats.length]!
    drawOff[i] = off
    off += drawSlots(s, b)
    if (b.kind === 'event' || b.kind === 'elite') {
      if (main) held++
      else otHeld++
    }
    if (i > 0 && i !== beats.length) {
      const p = main ? beats[i - 1]! : otBeats[i - beats.length - 1]!
      if (b.at < p.at || b.at - leadOf(b) < p.at - leadOf(p)) throw new Error(`run script '${arenaId}' beat ${i} is out of order`)
    }
    if (!main) continue
    if (b.kind === 'event') {
      at.push(b.at)
      kind.push(b.id === 'finalSwarm' ? MARKER_FINAL : MARKER_EVENT)
      label.push(EVENT_TITLE[b.id])
    } else if (b.kind === 'elite') {
      at.push(b.at)
      kind.push(MARKER_ELITE)
      label.push(ENEMIES[s.eliteId]!.displayName)
    } else if (b.kind === 'boss') {
      at.push(b.at)
      kind.push(b.stage === 'final' ? MARKER_FINAL : MARKER_BOSS)
      label.push(stageText(s, b.stage).title)
    }
  }
  if (total > MAX_BEATS) throw new Error(`run script '${arenaId}' has ${total} beats with OVERTIME (max ${MAX_BEATS})`)
  if (off > BEAT_DRAW_SLOTS) throw new Error(`run script '${arenaId}' needs ${off} draw slots (max ${BEAT_DRAW_SLOTS})`)
  if (Math.max(held, otHeld) > DEFER_SLOTS) throw new Error(`run script '${arenaId}' has ${Math.max(held, otHeld)} event and elite beats (max ${DEFER_SLOTS})`)
  return { ...s, threat, beats, otBeats, drawOff, markers: { at: Float32Array.from(at), kind: Uint8Array.from(kind), label } }
}

/** Label of the first marker still ahead at time `t`, or null past the last. */
export function nextBeatLabel(s: ResolvedScript, t: number): string | null {
  const m = s.markers
  for (let i = 0; i < m.at.length; i++) if (m.at[i]! > t) return m.label[i]!
  return null
}
