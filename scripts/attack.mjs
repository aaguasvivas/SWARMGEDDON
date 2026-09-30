// Leaderboard v2 attack suite (NEXT-LEVEL.md A-LB). Run it against a LOCAL worker
// with a LOCAL D1 only; never against the live worker.
//
// Setup (in server/): npm run db:migrate:test, then npm run dev:test
// Run (repo root):
//   LB_URL=http://127.0.0.1:8788 LB_PERSIST=server/.wrangler/test node scripts/attack.mjs
//
// Each case posts from its own client IP (cf-connecting-ip, which only a local
// worker takes from the request; Cloudflare sets it in production) and its own
// install ids, so the cases do not share rate-limit budgets. LB_PERSIST lets the
// clamp case read kill_pts from the local D1. Exits 1 when any case fails.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLEAR_MIN_MS, KILL_PTS_PER_XP, MAX_TIER, UNCLEARED_MAX_MS, dailySpec, dayOf, scoreOf } from '../src/core/rules.ts'

const API = (process.env.LB_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '')
const PERSIST = process.env.LB_PERSIST ? resolve(process.env.LB_PERSIST) : ''
const SERVER_DIR = fileURLToPath(new URL('../server', import.meta.url))
const now = Date.now()
const today = dayOf(now)
const yesterday = dayOf(now - 86_400_000)
const spec = dailySpec(today)
const nonce = Math.floor(now / 1000).toString(36)

let idSeq = 0
/** A fresh 22-character install id. */
const newId = () => (`t${nonce}x${(idSeq++).toString(36)}` + 'A'.repeat(22)).slice(0, 22)
let ipSeq = 0
/** A fresh client IP per case. */
const newIp = () => `10.${(ipSeq >> 8) & 255}.${ipSeq & 255}.${(ipSeq++ % 250) + 1}`
const seenIds = new Set()
const bodies = []

function standard(over = {}) {
  return {
    v: 2, player: newId(), name: 'TESTER', mode: 'endless', day: today, world: 'hive', pilot: 'nova', paint: 'factory',
    threat: 0, seed: 12345, timeMs: 120_000, kills: 200, level: 8, xpSum: 260, killPts: 6000, bosses: 0, bestChain: 60,
    hits: 12, closeCalls: 3, cleared: false, clearMs: 0, client: 'web', ...over,
  }
}
function daily(over = {}) {
  return standard({ mode: 'daily', day: spec.date, world: spec.world, pilot: spec.pilot, threat: spec.threat, seed: spec.seed, ...over })
}

async function call(method, path, body, ip) {
  const headers = { 'cf-connecting-ip': ip || newIp() }
  if (body) headers['content-type'] = 'application/json'
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  bodies.push(text)
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json }
}
const post = (b, ip) => {
  seenIds.add(b.player)
  return call('POST', '/api/v2/run', b, ip)
}
const getBoard = (q) => call('GET', '/api/v2/board?' + new URLSearchParams(q).toString())

