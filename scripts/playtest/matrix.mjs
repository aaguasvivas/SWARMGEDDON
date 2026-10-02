// Section 11 verification matrix (docs/NEXT-LEVEL.md): runs the bot sets with
// playtest.mjs and the headless checks with measure.mjs and probe-alloc.mjs,
// then scores every metric A1 to A18 against its target. The per-run summary
// and the fight, A3, A10, A12 and A13 aggregates come from analyze.mjs.
//
// Usage: node scripts/playtest/matrix.mjs [options]
//   --seeds=N         seeds per world for the bot sets: 1001 x 1..N (default 10)
//   --seed-from=K     start the bot sets' seeds at 1001 x K instead (a holdout
//                     set: --seeds=30 --seed-from=31 runs 1001 x 31..60)
//   --worlds=a,b      worlds for the bot sets (default hive,depths,wastes)
//   --only=A6,A10     run and report only these metrics (default: all)
//   --threat-seeds=N  Hive seeds for the A12 ladder, T0 to T4 (default 60, the
//                     decided A12 sample; section 11)
//   --ot-sets=1,2     OVERTIME sets for A13 (default 1,2; section 11 A12/A13 note;
//                     set 3 is a holdout: T0 1001 x 61..90, T1 to T3 x 21..30)
//   --ot-seeds=N      a quick A13 check: each OVERTIME set runs only its first N
//                     T0 seeds and its first min(N, 10) seeds of T1 to T3
//   --ot-worlds=a,b   worlds with T0 OVERTIME sets besides Hive's ladder sets
//                     (default depths,wastes; P19 review: A13 per world)
//   --focus-seeds=N   seeds of the A6 boss-focus set, 1001 x K..K+N-1 (default
//                     90; P19 review: a focus median needs 20 kills per stage,
//                     and Depths' focus bot reaches about 17 PRIME kills in 60)
//   --rate-seeds=N    seeds of the A7 and A8 sets (smart, smart+P, crude) and of
//                     the A6 default-bot clauses, 1001 x K..K+N-1 (default 60;
//                     P19 review: two 30-seed halves of one build differ by up
//                     to 9 wins of 30)
//   --label=NAME      names the outputs (default baseline)
//   --runs=DIR        raw run JSONs and logs (default /tmp/swg-matrix/<label>);
//                     a run already there with the same config is reused, so an
//                     interrupted matrix resumes
//   --out=DIR         where <label>.json and <label>.md go (default docs/tuning)
//   --daily=DATE      A14 also runs det and det-death of that day's Daily with a
//                     fresh save (375x667) and the unlocked save (667x375)
//   --baseline=FILE   an earlier matrix JSON (docs/tuning/baseline.json): the
//                     Markdown table gets its value and result per metric and
//                     a Change column, and each metric in the JSON its baseline
//   --skip-perf       leave A15, A16, BENCH and S3.2 out (they need an idle machine)
//   --report-from=FILE  run nothing: re-render FILE (a matrix JSON) as JSON and
//                     Markdown into --out under its own label (with --baseline,
//                     the comparison is recomputed)
// The dev server must serve the build under test (SWG_URL, default
// http://localhost:5176). Every headless step takes the machine-wide Chrome
// lock, so the steps run one at a time; the timing steps run last, after a
// cool-down: perf (A15), bench (BENCH, CPU per tick, reported only), the GC
// trace (A16) and the section 3.2 allocation profile and heap growth (S3.2,
// reported only).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, closeSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { a10Stats, a13Stats, a3Stats, fightStats, ladderStats, median, summarize } from './analyze.mjs'
import { parseConfig, runFile } from './configs.mjs'
import { fmt, mmss, writeReport } from './report.mjs'

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
const SEED_FROM = parseInt(flags['seed-from'] ?? '1')
const WORLDS = (flags.worlds ?? 'hive,depths,wastes').split(',')
const THREAT_SEEDS = parseInt(flags['threat-seeds'] ?? '60')
const OT_SETS = (flags['ot-sets'] ?? '1,2').split(',').map(Number)
const OT_SEEDS = flags['ot-seeds'] ? parseInt(flags['ot-seeds']) : null
const OT_WORLDS = (flags['ot-worlds'] ?? 'depths,wastes').split(',').filter(Boolean)
const FOCUS_SEEDS = parseInt(flags['focus-seeds'] ?? '90')
const RATE_SEEDS = parseInt(flags['rate-seeds'] ?? '60')
/** A6 (P19 review): a focus-bot stage median is scored only on this many kills or more. */
const A6_MIN_KILLS = 20
/** A18 (P19 review): minutes alive per death is scored only when the no-dash set has this many deaths. */
const A18_MIN_DEATHS = 5
const LABEL = flags.label ?? 'baseline'
const RUNS = resolve(flags.runs ?? `/tmp/swg-matrix/${LABEL}`)
const OUT = resolve(flags.out ?? join(ROOT, 'docs/tuning'))
const DAILY = flags.daily ?? null
const BASELINE = flags.baseline ? JSON.parse(readFileSync(resolve(flags.baseline), 'utf8')) : null
const ALL = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'BENCH', 'S3.2']
const TIMING = ['A15', 'A16', 'BENCH', 'S3.2']
const ONLY = flags.only ? flags.only.split(',') : ALL.filter((id) => !(flags['skip-perf'] && TIMING.includes(id)))
if (flags['report-from']) {
  const saved = JSON.parse(readFileSync(resolve(flags['report-from']), 'utf8'))
  for (const m of saved.metrics) {
    delete m.baseline
    delete m.change
  }
  saved.meta.renderedFrom = `${flags['report-from']} (node scripts/playtest/matrix.mjs ${process.argv.slice(2).join(' ')})`
  writeReport({ meta: saved.meta, metrics: saved.metrics, baseline: BASELINE, baselineFile: flags.baseline, out: resolve(flags.out ?? join(ROOT, 'docs/tuning')) })
  console.error(`[matrix] re-rendered ${saved.meta.label}.md and .json from ${flags['report-from']}`)
  process.exit(0)
}
const PERF_PERKS = 'piercing,cryo_rounds,explosive_rounds,arc_rounds,incendiary,ricochet,f_shatter,f_firestorm'
const SETTINGS = '{"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
const BOSS_IDS = /^(queen|queenPrime|voidMatron|voidMatronPrime|emberTyrant|emberTyrantPrime)$/
mkdirSync(RUNS, { recursive: true })
mkdirSync(OUT, { recursive: true })

