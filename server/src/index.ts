/**
 * SWARMGEDDON global leaderboard — a single Cloudflare Worker backed by D1.
 *
 *   POST /api/score        submit a run    (body: { name, mode, time, kills, level, seed, character, arena })
 *   GET  /api/leaderboard  read a board    (?mode=&board=alltime|daily&scope=global|region&limit=)
 *
 * Regions come for free: Cloudflare tags every request with the player's
 * country/continent (request.cf), so no GPS or permissions are needed.
 *
 * Anti-abuse posture (pragmatic, fits a public web game):
 *  - the score is RECOMPUTED server-side from capped run stats;
 *  - DAILY submissions must carry the actual daily seed for today (or
 *    yesterday, for runs that cross the UTC midnight) — forged/practiced
 *    seeds are rejected;
 *  - the rate limit is enforced atomically (guarded INSERT — no
 *    check-then-write race);
 *  - boards are deduped to each player's best (name + ip identity);
 *  - names are sanitized against control/bidi/zero-width/Zalgo tricks;
 *  - old rows are pruned opportunistically so the table can't grow forever.
 */

export interface Env {
  DB: D1Database
}

const MAX_NAME = 14
const LIMIT_MAX = 100
// Sanity caps — anything past these is a forged/garbage run, clamp it.
const CAP = { time: 4 * 3600, kills: 200_000, level: 500 }
// Retention: dailies age out; endless keeps a deep all-time top + recent tail.
const DAILY_KEEP_MS = 45 * 86_400_000
const ENDLESS_KEEP_MS = 30 * 86_400_000
const ENDLESS_KEEP_TOP = 2000

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))
    const url = new URL(req.url)
    try {
      if (url.pathname === '/api/score' && req.method === 'POST') return cors(await submit(req, env))
      if (url.pathname === '/api/leaderboard' && req.method === 'GET') return cors(await board(req, url, env))
    } catch (e) {
      console.error('leaderboard error:', e)
      return cors(json({ error: 'server error' }, 500)) // never leak internals
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
  // time stays fractional so the recomputed score matches what the game showed
  // (the client floors time*10 on FLOAT seconds); the stored column is rounded.
  const time = clampNum(body.time, CAP.time)
  const kills = clampInt(body.kills, CAP.kills)
  const level = clampInt(body.level, CAP.level)
  const score = computeScore(time, kills, level)
  if (score <= 0) return json({ error: 'empty run' }, 400)

  const seed = clampInt(body.seed, 0xffffffff)
  const ts = Date.now()

  // Daily runs must be on the real daily seed. Accept yesterday's too — a run
  // started before UTC midnight legitimately lands after it — and file the row
  // under the day its seed belongs to, so boards and ranks stay coherent.
  let day = today(ts)
  if (mode === 'daily') {
    const yesterday = today(ts - 86_400_000)
    if (seed === dailySeed(day)) {
      // today's seed
    } else if (seed === dailySeed(yesterday)) {
      day = yesterday
    } else {
      return json({ error: 'not the daily seed' }, 400)
    }
  }

  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf
  const country = typeof cf?.country === 'string' ? cf.country : null
  const continent = typeof cf?.continent === 'string' ? cf.continent : null
  const character = idToken(body.character)
  const arena = idToken(body.arena)
  const ipHash = await sha256(req.headers.get('cf-connecting-ip') ?? '')

  // Rate limit enforced ATOMICALLY: the guard lives inside the INSERT itself
  // (SQLite is single-writer), so N parallel requests can't all pass a
  // check-then-write race. changes === 0 -> limited.
  const ins = await env.DB.prepare(
    `INSERT INTO scores (name, mode, score, time, kills, level, seed, character, arena, country, continent, day, ts, ip_hash)
     SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?
     WHERE (SELECT COUNT(*) FROM scores WHERE ip_hash = ? AND ts > ?) < 6`,
  )
    .bind(name, mode, score, Math.round(time), kills, level, seed, character, arena, country, continent, day, ts, ipHash, ipHash, ts - 30_000)
    .run()
  if ((ins.meta.changes ?? 0) === 0) return json({ error: 'slow down' }, 429)

  // Opportunistic retention prune (~1% of submits) so the table can't grow
  // without bound under flooding or plain organic traffic.
  if (Math.random() < 0.01) {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM scores WHERE mode = 'daily' AND ts < ?`).bind(ts - DAILY_KEEP_MS),
      env.DB.prepare(
        `DELETE FROM scores WHERE mode = 'endless' AND ts < ?
         AND id NOT IN (SELECT id FROM scores WHERE mode = 'endless' ORDER BY score DESC, ts ASC LIMIT ?)`,
      ).bind(ts - ENDLESS_KEEP_MS, ENDLESS_KEEP_TOP),
    ])
  }

  // Rank among each player's BEST (matches the deduped board), and for dailies
  // only within the run's own day.
  const rankWhere = mode === 'daily' ? `mode = ? AND day = ?` : `mode = ?`
  const rankBinds: (string | number)[] = mode === 'daily' ? [mode, day] : [mode]
  const better = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (SELECT MAX(score) AS s FROM scores WHERE ${rankWhere} GROUP BY name, ip_hash) WHERE s > ?`,
  )
    .bind(...rankBinds, score)
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
    args.push(today(Date.now()))
  }
  if (scope === 'region' && region) {
    where.push('continent = ?')
    args.push(region)
  }
  args.push(limit)

  // One row per player identity (their best) — a grinder can't fill the board.
  // SQLite's bare-column-with-MAX() rule makes the other columns come from the
  // best-scoring row.
  const rows = await env.DB.prepare(
    `SELECT name, MAX(score) AS score, time, kills, level, country FROM scores
     WHERE ${where.join(' AND ')} GROUP BY name, ip_hash ORDER BY score DESC LIMIT ?`,
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
  return Math.floor(clampNum(v, max))
}