const results = []
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`)
}

// --- A-LB ------------------------------------------------------------------------

{
  const r = await post(daily({ seed: (spec.seed + 1) >>> 0 }))
  check('forged seed 400', r.status === 400, r.status)
}
{
  const wrong = ['nova', 'ember', 'vesper'].find((p) => p !== spec.pilot)
  const r = await post(daily({ pilot: wrong }))
  check('wrong pilot 400', r.status === 400, r.status)
}
{
  const ip = newIp()
  const b = daily()
  const a = await post(b, ip)
  const c = await post({ ...b }, ip)
  check('second Daily 409', a.status === 200 && c.status === 409, [a.status, c.status])
}
{
  const ip = newIp()
  const st = []
  for (let i = 0; i < 4; i++) st.push((await post(daily(), ip)).status)
  check('4th Daily per IP 429', st.join() === '200,200,200,429', st)
}
{
  const ip = newIp()
  const st = []
  for (let i = 0; i < 9; i++) st.push((await post(standard(), ip)).status)
  check('9th insert in 10 min 429', st.slice(0, 8).every((s) => s === 200) && st[8] === 429, st)
}
{
  const b = standard({ killPts: 100 * 260 })
  const r = await post(b)
  const want = scoreOf(MAX_TIER * KILL_PTS_PER_XP * 260, 260, 0, 0)
  let stored = null
  if (PERSIST) {
    const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'swarmgeddon', '--local', '--persist-to', PERSIST, '--json',
      '--command', `SELECT kill_pts FROM runs WHERE player_id = '${b.player}'`], { cwd: SERVER_DIR, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
    stored = JSON.parse(out)[0].results[0]?.kill_pts ?? null
  }
  check('killPts > 80 x xpSum stored clamped', r.status === 200 && r.json.score === want && (stored === null || stored === 80 * 260),
    { status: r.status, score: r.json?.score, want, storedKillPts: stored })
}
{
  const r = await post(standard({ timeMs: 10_000, kills: 2_700, xpSum: 2_700, bestChain: 100 }))
  check('kills over 250/s 422', r.status === 422, r.status)
}
{
  const r = await post(standard({ kills: 5, xpSum: 5, killPts: 100, closeCalls: 2, bestChain: 35, timeMs: 30_000 }))
  check('kills 5, closeCalls 2, bestChain 35 accepted', r.status === 200, r.status)
}
{
  const r = await post(standard({ kills: 5, xpSum: 5, killPts: 100, closeCalls: 2, bestChain: 36, timeMs: 30_000 }))
  check('bestChain > kills + 15 x closeCalls 422', r.status === 422, r.status)
}
{
  const b = standard({ name: 'SH1T_HEAD' })
  const r = await post(b)
  const want = 'PILOT' + b.player.slice(0, 4).toUpperCase()
  check('blocklisted name becomes PILOT####', r.status === 200 && r.json.name === want && r.json.renamed === true, r.json)
}
{
  const ip = newIp()
  for (let i = 0; i < 3; i++) await post(standard(), ip)
  const burst = await Promise.all(Array.from({ length: 12 }, () => post(standard(), ip)))
  const ok = burst.filter((r) => r.status === 200).length
  const limited = burst.filter((r) => r.status === 429).length
  check('burst of 12 accepts exactly the remaining budget (5)', ok === 5 && limited === 7, { ok, limited })
}
{
  const world = 'wastes'
  const player = newId()
  const ip = newIp()
  for (const kp of [1000, 5000, 3000]) await post(standard({ player, world, killPts: kp, name: 'OR' + nonce }), ip)
  const r = await getBoard({ board: 'endless', world, period: 'all', limit: '100' })
  const mine = r.json.rows.filter((x) => x.name === 'OR' + nonce)
  check('board returns one row per player (their best)', mine.length === 1 && mine[0].score === scoreOf(5000, 260, 0, 0), mine)
}
{
  // 55 players above one low scorer on the Depths all-time board.
  const world = 'depths'
  const posts = []
  for (let i = 0; i < 55; i++) posts.push(standard({ world, killPts: 10_000 + i, name: 'HIGH' + i }))
  for (let i = 0; i < posts.length; i += 8) {
    const ip = newIp()
    await Promise.all(posts.slice(i, i + 8).map((b) => post(b, ip)))
  }
  const low = standard({ world, killPts: 10, name: 'LO' + nonce })
  await post(low)
  const r = await getBoard({ board: 'endless', world, period: 'all', limit: '50', player: low.player })
  const inTop = r.json.rows.some((x) => x.name === 'LO' + nonce)
  check('me present outside the top 50', r.status === 200 && r.json.rows.length === 50 && !inTop && r.json.me && r.json.me.rank > 50, { me: r.json.me, total: r.json.total })
}
{
  const a = await call('POST', '/api/score', { name: 'OLD', mode: 'endless', time: 60, kills: 5, level: 2 })
  const b = await call('GET', '/api/leaderboard?mode=endless&board=alltime&scope=global')
  check('/api/score and /api/leaderboard 410', a.status === 410 && b.status === 410, [a.status, b.status])
}

// --- clear bounds (carry-over) and other contract cases ----------------------------

{
  // The PRIME arrives at 630 s and emerges for 1.0 s: the earliest kill is 631 s plus a tick.
  const r = await post(standard({ cleared: true, clearMs: 631_017, timeMs: 633_050, bosses: 1, kills: 900, xpSum: 1400, killPts: 40_000, bestChain: 300, level: 22 }))
  check('earliest clear (631.017 s, one boss after an ascend) accepted', r.status === 200, { status: r.status, CLEAR_MIN_MS })
  const r2 = await post(standard({ cleared: true, clearMs: CLEAR_MIN_MS - 1, timeMs: 633_050, bosses: 2, kills: 900, xpSum: 1400, killPts: 40_000, bestChain: 300, level: 22 }))
  check('clear before the PRIME beat 422', r2.status === 422, r2.status)
  const r3 = await post(daily({ cleared: true, clearMs: 640_000, timeMs: 642_016, bosses: 3, kills: 900, xpSum: 1400, killPts: 40_000, bestChain: 300, level: 22 }))
  check('Daily clear ended 2 s after the kill accepted', r3.status === 200, r3.status)
  const r4 = await post(daily({ cleared: true, clearMs: 640_000, timeMs: 645_000, bosses: 3, kills: 900, xpSum: 1400, killPts: 40_000, bestChain: 300, level: 22 }))
  check('Daily clear with time past clear + 3 s 422', r4.status === 422, r4.status)
}
{
  // A mid kill just before 10:30 delays the PRIME to 650 s; its stalemate ends the run at 860 s.
  const r = await post(standard({ timeMs: 860_017, bosses: 2, kills: 1500, xpSum: 2500, killPts: 50_000, bestChain: 300, level: 25 }))
  check('latest stalemate (860 s) accepted', r.status === 200, r.status)
  const r2 = await post(standard({ timeMs: UNCLEARED_MAX_MS + 1, bosses: 2, kills: 1500, xpSum: 2500, killPts: 50_000, bestChain: 300, level: 25 }))
  check('uncleared past the stalemate bound 422', r2.status === 422, r2.status)
}
{
  const r = await post(standard({ v: 1 }))
  check('old sim version 426', r.status === 426, r.status)
}
{
  const ys = dailySpec(yesterday)
  const r = await post(daily({ day: yesterday, seed: ys.seed, world: ys.world, pilot: ys.pilot, threat: ys.threat }))
  const old = dayOf(now - 2 * 86_400_000)
  const os = dailySpec(old)
  const r2 = await post(daily({ day: old, seed: os.seed, world: os.world, pilot: os.pilot, threat: os.threat }))
  check("yesterday's Daily accepted, two days back 400", r.status === 200 && r2.status === 400, [r.status, r2.status])
}
{
  const r = await post(daily({ name: 'DAYRANK' }))
  check('Daily post returns a day rank', r.status === 200 && r.json.ranks?.day?.rank >= 1 && r.json.ranks.day.of >= r.json.ranks.day.rank, r.json?.ranks)
  const s = await post(standard({ world: 'hive' }))
  check('Standard post returns week and all-time ranks', s.status === 200 && s.json.ranks?.week?.rank >= 1 && s.json.ranks?.all?.rank >= 1, s.json?.ranks)
}
{
  const zalgo = await post(standard({ name: 'A' + '̀'.repeat(13) + 'B' }))
  const bidi = await post(standard({ name: 'abc‮xyz' }))
  const invisible = await post(standard({ name: '​​​' }))
  check('name sanitizer: Zalgo and bidi stripped, invisible name renamed',
    zalgo.json?.name === 'ÀB' && bidi.json?.name === 'abcxyz' && invisible.json?.renamed === true,
    [zalgo.json?.name, bidi.json?.name, invisible.json?.name])
}
{
  const b = standard({ world: 'hive', killPts: 999_999, xpSum: 30_000, kills: 20_000, timeMs: 1_200_000, bestChain: 20_000, name: 'DM' + nonce, cleared: true, clearMs: 700_000, bosses: 4 })
  const a = await post(b)
  const del = await call('DELETE', '/api/v2/player/' + b.player)
  const r = await getBoard({ board: 'endless', world: 'hive', period: 'all', limit: '100' })
  check('DELETE /api/v2/player/:id removes every row', a.status === 200 && del.status === 200 && del.json.deleted === 1 && !r.json.rows.some((x) => x.name === 'DM' + nonce), { post: a.status, del: del.json })
}
{
  const leak = bodies.filter((t) => /player_id|ip_hash/.test(t) || [...seenIds].some((id) => t.includes(id)))
  check('no player_id (or ip_hash) in any response', leak.length === 0, { responses: bodies.length, leaks: leak.slice(0, 2) })
}

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ cases: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }))
process.exit(failed.length ? 1 : 0)
