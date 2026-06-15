import { loadJSON, saveJSON } from '../platform/storage.ts'

/** A single run's result, used for high scores and the share card. */
export interface RunResult {
  mode: 'endless' | 'daily'
  time: number // seconds survived
  kills: number
  level: number
  score: number
  seed: number
  date: string // YYYY-MM-DD when played
}

export interface BestRecord {
  score: number
  time: number
  kills: number
  level: number
}

const EMPTY_BEST: BestRecord = { score: 0, time: 0, kills: 0, level: 0 }

/** Score formula — rewards survival, kills, and depth roughly equally. */
export function computeScore(time: number, kills: number, level: number): number {
  return Math.floor(time * 10 + kills * 5 + level * 50)
}

export function loadBest(mode: 'endless' | 'daily'): BestRecord {
  return { ...EMPTY_BEST, ...loadJSON(`best:${mode}`, {}) }
}

/** Record a run if it beats the stored best for its mode. Returns true if it
 *  set a new high score. */
export function recordRun(result: RunResult): boolean {
  const best = loadBest(result.mode)
  const isHigh = result.score > best.score
  if (isHigh) {
    saveJSON(`best:${result.mode}`, {
      score: result.score,
      time: result.time,
      kills: result.kills,
      level: result.level,
    })
  }
  // Track the most recent daily completion so the menu can show "done today".
  if (result.mode === 'daily') {
    saveJSON('daily:last', { date: result.date, score: result.score })
  }
  return isHigh
}

export function dailyCompletedToday(today: string): boolean {
  const last = loadJSON<{ date: string }>('daily:last', { date: '' })
  return last.date === today
}
