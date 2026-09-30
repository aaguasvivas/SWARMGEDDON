/**
 * SWARMGEDDON leaderboard v2: one Cloudflare Worker backed by D1 (section 8.4).
 *
 *   POST   /api/v2/run          post a run; the score is recomputed here
 *   GET    /api/v2/board        a board: one row per player (their best) plus a `me` row
 *   DELETE /api/v2/player/:id   remove every row of one install id
 *   /api/score, /api/leaderboard (v1)   410
 *
 * The Daily spec, the score formula and the plausibility bounds come from the
 * game's own src/core/rules.ts, so client and server cannot drift apart.
 * Responses never carry player_id or ip_hash.
 */
import {
  KILL_PTS_PER_XP,
  KNOWN_WORLDS,
  MAX_TIER,
  SIM_VERSION,
  dailySpec,
  dayOf,
  implausible,
  isDay,
  isoWeek,
  scoreOf,
  type RunSummary,
} from '../../src/core/rules.ts'
import { blocked } from './blocklist.ts'

export interface Env {
  DB: D1Database
  /** Secret (`wrangler secret put IP_SALT`). Without it the worker refuses posts. */
  IP_SALT?: string
  /** Set only by `wrangler dev --var DEV_ROUTES:1` for the parity script. */
  DEV_ROUTES?: string
}

interface Rank {
  rank: number
  of: number
}

const PLAYER_RE = /^[A-Za-z0-9_-]{22}$/
const NAME_MIN = 2
const NAME_MAX = 14
const CLIENTS = ['web', 'ios', 'android']
const DAY_MS = 86_400_000
/** Insert guards: per IP hash in 10 minutes, per player in 24 hours, Daily rows per IP hash (which rotates daily). */
const IP_PER_10_MIN = 8
const PLAYER_PER_DAY = 40
const DAILY_PER_IP = 3
const DAILY_KEEP_MS = 45 * DAY_MS
const STANDARD_KEEP_TOP = 2000
const BOARD_MAX = 100

export default {
  async fetch(req, env, ctx): Promise<Response> {
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))
    const url = new URL(req.url)
    const path = url.pathname
    try {
      if (path === '/api/v2/run' && req.method === 'POST') return cors(await submit(req, env, ctx))
      if (path === '/api/v2/board' && req.method === 'GET') return cors(await board(url, env))
      const del = /^\/api\/v2\/player\/([^/]*)$/.exec(path)
      if (del && req.method === 'DELETE') return cors(await removePlayer(del[1]!, env))
      if (path === '/api/score' || path === '/api/leaderboard') return cors(json({ error: 'gone', update: true }, 410))
      if (path === '/api/v2/dev/daily' && env.DEV_ROUTES === '1') return cors(devDaily(url))
    } catch (e) {
      console.error('leaderboard error:', e)
      return cors(json({ error: 'server error' }, 500))
    }
    return cors(json({ error: 'not found' }, 404))
  },
} satisfies ExportedHandler<Env>

