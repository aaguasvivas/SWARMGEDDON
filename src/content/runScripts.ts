import { ENEMIES } from './enemies.ts'

/**
 * The three world scripts (docs/NEXT-LEVEL.md A7). Every world shares one beat
 * skeleton; the minute rows, events, elite and bosses make each world differ.
 * Pure data plus `resolveScript`, which runs once per run in beginRun.
 */

export type SwarmEventId =
  | 'stampede' | 'broodRing' | 'hiveWall'
  | 'riptide' | 'shoalRun' | 'blinkStorm'
  | 'cinderWall' | 'chargerVolley' | 'mortarBarrage'
  | 'finalSwarm'

export type AffixId = 'molten' | 'hasted' | 'brood' | 'volatile' | 'shielded'

/** A9 bits: elite affix picks are stored as a mask of these. */
export const AFFIX_BIT: Readonly<Record<AffixId, number>> = { molten: 1, hasted: 2, brood: 4, volatile: 8, shielded: 16 }

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

export type BossStage = 'mid1' | 'mid2' | 'final'

export interface AlertText {
  title: string
  sub: string
}

/** `arc` is in degrees: 360 places units evenly on a circle with one radius
 *  draw each; a smaller arc spreads them around one drawn center angle. */
export type Beat =
  | { at: number; kind: 'pack'; unit: string; count: number; rMin: number; rMax: number; arc: number }
  | { at: number; kind: 'lull'; dur: number; minAliveMul: number; alert?: AlertText }
  | { at: number; kind: 'elite'; count: number; affixes: number; hpMul: number }
  | { at: number; kind: 'event'; id: SwarmEventId }
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
  boss: { midId: string; primeId: string; worldMul: number }
  text: { mid1: AlertText; mid2: AlertText; final: AlertText; slain: string; win: string; stalemate: string }
}

export const MARKER_EVENT = 0, MARKER_ELITE = 1, MARKER_BOSS = 2, MARKER_FINAL = 3

export interface ResolvedScript extends WorldScript {
  /** Per beat: first slot in Director.beatAng / beatAffix for its script draws. */
  drawOff: Int16Array
  /** HUD timeline and the "next was" line. */
  markers: { at: Float32Array; kind: Uint8Array; label: readonly string[] }
}

/** Director.beatAng / beatAffix capacity. */
export const BEAT_DRAW_SLOTS = 64

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
    { at: 90, kind: 'elite', count: 1, affixes: 0, hpMul: 0.6 },
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
      row([['swarmer', 10], ['biter', 4]], 12, 40, 1.0, 2, 1.0),
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
    boss: { midId: 'queen', primeId: 'queenPrime', worldMul: 1.0 },
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
      row([['biter', 8], ['flyer', 3]], 10, 40, 3.0, 6, 1.0),
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
    boss: { midId: 'voidMatron', primeId: 'voidMatronPrime', worldMul: 0.9 },
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
      row([['biter', 6], ['beetle', 3]], 10, 35, 1.4, 2, 1.0),
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
    boss: { midId: 'emberTyrant', primeId: 'emberTyrantPrime', worldMul: 1.15 },
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

/** Script-stream slots a beat fills at warn time: one per pack unit on a full
 *  circle (radius), one pack center angle otherwise, one side per elite, one
 *  S or G per event, one spawn angle per boss. */
function drawSlots(b: Beat): number {
  switch (b.kind) {
    case 'pack':
      return b.arc >= 360 ? b.count : 1
    case 'elite':
      return b.count
    case 'event':
    case 'boss':
      return 1
    case 'lull':
      return 0
  }
}

/** Resolve an arena's script for one run. Allocates; beginRun only. */
export function resolveScript(arenaId: string): ResolvedScript {
  const s = WORLD_SCRIPTS[arenaId]
  if (!s) throw new Error(`no run script for arena '${arenaId}'`)
  const drawOff = new Int16Array(s.beats.length)
  let off = 0
  const at: number[] = []
  const kind: number[] = []
  const label: string[] = []
  for (let i = 0; i < s.beats.length; i++) {
    const b = s.beats[i]!
    drawOff[i] = off
    off += drawSlots(b)
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
      label.push(s.text[b.stage].title)
    }
  }
  if (off > BEAT_DRAW_SLOTS) throw new Error(`run script '${arenaId}' needs ${off} draw slots (max ${BEAT_DRAW_SLOTS})`)
  return { ...s, drawOff, markers: { at: Float32Array.from(at), kind: Uint8Array.from(kind), label } }
}

/** Label of the first marker still ahead at time `t`, or null past the last. */
export function nextBeatLabel(s: ResolvedScript, t: number): string | null {
  const m = s.markers
  for (let i = 0; i < m.at.length; i++) if (m.at[i]! > t) return m.label[i]!
  return null
}
