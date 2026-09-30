import { SIM_VERSION, dayOf, isoWeek } from '../core/rules.ts'
import { platformId } from '../platform/native.ts'
import { loadJSON, saveJSON } from '../platform/storage.ts'
import type { PostableRun } from '../state/daily.ts'

/**
 * Client for the leaderboard worker (server/, section 8). Posting is opt-in:
 * nothing is sent until the player chooses a name. Every call makes at most one
 * request and never retries; a server without the v2 routes (404, 410) or one
 * that wants a newer client (426) switches the client off for the session.
 */

/** Production builds post here unless VITE_LEADERBOARD_URL overrides it. */
const PROD_URL = 'https://swarmgeddon-leaderboard.adelsonaguasvivas.workers.dev'
const ENV_URL = (import.meta.env.VITE_LEADERBOARD_URL as string | undefined) || ''
const BASE = (ENV_URL || (import.meta.env.PROD ? PROD_URL : '')).replace(/\/+$/, '')
/** Dev servers and test harnesses never post unless this is set. */
const CAN_POST = import.meta.env.PROD || !!import.meta.env.VITE_LEADERBOARD_DEV_SUBMIT
const TIMEOUT_MS = 8000
const MIN_POST_S = 10

export const MAX_NAME = 14
export const MIN_NAME = 2

/** Set once the server answered 404, 410 or 426. */
let offline: 'gone' | 'outdated' | null = null

export function leaderboardEnabled(): boolean {
  return BASE.length > 0
}

export function getPlayerName(): string {
  return loadJSON<string>('player:name', '')
}

export function setPlayerName(name: string): void {
  saveJSON('player:name', name.slice(0, MAX_NAME))
}

/** `lb:optIn`: true after CHOOSE A NAME, false after NO THANKS, null while undecided. */
export function optInState(): boolean | null {
  const v = loadJSON<unknown>('lb:optIn', null)
  return typeof v === 'boolean' ? v : null
}

/** Turn posting on under `name`; the install id is created on first opt-in. */
export function optIn(name: string): void {
  setPlayerName(name)
  if (!playerId()) saveJSON('lb:id', newPlayerId())
  saveJSON('lb:optIn', true)
}

export function optOut(): void {
  saveJSON('lb:optIn', false)
}

export function playerId(): string {
  const v = loadJSON<unknown>('lb:id', '')
  return typeof v === 'string' && /^[A-Za-z0-9_-]{22}$/.test(v) ? v : ''
}