async function submit(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: Record<string, unknown>
  try {
    const b: unknown = await req.json()
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'bad json' }, 400)
    body = b as Record<string, unknown>
  } catch {
    return json({ error: 'bad json' }, 400)
  }
  if (body.v !== SIM_VERSION) return json({ error: 'update the game' }, 426)

  const player = body.player
  if (typeof player !== 'string' || !PLAYER_RE.test(player)) return json({ error: 'bad player' }, 400)
  const mode = body.mode
  if (mode !== 'daily' && mode !== 'endless') return json({ error: 'bad mode' }, 400)
  const clean = cleanName(body.name)
  const renamed = clean === null || blocked(clean)
  const name = renamed ? 'PILOT' + player.slice(0, 4).toUpperCase() : clean

  const s: RunSummary = {
    world: typeof body.world === 'string' ? body.world : '',
    pilot: typeof body.pilot === 'string' ? body.pilot : '',
    threat: num(body.threat),
    timeMs: num(body.timeMs),
    kills: num(body.kills),
    xpSum: num(body.xpSum),
    killPts: num(body.killPts),
    closeCalls: num(body.closeCalls),
    bestChain: num(body.bestChain),
    hits: num(body.hits),
    level: num(body.level),
    bosses: num(body.bosses),
    cleared: body.cleared as boolean,
    clearMs: num(body.clearMs),
  }
  if (implausible(s)) return json({ error: 'rejected' }, 422)
  const seed = body.seed
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return json({ error: 'bad seed' }, 400)

  const now = Date.now()
  const today = dayOf(now)
  let day = today
  if (mode === 'daily') {
    const d = body.day
    // A run belongs to the day it started on; one that crosses UTC midnight posts after it.
    if (!isDay(d) || (d !== today && d !== dayOf(now - DAY_MS))) return json({ error: 'wrong day' }, 400)
    const spec = dailySpec(d)
    if (seed !== spec.seed || s.world !== spec.world || s.pilot !== spec.pilot || s.threat !== spec.threat) {
      return json({ error: 'not the daily' }, 400)
    }
    // The Daily ends at the clear: the 2 s win hand-off plus pending drafts.
    if (s.cleared && s.timeMs > s.clearMs + 3000) return json({ error: 'rejected' }, 422)
    day = d
    if (await dailyPosted(env, player, day)) return json({ error: 'already posted' }, 409)
  }

  const score = scoreOf(s.killPts, s.xpSum, s.cleared ? s.clearMs : 0, s.threat)
  if (score <= 0) return json({ error: 'empty run' }, 400)
  if (!env.IP_SALT) return json({ error: 'not configured' }, 503)
  const ipHash = await hmacHex(env.IP_SALT, (req.headers.get('cf-connecting-ip') ?? '') + '|' + today)
  const killPts = Math.min(s.killPts, MAX_TIER * KILL_PTS_PER_XP * s.xpSum)
  const week = isoWeek(today)
  const cfCountry = (req.cf as { country?: unknown } | undefined)?.country
  const country = typeof cfCountry === 'string' && /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : null
  const paint = typeof body.paint === 'string' && /^[a-z0-9_]{1,24}$/.test(body.paint) ? body.paint : 'factory'
  const client = typeof body.client === 'string' && CLIENTS.includes(body.client) ? body.client : 'other'

  // The limits live inside the INSERT (SQLite is single-writer), so a parallel
  // burst cannot pass a check-then-write race; the partial unique index turns a
  // racing second Daily of one player into an ignored row.
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO runs (v, board, world, pilot, paint, threat, player_id, name, score, time_ms, kills, level,
       xp_sum, kill_pts, bosses, best_chain, hits, cleared, clear_ms, seed, day, week, country, client, ts, ip_hash)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM runs WHERE ip_hash = ? AND ts > ?) < ?
       AND (SELECT COUNT(*) FROM runs WHERE player_id = ? AND ts > ?) < ?
       AND (? <> 'daily' OR (SELECT COUNT(*) FROM runs WHERE ip_hash = ? AND board = 'daily') < ?)`,
  )
    .bind(
      SIM_VERSION, mode, s.world, s.pilot, paint, s.threat, player, name, score, s.timeMs, s.kills, s.level,
      s.xpSum, killPts, s.bosses, s.bestChain, s.hits, s.cleared ? 1 : 0, s.cleared ? s.clearMs : 0, seed, day, week, country, client, now, ipHash,
      ipHash, now - 600_000, IP_PER_10_MIN,
      player, now - DAY_MS, PLAYER_PER_DAY,
      mode, ipHash, DAILY_PER_IP,
    )
    .run()
  if (!ins.meta.changes) {
    if (mode === 'daily' && (await dailyPosted(env, player, day))) return json({ error: 'already posted' }, 409)
    return json({ error: 'slow down' }, 429)
  }
  if (Math.random() < 0.01) ctx.waitUntil(prune(env, now))

  const ranks: { day?: Rank; week?: Rank; all?: Rank } = {}
  if (mode === 'daily') {
    ranks.day = await rankOf(env, `v = ? AND board = 'daily' AND day = ?`, [SIM_VERSION, day], score, player)
  } else {
    ranks.week = await rankOf(env, `v = ? AND board = 'endless' AND world = ? AND week = ?`, [SIM_VERSION, s.world, week], score, player)
    ranks.all = await rankOf(env, `v = ? AND board = 'endless' AND world = ?`, [SIM_VERSION, s.world], score, player)
  }
  return json({ ok: true, score, name, renamed, ranks })
}

async function dailyPosted(env: Env, player: string, day: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT 1 AS x FROM runs WHERE player_id = ? AND day = ? AND board = 'daily' LIMIT 1`).bind(player, day).first()
  return row !== null
}