const seedsN = (n, from = SEED_FROM) => Array.from({ length: n }, (_, i) => 1001 * (from + i))

// Bot sets: per world, a list of config strings (configs.mjs format).
const SETS = {
  smart: { label: 'smart', pattern: 'smart+human:SEED:14', configs: () => seedsN(SEEDS).map((s) => `smart+human:${s}:14`) },
  smartP: { label: 'smart+P', pattern: 'smart+human:SEED:14:nova:priority', configs: () => seedsN(SEEDS).map((s) => `smart+human:${s}:14:nova:priority`) },
  focus: { label: 'smart+focus+P', pattern: 'smart+focus+human:SEED:14:nova:priority', configs: () => seedsN(SEEDS).map((s) => `smart+focus+human:${s}:14:nova:priority`) },
  // A6 focus medians on --focus-seeds seeds (P19 review); shares its run files
  // with the focus set above for the seeds both hold.
  focusA6: { label: 'smart+focus+P (A6)', pattern: 'smart+focus+human:SEED:14:nova:priority', seeds: () => FOCUS_SEEDS, configs: () => seedsN(FOCUS_SEEDS).map((s) => `smart+focus+human:${s}:14:nova:priority`) },
  crude: { label: 'crude', pattern: 'crude:SEED:14', configs: () => seedsN(SEEDS).map((s) => `crude:${s}:14`) },
  // A7 and A8 on --rate-seeds seeds (P19 review); they share run files with
  // the sets above for the seeds both hold.
  smartR: { label: 'smart (A7, A8)', pattern: 'smart+human:SEED:14', seeds: () => RATE_SEEDS, configs: () => seedsN(RATE_SEEDS).map((s) => `smart+human:${s}:14`) },
  smartPR: { label: 'smart+P (A7, A8)', pattern: 'smart+human:SEED:14:nova:priority', seeds: () => RATE_SEEDS, configs: () => seedsN(RATE_SEEDS).map((s) => `smart+human:${s}:14:nova:priority`) },
  crudeR: { label: 'crude (A8)', pattern: 'crude:SEED:14', seeds: () => RATE_SEEDS, configs: () => seedsN(RATE_SEEDS).map((s) => `crude:${s}:14`) },
  roam: { label: 'roam', pattern: 'roam:SEED:14', configs: () => seedsN(SEEDS).map((s) => `roam:${s}:14`) },
  dash: { label: 'smart+dash+P', pattern: 'smart+dash+human:SEED:14:nova:priority', configs: () => seedsN(SEEDS).map((s) => `smart+dash+human:${s}:14:nova:priority`) },
  dashR: { label: 'smart+dash+P (A18)', pattern: 'smart+dash+human:SEED:14:nova:priority', seeds: () => RATE_SEEDS, configs: () => seedsN(RATE_SEEDS).map((s) => `smart+dash+human:${s}:14:nova:priority`) },
  evolve: { label: 'smart+E', pattern: 'smart+human:SEED:14:nova:evolve', configs: () => seedsN(SEEDS).map((s) => `smart+human:${s}:14:nova:evolve`) },
  // A12 ladder: Hive only, T0 to T4 on --threat-seeds seeds. T0 shares its
  // run files with the smart+P set (same config), so a run is never repeated.
  threat: {
    label: 'smart+P T0 to T4 (Hive)',
    pattern: 'smart+human:SEED:14:nova:priority:T (T 0 to 4)',
    hiveOnly: true,
    seeds: () => THREAT_SEEDS,
    configs: () => [0, 1, 2, 3, 4].flatMap((t) => seedsN(THREAT_SEEDS).map((s) => `smart+human:${s}:14:nova:priority${t ? `:${t}` : ''}`)),
  },
  // A13: the OVERTIME sets of the section 11 A12/A13 note (Hive). Set n: T0
  // 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n (set 1: 1..30 and
  // 1..10; set 2: 31..60 and 11..20; set 3, a holdout: 61..90 and 21..30).
  ot: {
    label: 'smart+P OVERTIME (Hive)',
    pattern: 'smart+human:SEED:25:nova:priority:T:ot',
    hiveOnly: true,
    configs: () =>
      OT_SETS.flatMap((set) => [
        ...seedsN(OT_SEEDS ?? 30, 30 * (set - 1) + 1).map((s) => `smart+human:${s}:25:nova:priority:0:ot`),
        ...[1, 2, 3].flatMap((t) => seedsN(Math.min(OT_SEEDS ?? 10, 10), 10 * (set - 1) + 1).map((s) => `smart+human:${s}:25:nova:priority:${t}:ot`)),
      ]),
  },
  // A13 in the other worlds (P19 review): the T0 part of each OVERTIME set.
  otWorlds: {
    label: 'smart+P OVERTIME T0 (Depths, Wastes)',
    pattern: 'smart+human:SEED:25:nova:priority:0:ot',
    worlds: () => OT_WORLDS,
    configs: () => OT_SETS.flatMap((set) => seedsN(OT_SEEDS ?? 30, 30 * (set - 1) + 1).map((s) => `smart+human:${s}:25:nova:priority:0:ot`)),
  },
}

