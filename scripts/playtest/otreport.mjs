// OVERTIME report (section 11 A13, section 4.1): every OVERTIME run in a runs
// directory (configs with :ot that won), with the death cycle, the share of
// OVERTIME spent in a boss cage, damage and healing per cycle, the bonus drop
// rate in OVERTIME (whole run and the busiest 60 s and 120 s windows), and the
// OVERTIME beats that fired late or were dropped. Prints A13 per set. The
// bonus rate per run counts runs with 120 s or more of OVERTIME.
//
// Usage: node scripts/playtest/otreport.mjs <runs dir> [--json=FILE] [--md=FILE] [--runs]
//   --runs prints one line per run; --json writes the numbers; --md writes the
//   summary and the per-run table as Markdown.
// Set 1: T0 seeds 1001 x 1..30, T1 to T3 1001 x 1..10. Set 2: T0 1001 x 31..60,
// T1 to T3 1001 x 11..20; set n in general T0 30(n-1)+1..30n, T1 to T3
// 10(n-1)+1..10n (matrix.mjs, the section 11 A12/A13 note). Sets and death
// cycles are counted per world (P19 review: A13 in Depths and Wastes too).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const dir = args.find((a) => !a.startsWith('--'))
const jsonOut = args.find((a) => a.startsWith('--json='))?.slice(7)
const mdOut = args.find((a) => a.startsWith('--md='))?.slice(5)
const perRun = args.includes('--runs')
if (!dir) throw new Error('usage: otreport.mjs <runs dir>')

const CYCLE = 180
const setOf = (threat, k) => Math.ceil(k / (threat === 0 ? 30 : 10))
const median = (a) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const r1 = (x) => (x === null || x === undefined ? null : +x.toFixed(1))
const r2 = (x) => (x === null || x === undefined ? null : +x.toFixed(2))

const runs = []
for (const f of readdirSync(dir)) {
  if (!f.endsWith('_ot.json')) continue
  const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  if (!r.cfg?.ot || r.otStart === null || r.otStart === undefined) continue
  const k = r.cfg.seed / 1001
  const ot0 = r.otStart
  const end = r.endTime
  const otSec = end - ot0
  // Damage and healing per cycle from the 30 s chunks (a chunk counts in the cycle it ends in).
  const byCycle = {}
  for (const c of r.chunks) {
    if (c.t <= ot0 + 1e-6) continue
    const cy = Math.max(1, Math.floor((c.t - 1e-6 - ot0) / CYCLE) + 1)
    const e = (byCycle[cy] ??= { dmg: 0, heal: 0, minHpFrac: 1, maxAlive: 0, bossSteps: 0 })
    e.dmg += c.dmgTaken
    e.heal += c.healed
    if (c.hp !== null && c.maxHp) e.minHpFrac = Math.min(e.minHpFrac, c.hp / c.maxHp)
    e.maxAlive = Math.max(e.maxAlive, c.maxEnemiesChunk)
  }
  for (const h of r.hpHist ?? []) {
    if (h[0] <= ot0) continue
    const cy = Math.max(1, Math.floor((h[0] - ot0) / CYCLE) + 1)
    if (byCycle[cy]) byCycle[cy].minHpFrac = Math.min(byCycle[cy].minHpFrac, h[1] / h[2])
  }
  // Bonus drops in OVERTIME: whole-run rate and the busiest windows.
  const drops = r.events.filter((e) => e.type === 'bonus' && e.t > ot0).map((e) => e.t)
  // The same run before the win, from 2:00 (P9's band is measured from 2:00 to the win).
  const preDrops = r.events.filter((e) => e.type === 'bonus' && e.t >= 120 && e.t <= ot0).map((e) => e.t)
  const busiest = (win, ds = drops) => {
    let best = 0
    for (let i = 0; i < ds.length; i++) {
      let n = 0
      for (let j = i; j < ds.length && ds[j] < ds[i] + win; j++) n++
      if (n > best) best = n
    }
    return best
  }
  const otBeats = r.events.filter((e) => e.type === 'otBeat')
  const bossRetreats = r.events.filter((e) => e.type === 'alert' && e.kind === 'boss' && /ESCAPED/.test(e.title ?? '')).length
  const otBossKills = r.events.filter((e) => e.type === 'bossKill' && e.stage === 'overtime').length
  runs.push({
    file: f,
    world: r.cfg.arena,
    threat: r.cfg.threat,
    seed: r.cfg.seed,
    k,
    set: setOf(r.cfg.threat, k),
    otStart: ot0,
    end,
    dead: r.dead,
    otSec: r1(otSec),
    deathCycle: r.dead ? Math.floor((end - ot0) / CYCLE) + 1 : null,
    by20: r.dead && end <= 1200,
    past24: !r.dead || end > 1440,
    caged: r.otSteps ? r2(r.otCagedSteps / r.otSteps) : null,
    byCycle: Object.fromEntries(Object.entries(byCycle).map(([c, e]) => [c, { dmg: Math.round(e.dmg), heal: Math.round(e.heal), minHpFrac: r2(e.minHpFrac), maxAlive: e.maxAlive }])),
    bonus: { n: drops.length, perMin: otSec >= 120 ? r2(drops.length / (otSec / 60)) : null, max60: busiest(60), max120: busiest(120), max180: busiest(180), prePerMin: r2(preDrops.length / ((ot0 - 120) / 60)), preMax120: busiest(120, preDrops) },
    otBossKills,
    bossRetreats,
    beats: otBeats.map((e) => ({ cycle: e.cycle, kind: e.kind, id: e.id, mirror: e.mirror, late: e.late, result: e.result, due: e.due, t: e.t })),
    level: r.level,
    evolutions: r.evolutions,
    perkStacks: r.perkStacks,
    maxHp: r.chunks.at(-1)?.maxHp ?? null,
  })
}
const WORLD_ORDER = ['hive', 'depths', 'wastes']
const wi = (w) => (WORLD_ORDER.indexOf(w) + 4) % 4
runs.sort((a, b) => wi(a.world) - wi(b.world) || a.set - b.set || a.threat - b.threat || a.k - b.k)

