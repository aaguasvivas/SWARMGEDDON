import { loadJSON, saveJSON } from '../platform/storage.ts'
import type { RunResult } from './runResult.ts'

/** Per-world personal bests under `best:world:<id>`. Each field is its own
 *  maximum over every run in that world; `scoreDate` is the day of the best
 *  score. v1 saves hold only `{ time, kills }` and load over the defaults. */
export interface WorldBest {
  time: number
  kills: number
  score: number
  chain: number
  level: number
  scoreDate: string
}

const EMPTY_WORLD_BEST: WorldBest = { time: 0, kills: 0, score: 0, chain: 0, level: 0, scoreDate: '' }

export function loadWorldBest(arenaId: string): WorldBest {
  return { ...EMPTY_WORLD_BEST, ...loadJSON<Partial<WorldBest>>(`best:world:${arenaId}`, {}) }
}

/** What a run newly beat in its world (for the recap callout). */
export interface WorldBestGains {
  time: boolean
  kills: boolean
  score: boolean
}

/** Update the bests of the world this run was played in (any mode). */
export function recordWorldBest(r: RunResult): WorldBestGains {
  const wb = loadWorldBest(r.arena)
  const gains: WorldBestGains = { time: r.time > wb.time, kills: r.kills > wb.kills, score: r.score > wb.score }
  if (gains.time || gains.kills || gains.score || r.bestChain > wb.chain || r.level > wb.level) {
    saveJSON(`best:world:${r.arena}`, {
      time: Math.max(wb.time, r.time),
      kills: Math.max(wb.kills, r.kills),
      score: Math.max(wb.score, r.score),
      chain: Math.max(wb.chain, r.bestChain),
      level: Math.max(wb.level, r.level),
      scoreDate: gains.score ? r.date : wb.scoreDate,
    })
  }
  return gains
}