// What each metric reads: bot sets, and headless steps.
const NEEDS = {
  A1: { steps: ['opening'] },
  A2: { sets: ['smartP'] },
  A3: { sets: ['roam', 'smart', 'smartP', 'focus', 'dash', 'evolve'] },
  A4: { sets: ['smartP'] },
  A5: { sets: ['smartP', 'focus'] },
  A6: { sets: ['focusA6', 'smartPR'] },
  A7: { sets: ['smartR', 'smartPR'] },
  A8: { sets: ['smartR', 'smartPR', 'crudeR'] },
  A9: { sets: ['smartP'] },
  A10: { sets: ['smart', 'smartP', 'focus', 'dash', 'evolve', 'crude', 'smartPR'] },
  A11: { sets: ['smart', 'smartP', 'focus', 'crude', 'roam', 'dash', 'evolve'] },
  A12: { sets: ['threat'] },
  A13: { sets: ['ot', 'otWorlds'] },
  A14: { steps: ['det'] },
  A15: { steps: ['perf'] },
  A16: { steps: ['gc'] },
  A17: {},
  A18: { sets: ['smartP', 'dash', 'evolve', 'roam', 'focus', 'smartPR', 'dashR'] },
  BENCH: { steps: ['bench'] },
  'S3.2': { steps: ['alloc'] },
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
  const worlds = set.hiveOnly ? ['hive'] : set.worlds ? set.worlds() : WORLDS
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
const worldsOf = (setId) => (SETS[setId].hiveOnly ? ['hive'] : SETS[setId].worlds ? SETS[setId].worlds() : WORLDS)

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
    d.push({ mode, view: '375x667 settings', ...measure(['375', '667', mode, `--settings=${SETTINGS}`], { mode, W: 375, H: 667 }, 'measure-det.log') })
  }
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
// The timing steps run after every bot run and headless check. A cool-down
// first: up to 180 s for the 1-minute load average to fall under 3.
let coolDown = null
if (['perf', 'bench', 'gc', 'alloc'].some((s) => wantSteps.has(s))) {
  const t0 = Date.now()
  while (os.loadavg()[0] >= 3 && Date.now() - t0 < 180000) spawnSync('sleep', ['15'])
  coolDown = { waitedSec: Math.round((Date.now() - t0) / 1000), ...machine() }
  log(`cool-down ${coolDown.waitedSec} s, load ${coolDown.load.join(' ')}`)
}
if (wantSteps.has('perf')) {
  steps.perf = [
    { ...measure(['390', '844', 'perf', 'nova', 'hive'], { mode: 'perf', W: 390, H: 844, arenaId: 'hive' }, 'measure-perf.log'), machine: machine() },
    { ...measure(['390', '844', 'perf', 'nova', 'wastes'], { mode: 'perf', W: 390, H: 844, arenaId: 'wastes' }, 'measure-perf.log'), machine: machine() },
    { ...measure(['390', '844', 'perf-final', 'nova', 'hive'], { mode: 'perf-final', W: 390, H: 844, arenaId: 'hive' }, 'measure-perf.log'), machine: machine() },
  ]
}
if (wantSteps.has('bench')) {
  const m = machine()
  steps.bench = { ...measure(['390', '844', 'bench', 'nova', 'hive', '10', `--perks=${PERF_PERKS}`], { mode: 'bench', W: 390, H: 844, arenaId: 'hive' }, 'measure-bench.log'), machine: m }
}
if (wantSteps.has('gc')) {
  const m = machine()
  const r = runNode('scripts/probe-alloc.mjs', ['x', 'x', '--gc', '--perks='], 'probe-alloc-gc.log')
  steps.gc = { lines: r.lines.filter((l) => l.mode === 'gc'), pageErrors: r.lines.filter((l) => l.pageErrors).flatMap((l) => l.pageErrors), machine: m }
}
if (wantSteps.has('alloc')) {
  // Section 3.2: the allocation rate per scene (the PA and PB lanes' command)
  // and the heap growth over 60 s of flood(500) after an 80 s warm-up.
  const m = machine()
  const r = runNode('scripts/probe-alloc.mjs', ['all', 'all', '--budget=1.0'], 'probe-alloc.log')
  const g = runNode('scripts/probe-alloc.mjs', ['flood', 'hive', '--growth=60', '--warm=80'], 'probe-alloc-growth.log')
  steps.alloc = {
    lines: r.lines.filter((l) => l.mode === 'alloc'),
    growth: g.lines.filter((l) => !l.pageErrors),
    pageErrors: [...r.lines, ...g.lines].filter((l) => l.pageErrors).flatMap((l) => l.pageErrors),
    machine: m,
  }
}

