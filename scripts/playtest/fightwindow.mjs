// A6/A7 boss-HP window report (P19 bosshp pass). Reads the run JSONs of one
// matrix runs folder and prints, per world and stage:
//   - the focus bot's kill median, its spread and the fights it did not finish;
//   - the default bot's (smart+P) longest fight and every fight over 150 s;
//   - the HP-multiplier window each A6 clause leaves (fight length ~ HP / rate):
//     focus median x k inside the band, and default longest x k <= 150 s;
//   - the A7 wins of smart+P and smart, and the PRIME HP factor windows each
//     A6/A7 clause leaves (primeGrid).
// The window is first order: it holds each fight's damage rate fixed, so it
// says whether ONE HP knob can pass both clauses, not the exact value.
//
// Usage: node scripts/playtest/fightwindow.mjs <runsDir> [--seeds=N] [--json]
//   --seeds=N  only seeds 1001 x 1..N (a 10-seed view of a 30-seed folder)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { median, summarize } from './analyze.mjs'

const dir = process.argv[2]
if (!dir || !existsSync(dir)) throw new Error('usage: fightwindow.mjs <runsDir> [--json]')
const asJson = process.argv.includes('--json')
const seedArg = process.argv.find((a) => a.startsWith('--seeds='))
const maxSeed = seedArg ? 1001 * parseInt(seedArg.slice(8)) : Infinity
const BANDS = { mid1: [20, 40], mid2: [20, 40], final: [40, 75] }
const CAP = 150
/** src/config.ts STALEMATE_AFTER. */
const STALE = 210

const runs = []
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.json')) continue
  const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  if (!r.cfg || r.cfg.threat || r.cfg.ot || r.cfg.invincible || r.cfg.seed > maxSeed) continue
  runs.push(summarize(r, f))
}
const r1 = (x) => (x === null || x === undefined ? null : +x.toFixed(1))
const out = {}
for (const world of ['hive', 'depths', 'wastes']) {
  const focus = runs.filter((s) => s.arena === world && s.mode === 'smart+focus+P')
  const def = runs.filter((s) => s.arena === world && s.mode === 'smart+P')
  const smart = runs.filter((s) => s.arena === world && s.mode === 'smart')
  if (!focus.length && !def.length) continue
  const w = (out[world] = { runs: { focus: focus.length, smartP: def.length, smart: smart.length }, stages: {} })
  for (const stage of ['mid1', 'mid2', 'final']) {
    const ff = focus.flatMap((s) => s.fights.filter((f) => f.stage === stage).map((f) => ({ ...f, run: s.file })))
    const kills = ff.filter((f) => f.how === 'kill').map((f) => f.len)
    const df = def.flatMap((s) => s.fights.filter((f) => f.stage === stage).map((f) => ({ ...f, run: s.file })))
    const dKills = df.filter((f) => f.how === 'kill')
    const dNotStale = df.filter((f) => f.how !== 'stalemate')
    const dMax = dNotStale.length ? Math.max(...dNotStale.map((f) => f.len)) : null
    const fMed = median(kills)
    const [lo, hi] = BANDS[stage]
    const kLo = fMed ? lo / fMed : null
    const kHi = fMed ? Math.min(hi / fMed, dMax ? CAP / dMax : Infinity) : null
    w.stages[stage] = {
      focusKills: kills.length,
      focusMedian: r1(fMed),
      focusP25P75: kills.length ? [r1(pct(kills, 0.25)), r1(pct(kills, 0.75))] : null,
      focusNotKilled: ff.filter((f) => f.how !== 'kill').map((f) => `${f.how} ${f.len}`),
      focusHpMedian: median(ff.map((f) => f.hp)),
      defaultFights: df.length,
      defaultKills: dKills.length,
      defaultMedian: r1(median(dKills.map((f) => f.len))),
      defaultLongest: dMax,
      defaultOver150: dNotStale.filter((f) => f.len > CAP).map((f) => `${f.len} s ${f.how} ${f.run}`),
      defaultStalemates: df.filter((f) => f.how === 'stalemate').length,
      defaultHow: count(df.map((f) => f.how)),
      kWindow: fMed ? [+kLo.toFixed(2), +kHi.toFixed(2)] : null,
      kFeasible: fMed ? kLo <= kHi : null,
      ratioLongestToMedian: fMed && dMax ? +(dMax / fMed).toFixed(2) : null,
      ratioAllowed: +(CAP / lo).toFixed(2),
    }
  }
  w.a7 = { smartP: `${def.filter((s) => s.won).length}/${def.length}`, smart: `${smart.filter((s) => s.won).length}/${smart.length}` }
  // The PRIME fights the A7 wins came from: a win needs the kill inside the
  // 210 s stalemate, so a PRIME HP factor k keeps about the wins with len x k <= 210.
  const finals = (set) => set.flatMap((s) => s.fights.filter((f) => f.stage === 'final' && f.how === 'kill').map((f) => f.len)).sort((a, b) => a - b)
  w.winFinalLens = { smartP: finals(def), smart: finals(smart) }
  w.primeGrid = primeGrid(w, def.length, smart.length)
  const gaps = [...focus, ...def].flatMap((s) => s.killGaps)
  w.gapMin = gaps.length ? Math.min(...gaps) : null
}

