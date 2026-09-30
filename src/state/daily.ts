import { dayOf } from '../core/rules.ts'
import { keysWithPrefix, loadJSON, removeKey, saveJSON } from '../platform/storage.ts'
import type { RunResult } from './runResult.ts'

/**
 * The Daily's ranked lifecycle on this device (section 7.5): one ranked start
 * per UTC day, practice after it, a checkpoint while the ranked run lives, and
 * the display-only streak. A run belongs to the day it started on.
 */

/** The run fields a leaderboard post needs; a ranked Daily keeps them so it can
 *  post after a later opt-in. */
export type PostableRun = Pick<
  RunResult,
  | 'mode' | 'ranked' | 'end' | 'date' | 'dailyNumber' | 'seed' | 'character' | 'arena' | 'threat' | 'paint'
  | 'time' | 'kills' | 'level' | 'score' | 'killPts' | 'xpSum' | 'bossesSlain' | 'bestChain' | 'hits'
  | 'closeCalls' | 'cleared' | 'clearMs'
>

/** `daily:<date>`. A v1 Daily migrated into v2 carries `ranked: { legacy: true }`. */
export interface DailyDayRecord {
  rankedStarted: boolean
  ranked?: PostableRun | { legacy: true }
  practiceBest?: number
  practiceRuns?: number
}

/** `daily:streak`: display only. `played` never decreases. */
export interface DailyStreak {
  last: string
  run: number
  played: number
}

const KEEP_DAYS = 14
const DAY_KEY = /^daily:(\d{4}-\d{2}-\d{2})$/

export function todayUtc(): string {
  return dayOf(Date.now())
}

export function loadDay(date: string): DailyDayRecord {
  const v = loadJSON<Partial<DailyDayRecord> | null>('daily:' + date, null)
  return { rankedStarted: false, ...(v && typeof v === 'object' ? v : {}) }
}

function saveDay(date: string, rec: DailyDayRecord): void {
  saveJSON('daily:' + date, rec)
}

export function rankedAvailable(date: string): boolean {
  return !loadDay(date).rankedStarted
}

/** Written before the first sim step of the ranked run. */
export function markRankedStarted(date: string): void {
  saveDay(date, { ...loadDay(date), rankedStarted: true })
}

export function postable(r: RunResult): PostableRun {
  return {
    mode: r.mode, ranked: r.ranked, end: r.end, date: r.date, dailyNumber: r.dailyNumber, seed: r.seed,
    character: r.character, arena: r.arena, threat: r.threat, paint: r.paint, time: r.time, kills: r.kills,
    level: r.level, score: r.score, killPts: r.killPts, xpSum: r.xpSum, bossesSlain: r.bossesSlain,
    bestChain: r.bestChain, hits: r.hits, closeCalls: r.closeCalls, cleared: r.cleared, clearMs: r.clearMs,
  }
}

/** The ranked run of `date` when this device played one in v2, else null. */
export function rankedRun(date: string): PostableRun | null {
  const r = loadDay(date).ranked
  return r && !('legacy' in r) ? r : null
}

/** File a finished Daily under its start day: the ranked result once, or the practice best. */
export function recordDailyEnd(r: RunResult): void {
  const rec = loadDay(r.date)
  if (r.ranked) {
    if (!rec.ranked) {
      rec.ranked = postable(r)
      bumpStreak(r.date)
    }
  } else {
    rec.practiceBest = Math.max(rec.practiceBest ?? 0, r.score)
    rec.practiceRuns = (rec.practiceRuns ?? 0) + 1
  }
  saveDay(r.date, rec)
  clearCheckpoint()
}

export function loadStreak(): DailyStreak {
  return { last: '', run: 0, played: 0, ...loadJSON<Partial<DailyStreak>>('daily:streak', {}) }
}

function bumpStreak(date: string): void {
  const s = loadStreak()
  if (s.last === date) return
  s.run = s.last === dayOf(Date.parse(date + 'T00:00:00Z') - 86_400_000) ? s.run + 1 : 1
  s.played++
  s.last = date
  saveJSON('daily:streak', s)
}

/** Drop `daily:<date>` records older than KEEP_DAYS. */
export function pruneDays(today: string): void {
  const oldest = dayOf(Date.parse(today + 'T00:00:00Z') - KEEP_DAYS * 86_400_000)
  for (const key of keysWithPrefix('daily:')) {
    const m = DAY_KEY.exec(key)
    if (m && m[1]! < oldest) removeKey(key)
  }
}

// --- checkpoint (`daily:ckpt`) -------------------------------------------------

export const CHECKPOINT_EVERY_S = 10

export function saveCheckpoint(r: RunResult): void {
  saveJSON('daily:ckpt', r)
}

export function clearCheckpoint(): void {
  removeKey('daily:ckpt')
}

/** A ranked run the app lost without ending it (killed in the background). A
 *  checkpoint that another tab or window is still writing is not lost. */
export async function lostCheckpoint(): Promise<RunResult | null> {
  const r = loadJSON<RunResult | null>('daily:ckpt', null)
  if (!r || typeof r !== 'object' || r.mode !== 'daily' || !r.ranked || typeof r.date !== 'string') return null
  return (await rankedRunLiveElsewhere()) ? null : r
}

// The page whose ranked run is live holds this Web Lock; the browser drops it
// with the page. Without Web Locks (WebViews before iOS 15.4, which run one
// page) a leftover checkpoint always counts as lost.
const RANKED_LOCK = 'swarmgeddon:ranked-run'
let releaseLock: (() => void) | null = null

function lockManager(): LockManager | null {
  return (navigator.locks as LockManager | undefined) ?? null
}

export function holdRankedLock(): void {
  const locks = lockManager()
  if (!locks || releaseLock) return
  const held = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  locks.request(RANKED_LOCK, () => held).catch(() => {})
}

export function releaseRankedLock(): void {
  releaseLock?.()
  releaseLock = null
}

async function rankedRunLiveElsewhere(): Promise<boolean> {
  const locks = lockManager()
  if (!locks) return false
  try {
    const q = await locks.query()
    return (q.held ?? []).some((l) => l.name === RANKED_LOCK)
  } catch {
    return false
  }
}
