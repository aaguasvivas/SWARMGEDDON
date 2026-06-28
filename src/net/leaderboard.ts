import { loadJSON, saveJSON } from '../platform/storage.ts'
import type { RunResult } from '../state/persistence.ts'

/**
 * Thin client for the Cloudflare Worker leaderboard (see /server). Everything is
 * a no-op when `VITE_LEADERBOARD_URL` is unset, so the game runs fine with no
 * backend — the leaderboard UI just stays hidden.
 */
const BASE = ((import.meta.env.VITE_LEADERBOARD_URL as string | undefined) ?? '').replace(/\/+$/, '')

export const MAX_NAME = 14

export type BoardKind = 'alltime' | 'daily'
export type BoardScope = 'global' | 'region'

export interface BoardEntry {
  rank: number
  name: string
  score: number
  time: number
  kills: number
  level: number
  country: string | null
}

export interface BoardResult {
  entries: BoardEntry[]
  region: string | null
}

export function leaderboardEnabled(): boolean {
  return BASE.length > 0
}

export function getPlayerName(): string {
  return loadJSON<string>('player:name', '')
}

export function setPlayerName(name: string): void {
  saveJSON('player:name', name.slice(0, MAX_NAME))
}

/** Submit a finished run. Resolves with the server rank, or null on any failure. */
export async function submitScore(r: RunResult): Promise<{ score: number; rank: number } | null> {
  if (!BASE) return null
  try {
    const res = await fetch(`${BASE}/api/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: getPlayerName() || 'ANON',
        mode: r.mode,
        time: r.time,
        kills: r.kills,
        level: r.level,
        seed: r.seed,
      }),
    })
    if (!res.ok) return null
    return (await res.json()) as { score: number; rank: number }
  } catch {
    return null
  }
}

export async function fetchBoard(opts: {
  mode: 'endless' | 'daily'
  board: BoardKind
  scope: BoardScope
  limit?: number
}): Promise<BoardResult | null> {
  if (!BASE) return null
  const q = new URLSearchParams({
    mode: opts.mode,
    board: opts.board,
    scope: opts.scope,
    limit: String(opts.limit ?? 50),
  })
  try {
    const res = await fetch(`${BASE}/api/leaderboard?${q.toString()}`)
    if (!res.ok) return null
    const data = (await res.json()) as Partial<BoardResult>
    return { entries: data.entries ?? [], region: data.region ?? null }
  } catch {
    return null
  }
}
