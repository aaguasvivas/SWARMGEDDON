// Section 11 verification matrix (docs/NEXT-LEVEL.md): runs the bot sets with
// playtest.mjs and the headless checks with measure.mjs and probe-alloc.mjs,
// then scores every metric A1 to A18 against its target. The per-run summary
// and the fight, A3, A10, A12 and A13 aggregates come from analyze.mjs.
//
// Usage: node scripts/playtest/matrix.mjs [options]
//   --seeds=N         seeds per world for the bot sets: 1001 x 1..N (default 10)
//   --worlds=a,b      worlds for the bot sets (default hive,depths,wastes)
//   --only=A6,A10     run and report only these metrics (default: all)
//   --threat-seeds=N  Hive seeds for the A12 sweep (default --seeds)
//   --ot-sets=1,2     OVERTIME sets for A13 (default 1,2; section 11 A12/A13 note)
//   --label=NAME      names the outputs (default baseline)
//   --runs=DIR        raw run JSONs and logs (default /tmp/swg-matrix/<label>);
//                     a run already there with the same config is reused, so an
//                     interrupted matrix resumes
//   --out=DIR         where <label>.json and <label>.md go (default docs/tuning)
//   --daily=DATE      A14 also runs det and det-death of that day's Daily with a
//                     fresh save (375x667) and the unlocked save (667x375)
//   --skip-perf       leave A15 and A16 out (they need an idle machine)
// The dev server must serve the build under test (SWG_URL, default
// http://localhost:5176). Every headless step takes the machine-wide Chrome
// lock, so the steps run one at a time; A15 and A16 run last.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, closeSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { a10Stats, a13Stats, a3Stats, fightStats, ladderStats, median, summarize } from './analyze.mjs'
import { parseConfig, runFile } from './configs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const NODE = process.execPath

const flags = {}
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z-]+)(?:=(.*))?$/s.exec(a)
  if (!m) throw new Error(`unknown argument ${a}`)
  flags[m[1]] = m[2] ?? true
}
const SEEDS = parseInt(flags.seeds ?? '10')
const WORLDS = (flags.worlds ?? 'hive,depths,wastes').split(',')
const THREAT_SEEDS = parseInt(flags['threat-seeds'] ?? String(SEEDS))
const OT_SETS = (flags['ot-sets'] ?? '1,2').split(',').map(Number)
const LABEL = flags.label ?? 'baseline'
const RUNS = resolve(flags.runs ?? `/tmp/swg-matrix/${LABEL}`)
const OUT = resolve(flags.out ?? join(ROOT, 'docs/tuning'))
const DAILY = flags.daily ?? null
const ALL = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18']
const ONLY = flags.only ? flags.only.split(',') : ALL.filter((id) => !(flags['skip-perf'] && (id === 'A15' || id === 'A16')))
const SETTINGS = '{"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
const BOSS_IDS = /^(queen|queenPrime|voidMatron|voidMatronPrime|emberTyrant|emberTyrantPrime)$/
mkdirSync(RUNS, { recursive: true })
mkdirSync(OUT, { recursive: true })

const seedsN = (n, from = 1) => Array.from({ length: n }, (_, i) => 1001 * (from + i))

// Bot sets: per world, a list of config strings (configs.mjs format).
const SETS = {
  smart: { label: 'smart', pattern: 'smart:SEED:14', configs: () => seedsN(SEEDS).map((s) => `smart:${s}:14`) },
  smartP: { label: 'smart+P', pattern: 'smart:SEED:14:nova:priority', configs: () => seedsN(SEEDS).map((s) => `smart:${s}:14:nova:priority`) },
  focus: { label: 'smart+focus+P', pattern: 'smart+focus:SEED:14:nova:priority', configs: () => seedsN(SEEDS).map((s) => `smart+focus:${s}:14:nova:priority`) },
  crude: { label: 'crude', pattern: 'crude:SEED:14', configs: () => seedsN(SEEDS).map((s) => `crude:${s}:14`) },
  roam: { label: 'roam', pattern: 'roam:SEED:14', configs: () => seedsN(SEEDS).map((s) => `roam:${s}:14`) },
  dash: { label: 'smart+dash+P', pattern: 'smart+dash:SEED:14:nova:priority', configs: () => seedsN(SEEDS).map((s) => `smart+dash:${s}:14:nova:priority`) },
  evolve: { label: 'smart+E', pattern: 'smart:SEED:14:nova:evolve', configs: () => seedsN(SEEDS).map((s) => `smart:${s}:14:nova:evolve`) },
  // A12 sweep: Hive only; T0 is the smart+P set.
  threat: {
    label: 'smart+P T1, T4 (Hive)',
    pattern: 'smart:SEED:14:nova:priority:T (T 1 and 4)',
    hiveOnly: true,
    seeds: () => THREAT_SEEDS,
    configs: () => [1, 4].flatMap((t) => seedsN(THREAT_SEEDS).map((s) => `smart:${s}:14:nova:priority:${t}`)),
  },
  // A13: the OVERTIME sets of the section 11 A12/A13 note (Hive). Set 1: T0
  // 1001 x 1..30, T1 to T3 1001 x 1..10. Set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20.
  ot: {
    label: 'smart+P OVERTIME (Hive)',
    pattern: 'smart:SEED:25:nova:priority:T:ot',
    hiveOnly: true,
    configs: () =>
      OT_SETS.flatMap((set) => [
        ...seedsN(30, set === 1 ? 1 : 31).map((s) => `smart:${s}:25:nova:priority:0:ot`),
        ...[1, 2, 3].flatMap((t) => seedsN(10, set === 1 ? 1 : 11).map((s) => `smart:${s}:25:nova:priority:${t}:ot`)),
      ]),
  },
}