// ---- metrics ------------------------------------------------------------------
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)
/** Seconds survived: a death's time, else the whole run (a win or a stalemate survived). */
const survival = (s) => (s.dead ? s.endTime : (s.minutes ?? 14) * 60)
const metrics = []
function add(id, name, value, target, pass, details = null) {
  metrics.push({ id, name, value, target, result: pass === null ? 'n/a' : pass === 'owner' || pass === 'info' ? pass : pass ? 'PASS' : 'FAIL', details })
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
    if (x) bySet[SETS[id].label] = { runs: x.runs.length, offRule: x.offRule, maxAlive: x.maxAlive, overRowMax: x.overRowMax, overRowCageMax: x.overRowCageMax, satMax: x.satMax, worst: x.runs.reduce((a, b) => (b.satFrac > a.satFrac ? b : a)).file }
  }
  // Saturated share per world and minute row, summed over every A3 run (the
  // steps outside a cage and an event window, and those at 95%+ of maxAlive;
  // the chunk ending at t belongs to row floor((t - 0.01) / 60)).
  const byRow = {}
  for (const w of WORLDS) {
    const rows = Array.from({ length: 12 }, () => ({ base: 0, sat: 0 }))
    for (const r of runs) {
      if (r.world !== w || !sets.includes(r.set) || r.s.ot) continue
      for (const c of r.s.a3Chunks) {
        const m = Math.min(11, Math.floor((c.t - 0.01) / 60))
        rows[m].base += c.a3Base
        rows[m].sat += c.a3Sat
      }
    }
    byRow[w] = rows.map((x) => (x.base ? +(x.sat / x.base).toFixed(3) : null))
  }
  // Over-row rule (P19 density, section 11 A3 note): inside a cage the field is
  // measured against the maxAlive of the row in force when that cage rose; a
  // row step inside a cage takes effect when the cage drops. overRowMax (the
  // row of the current minute) is kept in the details.
  const overRow = st ? st.overRowCageMax ?? st.overRowMax : null
  add(
    'A3',
    'Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve)',
    st ? `beats off-rule ${st.offRule}; alive max ${st.maxAlive}; over row maxAlive ${overRow} (row of the minute: ${st.overRowMax}); saturated share max ${st.satMax}` : 'no runs',
    'beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25',
    st ? st.offRule === 0 && st.maxAlive <= 610 && overRow <= 160 && st.satMax <= 0.25 : false,
    { bySet, byRow, offRuleRuns: st ? st.runs.filter((r) => r.off > 0).map((r) => ({ file: r.file, off: r.beats.filter((b) => !b.ok) })) : [] },
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
    let inBandMinute = 0
    for (let m = 0; m < 12; m++) {
      const band = bands[w][m]
      // Minute mean (every step of the minute, the cage and lull steps included).
      const vm = rs.filter((s) => s.endTime >= (m + 1) * 60 && s.perMin[m]?.aliveMean != null).map((s) => s.perMin[m].aliveMean)
      const medMinute = median(vm)
      const okMinute = band && medMinute !== null ? medMinute >= band[0] && medMinute <= band[1] : null
      if (okMinute) inBandMinute++
      // Free field (P19 density, section 11 A4 note): the steps of the minute
      // with no cage and no lull, where the row's minAlive is the floor; a run
      // counts when it lived through the minute and had 10 s or more of them.
      const v = rs.filter((s) => s.endTime >= (m + 1) * 60 && s.perMin[m]?.freeAliveMean != null && s.perMin[m].freeSteps >= 600).map((s) => s.perMin[m].freeAliveMean)
      const med = median(v)
      const ok = band && med !== null ? med >= band[0] && med <= band[1] : null
      if (band && med !== null) {
        scored++
        if (ok) inBand++
      }
      mins.push({ min: m + 1, band: band ? band.join('-') : 'cage', median: med, runs: v.length, ok, minuteMean: medMinute, minuteRuns: vm.length, okMinute })
    }
    // Section 11: "inside the band in 9 or more of 12 minutes". The cage
    // rows (4, 7, 11) have no band, so the same 3-in-4 share applies to the
    // scored minutes (ceil(0.75 x 9) = 7); a minute no run lived through is
    // not scored.
    const need = Math.ceil(0.75 * scored)
    per[w] = { inBand, scored, need, mins, inBandMinuteMean: inBandMinute }
    // A run JSON from before the free-field counters scores no minute: no result, not a pass.
    if (scored === 0 || inBand < need) pass = false
  }
  add('A4', 'Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull)', WORLDS.map((w) => `${w} ${per[w].inBand}/${per[w].scored} (minute mean ${per[w].inBandMinuteMean}/9)`).join(', '), 'in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band)', pass, per)
}

if (has('A5')) {
  const fs = fightStats(of(NEEDS.A5.sets))
  const a = fs?.arrivals
  add('A5', 'Boss arrival (smart+P and focus fights)', a ? `${a.n} arrivals (${a.ascended} PRIME ascends, placed where the mid boss was), ${a.distMin} to ${a.distMax} u, cage active and inside ${a.cageInside}/${a.n}, in arena ${a.inArena}/${a.n}` : 'no fights', '250 to 340 u; cage active the same tick', a ? a.bad.length === 0 : false, a ? a.bad : null)
}

if (has('A6')) {
  const per = {}
  let pass = true
  let gapMin = Infinity
  const q = (a, p) => {
    if (!a.length) return null
    const v = [...a].sort((x, y) => x - y)
    const i = (v.length - 1) * p
    const lo = Math.floor(i)
    return +(v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo)).toFixed(1)
  }
  // Boss attacks (the hazard and lunge kinds) per fight, and the fights that
  // ended in the bot's death (P19 review: a player can be hit and killed in a fight).
  const atk = (fights) => {
    const v = fights.filter((x) => x.bossAtk !== null && x.bossAtk !== undefined).map((x) => x.bossAtk)
    return v.length ? { fights: v.length, hit: v.filter((x) => x > 0).length, mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), max: Math.max(...v), deaths: fights.filter((x) => x.how === 'death').length } : { fights: 0, hit: 0, mean: null, max: null, deaths: fights.filter((x) => x.how === 'death').length }
  }
  for (const w of WORLDS) {
    const f = fightStats(of(['focusA6'], w))
    const d = fightStats(of(['smartPR'], w))
    const fm = (st) => (st ? { kills: st.kills, median: st.median, min: st.min, max: st.max, unfinished: st.unfinished.length, deaths: st.unfinished.filter((u) => u.how === 'death').length, enough: st.kills >= A6_MIN_KILLS } : null)
    const focus = f ? { mid1: fm(f.stages.mid1), mid2: fm(f.stages.mid2), final: fm(f.stages.final) } : null
    const defLongest = d ? Math.max(0, ...d.fights.filter((x) => x.how !== 'stalemate').map((x) => x.len)) : null
    const defOver = d ? d.fights.filter((x) => x.how !== 'stalemate' && x.len > 150).map((x) => `${x.stage} ${x.len} s (${x.how}, ${x.run})`) : []
    // Decided rule (P19, section 11 A6): the default bot's 150 s cap applies to
    // the mid1 and mid2 fights, at most 5% of them over 150 s per world; a PRIME
    // fight may run to the 210 s stalemate (its fights over 150 s are reported).
    const mids = d ? d.fights.filter((x) => (x.stage === 'mid1' || x.stage === 'mid2') && x.how !== 'stalemate') : []
    const midOver = mids.filter((x) => x.len > 150)
    const finalOver = d ? d.fights.filter((x) => x.stage === 'final' && x.how !== 'stalemate' && x.len > 150).length : 0
    const finals = d ? d.fights.filter((x) => x.stage === 'final') : []
    // Reported (P19 review): the default bot's PRIME fight, every ending (a
    // stalemate counts its 210 s), against a provisional median of 120 s that
    // the owner judges on the phone (A17).
    const primeLens = finals.map((x) => x.len)
    const prime = { n: finals.length, median: q(primeLens, 0.5), p75: q(primeLens, 0.75), over150: primeLens.filter((x) => x > 150).length, stalemates: finals.filter((x) => x.how === 'stalemate').length }
    const defDeaths = d ? d.fights.filter((x) => x.how === 'death').length : 0
    for (const x of [f, d]) if (x && x.gaps.min !== null) gapMin = Math.min(gapMin, x.gaps.min)
    // A focus stage median counts only on A6_MIN_KILLS kills or more (P19 review).
    const inR = (st, lo, hi) => st && st.enough && st.median !== null && st.median >= lo && st.median <= hi
    // Decided after the P19 review: the default bot's PRIME median (every ending) at most 120 s.
    const ok = !!focus && inR(focus.mid1, 20, 40) && inR(focus.mid2, 20, 40) && inR(focus.final, 40, 75) && midOver.length <= 0.05 * mids.length && prime.median !== null && prime.median <= 120
    if (!ok) pass = false
    per[w] = {
      focus, defaultLongest: defLongest, defaultMidOver150: `${midOver.length}/${mids.length}`, defaultFinalOver150: `${finalOver}/${finals.length}`, defaultOver150: defOver, defaultFightsEndedByDeath: defDeaths, defaultFights: d ? d.fights.length : 0,
      defaultPrime: prime,
      bossAttacks: { default: atk(d ? d.fights : []), focus: atk(f ? f.fights : []) },
      unresolved: focus ? ['mid1', 'mid2', 'final'].filter((k) => focus[k] && !focus[k].enough) : [],
    }
  }
  if (gapMin < 20) pass = false
  const st = (x) => `${fmt(x?.median, 1)}${x && !x.enough ? '*' : ''}`
  const v = WORLDS.map((w) => {
    const f = per[w].focus
    const p = per[w].defaultPrime
    const a = per[w].bossAttacks.default
    return `${w} focus ${st(f?.mid1)}/${st(f?.mid2)}/${st(f?.final)} s (kills ${f?.mid1?.kills ?? 0}/${f?.mid2?.kills ?? 0}/${f?.final?.kills ?? 0}), default mid fights over 150 s ${per[w].defaultMidOver150} (PRIME ${per[w].defaultFinalOver150}, longest ${fmt(per[w].defaultLongest, 1)} s), default PRIME median ${fmt(p.median, 1)} s, p75 ${fmt(p.p75, 1)} s (${p.n} fights), boss-attack HP per default fight ${fmt(a.mean, 1)} (hit in ${a.hit}/${a.fights}), fights ended by death ${a.deaths}`
  })
  add(
    'A6',
    `Fights (focus bot medians mid1/mid2/final on ${FOCUS_SEEDS} seeds, * = under ${A6_MIN_KILLS} kills; default bot = smart+P on ${RATE_SEEDS} seeds)`,
    v.join('; ') + `; kill-to-next-arrival min ${gapMin === Infinity ? '-' : fmt(gapMin, 1)} s`,
    `focus mid1/mid2 median 20 to 40 s, final 40 to 75 s, each on ${A6_MIN_KILLS} kills or more; default bot at most 5% of mid1 and mid2 fights over 150 s, and its PRIME fight (every ending, a stalemate at 210 s) median <= 120 s; gap >= 20 s`,
    pass,
    per,
  )
}