/** First-order windows for a PRIME HP factor k (relative to these runs), one
 *  per clause: the focus median x k inside 40 to 75 s; every default-bot
 *  PRIME kill either at most 150 s or past the 210 s stalemate (L x k); the
 *  A7 bands with wins(k) = the kills with L x k <= 210 (matrix rounding).
 *  Below k = 1 a stalemate may turn into a kill, so the default and A7
 *  windows are read only from k = 1 up when the runs hold stalemates. */
function primeGrid(w, nP, nS) {
  const f = w.stages.final
  const lensP = w.winFinalLens.smartP
  const lensS = w.winFinalLens.smart
  const from = f.defaultStalemates > 0 ? 1 : 0.4
  const pc = (a, b) => (b ? Math.round((100 * a) / b) : 0)
  const clauses = {
    focus: (k) => f.focusMedian !== null && f.focusMedian * k >= 40 && f.focusMedian * k <= 75,
    default: (k) => k >= from && lensP.every((L) => L * k <= CAP || L * k > STALE),
    a7smartP: (k) => k >= from && pc(lensP.filter((L) => L * k <= STALE).length, nP) >= 25 && pc(lensP.filter((L) => L * k <= STALE).length, nP) <= 45,
    a7smart: (k) => k >= from && pc(lensS.filter((L) => L * k <= STALE).length, nS) >= 5 && pc(lensS.filter((L) => L * k <= STALE).length, nS) <= 25,
  }
  const out = {}
  const ks = []
  for (let k = 0.4; k <= 4 + 1e-9; k += 0.01) ks.push(+k.toFixed(2))
  for (const [name, ok] of Object.entries(clauses)) out[name] = ranges(ks.filter(ok))
  out.all = ranges(ks.filter((k) => Object.values(clauses).every((ok) => ok(k))))
  out.allButDefault = ranges(ks.filter((k) => clauses.focus(k) && clauses.a7smartP(k) && clauses.a7smart(k)))
  return out
}
function ranges(ks) {
  const r = []
  for (const k of ks) {
    const last = r[r.length - 1]
    if (last && Math.abs(k - last[1] - 0.01) < 1e-6) last[1] = k
    else r.push([k, k])
  }
  return r.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ') || 'none'
}

function pct(a, q) {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]
}
function count(a) {
  const m = {}
  for (const x of a) m[x] = (m[x] || 0) + 1
  return m
}

if (asJson) console.log(JSON.stringify(out, null, 1))
else {
  for (const [world, w] of Object.entries(out)) {
    console.log(`${world}: runs focus ${w.runs.focus}, smart+P ${w.runs.smartP}, smart ${w.runs.smart}; A7 smart+P ${w.a7.smartP}, smart ${w.a7.smart}; kill-to-next-arrival min ${w.gapMin}`)
    for (const [stage, s] of Object.entries(w.stages)) {
      console.log(
        `  ${stage}: focus median ${s.focusMedian} s (${s.focusKills} kills, p25-p75 ${s.focusP25P75?.join('-')}, not killed ${s.focusNotKilled.length}: ${s.focusNotKilled.join(', ')}), HP median ${s.focusHpMedian}; default median ${s.defaultMedian} s, longest ${s.defaultLongest} s, how ${JSON.stringify(s.defaultHow)}; k window ${s.kWindow?.join(' to ')} (${s.kFeasible ? 'feasible' : 'EMPTY'}; longest/median ${s.ratioLongestToMedian} vs ${s.ratioAllowed} allowed)`,
      )
      for (const o of s.defaultOver150) console.log(`      over 150: ${o}`)
    }
    console.log(`  PRIME kills (A7 wins) smart+P: ${w.winFinalLens.smartP.join(', ')}`)
    console.log(`  PRIME kills (A7 wins) smart: ${w.winFinalLens.smart.join(', ')}`)
    const g = w.primeGrid
    console.log(`  PRIME HP factor windows (first order): focus ${g.focus}; default ${g.default}; A7 smart+P ${g.a7smartP}; A7 smart ${g.a7smart}; all ${g.all}; all but the default clause ${g.allButDefault}`)
  }
}