// What each metric reads: bot sets, and headless steps.
const NEEDS = {
  A1: { steps: ['opening'] },
  A2: { sets: ['smartP'] },
  A3: { sets: ['roam', 'smart', 'smartP', 'focus', 'dash', 'evolve'] },
  A4: { sets: ['smartP'] },
  A5: { sets: ['smartP', 'focus'] },
  A6: { sets: ['focus', 'smartP'] },
  A7: { sets: ['smart', 'smartP'] },
  A8: { sets: ['smart', 'smartP', 'crude'] },
  A9: { sets: ['smartP'] },
  A10: { sets: ['smart', 'smartP', 'focus', 'dash', 'evolve', 'crude'] },
  A11: { sets: ['smart', 'smartP', 'focus', 'crude', 'roam', 'dash', 'evolve'] },
  A12: { sets: ['smartP', 'threat'] },
  A13: { sets: ['ot'] },
  A14: { steps: ['det'] },
  A15: { steps: ['perf'] },
  A16: { steps: ['gc'] },
  A17: {},
  A18: { sets: ['smartP', 'dash', 'evolve', 'roam', 'focus'] },
}
const wantSets = [...new Set(ONLY.flatMap((id) => NEEDS[id]?.sets ?? []))]
const wantSteps = new Set(ONLY.flatMap((id) => NEEDS[id]?.steps ?? []))

/** Every command as run (meta.commands), and the short forms the Markdown lists. */
const commands = []
const shownCommands = []
const log = (s) => console.error(`[matrix] ${s}`)

function freeDiskMb() {
  const r = spawnSync('df', ['-m', '/System/Volumes/Data'], { encoding: 'utf8' })
  const line = r.stdout.trim().split('\n').pop().split(/\s+/)
  return parseInt(line[3])
}
function waitForDisk() {
  for (let i = 0; i < 20; i++) {
    const mb = freeDiskMb()
    if (!(mb < 400)) return mb
    log(`only ${mb} MB free on the data volume; waiting 60 s (stops under 400 MB)`)
    spawnSync('sleep', ['60'])
  }
  throw new Error('the data volume stayed under 400 MB free')
}
const pause = () => spawnSync('sleep', ['6']) // puppeteer launches race on the profile when back to back

/** Runs a node script, returns its stdout JSON lines; stderr goes to the log. */
function runNode(script, args, logName, short = null) {
  const shown = `node ${script} ${args.map((a) => (/[\s"{}]/.test(a) ? `'${a}'` : a)).join(' ')}`
  commands.push(shown)
  if (!short) shownCommands.push(shown)
  log(shown.length > 200 ? shown.slice(0, 200) + ' ...' : shown)
  const fd = openSync(join(RUNS, logName), 'a')
  const r = spawnSync(NODE, [join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', fd] })
  closeSync(fd)
  pause()
  const lines = (r.stdout || '')
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l))
  return { status: r.status, lines }
}

// ---- bot runs ---------------------------------------------------------------
/** Config strings as patterns with their seed range: smart:SEED:14 (SEED = 1001 x 1..10). */
function compact(cfgs) {
  const groups = new Map()
  for (const c of cfgs) {
    const parts = c.split(':')
    const k = parseInt(parts[1]) / 1001
    parts[1] = 'SEED'
    const p = parts.join(':')
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p).push(k)
  }
  return [...groups].map(([p, ks]) => `${p} (SEED = 1001 x ${ks.every((k, i) => i === 0 || k === ks[i - 1] + 1) ? `${ks[0]}..${ks[ks.length - 1]}` : ks.join(',')})`).join(' ')
}
const runIndex = [] // { set, world, cfg, file }
for (const id of wantSets) {
  const set = SETS[id]
  const worlds = set.hiveOnly ? ['hive'] : WORLDS
  for (const world of worlds) {
    const cfgs = set.configs()
    const todo = []
    for (const c of cfgs) {
      const cfg = parseConfig(c)
      const file = join(RUNS, runFile(world, cfg))
      runIndex.push({ set: id, world, cfg: c, file })
      let ok = false
      if (existsSync(file)) {
        try {
          ok = JSON.parse(readFileSync(file, 'utf8')).cfg.minutes === cfg.minutes
        } catch {}
      }
      if (!ok) todo.push(c)
    }
    const short = `node scripts/playtest/playtest.mjs ${world} ${compact(cfgs)} --out=${RUNS}`
    shownCommands.push(todo.length ? short : `${short}   # reused from an earlier run of this matrix`)
    if (!todo.length) continue
    waitForDisk()
    const r = runNode('scripts/playtest/playtest.mjs', [world, ...todo, `--out=${RUNS}`], `playtest-${id}-${world}.log`, short)
    if (r.status !== 0) log(`playtest ${id} ${world} exited ${r.status}; see ${join(RUNS, `playtest-${id}-${world}.log`)}`)
  }
}
const runs = []
for (const ri of runIndex) {
  if (!existsSync(ri.file)) {
    log(`missing run ${ri.file}`)
    continue
  }
  const raw = JSON.parse(readFileSync(ri.file, 'utf8'))
  runs.push({ ...ri, s: summarize(raw, runFile(ri.world, parseConfig(ri.cfg))), death: raw.death })
}
const of = (setIds, world) => runs.filter((r) => setIds.includes(r.set) && (!world || r.world === world)).map((r) => r.s)
const worldsOf = (setId) => (SETS[setId].hiveOnly ? ['hive'] : WORLDS)