if (has('A7')) {
  const per = {}
  let pass = true
  for (const w of WORLDS) {
    const p = of(['smartPR'], w)
    const s = of(['smartR'], w)
    const pw = p.filter((x) => x.won).length
    const sw = s.filter((x) => x.won).length
    // The two seed halves, reported (P19 review: the halves of one build differ by more than a knob step).
    const half = (a, lo, hi) => a.filter((x) => x.seed / 1001 >= lo && x.seed / 1001 <= hi && x.won).length
    const h = Math.floor(RATE_SEEDS / 2)
    per[w] = { smartP: `${pw}/${p.length}`, smart: `${sw}/${s.length}`, smartPHalves: `${half(p, SEED_FROM, SEED_FROM + h - 1)}/${h} and ${half(p, SEED_FROM + h, SEED_FROM + RATE_SEEDS - 1)}/${RATE_SEEDS - h}`, smartHalves: `${half(s, SEED_FROM, SEED_FROM + h - 1)}/${h} and ${half(s, SEED_FROM + h, SEED_FROM + RATE_SEEDS - 1)}/${RATE_SEEDS - h}` }
    if (!(pct(pw, p.length) >= 25 && pct(pw, p.length) <= 45 && pct(sw, s.length) >= 5 && pct(sw, s.length) <= 25)) pass = false
  }
  add('A7', `Win rate (${RATE_SEEDS} seeds per world)`, WORLDS.map((w) => `${w} smart+P ${per[w].smartP}, smart ${per[w].smart} (halves: smart+P ${per[w].smartPHalves}, smart ${per[w].smartHalves})`).join('; '), 'smart+P 25 to 45%; smart 5 to 25%', pass, per)
}

if (has('A8')) {
  const per = {}
  let pass = true
  for (const w of WORLDS) {
    per[w] = {}
    for (const [id, key, min] of [['smartR', 'smart', 330], ['smartPR', 'smartP', 480], ['crudeR', 'crude', 150]]) {
      const m = median(of([id], w).map(survival))
      per[w][key] = m
      if (m === null || m < min) pass = false
    }
  }
  const hiveCrude = per.hive?.crude
  const crudeOrder = hiveCrude == null || WORLDS.every((w) => per[w].crude == null || hiveCrude >= per[w].crude)
  if (!crudeOrder) pass = false
  // Reported (P19 review): deaths per minute of the run, per world, for
  // smart+P and for smart and smart+P together; the share of the busiest
  // minute against a provisional 35% (a death wall after mid1 shows here).
  const deathMinutes = {}
  for (const w of WORLDS) {
    const hist = (ids) => {
      const dead = of(ids, w).filter((s) => s.dead)
      const h = Array(15).fill(0)
      for (const s of dead) h[Math.min(14, Math.floor(s.endTime / 60))]++
      const top = Math.max(0, ...h)
      return { deaths: dead.length, perMinute: h, busiest: h.indexOf(top), busiestShare: dead.length ? +(top / dead.length).toFixed(2) : null }
    }
    deathMinutes[w] = { smartP: hist(['smartPR']), smartAndP: hist(['smartR', 'smartPR']) }
    // Decided after the P19 review: no single minute holds more than 35% of the smart+P deaths.
    if (deathMinutes[w].smartP.busiestShare !== null && deathMinutes[w].smartP.busiestShare > 0.35) pass = false
  }
  add(
    'A8',
    `Median survival (${RATE_SEEDS} seeds per world; a win or a stalemate counts as the whole 14:00)`,
    WORLDS.map((w) => `${w} smart ${mmss(per[w].smart)}, smart+P ${mmss(per[w].smartP)}, crude ${mmss(per[w].crude)}`).join('; ') + `. Busiest death minute (smart+P): ${WORLDS.map((w) => `${w} ${deathMinutes[w].smartP.busiest}:00 to ${deathMinutes[w].smartP.busiest + 1}:00 ${fmt(deathMinutes[w].smartP.busiestShare)} of ${deathMinutes[w].smartP.deaths}`).join(', ')}`,
    'smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes; no single minute holds more than 35% of the smart+P deaths',
    pass,
    { ...per, hiveCrudeAtLeastOthers: crudeOrder, deathMinutes },
  )
}