function clampNum(v: unknown, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(max, n)
}

/** Lowercase [a-z0-9_-] identifier (pilot/arena ids), or null. */
function idToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.toLowerCase().slice(0, 24)
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    const ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x5f || c === 0x2d
    if (ok) out += ch
  }
  return out || null
}

/**
 * Display-name sanitizer. NFC-normalize (so legit accents become single code
 * points), then strip: C0/C1 controls, DEL, zero-width + bidi controls (RLO
 * spoofing, invisible names), BOM, and any remaining combining marks (Zalgo
 * stacking). Falls back to ANON when nothing visible survives.
 */
function sanitizeName(raw: unknown): string {
  const src = (typeof raw === 'string' ? raw : '').normalize('NFC').slice(0, 64)
  let out = ''
  for (const ch of src) {
    const c = ch.codePointAt(0) ?? 0
    if (c < 0x20 || c === 0x7f) continue // C0 + DEL
    if (c >= 0x80 && c <= 0x9f) continue // C1 controls
    if (c >= 0x200b && c <= 0x200f) continue // zero-width + bidi marks
    if (c >= 0x202a && c <= 0x202e) continue // bidi embeddings/overrides
    if (c >= 0x2060 && c <= 0x2069) continue // invisibles + bidi isolates
    if (c === 0xfeff) continue // BOM / ZWNBSP
    if (
      (c >= 0x0300 && c <= 0x036f) || (c >= 0x1ab0 && c <= 0x1aff) ||
      (c >= 0x1dc0 && c <= 0x1dff) || (c >= 0x20d0 && c <= 0x20ff) ||
      (c >= 0xfe20 && c <= 0xfe2f)
    ) continue // combining marks surviving NFC = stacking spam
    out += ch
  }
  const trimmed = [...out.trim()].slice(0, MAX_NAME).join('').trim()
  return trimmed || 'ANON'
}

function today(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Seed for a given day's Daily Challenge. */
function dailySeed(day: string): number {
  return seedFromString('swarmgeddon:' + day)
}

/**
 * MUST MATCH src/core/rng.ts seedFromString in the game client, bit for bit —
 * it's how the worker verifies a daily submission really played today's seed.
 */
function seedFromString(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
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
