/**
 * SWARMGEDDON global leaderboard — a single Cloudflare Worker backed by D1.
 *
 *   POST /api/score        submit a run    (body: { name, mode, time, kills, level, seed })
 *   GET  /api/leaderboard  read a board    (?mode=&board=alltime|daily&scope=global|region&limit=)
 *
 * Regions come for free: Cloudflare tags every request with the player's
 * country/continent (request.cf), so no GPS or permissions are needed. The
 * score is RECOMPUTED server-side from the (capped) run stats, so a forged
 * `score` can't inflate the board without also forging plausible time/kills/
 * level — the pragmatic anti-cheat that fits a public web game.
 */

export interface Env {
  DB: D1Database
}

const MAX_NAME = 14
const LIMIT_MAX = 100
// Sanity caps — anything past these is a forged/garbage run, clamp it.
const CAP = { time: 4 * 3600, kills: 200_000, level: 500 }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))
    const url = new URL(req.url)
    try {
      if (url.pathname === '/api/score' && req.method === 'POST') return cors(await submit(req, env))
      if (url.pathname === '/api/leaderboard' && req.method === 'GET') return cors(await board(req, url, env))
    } catch (e) {
      return cors(json({ error: 'server error', detail: String(e) }, 500))
    }
    return cors(json({ error: 'not found' }, 404))
  },
}

async function submit(req: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  const mode = body.mode === 'daily' ? 'daily' : 'endless'
  const name = sanitizeName(body.name)
  const time = clampInt(body.time, CAP.time)
  const kills = clampInt(body.kills, CAP.kills)
  const level = clampInt(body.level, CAP.level)
  const score = computeScore(time, kills, level)
  if (score <= 0) return json({ error: 'empty run' }, 400)

  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf
  const country = typeof cf?.country === 'string' ? cf.country : null
  const continent = typeof cf?.continent === 'string' ? cf.continent : null
  const day = today()
  const ts = Date.now()
  const seed = clampInt(body.seed, 0xffffffff)
  const ipHash = await sha256(req.headers.get('cf-connecting-ip') ?? '')

  // Light rate limit: at most 6 submissions / 30s from one IP.
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND ts > ?')
    .bind(ipHash, ts - 30_000)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= 6) return json({ error: 'slow down' }, 429)

  await env.DB.prepare(
    'INSERT INTO scores (name, mode, score, time, kills, level, seed, country, continent, day, ts, ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(name, mode, score, time, kills, level, seed, country, continent, day, ts, ipHash)
    .run()

  const better = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE mode = ? AND score > ?')
    .bind(mode, score)
    .first<{ n: number }>()

  return json({ ok: true, score, rank: (better?.n ?? 0) + 1 })
}

async function board(req: Request, url: URL, env: Env): Promise<Response> {
  const p = url.searchParams
  const mode = p.get('mode') === 'daily' ? 'daily' : 'endless'
  const kind = p.get('board') === 'daily' ? 'daily' : 'alltime'
  const scope = p.get('scope') === 'region' ? 'region' : 'global'
  const limit = Math.min(LIMIT_MAX, Math.max(1, Math.floor(Number(p.get('limit')) || 50)))

  // Resolve the viewer's own continent when asking for a regional board.
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf
  const region = (p.get('region') || (typeof cf?.continent === 'string' ? cf.continent : '')).slice(0, 4)

  const where = ['mode = ?']
  const args: (string | number)[] = [mode]
  if (kind === 'daily') {
    where.push('day = ?')
    args.push(today())
  }
  if (scope === 'region' && region) {
    where.push('continent = ?')
    args.push(region)
  }
  args.push(limit)

  const rows = await env.DB.prepare(
    `SELECT name, score, time, kills, level, country FROM scores WHERE ${where.join(' AND ')} ORDER BY score DESC, ts ASC LIMIT ?`,
  )
    .bind(...args)
    .all<Record<string, unknown>>()

  const entries = (rows.results ?? []).map((r, i) => ({ rank: i + 1, ...r }))
  return json({ entries, region: scope === 'region' ? region : null })
}

// --- helpers ---------------------------------------------------------------

function computeScore(time: number, kills: number, level: number): number {
  return Math.floor(time * 10 + kills * 5 + level * 50)
}

function clampInt(v: unknown, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(max, Math.floor(n))
}

function sanitizeName(raw: unknown): string {
  const src = typeof raw === 'string' ? raw : ''
  let out = ''
  for (const ch of src) {
    const c = ch.codePointAt(0) ?? 0
    if (c >= 0x20 && c !== 0x7f) out += ch // drop control chars
  }
  return out.trim().slice(0, MAX_NAME) || 'ANON'
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function cors(res: Response): Response {
  res.headers.set('access-control-allow-origin', '*')
  res.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.headers.set('access-control-allow-headers', 'content-type')
  res.headers.set('cache-control', 'no-store')
  return res
}