/** 16 random bytes, base64url: 22 characters. */
function newPlayerId(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The recap's opt-in card shows from the second counted run, at most 3 times. */
export function shouldAskOptIn(countedRuns: number): boolean {
  return leaderboardEnabled() && optInState() === null && countedRuns >= 2 && loadJSON<number>('lb:asked', 0) < 3
}

export function markAsked(): void {
  saveJSON('lb:asked', loadJSON<number>('lb:asked', 0) + 1)
}

// --- posting -------------------------------------------------------------------

export interface Rank {
  rank: number
  of: number
}

export type SubmitOutcome =
  /** No request was made: not opted in, dev build, practice, too short, not a new weekly best, or already sent. */
  | { kind: 'off' }
  | { kind: 'posted'; score: number; name: string; renamed: boolean; day?: Rank; week?: Rank; all?: Rank }
  /** 409: the ranked Daily of that day is already on the board. */
  | { kind: 'duplicate' }
  /** 400 or 422: the server refused the run. */
  | { kind: 'rejected' }
  /** 404 or 410: the server has no v2 routes. */
  | { kind: 'gone' }
  /** 426: the server wants a newer client. */
  | { kind: 'outdated' }
  /** Network error, timeout, 429 or 5xx. */
  | { kind: 'failed' }

type Sent = Record<string, number>

function sentKey(r: PostableRun, today: string): string {
  return r.mode === 'daily' ? 'daily:' + r.date : `endless:${r.arena}:${isoWeek(today)}`
}

function loadSent(): Sent {
  const v = loadJSON<unknown>('lb:sent', {})
  return v && typeof v === 'object' ? (v as Sent) : {}
}

/** Keep only this week's and last week's Standard keys and the last 3 days of Daily keys. */
function saveSent(sent: Sent, today: string): void {
  const now = Date.parse(today + 'T00:00:00Z')
  const weeks = [isoWeek(today), isoWeek(dayOf(now - 7 * 86_400_000))]
  const oldestDay = dayOf(now - 3 * 86_400_000)
  const out: Sent = {}
  for (const k in sent) {
    const keep = k.startsWith('daily:') ? k.slice(6) >= oldestDay : weeks.some((w) => k.endsWith(':' + w))
    if (keep) out[k] = sent[k]!
  }
  saveJSON('lb:sent', out)
}

/** Whether `r` qualifies for a post (no request is made to decide). */
function eligible(r: PostableRun): boolean {
  if (!BASE || !CAN_POST || optInState() !== true || !playerId()) return false
  if (r.time < MIN_POST_S || r.score <= 0) return false
  if (r.mode === 'daily' && !r.ranked) return false
  const prev = loadSent()[sentKey(r, dayOf(Date.now()))]
  if (r.mode === 'daily') return prev === undefined
  return prev === undefined || r.score > prev
}

/** Post one run: the ranked Daily once, a Standard run when it beats this week's
 *  sent score. Never practice runs, runs under 10 s, or runs that scored nothing. */
export async function submitRun(r: PostableRun): Promise<SubmitOutcome> {
  if (!eligible(r)) return { kind: 'off' }
  if (offline) return { kind: offline }
  const today = dayOf(Date.now())
  const body = {
    v: SIM_VERSION,
    player: playerId(),
    name: getPlayerName(),
    mode: r.mode,
    day: r.date,
    world: r.arena,
    pilot: r.character,
    paint: r.paint,
    threat: r.threat,
    seed: r.seed >>> 0,
    timeMs: Math.round(r.time * 1000),
    kills: r.kills,
    level: r.level,
    xpSum: r.xpSum,
    killPts: r.killPts,
    bosses: r.bossesSlain,
    bestChain: r.bestChain,
    hits: r.hits,
    closeCalls: r.closeCalls,
    cleared: r.cleared,
    clearMs: r.clearMs,
    client: platformId(),
  }
  // keepalive: a run recorded as the page closes still reaches the server.
  const res = await request('/api/v2/run', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res) return { kind: 'failed' }
  const kind = statusKind(res.status)
  if (kind !== 'ok') {
    // A refused or duplicate Daily is settled; it never posts again.
    if ((kind === 'duplicate' || kind === 'rejected') && r.mode === 'daily') markSent(r, today, r.score)
    return { kind }
  }
  const data = (await readJson(res)) as Partial<{ score: number; name: string; renamed: boolean; ranks: { day?: Rank; week?: Rank; all?: Rank } }> | null
  const score = typeof data?.score === 'number' ? data.score : r.score
  markSent(r, today, score)
  const name = typeof data?.name === 'string' ? data.name : getPlayerName()
  const renamed = data?.renamed === true
  if (renamed) setPlayerName(name)
  return { kind: 'posted', score, name, renamed, ...(data?.ranks ?? {}) }
}

function markSent(r: PostableRun, today: string, score: number): void {
  const sent = loadSent()
  sent[sentKey(r, today)] = score
  saveSent(sent, today)
}

// --- boards --------------------------------------------------------------------

export interface BoardRow {
  rank: number
  name: string
  country: string | null
  pilot: string
  paint: string
  threat: number
  score: number
  timeMs: number
  kills: number
  level: number
  cleared: boolean
}

export interface BoardMe extends Rank {
  pct: number
  score: number
}

export interface BoardQuery {
  board: 'daily' | 'endless'
  /** Standard only. */
  world?: string
  period?: 'week' | 'all'
  /** Daily only; the server defaults to today. */
  day?: string
  limit?: number
}

export type BoardResult =
  | { ok: true; rows: BoardRow[]; total: number; me: BoardMe | null }
  | { ok: false; reason: 'offline' | 'gone' | 'outdated' }

export async function fetchBoard(q: BoardQuery): Promise<BoardResult> {
  if (!BASE) return { ok: false, reason: 'offline' }
  if (offline) return { ok: false, reason: offline }
  const p = new URLSearchParams({ board: q.board, limit: String(q.limit ?? 50) })
  if (q.world) p.set('world', q.world)
  if (q.period) p.set('period', q.period)
  if (q.day) p.set('day', q.day)
  const id = optInState() === true ? playerId() : ''
  if (id) p.set('player', id)
  const res = await request('/api/v2/board?' + p.toString(), { method: 'GET' })
  if (!res) return { ok: false, reason: 'offline' }
  const kind = statusKind(res.status)
  if (kind === 'gone' || kind === 'outdated') return { ok: false, reason: kind }
  if (kind !== 'ok') return { ok: false, reason: 'offline' }
  const data = (await readJson(res)) as Partial<{ rows: BoardRow[]; total: number; me: BoardMe | null }> | null
  if (!data || !Array.isArray(data.rows)) return { ok: false, reason: 'offline' }
  return { ok: true, rows: data.rows, total: typeof data.total === 'number' ? data.total : data.rows.length, me: data.me ?? null }
}

/** REMOVE MY SCORES: delete every row of this install, then stop posting. */
export async function deleteMyScores(): Promise<'ok' | 'failed' | 'gone' | 'outdated'> {
  const id = playerId()
  if (!BASE || !id) {
    optOut()
    return 'ok'
  }
  if (offline) return offline
  const res = await request('/api/v2/player/' + id, { method: 'DELETE' })
  if (!res) return 'failed'
  const kind = statusKind(res.status)
  if (kind === 'gone' || kind === 'outdated') return kind
  if (kind !== 'ok') return 'failed'
  optOut()
  return 'ok'
}

// --- transport -----------------------------------------------------------------

type StatusKind = 'ok' | 'duplicate' | 'rejected' | 'gone' | 'outdated' | 'failed'

function statusKind(status: number): StatusKind {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 404 || status === 410) {
    offline = 'gone'
    return 'gone'
  }
  if (status === 426) {
    offline = 'outdated'
    return 'outdated'
  }
  if (status === 409) return 'duplicate'
  if (status === 400 || status === 422) return 'rejected'
  return 'failed'
}

/** One request with a timeout; null on any network error. */
async function request(path: string, init: RequestInit): Promise<Response | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(BASE + path, { ...init, signal: ctl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}