// ---- headless steps -----------------------------------------------------------
const steps = {}
/** A measure.mjs line counts only when it echoes the requested mode and viewport. */
function measure(args, expect, logName) {
  const r = runNode('scripts/measure.mjs', args, logName)
  const lines = r.lines.filter((l) => !l.pageErrors)
  const bad = lines.filter((l) => Object.entries(expect).some(([k, v]) => l[k] !== v))
  const errs = r.lines.filter((l) => l.pageErrors)
  return { args, lines, echoOk: lines.length > 0 && bad.length === 0, pageErrors: errs.flatMap((e) => e.pageErrors), status: r.status }
}
if (wantSteps.has('det')) {
  const d = []
  for (const mode of ['det', 'det-long', 'det-death']) {
    d.push({ mode, view: '375x667', ...measure(['375', '667', mode], { mode, W: 375, H: 667 }, 'measure-det.log') })
    d.push({ mode, view: '667x375', ...measure(['667', '375', mode], { mode, W: 667, H: 375 }, 'measure-det.log') })
  }
  d.push({ mode: 'det', view: '375x667 settings', ...measure(['375', '667', 'det', `--settings=${SETTINGS}`], { mode: 'det', W: 375, H: 667 }, 'measure-det.log') })
  if (DAILY) {
    for (const mode of ['det', 'det-death']) {
      d.push({ mode, daily: true, view: '375x667 fresh', ...measure(['375', '667', mode, '--mode=daily', `--date=${DAILY}`], { mode, W: 375, H: 667, runMode: 'daily', save: 'fresh' }, 'measure-det.log') })
      d.push({ mode, daily: true, view: '667x375 unlocked', ...measure(['667', '375', mode, '--mode=daily', `--date=${DAILY}`, '--save=unlocked'], { mode, W: 667, H: 375, runMode: 'daily', save: 'unlocked' }, 'measure-det.log') })
    }
  }
  steps.det = d
}
if (wantSteps.has('opening')) {
  steps.opening = [
    { view: '560x996', ...measure(['375', '667', 'opening', '560', '996'], { mode: 'opening', W: 375, H: 667 }, 'measure-opening.log') },
    { view: '996x560', ...measure(['375', '667', 'opening', '996', '560'], { mode: 'opening', W: 375, H: 667 }, 'measure-opening.log') },
  ]
}
const machine = () => {
  const swap = spawnSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' }).stdout.trim()
  return { load: os.loadavg().map((x) => +x.toFixed(2)), swap }
}
if (wantSteps.has('perf')) {
  steps.perf = [
    { ...measure(['390', '844', 'perf', 'nova', 'hive'], { mode: 'perf', W: 390, H: 844, arenaId: 'hive' }, 'measure-perf.log'), machine: machine() },
    { ...measure(['390', '844', 'perf', 'nova', 'wastes'], { mode: 'perf', W: 390, H: 844, arenaId: 'wastes' }, 'measure-perf.log'), machine: machine() },
    { ...measure(['390', '844', 'perf-final', 'nova', 'hive'], { mode: 'perf-final', W: 390, H: 844, arenaId: 'hive' }, 'measure-perf.log'), machine: machine() },
  ]
}
if (wantSteps.has('gc')) {
  const m = machine()
  const r = runNode('scripts/probe-alloc.mjs', ['x', 'x', '--gc', '--perks='], 'probe-alloc-gc.log')
  steps.gc = { lines: r.lines.filter((l) => l.mode === 'gc'), pageErrors: r.lines.filter((l) => l.pageErrors).flatMap((l) => l.pageErrors), machine: m }
}

// ---- metrics ------------------------------------------------------------------
const fmt = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? '-' : typeof x === 'number' ? +x.toFixed(d) : x)
const mmss = (s) => (s === null ? '-' : `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`)
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)
/** Seconds survived: a death's time, else the whole run (a win or a stalemate survived). */
const survival = (s) => (s.dead ? s.endTime : (s.minutes ?? 14) * 60)
const metrics = []
function add(id, name, value, target, pass, details = null) {
  metrics.push({ id, name, value, target, result: pass === null ? 'n/a' : pass === 'owner' ? 'owner' : pass ? 'PASS' : 'FAIL', details })
}

/** A7.2 "Target alive" bands per world and minute row, read from the appendix (it stays authoritative). */
function targetBands() {
  const doc = readFileSync(join(ROOT, 'docs/NEXT-LEVEL.md'), 'utf8')
  const sec = doc.slice(doc.indexOf('### A7.2 World rows'), doc.indexOf('### A7.3'))
  const out = {}
  for (const [title, id] of [['**HIVE MEADOW**', 'hive'], ['**VIOLET DEPTHS**', 'depths'], ['**EMBER WASTES**', 'wastes']]) {
    const part = sec.slice(sec.indexOf(title))
    const rows = part.split('\n').filter((l) => l.startsWith('|'))
    const head = rows[0].split('|').map((c) => c.trim())
    const col = head.indexOf('Target alive')
    const bands = []
    for (const row of rows.slice(2, 14)) {
      const c = row.split('|').map((x) => x.trim())
      const m = /^(\d+)-(\d+)$/.exec(c[col])
      bands[parseInt(c[1])] = m ? [parseInt(m[1]), parseInt(m[2])] : null
    }
    out[id] = bands
  }
  return out
}