if (has('A9')) {
  const per = {}
  let pass = true
  const levelAt = (s, t) => s.levelAt[t] ?? (s.won && s.endTime < t ? s.finalLevel : null)
  for (const w of WORLDS) {
    const rs = of(['smartP'], w)
    const at = {}
    for (const t of [180, 480, 660]) at[t] = median(rs.map((s) => levelAt(s, t)).filter((x) => x != null))
    // Gaps are measured outside boss fights (P19 decision, section 11 A9): the
    // seconds of a gap between two level-ups (or the last one and the run's
    // end) that fall inside a fight, spawn to its end, do not count.
    const outside = (s, g) => {
      let inFight = 0
      for (const f of s.fights) inFight += Math.max(0, Math.min(g.to, f.endT) - Math.max(g.from, f.spawnT))
      return +(g.to - g.from - inFight).toFixed(1)
    }
    const all = rs.flatMap((s) => s.levelUpGapsOver60s.filter((g) => g.from >= 60).map((g) => ({ ...g, outside: outside(s, g), run: s.file })))
    const gaps = all.filter((g) => g.outside > 60)
    per[w] = {
      L3: at[180], L8: at[480], L11: at[660],
      gapRuns: new Set(gaps.map((g) => g.run)).size, runs: rs.length, longestGap: gaps.length ? Math.max(...gaps.map((g) => g.outside)) : 0, gaps,
      gapRunsWithFights: new Set(all.map((g) => g.run)).size, gapsWithFights: all,
    }
    const inR = (x, lo, hi) => x !== null && x >= lo && x <= hi
    if (!(inR(at[180], 9, 12) && inR(at[480], 16, 20) && inR(at[660], 19, 24) && gaps.length === 0)) pass = false
  }
  add('A9', 'Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights)', WORLDS.map((w) => `${w} L${fmt(per[w].L3, 1)}/L${fmt(per[w].L8, 1)}/L${fmt(per[w].L11, 1)} at 3:00/8:00/11:00, gap over 60 s outside fights in ${per[w].gapRuns}/${per[w].runs} runs (fights counted: ${per[w].gapRunsWithFights})`).join('; '), 'L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights', pass, per)
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
  // Decided after the P19 review: scored pooled (the smart family, 30 seeds)
  // and per world on the smart+P set (the default player, RATE_SEEDS seeds).
  const bySetWorld = {}
  for (const w of WORLDS) {
    const x = a10Stats(of(['smartPR'], w))
    bySetWorld[w] = x ? { deaths: x.deaths, median: x.median, min: x.min } : null
  }
  const worldsOk = WORLDS.every((w) => !bySetWorld[w] || bySetWorld[w].median >= 3)
  add(
    'A10',
    'Readable deaths (smart-family deaths pooled, smart+P deaths per world; crude in the details)',
    st ? `${st.deaths} deaths, median ${fmt(st.median)} s, min ${fmt(st.min)} s; smart+P per world (${RATE_SEEDS} seeds) ${WORLDS.map((w) => `${w} ${fmt(bySetWorld[w]?.median)} s (${bySetWorld[w]?.deaths ?? 0})`).join(', ')}; smart family per world ${WORLDS.map((w) => `${w} ${fmt(byWorld[w]?.median)} s (${byWorld[w]?.deaths ?? 0})`).join(', ')}` : 'no deaths',
    `median >= 3.0 s over the smart-family deaths pooled and over the smart+P deaths of each world (${RATE_SEEDS} seeds); minimum >= 1.2 s`,
    st ? st.median >= 3 && worldsOk && st.min >= 1.2 : false,
    { bySet, byWorld, bySetWorldSmartP: bySetWorld, under, windowDmg, fastest },
  )
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
  // Decided (P19 ladder pass): 60 Hive seeds; T1 wins at least 5 points less
  // often than T0. T2 and T3 are reported; each level should win no more than
  // the one below it.
  const lad = ladderStats(of(['threat'], 'hive')).find((l) => l.key === 'hive smart+P' || l.key === 'hive smart+human+P')
  const get = (t) => lad?.byThreat.find((e) => e.threat === t)
  const rate = (e) => (e ? e.wins / e.runs : null)
  const lv = [0, 1, 2, 3, 4].map(get)
  const [t0, t1, , , t4] = lv
  const ok = !!(t0 && t1 && t4) && rate(t4) <= 0.15 && rate(t0) - rate(t1) >= 0.05 - 1e-9
  const steps = lv.slice(1).map((e, i) => (e && lv[i] && rate(e) > rate(lv[i]) ? `T${i + 1} over T${i}` : null)).filter(Boolean)
  // P19 review: a step smaller than two standard errors of the difference of
  // two win rates (pooled rate p over n runs each: sqrt(2 p (1 - p) / n)) is
  // inside the noise, so those two levels measure as equal.
  const equal = lv
    .slice(1)
    .map((e, i) => {
      const a = lv[i]
      if (!e || !a) return null
      const p = (a.wins + e.wins) / (a.runs + e.runs)
      const se = Math.sqrt((p * (1 - p) * (1 / a.runs + 1 / e.runs)))
      return Math.abs(rate(a) - rate(e)) < 2 * se ? `T${i} and T${i + 1}` : null
    })
    .filter(Boolean)
  const value = lv.map((e, t) => (e ? `T${t} ${e.wins}/${e.runs} (${pct(e.wins, e.runs)}%)` : `T${t} -`)).join(', ') + `; ladder ${steps.length ? steps.join(', ') : 'falls at every step'}; within noise (under 2 standard errors): ${equal.length ? equal.join(', ') : 'none'}`
  add('A12', 'Ladder (Hive smart+P, T0 to T4)', value, 'T4 win rate <= 15%; T1 at least 5 points under T0', ok, { ...lad, steps, withinNoise: equal })
}