// Keyed '<world> <set>' (a world's sets in order).
const sets = {}
for (const r of runs) {
  const key = `${r.world} ${r.set}`
  const e = (sets[key] ??= { n: 0, by20: 0, past24: 0 })
  e.n++
  if (r.by20) e.by20++
  if (r.past24) e.past24++
}
const both = runs
const deathCycles = {}
for (const r of both) {
  const key = `${r.world} ${r.dead ? `c${r.deathCycle}` : 'alive'}`
  deathCycles[key] = (deathCycles[key] ?? 0) + 1
}
const late = both.filter((r) => r.dead && r.end > 1200)
const rates = both.map((r) => r.bonus.perMin).filter((x) => x !== null)
const beatAll = both.flatMap((r) => r.beats.map((b) => ({ ...b, run: r.file })))
const beatStats = {
  fired: beatAll.filter((b) => b.result === 'fired').length,
  dropped: beatAll.filter((b) => b.result === 'dropped'),
  lateMax: Math.max(0, ...beatAll.filter((b) => b.result === 'fired').map((b) => b.late)),
}
const out = {
  dir,
  sets,
  total: { n: both.length, by20: both.filter((r) => r.by20).length, past24: both.filter((r) => r.past24).length },
  deathCycles,
  medianOtSec: median(both.map((r) => r.otSec)),
  medianCaged: median(both.map((r) => r.caged).filter((x) => x !== null)),
  bonus: {
    medianPerMin: r2(median(rates)),
    maxPerMin: r2(Math.max(0, ...rates)),
    over3: both.filter((r) => r.bonus.perMin !== null && r.bonus.perMin > 3).map((r) => `${r.file} ${r.bonus.n} in ${r.otSec} s`),
    max120: Math.max(0, ...both.map((r) => r.bonus.max120)),
    medianMax120: median(both.map((r) => r.bonus.max120)),
    pre: { medianPerMin: r2(median(both.map((r) => r.bonus.prePerMin))), maxPerMin: r2(Math.max(0, ...both.map((r) => r.bonus.prePerMin))), medianMax120: median(both.map((r) => r.bonus.preMax120)), max120: Math.max(0, ...both.map((r) => r.bonus.preMax120)) },
    max180: Math.max(0, ...both.map((r) => r.bonus.max180)),
  },
  beats: { fired: beatStats.fired, dropped: beatStats.dropped.length, droppedList: beatStats.dropped.map((b) => `${b.run} c${b.cycle} ${b.kind}${b.mirror ? ' mirror' : ''} ${b.id ?? ''} due ${b.due} at ${b.t}`), lateMax: beatStats.lateMax },
  lateRuns: late.map((r) => ({ file: r.file, end: r.end, caged: r.caged, byCycle: r.byCycle, evolutions: r.evolutions, perkStacks: r.perkStacks })),
  survivors: both.filter((r) => !r.dead).map((r) => ({ file: r.file, caged: r.caged, byCycle: r.byCycle, evolutions: r.evolutions, perkStacks: r.perkStacks, maxHp: r.maxHp, level: r.level })),
  runs,
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1))