const has = (id) => ONLY.includes(id)

if (has('A1')) {
  const o = steps.opening
  const worst = o.map((x) => x.lines.find((l) => l.worst))
  const ok = worst.every(Boolean) && o.every((x) => x.echoOk)
  const w = { firstInView: 0, firstKill: 0, emptyViewSec: 0 }
  for (const l of worst.filter(Boolean)) for (const k of Object.keys(w)) w[k] = Math.max(w[k], l.worst[k])
  add('A1', 'Opening probe (5 seeds x 3 worlds, views 560x996 and 996x560)', ok ? `first in view ${w.firstInView} s, first kill ${w.firstKill} s, empty view ${w.emptyViewSec} s (worst)` : 'no result', 'first enemy in view <= 1.0 s; first kill <= 2.5 s; empty view <= 2.0 s', ok && worst.every((l) => l.pass), o.map((x, i) => ({ view: x.view, worst: worst[i]?.worst ?? null, pass: worst[i]?.pass ?? null, pageErrors: x.pageErrors.length })))
}

if (has('A2')) {
  const per = {}
  const all = []
  for (const w of WORLDS) {
    const v = of(['smartP'], w).map((s) => s.firstDraftAt).filter((x) => x !== null)
    per[w] = { median: median(v), max: v.length ? Math.max(...v) : null, n: v.length }
    all.push(...v)
  }
  const med = median(all)
  const max = all.length ? Math.max(...all) : null
  add('A2', 'First draft (smart+P)', `median ${fmt(med)} s, max ${fmt(max)} s`, 'median 6 to 12 s; max <= 20 s', med !== null && med >= 6 && med <= 12 && max <= 20, per)
}

if (has('A3')) {
  const sets = NEEDS.A3.sets
  const st = a3Stats(of(sets))
  const bySet = {}
  for (const id of sets) {
    const x = a3Stats(of([id]))
    if (x) bySet[SETS[id].label] = { runs: x.runs.length, offRule: x.offRule, maxAlive: x.maxAlive, overRowMax: x.overRowMax, satMax: x.satMax, worst: x.runs.reduce((a, b) => (b.satFrac > a.satFrac ? b : a)).file }
  }
  add(
    'A3',
    'Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve)',
    st ? `beats off-rule ${st.offRule}; alive max ${st.maxAlive}; over row maxAlive ${st.overRowMax}; saturated share max ${st.satMax}` : 'no runs',
    'beats on time or per deferral; alive <= row.maxAlive + 160 and <= 610; saturated share <= 0.25',
    st ? st.offRule === 0 && st.maxAlive <= 610 && st.overRowMax <= 160 && st.satMax <= 0.25 : false,
    { bySet, offRuleRuns: st ? st.runs.filter((r) => r.off > 0).map((r) => ({ file: r.file, off: r.beats.filter((b) => !b.ok) })) : [] },
  )
}

if (has('A4')) {
  const bands = targetBands()
  const per = {}
  let pass = true
  for (const w of WORLDS) {
    const rs = of(['smartP'], w)
    const mins = []
    let scored = 0
    let inBand = 0
    for (let m = 0; m < 12; m++) {
      const band = bands[w][m]
      const v = rs.filter((s) => s.endTime >= (m + 1) * 60 && s.perMin[m]?.aliveMean != null).map((s) => s.perMin[m].aliveMean)
      const med = median(v)
      const ok = band && med !== null ? med >= band[0] && med <= band[1] : null
      if (band && med !== null) {
        scored++
        if (ok) inBand++
      }
      mins.push({ min: m + 1, band: band ? band.join('-') : 'cage', median: med, runs: v.length, ok })
    }
    // Section 11: "inside the band in 9 or more of 12 minutes". The cage
    // rows (4, 7, 11) have no band, so the same 3-in-4 share applies to the
    // scored minutes (ceil(0.75 x 9) = 7); a minute no run lived through is
    // not scored.
    const need = Math.ceil(0.75 * scored)
    per[w] = { inBand, scored, need, mins }
    if (inBand < need) pass = false
  }
  add('A4', 'Density band (smart+P median alive per minute vs the A7.2 Target alive)', WORLDS.map((w) => `${w} ${per[w].inBand}/${per[w].scored}`).join(', '), 'in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band)', pass, per)
}

if (has('A5')) {
  const fs = fightStats(of(NEEDS.A5.sets))
  const a = fs?.arrivals
  add('A5', 'Boss arrival (smart+P and focus fights)', a ? `${a.n} arrivals, ${a.distMin} to ${a.distMax} u, cage active and inside ${a.cageInside}/${a.n}, in arena ${a.inArena}/${a.n}` : 'no fights', '250 to 340 u; cage active the same tick', a ? a.bad.length === 0 : false, a ? a.bad : null)
}