if (has('A13')) {
  // Each Hive OVERTIME set must pass on its own (P19 ladder pass). Depths and
  // Wastes (P19 review) run the T0 part of the same sets; with fewer winners
  // per set, they are scored on their sets pooled.
  const st = a13Stats(of(['ot'], 'hive'))
  const sets = st ? Object.entries(st.bySet) : []
  const others = {}
  for (const w of OT_WORLDS) others[w] = a13Stats(of(['otWorlds'], w))
  const okOf = (e) => e.n > 0 && e.by20 / e.n >= 0.9 && e.past24 === 0
  const value =
    (st ? `hive ${sets.map(([k, e]) => `set ${k} ${e.by20}/${e.n} (${pct(e.by20, e.n)}%), ${e.past24} past 24:00`).join('; ')}; all ${st.by20}/${st.n} (${pct(st.by20, st.n)}%)` : 'hive: no run reached OVERTIME') +
    OT_WORLDS.map((w) => (others[w] ? `; ${w} T0 sets ${OT_SETS.join(' and ')} ${others[w].by20}/${others[w].n} (${pct(others[w].by20, others[w].n)}%), ${others[w].past24} past 24:00` : `; ${w}: no run reached OVERTIME`)).join('')
  const pass = !!st && sets.every(([, e]) => okOf(e)) && OT_WORLDS.every((w) => others[w] && okOf(others[w]))
  add(
    'A13',
    `Overtime (runs that won: Hive OVERTIME sets ${OT_SETS.join(' and ')}${OT_WORLDS.length ? `; ${OT_WORLDS.join(' and ')} T0 of the same sets` : ''})`,
    value,
    `>= 90% dead by 20:00 and none past 24:00, in each Hive set${OT_WORLDS.length ? ` and in ${OT_WORLDS.join(' and ')} (sets pooled)` : ''}`,
    pass,
    { hive: st, ...others },
  )
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
  const expected = 3 * 9 + (DAILY ? 4 : 0)
  const count = Object.values(groups).reduce((n, v) => n + v.length, 0)
  add('A14', `Determinism (det, det-long, det-death at 375x667, 667x375 and 375x667 with the settings injection${DAILY ? `; det and det-death of the ${DAILY} Daily, fresh save 375x667 and unlocked save 667x375` : ''}; each with its rerun)`, `${Object.keys(groups).length} groups, ${split.length} split; reruns ${rerun ? 'match' : 'DIFFER'}; ${count}/${expected} lines`, 'one hash per mode and world across views, settings, reruns', echo && rerun && split.length === 0 && count === expected, groups)
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
    // The dash clause on RATE_SEEDS seeds (more deaths per set).
    const dash = of(['dashR'], w)
    const base = of(['smartPR'], w)
    const ratio = mean(dash.map(survival)) / mean(base.map(survival))
    // The 14:00 end censors survival, so the mean ratio cannot exceed
    // 14:00 / (no-dash mean). Minutes alive per death (all minutes played over
    // the deaths, the exponential estimate of the mean lifetime) is not capped
    // (P19 builds pass, section 11 A18 note).
    // Decided after the P19 review: minutes alive per death only when each set
    // has A18_MIN_DEATHS deaths or more; otherwise the mean-survival ratio is
    // reported and scored. The 14:00 end caps that ratio (ceiling below), so it
    // passes at 1.25x, or when the dash bot's mean survival is 13:00 or more
    // (it loses under a minute a run, so the cap, not the dash, sets the ratio).
    const lifePerDeath = (a) => a.reduce((n, s) => n + survival(s), 0) / 60 / Math.max(1, a.filter((s) => s.dead).length)
    const baseDeathsN = base.filter((s) => s.dead).length
    const dashDeathsN = dash.filter((s) => s.dead).length
    const perDeath = baseDeathsN >= A18_MIN_DEATHS && dashDeathsN >= A18_MIN_DEATHS
    const lifeRatio = perDeath ? lifePerDeath(dash) / lifePerDeath(base) : null
    const dashOk = perDeath ? lifeRatio >= 1.25 : ratio >= 1.25 || mean(dash.map(survival)) >= 780
    const ceiling = Math.max(...base.map((s) => (s.minutes ?? 14) * 60)) / mean(base.map(survival))
    const ccMin = dash.reduce((n, s) => n + s.closeCalls, 0) / (dash.reduce((n, s) => n + s.endTime, 0) / 60)
    const prio = of(['smartP', 'focus', 'dash'], w).filter((s) => s.endTime >= 240)
    const fused = prio.filter((s) => s.firstFusionAt !== null && s.firstFusionAt <= 240).length
    const evo = of(['evolve'], w).filter((s) => s.fights.some((f) => f.stage === 'mid2'))
    const evolved = evo.filter((s) => s.evolutions.length > 0).length
    const roam = of(['roam'], w)
    // XP up to the PRIME's end (P19 density, section 11 A18 note); the
    // whole-run share stays in the details.
    const xpPrime = roam.map((s) => s.xpCollectFracPrime)
    const xpMin = roam.length ? (xpPrime.includes(null) ? Math.min(...roam.map((s) => s.xpCollectFrac)) : Math.min(...xpPrime)) : null
    const xpWholeMin = roam.length ? Math.min(...roam.map((s) => s.xpCollectFrac)) : null
    const xp30Min = roam.length ? Math.min(...roam.map((s) => s.xpCollectFrac30 ?? 1)) : null
    per[w] = {
      dashSurvivalRatio: ratio,
      dashMeanSurvival: mean(dash.map(survival)),
      baseMeanSurvival: mean(base.map(survival)),
      dashMeanRatioCeiling: ceiling,
      dashLifeRatio: lifeRatio,
      dashScoredOn: perDeath ? 'minutes per death' : 'mean survival',
      dashOk,
      dashMinPerDeath: lifePerDeath(dash),
      baseMinPerDeath: lifePerDeath(base),
      dashDeaths: `${dash.filter((s) => s.dead).length}/${dash.length}`,
      baseDeaths: `${base.filter((s) => s.dead).length}/${base.length}`,
      closeCallsPerMin: ccMin,
      fusionBy4: `${fused}/${prio.length}`,
      evolveAtBoss2: `${evolved}/${evo.length}`,
      roamXpMin: xpMin,
      roamXpWholeRunMin: xpWholeMin,
      roamXpUnder90: roam.filter((s) => (s.xpCollectFracPrime ?? s.xpCollectFrac) < 0.9).map((s) => `${s.file} ${s.xpCollectFracPrime ?? s.xpCollectFrac}`),
      roamXp30Min: xp30Min,
    }
    // Scored on minutes alive per death (P19 decision); the mean ratio and its
    // ceiling are information.
    if (!(dashOk && ccMin >= 1 && ccMin <= 4 && prio.length && fused / prio.length >= 0.5 && evo.length && evolved / evo.length >= 0.4 && xpMin >= 0.9)) pass = false
  }
  add(
    'A18',
    'Build systems (dash = smart+dash+P vs smart+P minutes alive per death; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill)',
    WORLDS.map((w) => `${w} dash ${per[w].dashLifeRatio === null ? `mean ${fmt(per[w].dashSurvivalRatio)}x (under ${A18_MIN_DEATHS} deaths in a set; dash mean ${mmss(per[w].dashMeanSurvival)})` : `${fmt(per[w].dashLifeRatio)}x per death`} (deaths ${per[w].dashDeaths} vs ${per[w].baseDeaths}; mean ${fmt(per[w].dashSurvivalRatio)}x, ceiling ${fmt(per[w].dashMeanRatioCeiling)}x), cc ${fmt(per[w].closeCallsPerMin)}/min, fusion by 4:00 ${per[w].fusionBy4}, evolve ${per[w].evolveAtBoss2}, XP min ${fmt(per[w].roamXpMin, 3)} (whole run ${fmt(per[w].roamXpWholeRunMin, 3)})`).join('; '),
    `dash >= 1.25x minutes alive per death (${RATE_SEEDS} seeds; with under ${A18_MIN_DEATHS} deaths in either set, the mean-survival ratio >= 1.25x or a dash mean survival of 13:00 or more); 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90%`,
    pass,
    per,
  )
}

