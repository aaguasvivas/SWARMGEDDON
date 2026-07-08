// SWARMGEDDON leaderboard-server attack suite (run against a LOCAL worker).
//
// Setup:  cd server && rm -rf .wrangler && npm run db:migrate:local
//         npm run dev -- --port 8788        (in server/)
// Run:    node scripts/attack.mjs
//
// Verifies the hardening batch: forged-daily-seed rejection, float-exact scores,
// name sanitizer (Zalgo / invisible / bidi), per-identity board dedupe, and the
// ATOMIC rate limit (parallel burst yields exactly the cap, never more).
// NOTE: seedFromString below MUST stay identical to src/core/rng.ts.
function seedFromString(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}
const day = new Date().toISOString().slice(0, 10)
const good = seedFromString('swarmgeddon:' + day)
const api = 'http://localhost:8788/api'
const post = (b) => fetch(`${api}/score`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }))

const out = {}
out.dailyForged = await post({ name: 'CHEAT', mode: 'daily', time: 300, kills: 100, level: 8, seed: 12345 }) // expect 400
out.dailyReal = await post({ name: 'HONEST', mode: 'daily', time: 300, kills: 100, level: 8, seed: good, character: 'nova', arena: 'hive' }) // expect 200
out.floatScore = await post({ name: 'FLOATY', mode: 'endless', time: 123.9, kills: 0, level: 3 }) // expect score 1389 (matches client display)
out.zalgo = await post({ name: 'A' + '̀'.repeat(13), mode: 'endless', time: 60, kills: 5, level: 2 }) // stored as "À"
out.invisible = await post({ name: '​​​', mode: 'endless', time: 61, kills: 5, level: 2 }) // stored as ANON
out.bidi = await post({ name: 'abc‮xyz', mode: 'endless', time: 62, kills: 5, level: 2 }) // RLO stripped
await post({ name: 'GRINDER', mode: 'endless', time: 100, kills: 10, level: 3 })
await new Promise((r) => setTimeout(r, 31000)) // let the 30s rate window pass
await post({ name: 'GRINDER', mode: 'endless', time: 200, kills: 20, level: 5 })
const g3 = await post({ name: 'GRINDER', mode: 'endless', time: 400, kills: 40, level: 9 })
out.grinderRank = g3.body // board must show ONE GRINDER row (best score)
const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => post({ name: 'BURST' + i, mode: 'endless', time: 50 + i, kills: 1, level: 1 })))
out.burstAccepted = burst.filter((r) => r.status === 200).length // accepted + earlier submits in window === 6 exactly
out.burst429 = burst.filter((r) => r.status === 429).length
const board = await fetch(`${api}/leaderboard?mode=endless&board=alltime&scope=global&limit=50`).then((r) => r.json())
out.board = board.entries.map((e) => `${e.rank}. ${JSON.stringify(e.name)} ${e.score}`)
console.log(JSON.stringify(out, null, 1))