if (has('A6')) {
  const per = {}
  let pass = true
  let gapMin = Infinity
  for (const w of WORLDS) {
    const f = fightStats(of(['focus'], w))
    const d = fightStats(of(['smartP'], w))
    const fm = (st) => (st ? { kills: st.kills, median: st.median, min: st.min, max: st.max, unfinished: st.unfinished.length, deaths: st.unfinished.filter((u) => u.how === 'death').length } : null)
    const focus = f ? { mid1: fm(f.stages.mid1), mid2: fm(f.stages.mid2), final: fm(f.stages.final) } : null
    const defLongest = d ? Math.max(0, ...d.fights.filter((x) => x.how !== 'stalemate').map((x) => x.len)) : null
    const defOver = d ? d.fights.filter((x) => x.how !== 'stalemate' && x.len > 150).map((x) => `${x.stage} ${x.len} s (${x.how}, ${x.run})`) : []
    const defDeaths = d ? d.fights.filter((x) => x.how === 'death').length : 0
    for (const x of [f, d]) if (x && x.gaps.min !== null) gapMin = Math.min(gapMin, x.gaps.min)
    const inR = (st, lo, hi) => st && st.median !== null && st.median >= lo && st.median <= hi
    const ok = !!focus && inR(focus.mid1, 20, 40) && inR(focus.mid2, 20, 40) && inR(focus.final, 40, 75) && defOver.length === 0
    if (!ok) pass = false
    per[w] = { focus, defaultLongest: defLongest, defaultOver150: defOver, defaultFightsEndedByDeath: defDeaths, defaultFights: d ? d.fights.length : 0 }
  }
  if (gapMin < 20) pass = false
  const v = WORLDS.map((w) => {
    const f = per[w].focus
    return `${w} focus ${fmt(f?.mid1?.median, 1)}/${fmt(f?.mid2?.median, 1)}/${fmt(f?.final?.median, 1)} s (kills ${f?.mid1?.kills ?? 0}/${f?.mid2?.kills ?? 0}/${f?.final?.kills ?? 0}), default longest ${fmt(per[w].defaultLongest, 1)} s`
  })
  add('A6', 'Fights (focus bot medians mid1/mid2/final; default bot = smart+P)', v.join('; ') + `; kill-to-next-arrival min ${gapMin === Infinity ? '-' : fmt(gapMin, 1)} s`, 'focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s', pass, per)
}

if (has('A7')) {
  const per = {}
  let pass = true
  for (const w of WORLDS) {
    const p = of(['smartP'], w)
    const s = of(['smart'], w)
    const pw = p.filter((x) => x.won).length
    const sw = s.filter((x) => x.won).length
    per[w] = { smartP: `${pw}/${p.length}`, smart: `${sw}/${s.length}` }
    if (!(pct(pw, p.length) >= 25 && pct(pw, p.length) <= 45 && pct(sw, s.length) >= 5 && pct(sw, s.length) <= 25)) pass = false
  }
  add('A7', `Win rate (${SEEDS} seeds per world)`, WORLDS.map((w) => `${w} smart+P ${per[w].smartP}, smart ${per[w].smart}`).join('; '), 'smart+P 25 to 45%; smart 5 to 25%', pass, per)
}

if (has('A8')) {
  const per = {}
  let pass = true
  for (const w of WORLDS) {
    per[w] = {}
    for (const [id, min] of [['smart', 330], ['smartP', 480], ['crude', 150]]) {
      const m = median(of([id], w).map(survival))
      per[w][id] = m
      if (m === null || m < min) pass = false
    }
  }
  const hiveCrude = per.hive?.crude
  const crudeOrder = hiveCrude == null || WORLDS.every((w) => per[w].crude == null || hiveCrude >= per[w].crude)
  if (!crudeOrder) pass = false
  add('A8', 'Median survival (a win or a stalemate counts as the whole 14:00)', WORLDS.map((w) => `${w} smart ${mmss(per[w].smart)}, smart+P ${mmss(per[w].smartP)}, crude ${mmss(per[w].crude)}`).join('; '), 'smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes', pass, { ...per, hiveCrudeAtLeastOthers: crudeOrder })
}

if (has('A9')) {
  const per = {}
  let pass = true
  const levelAt = (s, t) => s.levelAt[t] ?? (s.won && s.endTime < t ? s.finalLevel : null)
  for (const w of WORLDS) {
    const rs = of(['smartP'], w)
    const at = {}
    for (const t of [180, 480, 660]) at[t] = median(rs.map((s) => levelAt(s, t)).filter((x) => x != null))
    const gaps = rs.flatMap((s) => s.levelUpGapsOver60s.filter((g) => g.from >= 60).map((g) => ({ ...g, run: s.file })))
    per[w] = { L3: at[180], L8: at[480], L11: at[660], gapRuns: new Set(gaps.map((g) => g.run)).size, runs: rs.length, longestGap: gaps.length ? Math.max(...gaps.map((g) => g.gap)) : 0, gaps }
    const inR = (x, lo, hi) => x !== null && x >= lo && x <= hi
    if (!(inR(at[180], 9, 12) && inR(at[480], 18, 23) && inR(at[660], 23, 28) && gaps.length === 0)) pass = false
  }
  add('A9', 'Level curve (smart+P median level; a run that won earlier counts its final level)', WORLDS.map((w) => `${w} L${fmt(per[w].L3, 1)}/L${fmt(per[w].L8, 1)}/L${fmt(per[w].L11, 1)} at 3:00/8:00/11:00, gap over 60 s in ${per[w].gapRuns}/${per[w].runs} runs`).join('; '), 'L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00', pass, per)
}