if (has('BENCH')) {
  // Not a gate: CPU per tick under the vsync cap, to compare builds on one machine.
  const b = steps.bench
  const l = b.lines.find((x) => x.sim) ?? null
  const ms = (s) => `median ${s.median}, p95 ${s.p95}, mean ${s.mean} ms`
  add('BENCH', `CPU per tick (bench 390x844, Hive, 10 s, the 8-perk build; reported only)`, l ? `stepSim ${ms(l.sim)}; render update ${ms(l.renderUpdate)}; Pixi draw ${ms(l.pixi)}; ${l.enemies} enemies, ${l.particles} particles` : 'no result', 'none (compares builds on one machine)', 'info', { line: l, echoOk: b.echoOk, machine: b.machine, pageErrors: b.pageErrors.length })
}

if (has('S3.2')) {
  // Not a section 11 metric: the section 3.2 allocation rates and heap growth, reported.
  const a = steps.alloc
  const scenes = a.lines.map((l) => ({ scene: `${l.scenario} ${l.arena}`, totalMBs: l.totalMBs, gameMBs: l.gameMBs, simOver: l.simOver, pass: l.pass }))
  const g = a.growth[0] ?? null
  const simOver = scenes.filter((s) => s.simOver.length)
  add(
    'S3.2',
    'Allocation (probe-alloc all all --budget=1.0; heap growth over 60 s of flood(500) after an 80 s warm-up; reported only)',
    scenes.length ? `${scenes.length} scenes, total ${Math.min(...scenes.map((s) => s.totalMBs))} to ${Math.max(...scenes.map((s) => s.totalMBs))} MB/s, game ${Math.min(...scenes.map((s) => s.gameMBs))} to ${Math.max(...scenes.map((s) => s.gameMBs))} MB/s, ${scenes.filter((s) => s.pass).length}/${scenes.length} within the probe's budget; sim functions over 0.1 MB/s in ${simOver.length} scenes; growth ${g ? `${g.growthMB} MB` : '-'}` : 'no result',
    'section 3.2: no sim function over 0.1 MB/s; no heap growth over 60 s',
    'info',
    { scenes, growth: g ? { growthMB: g.growthMB, beforeMB: g.beforeMB, afterMB: g.afterMB, keptMB: g.keptMB } : null, machine: a.machine, pageErrors: a.pageErrors.length },
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
  seeds: `1001 x ${SEED_FROM}..${SEED_FROM + SEEDS - 1} per world`,
  worlds: WORLDS,
  threatSeeds: `1001 x ${SEED_FROM}..${SEED_FROM + THREAT_SEEDS - 1}`,
  otSets: OT_SETS,
  otSeeds: OT_SEEDS,
  otWorlds: OT_WORLDS,
  focusSeeds: `1001 x ${SEED_FROM}..${SEED_FROM + FOCUS_SEEDS - 1}`,
  rateSeeds: `1001 x ${SEED_FROM}..${SEED_FROM + RATE_SEEDS - 1}`,
  only: ONLY,
  runsDir: RUNS,
  machineAtEnd: machine(),
  coolDown,
  sets: Object.fromEntries(wantSets.map((id) => [id, { label: SETS[id].label, pattern: SETS[id].pattern, worlds: worldsOf(id), runs: runs.filter((r) => r.set === id).length }])),
  commands,
  shownCommands,
}
writeReport({ meta, metrics, baseline: BASELINE, baselineFile: flags.baseline, out: OUT })
for (const m of metrics) console.log(`${m.id.padEnd(4)} ${m.result.padEnd(5)} ${m.value}`)
log(`wrote ${join(OUT, LABEL + '.md')} and ${LABEL}.json`)