const mmss = (s) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)
for (const [s, e] of Object.entries(sets)) console.log(`set ${s}: ${e.by20}/${e.n} (${pct(e.by20, e.n)}%) dead by 20:00, ${e.past24} alive past 24:00`)
console.log(`A13 sets ${Object.keys(sets).join('+')}: ${out.total.by20}/${out.total.n} (${pct(out.total.by20, out.total.n)}%) dead by 20:00, ${out.total.past24} past 24:00; death cycle ${JSON.stringify(deathCycles)}; median OT ${out.medianOtSec} s, caged ${out.medianCaged}`)
console.log(`bonus in OT: median ${out.bonus.medianPerMin}/min, max ${out.bonus.maxPerMin}/min, busiest 120 s ${out.bonus.max120} (median ${out.bonus.medianMax120}), 180 s ${out.bonus.max180}; runs over 3/min: ${out.bonus.over3.length ? out.bonus.over3.join('; ') : 'none'}; same runs 2:00 to the win: median ${out.bonus.pre.medianPerMin}/min, max ${out.bonus.pre.maxPerMin}, busiest 120 s ${out.bonus.pre.max120} (median ${out.bonus.pre.medianMax120})`)
console.log(`OT beats: ${out.beats.fired} fired (latest ${out.beats.lateMax} s late), ${out.beats.dropped} dropped${out.beats.dropped ? ': ' + out.beats.droppedList.slice(0, 12).join('; ') : ''}`)
for (const r of [...late, ...both.filter((x) => !x.dead)]) {
  console.log(`late ${r.file} ${r.dead ? 'dead ' + mmss(r.end) : 'ALIVE'} caged ${r.caged} L${r.level} maxHp ${r.maxHp} evo ${r.evolutions.join(',')} perks ${JSON.stringify(r.perkStacks)}`)
  console.log(`   per cycle ${Object.entries(r.byCycle).map(([c, e]) => `c${c} dmg ${e.dmg} heal ${e.heal} minHp ${e.minHpFrac} alive ${e.maxAlive}`).join(' | ')}`)
}
if (perRun) {
  for (const r of runs) {
    console.log(`${r.file.padEnd(40)} set ${r.set} T${r.threat} OT ${mmss(r.otStart)} ${r.dead ? 'dead ' + mmss(r.end) + ' c' + r.deathCycle : 'ALIVE ' + mmss(r.end)} caged ${r.caged} bonus ${r.bonus.n} (${r.bonus.perMin}/min, 120 s max ${r.bonus.max120}) kills ${r.otBossKills} retreats ${r.bossRetreats} beats ${r.beats.filter((b) => b.result === 'dropped').length} dropped`)
  }
}

if (mdOut) {
  const md = [`# OVERTIME report: ${dir}`, '', `Command: \`node scripts/playtest/otreport.mjs ${args.join(' ')}\``, '']
  md.push('| World and set | Dead by 20:00 | Alive past 24:00 |', '|---|---|---|')
  for (const [s, e] of Object.entries(sets)) md.push(`| ${s} | ${e.by20}/${e.n} (${pct(e.by20, e.n)}%) | ${e.past24} |`)
  md.push('', `- Death cycle: ${JSON.stringify(deathCycles)}; median time in OVERTIME ${out.medianOtSec} s; median caged share ${out.medianCaged}.`)
  md.push(`- Bonus drops in OVERTIME (per run with 120 s or more of it): median ${out.bonus.medianPerMin} a minute, max ${out.bonus.maxPerMin}; busiest 120 s window ${out.bonus.max120} (median ${out.bonus.medianMax120}), busiest 180 s ${out.bonus.max180}; runs over 3 a minute: ${out.bonus.over3.length ? out.bonus.over3.join('; ') : 'none'}. The same runs from 2:00 to the win: median ${out.bonus.pre.medianPerMin} a minute, max ${out.bonus.pre.maxPerMin}; busiest 120 s window ${out.bonus.pre.max120} (median ${out.bonus.pre.medianMax120}).`)
  md.push(`- OVERTIME beats: ${out.beats.fired} fired (the latest ${out.beats.lateMax} s late), ${out.beats.dropped} dropped${out.beats.dropped ? ': ' + out.beats.droppedList.join('; ') : ''}.`, '')
  md.push('| Run | Set | T | OVERTIME from | End | Cycle | Caged | Bonus drops (per min) | OT boss kills, retreats | Damage / healing per cycle |', '|---|---|---|---|---|---|---|---|---|---|')
  for (const r of runs) {
    const cyc = Object.entries(r.byCycle).map(([c, e]) => `c${c} ${e.dmg}/${e.heal}`).join(', ')
    md.push(`| ${r.file.replace('.json', '')} | ${r.set} | ${r.threat} | ${mmss(r.otStart)} | ${r.dead ? 'dead ' + mmss(r.end) : 'ALIVE ' + mmss(r.end)} | ${r.dead ? r.deathCycle : r.byCycle ? Object.keys(r.byCycle).length : '-'} | ${r.caged} | ${r.bonus.n} (${r.bonus.perMin ?? '-'}) | ${r.otBossKills}, ${r.bossRetreats} | ${cyc} |`)
  }
  writeFileSync(mdOut, md.join('\n') + '\n')
}