/** Where `score` places among the other players' bests on a board. */
async function rankOf(env: Env, where: string, binds: (string | number)[], score: number, player: string): Promise<Rank> {
  const r = await env.DB.prepare(
    `SELECT (SELECT COUNT(DISTINCT player_id) FROM runs WHERE ${where} AND score > ? AND player_id <> ?) AS better,
            (SELECT COUNT(DISTINCT player_id) FROM runs WHERE ${where}) AS total`,
  )
    .bind(...binds, score, player, ...binds)
    .first<{ better: number; total: number }>()
  const rank = (r?.better ?? 0) + 1
  return { rank, of: Math.max(rank, r?.total ?? 0) }
}

async function board(url: URL, env: Env): Promise<Response> {
  const p = url.searchParams
  const limit = Math.min(BOARD_MAX, Math.max(1, Math.floor(Number(p.get('limit')) || 50)))
  let where: string
  let binds: (string | number)[]
  if (p.get('board') === 'daily') {
    const day = p.get('day') ?? dayOf(Date.now())
    if (!isDay(day)) return json({ error: 'bad day' }, 400)
    where = `v = ? AND board = 'daily' AND day = ?`
    binds = [SIM_VERSION, day]
  } else if (p.get('board') === 'endless') {
    const world = p.get('world') ?? ''
    if (!KNOWN_WORLDS.includes(world)) return json({ error: 'bad world' }, 400)
    if (p.get('period') === 'all') {
      where = `v = ? AND board = 'endless' AND world = ?`
      binds = [SIM_VERSION, world]
    } else {
      where = `v = ? AND board = 'endless' AND world = ? AND week = ?`
      binds = [SIM_VERSION, world, isoWeek(dayOf(Date.now()))]
    }
  } else {
    return json({ error: 'bad board' }, 400)
  }

  const [rows, total] = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare(
      `SELECT name, country, pilot, paint, threat, score, time_ms, kills, level, cleared FROM (
         SELECT name, country, pilot, paint, threat, score, time_ms, kills, level, cleared, ts,
                ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY score DESC, ts ASC) AS rn
         FROM runs WHERE ${where})
       WHERE rn = 1 ORDER BY score DESC, ts ASC LIMIT ?`,
    ).bind(...binds, limit),
    env.DB.prepare(`SELECT COUNT(DISTINCT player_id) AS n FROM runs WHERE ${where}`).bind(...binds),
  ])
  const n = Number(total!.results[0]?.['n'] ?? 0)

  let me: (Rank & { pct: number; score: number }) | null = null
  const player = p.get('player')
  if (player && PLAYER_RE.test(player)) {
    const mine = await env.DB.prepare(`SELECT MAX(score) AS s FROM runs WHERE ${where} AND player_id = ?`).bind(...binds, player).first<{ s: number | null }>()
    if (mine && mine.s !== null) {
      const better = await env.DB.prepare(`SELECT COUNT(DISTINCT player_id) AS b FROM runs WHERE ${where} AND score > ?`).bind(...binds, mine.s).first<{ b: number }>()
      const rank = (better?.b ?? 0) + 1
      const of = Math.max(n, rank)
      me = { rank, of, pct: Math.max(1, Math.ceil((rank * 100) / of)), score: mine.s }
    }
  }

  return json({
    rows: rows!.results.map((r, i) => ({
      rank: i + 1,
      name: r['name'],
      country: r['country'] ?? null,
      pilot: r['pilot'],
      paint: r['paint'],
      threat: r['threat'],
      score: r['score'],
      timeMs: r['time_ms'],
      kills: r['kills'],
      level: r['level'],
      cleared: r['cleared'] === 1,
    })),
    total: n,
    me,
  })
}