if (has('A10')) {
  const smartFam = ['smart', 'smartP', 'focus', 'dash', 'evolve'].filter((id) => wantSets.includes(id))
  const st = a10Stats(of(smartFam))
  const bySet = {}
  for (const id of [...smartFam, 'crude']) {
    const x = a10Stats(of([id]))
    if (x) bySet[SETS[id].label] = { deaths: x.deaths, median: x.median, min: x.min }
  }
  const byWorld = {}
  for (const w of WORLDS) {
    const x = a10Stats(of(smartFam, w))
    if (x) byWorld[w] = { deaths: x.deaths, median: x.median, min: x.min }
  }
  // The A10 window (last step at 50%+ HP to death): damage by kind summed over
  // the smart-family deaths, and the deaths under 1.2 s and 3.0 s.
  const fam = runs.filter((r) => smartFam.includes(r.set) && r.s.fromHalfHp !== null)
  const windowDmg = {}
  for (const r of fam) for (const [k, v] of Object.entries(r.death.dmgFromHalfByKind ?? {})) windowDmg[k] = +((windowDmg[k] || 0) + v).toFixed(1)
  const under = { '1.2': fam.filter((r) => r.s.fromHalfHp < 1.2).length, '3.0': fam.filter((r) => r.s.fromHalfHp < 3).length }
  // What the fastest deaths took inside the window (older runs: the last 3 s).
  const fastest = fam
    .sort((a, b) => a.s.fromHalfHp - b.s.fromHalfHp)
    .slice(0, 8)
    .map((r) => ({ run: r.s.file, fromHalfHp: r.s.fromHalfHp, t: r.death.t, hpAtHalf: r.death.hpAtHalf ?? null, maxHp: r.death.maxHp, dmgFromHalfByKind: r.death.dmgFromHalfByKind ?? null, dmgLast3sByKind: r.death.dmgLast3sByKind, lastHitBy: r.death.lastHitBy }))
  add('A10', 'Readable deaths (smart-family deaths; crude in the details)', st ? `${st.deaths} deaths, median ${fmt(st.median)} s, min ${fmt(st.min)} s` : 'no deaths', 'median >= 3.0 s; minimum >= 1.2 s', st ? st.median >= 3 && st.min >= 1.2 : false, { bySet, byWorld, under, windowDmg, fastest })
}

if (has('A11')) {
  const max = {}
  for (const r of runs) {
    if (!NEEDS.A11.sets.includes(r.set) || r.s.ot || r.s.threat) continue
    for (const [id, v] of Object.entries(r.s.maxSpeedByType)) if (!(v <= (max[id]?.v ?? 0))) max[id] = { v, run: r.s.file }
  }
  const over = Object.entries(max).filter(([, x]) => x.v > 240 + 1e-6)
  add('A11', 'Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt)', `fastest ${Object.entries(max).sort((a, b) => b[1].v - a[1].v).slice(0, 3).map(([id, x]) => `${id} ${x.v}`).join(', ')} u/s`, 'no enemy over 240 u/s', over.length === 0, { max, over: over.map(([id, x]) => ({ id, ...x, boss: BOSS_IDS.test(id) })) })
}

if (has('A12')) {
  const hive = of(['smartP', 'threat'], 'hive')
  const lad = ladderStats(hive).find((l) => l.key === 'hive smart+P')
  const get = (t) => lad?.byThreat.find((e) => e.threat === t)
  const t0 = get(0)
  const t1 = get(1)
  const t4 = get(4)
  const rate = (e) => (e ? e.wins / e.runs : null)
  const ok = !!(t0 && t1 && t4) && rate(t4) <= 0.15 && rate(t1) <= rate(t0)
  add('A12', 'Ladder (Hive smart+P)', [t0, t1, t4].map((e, i) => (e ? `T${[0, 1, 4][i]} ${e.wins}/${e.runs} (${pct(e.wins, e.runs)}%)` : `T${[0, 1, 4][i]} -`)).join(', '), 'T4 win rate <= 15%; T1 <= T0', ok, lad)
}

if (has('A13')) {
  const st = a13Stats(of(['ot']))
  add('A13', `Overtime (Hive OVERTIME sets ${OT_SETS.join(' and ')}, runs that won)`, st ? `${st.by20}/${st.n} (${pct(st.by20, st.n)}%) dead by 20:00; ${st.past24} alive past 24:00` : 'no run reached OVERTIME', '>= 90% dead by 20:00; none past 24:00', st ? st.by20 / st.n >= 0.9 && st.past24 === 0 : false, st)
}

if (has('A14')) {
  const d = steps.det
  const groups = {}
  let echo = true
  let rerun = true
  for (const x of d) {
    if (!x.echoOk) echo = false
    for (const l of x.lines) {
      if (!l.rerunMatch) rerun = false
      const k = `${x.daily ? 'daily ' : ''}${x.mode} ${l.arenaId}`
      ;(groups[k] ??= []).push({ view: x.view, hash: l.hash, rerunMatch: l.rerunMatch, ...(x.mode === 'det-death' ? { end: l.end, time: l.time } : {}) })
    }
  }
  const split = Object.entries(groups).filter(([, v]) => new Set(v.map((x) => x.hash)).size !== 1)
  const expected = 3 * 7 + (DAILY ? 4 : 0)
  const count = Object.values(groups).reduce((n, v) => n + v.length, 0)
  add('A14', `Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection${DAILY ? ', Daily fresh and unlocked' : ''}; each with its rerun)`, `${Object.keys(groups).length} groups, ${split.length} split; reruns ${rerun ? 'match' : 'DIFFER'}; ${count}/${expected} lines`, 'one hash per mode and world across views, settings, reruns', echo && rerun && split.length === 0 && count === expected, groups)
}

