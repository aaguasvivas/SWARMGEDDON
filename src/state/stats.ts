import { STATS_MIN_RUN_S } from '../config.ts'
import { loadJSON, saveJSON } from '../platform/storage.ts'
import type { RunResult } from './runResult.ts'

export interface WorldStats {
  runs: number; seconds: number; kills: number; bosses: number; clears: number; bestTime: number
  /** Highest THREAT cleared in this world, -1 = none. */
  maxThreatCleared: number
}

export interface PilotStats {
  runs: number; seconds: number; kills: number; bosses: number; clears: number; bestLevel: number; bestTime: number
}

/** Career totals under the `stats` key (section 7.3), written once per run. */
export interface LifetimeStats {
  runs: number; seconds: number; kills: number; xp: number; damage: number; hits: number
  elites: number; bosses: number; bossesFlawless: number; clears: number
  dailyRanked: number; dailyPractice: number
  bestChain: number; peakTier: number; longestNoHit: number
  closeCalls: number; fusionsTaken: number; evolutions: number
  perWorld: Record<string, WorldStats>; perPilot: Record<string, PilotStats>
  killsByEnemy: Record<string, number>; perkPicks: Record<string, number>; weaponUses: Record<string, number>
  /** UTC days of the first and the latest counted run ('' = none yet). */
  firstRun: string; lastRun: string
  importedV1: boolean
}

const KEY = 'stats'

function emptyStats(): LifetimeStats {
  return {
    runs: 0, seconds: 0, kills: 0, xp: 0, damage: 0, hits: 0,
    elites: 0, bosses: 0, bossesFlawless: 0, clears: 0,
    dailyRanked: 0, dailyPractice: 0,
    bestChain: 0, peakTier: 0, longestNoHit: 0,
    closeCalls: 0, fusionsTaken: 0, evolutions: 0,
    perWorld: {}, perPilot: {},
    killsByEnemy: {}, perkPicks: {}, weaponUses: {},
    firstRun: '', lastRun: '',
    importedV1: false,
  }
}

export function loadStats(): LifetimeStats {
  return { ...emptyStats(), ...loadJSON<Partial<LifetimeStats>>(KEY, {}) }
}

export function saveStats(s: LifetimeStats): void {
  saveJSON(KEY, s)
}

/** Fold one finished run into the lifetime stats and save them. */
export function updateLifetime(r: RunResult): LifetimeStats {
  const s = loadStats()
  s.seconds += r.time
  s.kills += r.kills
  s.damage += r.damageTaken
  if (r.time >= STATS_MIN_RUN_S) {
    s.runs++
    s.xp += r.xpSum
    s.hits += r.hits
    s.elites += r.elitesSlain
    s.bosses += r.bossesSlain
    s.bossesFlawless += r.bossesFlawless
    if (r.cleared) s.clears++
    if (r.mode === 'daily') {
      if (r.ranked) s.dailyRanked++
      else s.dailyPractice++
    }
    s.bestChain = Math.max(s.bestChain, r.bestChain)
    s.peakTier = Math.max(s.peakTier, r.peakTier)
    s.longestNoHit = Math.max(s.longestNoHit, r.longestNoHit)
    s.closeCalls += r.closeCalls
    s.fusionsTaken += r.fusions.length
    s.evolutions += r.evolutions.length

    const w: WorldStats = { runs: 0, seconds: 0, kills: 0, bosses: 0, clears: 0, bestTime: 0, maxThreatCleared: -1, ...s.perWorld[r.arena] }
    w.runs++
    w.seconds += r.time
    w.kills += r.kills
    w.bosses += r.bossesSlain
    w.bestTime = Math.max(w.bestTime, r.time)
    if (r.cleared) {
      w.clears++
      w.maxThreatCleared = Math.max(w.maxThreatCleared, r.threat)
    }
    s.perWorld[r.arena] = w

    const p: PilotStats = { runs: 0, seconds: 0, kills: 0, bosses: 0, clears: 0, bestLevel: 0, bestTime: 0, ...s.perPilot[r.character] }
    p.runs++
    p.seconds += r.time
    p.kills += r.kills
    p.bosses += r.bossesSlain
    if (r.cleared) p.clears++
    p.bestLevel = Math.max(p.bestLevel, r.level)
    p.bestTime = Math.max(p.bestTime, r.time)
    s.perPilot[r.character] = p

    for (const id in r.killsByEnemy) s.killsByEnemy[id] = (s.killsByEnemy[id] ?? 0) + r.killsByEnemy[id]!
    for (const [id, n] of r.perks) s.perkPicks[id] = (s.perkPicks[id] ?? 0) + n
    for (const id of r.weapons) s.weaponUses[id] = (s.weaponUses[id] ?? 0) + 1

    if (!s.firstRun) s.firstRun = r.date
    s.lastRun = r.date
  }
  saveJSON(KEY, s)
  return s
}
