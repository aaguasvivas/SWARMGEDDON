import type { Rng } from '../core/rng.ts'

/**
 * Wave director — data-driven escalation, now PER ARENA (docs/WORLDS-SPEC.md).
 * Each world has its own roster (which enemies exist there at all), spawn
 * rhythm, elite cadence, and boss. This is the core of the "new world with new
 * enemies" feel: HIVE permanently lacks five types (stinger, wraith, burrower,
 * psychic, warper) so the other worlds debut them.
 *
 * `world.beginRun` resolves the arena's WaveConfig ONCE into a field; the spawn
 * system reads that resolved object — no lookups in the hot loop. Arena id is
 * already run identity (the Daily rotates it by date), so per-arena configs
 * keyed by arena id preserve device-independent determinism.
 */
export interface WaveEntry {
  id: string
  unlockAt: number // seconds
  weight: number
}

export interface WaveConfig {
  table: readonly WaveEntry[]
  /** interval(t) = max(floor, base - t*slope) — seconds between spawn pulses. */
  interval: { base: number; slope: number; floor: number }
  /** batch(t) = base + floor(t/period) — enemies per pulse. */
  batch: { base: number; period: number }
  elite: { id: string; first: number; interval: number; packEvery: number }
  boss: { id: string; first: number; interval: number; announce: string; name: string }
}

export const ARENA_WAVES: Record<string, WaveConfig> = {
  // THE ENDLESS TIDE — the classic flood, now exclusive to world 1.
  hive: {
    table: [
      { id: 'swarmer', unlockAt: 0, weight: 10 },
      { id: 'biter', unlockAt: 8, weight: 7 },
      { id: 'flyer', unlockAt: 20, weight: 4 },
      { id: 'spitter', unlockAt: 30, weight: 4 },
      { id: 'splitter', unlockAt: 45, weight: 4 },
      { id: 'beetle', unlockAt: 60, weight: 2 },
      { id: 'hivemind', unlockAt: 90, weight: 2 },
      { id: 'broodmother', unlockAt: 150, weight: 2 },
      { id: 'brute', unlockAt: 170, weight: 2 },
    ],
    interval: { base: 0.95, slope: 0.0072, floor: 0.08 },
    batch: { base: 1, period: 20 },
    elite: { id: 'guardian', first: 55, interval: 48, packEvery: 140 },
    boss: { id: 'queen', first: 175, interval: 165, announce: 'THE QUEEN AWAKENS', name: 'THE QUEEN' },
  },
  // THE RIPTIDE — pressure lands as crashing surges with genuine lulls; the
  // world refuses to hold still (blinks, called shoals, maw drag).
  depths: {
    table: [
      { id: 'biter', unlockAt: 0, weight: 8 },
      { id: 'flyer', unlockAt: 10, weight: 6 },
      { id: 'wraith', unlockAt: 25, weight: 8 },
      { id: 'psychic', unlockAt: 45, weight: 4 },
      { id: 'abyssalMaw', unlockAt: 50, weight: 2 },
      { id: 'deepCaller', unlockAt: 70, weight: 2 },
      { id: 'warper', unlockAt: 90, weight: 3 },
      { id: 'brute', unlockAt: 120, weight: 2 },
    ],
    interval: { base: 4.0, slope: 0.005, floor: 2.5 },
    batch: { base: 3, period: 14 },
    elite: { id: 'abyssalWarden', first: 60, interval: 52, packEvery: 160 },
    boss: { id: 'voidMatron', first: 170, interval: 160, announce: 'THE VOID MATRON STIRS', name: 'THE VOID MATRON' },
  },
  // THE SIEGE — fewer, tougher bodies; the projectile hail is the pressure.
  wastes: {
    table: [
      { id: 'biter', unlockAt: 0, weight: 6 },
      { id: 'beetle', unlockAt: 6, weight: 7 },
      { id: 'cinderCharger', unlockAt: 15, weight: 5 },
      { id: 'stinger', unlockAt: 35, weight: 4 },
      { id: 'burrower', unlockAt: 40, weight: 5 },
      { id: 'cinderMortarch', unlockAt: 60, weight: 3 },
      { id: 'brute', unlockAt: 90, weight: 3 },
    ],
    interval: { base: 1.4, slope: 0.005, floor: 0.35 },
    batch: { base: 1, period: 26 },
    elite: { id: 'duneLeviathan', first: 50, interval: 46, packEvery: 150 },
    boss: { id: 'emberTyrant', first: 180, interval: 170, announce: 'THE EMBER TYRANT RISES', name: 'THE EMBER TYRANT' },
  },
}

export function waveConfigFor(arenaId: string): WaveConfig {
  return ARENA_WAVES[arenaId] ?? ARENA_WAVES.hive!
}

/** Seconds between spawn pulses. */
export function spawnInterval(cfg: WaveConfig, time: number): number {
  return Math.max(cfg.interval.floor, cfg.interval.base - time * cfg.interval.slope)
}

/** Enemies per pulse. */
export function spawnBatch(cfg: WaveConfig, time: number): number {
  return cfg.batch.base + Math.floor(time / cfg.batch.period)
}

/** Weighted pick among the arena's currently-unlocked types. Fallback is the
 *  arena's own first entry — 'swarmer' does not exist in every world. */
export function pickEnemy(cfg: WaveConfig, rng: Rng, time: number): string {
  let total = 0
  for (const e of cfg.table) if (time >= e.unlockAt) total += e.weight
  let roll = rng.float() * total
  for (const e of cfg.table) {
    if (time < e.unlockAt) continue
    roll -= e.weight
    if (roll <= 0) return e.id
  }
  return cfg.table[0]!.id
}