if (has('A15')) {
  const p = steps.perf
  const [ph, pw, pf] = p.map((x) => x.lines.find((l) => l.fps !== undefined) ?? null)
  const perfOk = (l) => l && l.fps >= 59.5 && l.long === 0 && l.simTimeEnd > l.simTimeStart
  const finOk = (l) => l && l.p95 <= 16.7 && l.bad === 0 && l.simTimeStart >= 600
  const ok = p.every((x) => x.echoOk) && perfOk(ph) && perfOk(pw) && finOk(pf)
  const show = (l) => (l ? `${l.fps} fps, p95 ${l.p95} ms, max ${l.max} ms, >20 ms ${l.long}, >33.4 ms ${l.bad}` : 'no result')
  add('A15', 'Perf at 390x844, run alone (perf hive, perf wastes, perf-final hive)', `perf hive ${show(ph)}; perf wastes ${show(pw)}; perf-final ${show(pf)}${pf ? `, peak alive ${pf.peakAlive}` : ''}`, 'perf: 60 fps, 0 frames over 20 ms; perf-final: p95 <= 16.7 ms, 0 frames over 33.4 ms', ok, p.map((x) => ({ args: x.args, line: x.lines[0] ?? null, echoOk: x.echoOk, machine: x.machine, pageErrors: x.pageErrors.length })))
}

if (has('A16')) {
  const g = steps.gc
  const l = g.lines[0]
  add('A16', 'Allocation: GC pauses in a 10 s perf-final trace (probe-alloc --gc)', l ? `max pause ${l.maxPauseMs} ms (minor ${l.byName.MinorGC?.count ?? 0}, major ${l.byName.MajorGC?.count ?? 0})` : 'no result', 'no GC pause over 2 ms', l ? !!l.pass : false, { line: l ?? null, machine: g.machine })
}

if (has('A17')) add('A17', 'Human (owner): about 1 win in 3 Hive T0 runs on iPhone', 'owner', 'about 1 win in 3', 'owner')

if (has('A18')) {
  const per = {}
  let pass = true
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  for (const w of WORLDS) {
    const dash = of(['dash'], w)
    const base = of(['smartP'], w)
    const ratio = mean(dash.map(survival)) / mean(base.map(survival))
    const ccMin = dash.reduce((n, s) => n + s.closeCalls, 0) / (dash.reduce((n, s) => n + s.endTime, 0) / 60)
    const prio = of(['smartP', 'focus', 'dash'], w).filter((s) => s.endTime >= 240)
    const fused = prio.filter((s) => s.firstFusionAt !== null && s.firstFusionAt <= 240).length
    const evo = of(['evolve'], w).filter((s) => s.fights.some((f) => f.stage === 'mid2'))
    const evolved = evo.filter((s) => s.evolutions.length > 0).length
    const roam = of(['roam'], w)
    const xpMin = roam.length ? Math.min(...roam.map((s) => s.xpCollectFrac)) : null
    const xp30Min = roam.length ? Math.min(...roam.map((s) => s.xpCollectFrac30 ?? 1)) : null
    per[w] = {
      dashSurvivalRatio: ratio,
      dashMeanSurvival: mean(dash.map(survival)),
      baseMeanSurvival: mean(base.map(survival)),
      closeCallsPerMin: ccMin,
      fusionBy4: `${fused}/${prio.length}`,
      evolveAtBoss2: `${evolved}/${evo.length}`,
      roamXpMin: xpMin,
      roamXp30Min: xp30Min,
    }
    if (!(ratio >= 1.25 && ccMin >= 1 && ccMin <= 4 && prio.length && fused / prio.length >= 0.5 && evo.length && evolved / evo.length >= 0.4 && xpMin >= 0.9)) pass = false
  }
  add(
    'A18',
    'Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam whole-run)',
    WORLDS.map((w) => `${w} dash ${fmt(per[w].dashSurvivalRatio)}x, cc ${fmt(per[w].closeCallsPerMin)}/min, fusion by 4:00 ${per[w].fusionBy4}, evolve ${per[w].evolveAtBoss2}, XP min ${fmt(per[w].roamXpMin, 3)}`).join('; '),
    'dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90%',
    pass,
    per,
  )
}

// ---- report -------------------------------------------------------------------
const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
const meta = {
  label: LABEL,
  date: new Date().toISOString(),
  commit: git('rev-parse', '--short', 'HEAD'),
  srcDirty: git('status', '--porcelain', '--', 'src', 'index.html', 'public') !== '',
  scriptsDirty: git('status', '--porcelain', '--', 'scripts') !== '',
  command: `node scripts/playtest/matrix.mjs ${process.argv.slice(2).join(' ')}`.trim(),
  seeds: `1001 x 1..${SEEDS} per world`,
  worlds: WORLDS,
  threatSeeds: `1001 x 1..${THREAT_SEEDS}`,
  otSets: OT_SETS,
  only: ONLY,
  runsDir: RUNS,
  machineAtEnd: machine(),
  sets: Object.fromEntries(wantSets.map((id) => [id, { label: SETS[id].label, pattern: SETS[id].pattern, worlds: worldsOf(id), runs: runs.filter((r) => r.set === id).length }])),
  commands,
}
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify({ meta, metrics }, null, 1))

