// Report writer for matrix.mjs: <label>.json and <label>.md from the run's
// meta and metrics, with the baseline comparison when a baseline JSON is
// given. matrix.mjs --report-from=<label>.json re-renders a saved matrix
// through it without running anything.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const fmt = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? '-' : typeof x === 'number' ? +x.toFixed(d) : x)
export const mmss = (s) => (s === null ? '-' : `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`)

// Baseline comparison: the earlier matrix's value, target and result per
// metric, and a Change cell with the result and the main numbers, baseline to
// now. The numbers are read from the value strings, which keep one format per
// metric across P19 (a metric whose rule changed keeps its comparable part:
// A3 the over-row of the minute, A9 the gaps with fights counted, A18 the mean
// dash ratio).
const WORLD_RE = /^(hive|depths|wastes) /
function keyNumbers(id, v) {
  const k = []
  const one = (label, re, unit = '') => {
    const m = re.exec(v)
    if (m) k.push([label, `${m[1]}${unit}`])
  }
  const all = (re) => [...v.matchAll(re)].map((m) => m[1])
  // World segments: a '; ' followed by a world name (a segment may hold '; ' in parentheses).
  const perWorld = (fn) => {
    for (const seg of v.split(/; (?=(?:hive|depths|wastes) )/)) {
      const w = WORLD_RE.exec(seg)
      if (w) fn(w[1], seg)
    }
  }
  const pctOf = (a, b) => `${Math.round((100 * a) / b)}%`
  switch (id) {
    case 'A1':
      one('first in view', /first in view ([\d.]+) s/, ' s')
      one('first kill', /first kill ([\d.]+) s/, ' s')
      one('empty view', /empty view ([\d.]+) s/, ' s')
      break
    case 'A2':
      one('median', /median ([\d.]+) s/, ' s')
      break
    case 'A3':
      one('alive max', /alive max (\d+)/)
      if (/row of the minute: (\d+)/.test(v)) one('over row of the minute', /row of the minute: (\d+)/)
      else one('over row of the minute', /over row maxAlive (\d+)/)
      one('saturated share', /saturated share max ([\d.]+)/)
      break
    case 'A4':
      for (const m of v.matchAll(/(hive|depths|wastes) (\d+\/\d+)/g)) k.push([m[1], m[2]])
      break
    case 'A5': {
      const m = /(\d+) to (\d+) u/.exec(v)
      if (m) k.push(['distance', `${m[1]}-${m[2]} u`])
      break
    }
    case 'A6':
      perWorld((w, seg) => {
        const f = /focus ([\d.-]+\/[\d.-]+\/[\d.-]+) s/.exec(seg)
        if (f) k.push([`${w} focus`, `${f[1]} s`])
        const l = /longest ([\d.]+) s/.exec(seg)
        if (l) k.push([`${w} default longest`, `${l[1]} s`])
      })
      one('kill to next arrival', /kill-to-next-arrival min ([\d.]+) s/, ' s')
      break
    case 'A7':
      perWorld((w, seg) => {
        const p = /smart\+P (\d+)\/(\d+)/.exec(seg)
        const s = /, smart (\d+)\/(\d+)/.exec(seg)
        if (p) k.push([`${w} smart+P`, pctOf(p[1], p[2])])
        if (s) k.push([`${w} smart`, pctOf(s[1], s[2])])
      })
      break
    case 'A8':
      perWorld((w, seg) => {
        const m = /smart ([\d:]+), smart\+P ([\d:]+), crude ([\d:]+)/.exec(seg)
        if (m) k.push([`${w} smart, smart+P, crude`, `${m[1]}, ${m[2]}, ${m[3]}`])
      })
      break
    case 'A9':
      perWorld((w, seg) => {
        const l = /(L[\d.]+\/L[\d.]+\/L[\d.]+)/.exec(seg)
        if (l) k.push([`${w} levels`, l[1]])
        const runs = /in \d+\/(\d+) runs/.exec(seg)
        const g = /fights counted: (\d+)/.exec(seg) ?? /gap over 60 s in (\d+)\//.exec(seg)
        if (g && runs) k.push([`${w} runs with a gap (fights counted)`, pctOf(g[1], runs[1])])
      })
      break
    case 'A10':
      one('deaths', /(\d+) deaths/)
      one('median', /median ([\d.]+) s/, ' s')
      one('min', /min ([\d.]+) s/, ' s')
      break
    case 'A11':
      one('fastest', /fastest \w+ ([\d.]+)/, ' u/s')
      break
    case 'A12':
      for (const m of v.matchAll(/T(\d) \d+\/\d+ \((\d+)%\)/g)) if (m[1] === '0' || m[1] === '1' || m[1] === '4') k.push([`T${m[1]}`, `${m[2]}%`])
      break
    case 'A13': {
      const d = /all \d+\/\d+ \((\d+)%\)/.exec(v) ?? /\((\d+)%\) dead by 20:00/.exec(v)
      if (d) k.push(['dead by 20:00', `${d[1]}%`])
      const p = all(/(\d+) (?:alive )?past 24:00/g)
      if (p.length) k.push(['alive past 24:00', `${p.reduce((a, b) => a + parseInt(b), 0)}`])
      break
    }
    case 'A14':
      one('lines', /(\d+\/\d+) lines/)
      one('split groups', /(\d+) split/)
      break
    case 'A15': {
      const mx = all(/max ([\d.]+) ms/g).map(Number)
      if (mx.length) k.push(['worst frame', `${Math.max(...mx)} ms`])
      const over = all(/>20 ms (\d+)/g).map(Number)
      if (over.length) k.push(['frames over 20 ms', `${over.reduce((a, b) => a + b, 0)}`])
      one('perf-final p95', /perf-final [^;]*?p95 ([\d.]+) ms/, ' ms')
      break
    }
    case 'A16':
      one('max pause', /max pause ([\d.]+) ms/, ' ms')
      break
    case 'A18':
      perWorld((w, seg) => {
        const d = /mean ([\d.]+)x/.exec(seg) ?? /dash ([\d.]+)x,/.exec(seg)
        if (d) k.push([`${w} dash mean ratio`, `${d[1]}x`])
        const x = /XP min ([\d.]+)/.exec(seg)
        if (x) k.push([`${w} XP`, x[1]])
      })
      break
  }
  return k
}
const change = (m, b) => {
  if (!b) return 'new'
  const res = m.result === b.result ? `${m.result}, same` : `${b.result} to ${m.result}`
  const now = new Map(keyNumbers(m.id, m.value))
  const moved = keyNumbers(m.id, b.value)
    .filter(([label]) => now.has(label))
    .map(([label, was]) => (was === now.get(label) ? `${label} ${was} (same)` : `${label} ${was} to ${now.get(label)}`))
  return moved.length ? `${res}: ${moved.join('; ')}` : res
}
/** Writes <label>.json and <label>.md into `out`; `baseline` is an earlier matrix JSON or null. */
export function writeReport({ meta, metrics, baseline, baselineFile, out }) {
  const WORLDS = meta.worlds
  const LABEL = meta.label
  const RUNS = meta.runsDir
  const OT_SETS = meta.otSets
  const OT_SEEDS = meta.otSeeds
  const shownCommands = meta.shownCommands ?? []
  meta.baseline = baseline ? { file: baselineFile, label: baseline.meta.label, commit: baseline.meta.commit, seeds: baseline.meta.seeds, date: baseline.meta.date } : null
  if (baseline) {
    for (const m of metrics) {
      const b = baseline.metrics.find((x) => x.id === m.id)
      m.baseline = b ? { value: b.value, target: b.target, result: b.result, targetChanged: b.target !== m.target, nameThen: b.name !== m.name ? b.name : null } : null
      m.change = change(m, m.baseline)
    }
  }
  writeFileSync(join(out, `${LABEL}.json`), JSON.stringify({ meta, metrics }, null, 1))

  const esc = (s) => String(s).replace(/\|/g, '\\|')
  const md = []
  md.push(`# P19 ${LABEL} matrix`, '')
  md.push(`- Commit: \`${meta.commit}\`${meta.srcDirty ? ' (src has uncommitted changes)' : ' (src clean)'}${meta.scriptsDirty ? '; the harness in scripts/ is the working tree, committed with this report' : ''}, ${meta.date}`)
  md.push(`- Command: \`${meta.command}\` (dev server at ${process.env.SWG_URL || 'http://localhost:5176'})`)
  md.push(`- Seeds: ${meta.seeds}; A12 Hive ${meta.threatSeeds}; A13 OVERTIME sets ${OT_SETS.join(', ')} (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n${OT_SEEDS ? `; quick check: the first ${OT_SEEDS} T0 and ${Math.min(OT_SEEDS, 10)} T1 to T3 seeds of each set` : ''})`)
  md.push(`- Machine at the end: load ${meta.machineAtEnd.load.join(' ')}, swap ${meta.machineAtEnd.swap}`)
  if (meta.renderedFrom) md.push(`- Re-rendered from ${meta.renderedFrom}: same runs and steps, report text only`)
  md.push('')
  if (baseline) {
    const bm = meta.baseline
    md.push(`- Baseline: \`${bm.file}\` (label ${bm.label}, commit \`${bm.commit}\`, ${bm.seeds}, ${bm.date}). The Baseline column gives its value and result; where a P19 decision changed the measure or the target since, the cell ends with what the baseline was scored on. Change gives the result, baseline to now, and the main numbers, baseline to now (percentages where the seed counts differ).`)
    md.push('')
    md.push('| ID | Metric | Value | Target | Result | Baseline | Change |', '|---|---|---|---|---|---|---|')
    for (const m of metrics) {
      const b = m.baseline
      const bc = b ? `${esc(b.value)} (${b.result}${b.nameThen ? `; measured then as: ${esc(b.nameThen)}` : ''}${b.targetChanged ? `; target then: ${esc(b.target)}` : ''})` : '-'
      md.push(`| ${m.id} | ${esc(m.name)} | ${esc(m.value)} | ${esc(m.target)} | ${m.result} | ${bc} | ${esc(m.change)} |`)
    }
  } else {
    md.push('| ID | Metric | Value | Target | Result |', '|---|---|---|---|---|')
    for (const m of metrics) md.push(`| ${m.id} | ${esc(m.name)} | ${esc(m.value)} | ${esc(m.target)} | ${m.result} |`)
  }
  md.push('', '## Bot sets', '', '| Set | Config | Worlds | Runs |', '|---|---|---|---|')
  for (const [, s] of Object.entries(meta.sets)) md.push(`| ${esc(s.label)} | \`${s.pattern}\` | ${s.worlds.join(', ')} | ${s.runs} |`)
  md.push('', 'SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.', '')
  md.push('## Details', '')
  const det = (id) => metrics.find((m) => m.id === id)?.details
  if (det('A4')) {
    md.push('### A4 median alive per minute (smart+P)', '', 'Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median free-field alive [target band], x outside it, (n) runs alive through the minute with 10 s or more of free field; then the median over every step of the minute (cage and lull steps included).', '', `| World | ${Array.from({ length: 12 }, (_, i) => `${i}`).join(' | ')} |`, `|---|${'---|'.repeat(12)}`)
    for (const w of WORLDS) md.push(`| ${w} | ${det('A4')[w].mins.map((x) => `${x.median === null ? '-' : fmt(x.median, 0)}${x.band === 'cage' ? ' cage' : ` [${x.band}]${x.ok === false ? ' x' : ''}`} (${x.runs}); ${x.minuteMean === null ? '-' : fmt(x.minuteMean, 0)}${x.okMinute === false ? ' x' : ''}`).join(' | ')} |`)
    md.push('')
  }
  if (det('A6')) {
    md.push('### A6 fights per world', '', '| World | Focus mid1 | Focus mid2 | Focus final | Default mid fights over 150 s | Default PRIME fights over 150 s (no stalemate) | Default longest | Default fights over 150 s | Default fights ended by death |', '|---|---|---|---|---|---|---|---|---|')
    const c = (s) => (s ? `${fmt(s.median, 1)} s (${s.kills} kills, ${fmt(s.min, 1)} to ${fmt(s.max, 1)}; ${s.deaths} deaths)` : '-')
    for (const w of WORLDS) {
      const x = det('A6')[w]
      md.push(`| ${w} | ${c(x.focus?.mid1)} | ${c(x.focus?.mid2)} | ${c(x.focus?.final)} | ${x.defaultMidOver150} | ${x.defaultFinalOver150} | ${fmt(x.defaultLongest, 1)} s | ${x.defaultOver150.length ? esc(x.defaultOver150.join('; ')) : 'none'} | ${x.defaultFightsEndedByDeath}/${x.defaultFights} |`)
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
    md.push('### A3 by set', '', '| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |', '|---|---|---|---|---|---|---|')
    for (const [k, v] of Object.entries(det('A3').bySet)) md.push(`| ${esc(k)} | ${v.runs} | ${v.offRule} | ${v.maxAlive} | ${v.overRowCageMax ?? '-'} | ${v.overRowMax} | ${v.satMax} (${v.worst}) |`)
    md.push('', 'Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):', '', `| World | ${Array.from({ length: 12 }, (_, i) => `${i}`).join(' | ')} |`, `|---|${'---|'.repeat(12)}`)
    for (const [w, rows] of Object.entries(det('A3').byRow)) md.push(`| ${w} | ${rows.map((x) => (x === null ? '-' : x)).join(' | ')} |`)
    md.push('')
  }
  if (det('A14')) {
    md.push('### A14 hashes', '', '| Mode and world | Hashes (view) |', '|---|---|')
    for (const [k, v] of Object.entries(det('A14'))) md.push(`| ${k} | ${v.map((x) => `${x.hash} (${x.view}${x.end ? `, ${x.end} at ${x.time} s` : ''}${x.rerunMatch ? '' : ', RERUN DIFFERS'})`).join('; ')} |`)
    md.push('')
  }
  if (det('A15')) {
    md.push('### A15 machine state per perf run', '')
    if (meta.coolDown) md.push(`- Cool-down before the timing steps: ${meta.coolDown.waitedSec} s, then load ${meta.coolDown.load.join(' ')}, ${meta.coolDown.swap}`)
    for (const x of det('A15')) md.push(`- \`${x.args.join(' ')}\`: load ${x.machine.load.join(' ')}, ${x.machine.swap}; sim ${x.line?.simTimeStart} to ${x.line?.simTimeEnd} s; echo ${x.echoOk ? 'ok' : 'MISMATCH'}`)
    md.push('')
  }
  if (det('S3.2')) {
    md.push('### S3.2 allocation per scene', '', '| Scene | Total MB/s | Game MB/s | Sim functions over 0.1 MB/s | Within budget 1.0 |', '|---|---|---|---|---|')
    for (const x of det('S3.2').scenes) md.push(`| ${x.scene} | ${x.totalMBs} | ${x.gameMBs} | ${x.simOver.length ? esc(JSON.stringify(x.simOver)) : 'none'} | ${x.pass ? 'yes' : 'no'} |`)
    const g = det('S3.2').growth
    if (g) md.push('', `Heap growth (flood Hive, 80 s warm-up, forced GC before and after 60 s): ${g.beforeMB} to ${g.afterMB} MB, growth ${g.growthMB} MB, kept ${g.keptMB} MB.`)
    md.push('')
  }
  md.push('## Commands run', '', 'Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).', '', '```', ...shownCommands, '```', '')
  md.push(`Raw runs: \`${RUNS}\` (not kept). The JSON next to this file holds every metric's details.`, '')
  writeFileSync(join(out, `${LABEL}.md`), md.join('\n'))
}