async function removePlayer(id: string, env: Env): Promise<Response> {
  if (!PLAYER_RE.test(id)) return json({ error: 'bad player' }, 400)
  const r = await env.DB.prepare('DELETE FROM runs WHERE player_id = ?').bind(id).run()
  return json({ ok: true, deleted: r.meta.changes ?? 0 })
}

/** Retention (on 1% of posts): Daily rows go after 45 days; per world, Standard
 *  rows older than last week go unless they are in the all-time top 2000. */
async function prune(env: Env, now: number): Promise<void> {
  const lastWeek = isoWeek(dayOf(now - 7 * DAY_MS))
  const stmts = [env.DB.prepare(`DELETE FROM runs WHERE board = 'daily' AND ts < ?`).bind(now - DAILY_KEEP_MS)]
  for (const world of KNOWN_WORLDS) {
    stmts.push(
      env.DB.prepare(
        `DELETE FROM runs WHERE board = 'endless' AND world = ? AND week < ?
           AND id NOT IN (SELECT id FROM runs WHERE board = 'endless' AND world = ? ORDER BY score DESC, ts ASC LIMIT ?)`,
      ).bind(world, lastWeek, world, STANDARD_KEEP_TOP),
    )
  }
  await env.DB.batch(stmts)
}

/** Parity check only (scripts/test-rules.mjs): the specs of `n` days from `from`. */
function devDaily(url: URL): Response {
  const from = url.searchParams.get('from')
  const n = Math.min(1000, Math.max(1, Math.floor(Number(url.searchParams.get('n')) || 1)))
  if (!isDay(from)) return json({ error: 'bad day' }, 400)
  const t0 = Date.parse(from + 'T00:00:00Z')
  const days = []
  for (let i = 0; i < n; i++) {
    const d = dayOf(t0 + i * DAY_MS)
    days.push({ ...dailySpec(d), week: isoWeek(d) })
  }
  return json({ days })
}

// --- helpers ---------------------------------------------------------------

function num(v: unknown): number {
  return typeof v === 'number' ? v : NaN
}

/**
 * NFKC-fold the name, then strip C0/C1 controls, zero-width and bidi controls,
 * soft hyphens, lone surrogates and combining marks (Zalgo). Null unless 2 to
 * 14 visible characters survive.
 */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let out = ''
  for (const ch of raw.slice(0, 64).normalize('NFKC')) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x20 || c === 0x7f || (c >= 0x80 && c <= 0x9f) || c === 0xad) continue
    if ((c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x2069) || c === 0xfeff) continue
    if (c >= 0xd800 && c <= 0xdfff) continue
    if (
      (c >= 0x0300 && c <= 0x036f) || (c >= 0x1ab0 && c <= 0x1aff) || (c >= 0x1dc0 && c <= 0x1dff) ||
      (c >= 0x20d0 && c <= 0x20ff) || (c >= 0xfe20 && c <= 0xfe2f)
    ) continue
    out += ch
  }
  const s = out.replace(/\s+/g, ' ').trim()
  const n = [...s].length
  return n >= NAME_MIN && n <= NAME_MAX ? s : null
}

/** First 16 hex characters of HMAC-SHA256(key, msg). */
async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
  let hex = ''
  for (let i = 0; i < 8; i++) hex += sig[i]!.toString(16).padStart(2, '0')
  return hex
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function cors(res: Response): Response {
  res.headers.set('access-control-allow-origin', '*')
  res.headers.set('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
  res.headers.set('access-control-allow-headers', 'content-type')
  res.headers.set('cache-control', 'no-store')
  return res
}