const esc = (s) => String(s).replace(/\|/g, '\\|')
const md = []
md.push(`# P19 ${LABEL} matrix`, '')
md.push(`- Commit: \`${meta.commit}\`${meta.srcDirty ? ' (src has uncommitted changes)' : ' (src clean)'}${meta.scriptsDirty ? '; the harness in scripts/ is the working tree, committed with this report' : ''}, ${meta.date}`)
md.push(`- Command: \`${meta.command}\` (dev server at ${process.env.SWG_URL || 'http://localhost:5176'})`)
md.push(`- Seeds: ${meta.seeds}; A12 Hive ${meta.threatSeeds}; A13 OVERTIME sets ${OT_SETS.join(', ')} (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)`)
md.push(`- Machine at the end: load ${meta.machineAtEnd.load.join(' ')}, swap ${meta.machineAtEnd.swap}`)
md.push('')
md.push('| ID | Metric | Value | Target | Result |', '|---|---|---|---|---|')
for (const m of metrics) md.push(`| ${m.id} | ${esc(m.name)} | ${esc(m.value)} | ${esc(m.target)} | ${m.result} |`)
md.push('', '## Bot sets', '', '| Set | Config | Worlds | Runs |', '|---|---|---|---|')
for (const [, s] of Object.entries(meta.sets)) md.push(`| ${esc(s.label)} | \`${s.pattern}\` | ${s.worlds.join(', ')} | ${s.runs} |`)
md.push('', 'SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.', '')
md.push('## Details', '')
const det = (id) => metrics.find((m) => m.id === id)?.details
if (det('A4')) {
  md.push('### A4 median alive per minute (smart+P)', '', 'Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median alive [target band], x outside it, (n) runs alive through the minute.', '', `| World | ${Array.from({ length: 12 }, (_, i) => `${i}`).join(' | ')} |`, `|---|${'---|'.repeat(12)}`)
  for (const w of WORLDS) md.push(`| ${w} | ${det('A4')[w].mins.map((x) => `${x.median === null ? '-' : fmt(x.median, 0)}${x.band === 'cage' ? ' cage' : ` [${x.band}]${x.ok === false ? ' x' : ''}`} (${x.runs})`).join(' | ')} |`)
  md.push('')
}
if (det('A6')) {
  md.push('### A6 fights per world', '', '| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |', '|---|---|---|---|---|---|---|')
  const c = (s) => (s ? `${fmt(s.median, 1)} s (${s.kills} kills, ${fmt(s.min, 1)} to ${fmt(s.max, 1)}; ${s.deaths} deaths)` : '-')
  for (const w of WORLDS) {
    const x = det('A6')[w]
    md.push(`| ${w} | ${c(x.focus?.mid1)} | ${c(x.focus?.mid2)} | ${c(x.focus?.final)} | ${fmt(x.defaultLongest, 1)} s | ${x.defaultOver150.length ? esc(x.defaultOver150.join('; ')) : 'none'} | ${x.defaultFightsEndedByDeath}/${x.defaultFights} |`)
  }
  md.push('')
}
if (det('A10')) {
  md.push('### A10 deaths by set and world', '', '| Group | Deaths | Median s | Min s |', '|---|---|---|---|')
  for (const [k, v] of Object.entries(det('A10').bySet)) md.push(`| ${esc(k)} | ${v.deaths} | ${fmt(v.median)} | ${fmt(v.min)} |`)
  for (const [k, v] of Object.entries(det('A10').byWorld)) md.push(`| ${k} (smart family) | ${v.deaths} | ${fmt(v.median)} | ${fmt(v.min)} |`)
  const a10 = det('A10')
  md.push('', `Smart-family deaths under 1.2 s: ${a10.under['1.2']}; under 3.0 s: ${a10.under['3.0']}. Damage by kind inside the windows (last step at 50%+ HP to death), summed: ${esc(JSON.stringify(a10.windowDmg))}`)
  md.push('', 'Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):', '')
  for (const f of a10.fastest) md.push(`- ${f.run}: ${fmt(f.fromHalfHp)} s at ${mmss(f.t)}, ${f.hpAtHalf ?? '-'}/${f.maxHp} HP, ${esc(JSON.stringify(f.dmgFromHalfByKind ?? f.dmgLast3sByKind))}`)
  md.push('')
}
if (det('A3')) {
  md.push('### A3 by set', '', '| Set | Runs | Off-rule beats | Alive max | Over row max | Saturated share max (run) |', '|---|---|---|---|---|---|')
  for (const [k, v] of Object.entries(det('A3').bySet)) md.push(`| ${esc(k)} | ${v.runs} | ${v.offRule} | ${v.maxAlive} | ${v.overRowMax} | ${v.satMax} (${v.worst}) |`)
  md.push('')
}
if (det('A14')) {
  md.push('### A14 hashes', '', '| Mode and world | Hashes (view) |', '|---|---|')
  for (const [k, v] of Object.entries(det('A14'))) md.push(`| ${k} | ${v.map((x) => `${x.hash} (${x.view}${x.end ? `, ${x.end} at ${x.time} s` : ''}${x.rerunMatch ? '' : ', RERUN DIFFERS'})`).join('; ')} |`)
  md.push('')
}
if (det('A15')) {
  md.push('### A15 machine state per perf run', '')
  for (const x of det('A15')) md.push(`- \`${x.args.join(' ')}\`: load ${x.machine.load.join(' ')}, ${x.machine.swap}; sim ${x.line?.simTimeStart} to ${x.line?.simTimeEnd} s; echo ${x.echoOk ? 'ok' : 'MISMATCH'}`)
  md.push('')
}
md.push('## Commands run', '', 'Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).', '', '```', ...shownCommands, '```', '')
md.push(`Raw runs: \`${RUNS}\` (not kept). The JSON next to this file holds every metric's details.`, '')
writeFileSync(join(OUT, `${LABEL}.md`), md.join('\n'))
for (const m of metrics) console.log(`${m.id.padEnd(4)} ${m.result.padEnd(5)} ${m.value}`)
log(`wrote ${join(OUT, LABEL + '.md')} and ${LABEL}.json`)
