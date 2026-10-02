// Summarize playtest run JSONs into pacing metrics -> <dir>/summary.json (+ stdout table).
// Usage: node scripts/playtest/analyze.mjs [dir]   (default: scripts/playtest/playtest)
// matrix.mjs imports the per-run summary and the section 11 aggregates below.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'playtest')
/** src/config.ts STALEMATE_AFTER, and the slack at a run's end (see `fights` in summarize). */
const STALEMATE_AFTER = 210
const RUN_END_STALE = 0.1

/** Every run JSON in `dir`, summarized. */
export function loadSummaries(dir = DEFAULT_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'summary.json').sort()
  return files.map((f) => summarize(JSON.parse(readFileSync(join(dir, f), 'utf8')), f))
}

/** One run's pacing summary (`r` is a playtest.mjs output, `f` its file name). */
export function summarize(r, f) {
  const ev = r.events
  const lv = ev.filter((e) => e.type === 'levelup')
  const at = (t) => r.chunks.find((c) => Math.abs(c.t - t) < 0.05)
  const perMin = []
  const mins = Math.ceil(r.endTime / 60)
  for (let m = 0; m < mins; m++) {
    const lo = m * 60
    const hi = lo + 60
    const c = r.chunks.filter((c) => c.t > lo && c.t <= hi + 0.01)
    perMin.push({
      min: m + 1,
      levelUps: lv.filter((e) => e.t > lo && e.t <= hi).length,
      kills: c.reduce((s, x) => s + x.killsDelta, 0),
      maxEnemies: Math.max(0, ...c.map((x) => x.maxEnemiesChunk)),
      capFrac: c.length ? +(c.reduce((s, x) => s + x.capFrac, 0) / c.length).toFixed(2) : 0,
      dmgTaken: c.reduce((s, x) => s + x.dmgTaken, 0),
      aliveMean: c.length ? +(c.reduce((s, x) => s + x.aliveMean, 0) / c.length).toFixed(1) : null,
      // A4 free field: mean alive over the steps with no cage and no lull (the
      // row's minAlive in force); null when the minute had none or the run predates it.
      freeAliveMean: c.some((x) => x.freeSteps) ? +(c.reduce((s, x) => s + x.freeAliveSum, 0) / c.reduce((s, x) => s + x.freeSteps, 0)).toFixed(1) : null,
      freeSteps: c.reduce((s, x) => s + (x.freeSteps ?? 0), 0),
    })
  }
  // level-up gaps
  const lvTimes = [0, ...lv.map((e) => e.t), r.endTime]
  const lvGaps = []
  for (let i = 1; i < lvTimes.length; i++) {
    const g = lvTimes[i] - lvTimes[i - 1]
    if (g >= 60) lvGaps.push({ from: +lvTimes[i - 1].toFixed(1), to: +lvTimes[i].toFixed(1), gap: +g.toFixed(1) })
  }
  // "event" gaps: anything new happening for the player
  const firstSeenEv = Object.entries(r.firstSeen).map(([id, t]) => ({ t, type: 'newEnemy', id }))
  const meaningful = [...ev.filter((e) => ['levelup', 'equip', 'bossSpawn', 'bossKill', 'elite', 'revive'].includes(e.type)), ...firstSeenEv]
    .map((e) => e.t)
    .sort((a, b) => a - b)
  const evT = [0, ...meaningful, r.endTime]
  const stalls = []
  for (let i = 1; i < evT.length; i++) {
    const g = evT[i] - evT[i - 1]
    if (g >= 40) stalls.push({ from: +evT[i - 1].toFixed(1), to: +evT[i].toFixed(1), gap: +g.toFixed(1) })
  }
  // time on a pickup weapon
  let onPickup = 0
  let since = null
  for (const e of ev) {
    if (e.type === 'equip') {
      if (since === null) since = e.t
    } else if (e.type === 'revert') {
      if (since !== null) onPickup += e.t - since
      since = null
    }
  }
  if (since !== null) onPickup += r.endTime - since
  const bossSpawns = ev.filter((e) => e.type === 'bossSpawn')
  const bossKills = ev.filter((e) => e.type === 'bossKill')
  // Boss fights: each spawn runs until its kill, an ascend (the next spawn),
  // the stalemate, or the end of the run. A PRIME that arrives on its beat
  // (630.02 s) reaches STALEMATE_AFTER (210 s) 0.02 s after a 14-minute run
  // ends, so a final still open within RUN_END_STALE of 210 s at the run's end
  // counts as the stalemate it is about to be (P19 bosshp).
  const fights = bossSpawns.map((sp, i) => {
    const next = bossSpawns[i + 1]
    const end = ev.find((e) => e.t >= sp.t && (e.type === 'bossKill' || e.type === 'stalemate'))
    const endT = end && (!next || end.t <= next.t) ? end.t : next ? next.t : r.endTime
    let how = end && (!next || end.t <= next.t) ? (end.type === 'bossKill' ? 'kill' : 'stalemate') : next ? 'ascend' : r.dead ? 'death' : 'open'
    if (how === 'open' && sp.stage === 'final' && endT - sp.t >= STALEMATE_AFTER - RUN_END_STALE) how = 'stalemate'
    return { stage: sp.stage, spawnT: sp.t, endT, len: +(endT - sp.t).toFixed(2), how, dist: sp.dist, cage: sp.cage, inCage: sp.inCage, inArena: sp.inArena, hp: sp.hp }
  })
  // A PRIME that ascends from a living mid boss spawns in that boss's place
  // (section 4.1), not at the arrival distance; A5 leaves its distance out.
  for (let i = 1; i < fights.length; i++) fights[i].ascended = fights[i - 1].how === 'ascend'
  const killGaps = []
  for (let i = 0; i < fights.length - 1; i++) {
    if (fights[i].how === 'kill') killGaps.push(+(fights[i + 1].spawnT - fights[i].endT).toFixed(2))
  }
  const elites = ev.filter((e) => e.type === 'elite')
  const pods = ev.filter((e) => e.type === 'pod')
  const equips = ev.filter((e) => e.type === 'equip')
  const capChunk = r.chunks.find((c) => c.maxEnemiesChunk >= 700)
  return {
    file: f,
    arena: r.cfg.arena,
    mode: r.cfg.mode + (r.cfg.dash ? '+dash' : '') + (r.cfg.focus ? '+focus' : '') + ({ priority: '+P', random: '+R', evolve: '+E' }[r.cfg.perkPolicy] ?? ''),
    seed: r.cfg.seed,
    minutes: r.cfg.minutes ?? null,
    invincible: !!r.cfg.invincible,
    threat: r.cfg.threat ?? 0,
    ot: !!r.cfg.ot,
    otStart: r.otStart ?? null,
    otCycle: r.otCycle ?? 0,
    endTime: r.endTime,
    dead: r.dead,
    timeToDeath: r.dead ? r.endTime : null,
    finalLevel: r.level,
    kills: r.kills,
    killsPerMin: +(r.kills / (r.endTime / 60)).toFixed(1),
    firstLevelUp: lv[0]?.t ?? null,
    levelAt: { 60: at(60)?.level, 120: at(120)?.level, 180: at(180)?.level, 300: at(300)?.level, 480: at(480)?.level, 600: at(600)?.level, 660: at(660)?.level, 720: at(720)?.level },
    killsAt: { 300: at(300)?.kills, 600: at(600)?.kills },
    maxEnemies: r.maxEnemies,
    capFirstReachedChunkEnd: capChunk?.t ?? null,
    capStepFrac: +(r.capSteps / (r.endTime * 60)).toFixed(3),
    bossFirstSpawn: bossSpawns[0]?.t ?? null,
    bossSpawns: bossSpawns.map((e) => ({ t: e.t, id: e.id, hp: e.hp })),
    bossKills: bossKills.map((e) => e.t),
    fights,
    killGaps,
    won: !!r.won,
    stalemate: !!r.stalemate,
    elites: elites.length,
    eliteFirst: elites[0]?.t ?? null,
    elitesByMin: elites.map((e) => e.t),
    podsSeen: pods.length,
    podDropFailedAtPickupCap: r.podFails,
    pickupCapStepFrac: +((r.pickupCapSteps || 0) / (r.endTime * 60)).toFixed(3),
    levelUpsPerMin: perMin.map((m) => m.levelUps),
    killsPerMinSeries: perMin.map((m) => m.kills),
    podsFromKills: pods.filter((p) => p.src === 'kill').length,
    podIds: pods.map((p) => p.id),
    equips: equips.map((e) => `${e.t}:${e.id}`),
    secondsOnPickupWeapon: +onPickup.toFixed(1),
    xpDropped: r.xpDropped,
    xpCollected: r.xpCollected,
    xpCollectFrac: r.xpCollectFrac,
    xpCollectFrac30: r.xpCollectFrac30,
    xpCollectFracPrime: xpToPrimeEnd(r),
    firstDraftAt: r.firstDraftAt,
    firstFusionAt: r.firstFusionAt,
    dmgTaken: r.dmgTaken,
    healed: r.healed,
    coresTaken: r.coresTaken ?? 0,
    evolutions: r.evolutions ?? [],
    maxSpeedByType: r.maxSpeedByType ?? {},
    hzSteps: r.hzSteps ?? null,
    dashes: r.dashes ?? 0,
    closeCalls: r.closeCalls ?? 0,
    closeCallsPerMin: +((r.closeCalls ?? 0) / (r.endTime / 60)).toFixed(2),
    fromHalfHp: r.death?.fromHalfHp ?? null,
    a3: r.beats ? beatFidelity(r) : null,
    a3Density: r.beats
      ? {
          maxAlive: r.maxEnemies,
          overRowMax: Math.max(-Infinity, ...r.chunks.map((c) => c.overRowMax ?? -Infinity)),
          overRowCage: r.overRowCage ?? null,
          satFrac: r.a3Base ? +(r.a3Sat / r.a3Base).toFixed(3) : 0,
          eventUnitsMax: r.eventUnitsMax,
        }
      : null,
    frozenSteps: r.frozenSteps,
    a3Chunks: r.chunks.filter((c) => c.a3Base !== undefined).map((c) => ({ t: c.t, a3Base: c.a3Base, a3Sat: c.a3Sat })),
    perMin,
    levelUpGapsOver60s: lvGaps,
    stallsOver40s: stalls,
    firstSeen: r.firstSeen,
    perks: r.perks,
    death: r.death,
    wallSeconds: r.wallSeconds,
  }
}
/**
 * A18 XP up to the PRIME's end (P19 density): a win ends the run 2 s after
 * the PRIME kill, so the PRIME's own gem (240 to 260 XP) is never collected.
 * A run with a PRIME kill counts the XP dropped and collected just before the
 * kill step; any other run (a stalemate, a death, a run still open at its
 * end) counts the whole run. Null for an older run JSON whose bossKill events
 * carry no XP.
 */
function xpToPrimeEnd(r) {
  const k = r.events.find((e) => e.type === 'bossKill' && e.stage === 'final')
  if (!k) return r.xpCollectFrac
  if (k.xpDropped === undefined) return null
  return +(k.xpCollected / Math.max(1, k.xpDropped)).toFixed(4)
}

/**
 * A3: replay the deferral rules (section 4.1) over the run's own cage
 * intervals and compare each beat's fire time with where the rules put it.
 * An elite or event beat due while a cage is up waits; each boss kill
 * schedules every held beat, in beat order, 10 s after the kill and 12 s
 * apart (a held beat still waiting when the next cage rises waits for that
 * fight's kill); an event more than 60 s late is dropped; a lull inside a cage is
 * skipped. Bosses arrive at max(at, last kill + 20), mid2 not after 570 s.
 */
function beatFidelity(r) {
  const TICK = 1 / 60 + 1e-2
  // Cage intervals from the run's own boss log. Within one tick the director
  // fires due beats, then held beats, then raises a cage; a kill comes later
  // in the tick, so at equal times: beat, open, kill.
  const moments = []
  let open = false
  for (const e of r.events) {
    if (e.type === 'bossSpawn' && !open) {
      open = true
      moments.push({ t: e.t, type: 1 })
    } else if ((e.type === 'bossKill' || e.type === 'stalemate' || e.type === 'win') && open) {
      open = false
      moments.push({ t: e.t, type: 2, schedule: e.type === 'bossKill' && e.stage !== 'final' })
    }
  }
  const beats = r.beats
  for (const b of beats) if (b.kind === 'elite' || b.kind === 'event') moments.push({ t: b.at, type: 0, b })
  moments.sort((a, b) => a.t - b.t || a.type - b.type)
  const want = new Map()
  const cageSpans = []
  let held = []
  let cageOn = false
  let openedAt = 0
  const flush = (T) => {
    if (cageOn) return
    held.sort((a, b) => a.due - b.due)
    const keep = []
    for (const h of held) {
      if (!Number.isNaN(h.due) && h.due <= T + 1e-9) want.set(h.b.i, h.b.kind === 'event' && h.due - h.b.at > 60 ? -1 : h.due)
      else keep.push(h)
    }
    held = keep
  }
  for (const m of moments) {
    flush(m.t)
    if (m.type === 0) {
      if (cageOn) held.push({ b: m.b, due: NaN })
      else want.set(m.b.i, m.b.at)
    } else if (m.type === 1) {
      cageOn = true
      openedAt = m.t
      // A held beat not yet due when the next cage rises waits again, for
      // that fight's kill (directorBossKilled reschedules every held beat).
      for (const h of held) h.due = NaN
    } else {
      cageOn = false
      cageSpans.push([openedAt, m.t])
      if (m.schedule) {
        held.sort((a, b) => a.b.i - b.b.i)
        let at = m.t + 10
        for (const h of held) {
          h.due = at
          at += 12
        }
      }
    }
  }
  if (cageOn) cageSpans.push([openedAt, Infinity])
  flush(r.endTime)
  const caged = (t) => cageSpans.some(([a, b]) => t >= a && t <= b)
  const kills = moments.filter((m) => m.type === 2 && m.schedule).map((m) => m.t)
  const res = []
  for (const b of beats) {
    let w = want.has(b.i) ? want.get(b.i) : null
    if (b.kind === 'pack') w = b.at
    else if (b.kind === 'lull') w = caged(b.at) ? -1 : b.at
    else if (b.kind === 'boss') {
      const until = b.firedAt !== null && b.firedAt >= 0 ? b.firedAt + TICK : r.endTime + TICK
      const prior = kills.filter((k) => k < until)
      const arrive = Math.max(b.at, (prior.length ? prior[prior.length - 1] : -Infinity) + 20)
      w = b.id === 'mid2' && arrive > 570 ? -1 : arrive
    }
    // A beat due within a tick of the run's end may not have fired yet (the
    // run's end time is rounded to 0.01 s): it counts as not reached when it
    // did not fire (P19 density: Hive seed 4004 died at 374.98, the 6:15 elite).
    const fired = b.firedAt
    const reached = w !== null && (w < 0 || w <= r.endTime + TICK) && !(fired === null && w >= 0 && w > r.endTime - TICK)
    let ok
    if (!reached) ok = fired === null
    else if (w < 0) ok = fired === -1 || fired === null
    else ok = fired !== null && fired >= 0 && Math.abs(fired - w) <= TICK
    // A kill logged at the beat's own time (event times are rounded to 0.01 s)
    // may have come in the tick before the beat was due: the beat then fires on
    // time with the cage down, which the replay's order (beat before kill)
    // cannot tell apart (P19 density: Wastes roam seed 10010, mid2 killed at
    // 550.00, the 9:10 elite fired at 550.017).
    if (!ok && (b.kind === 'elite' || b.kind === 'event') && fired !== null && fired >= 0 && Math.abs(fired - b.at) <= TICK && kills.some((k) => Math.abs(k - b.at) <= 0.01)) ok = true
    res.push({ i: b.i, label: b.kind === 'boss' || b.kind === 'event' ? b.id : b.kind, at: b.at, fired, want: w === null ? null : +w.toFixed(2), ok })
  }
  return res
}


export const median = (a) => {
  if (!a.length) return null
  const v = [...a].sort((x, y) => x - y)
  const m = v.length >> 1
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** A5 arrivals and A6 fight lengths per stage, and the kill-to-next-arrival gaps. */
export function fightStats(out) {
  const fights = out.flatMap((s) => s.fights.map((f) => ({ ...f, run: s.file })))
  if (!fights.length) return null
  const placed = fights.filter((f) => !f.ascended)
  const dists = placed.map((f) => f.dist)
  const bad = fights.filter((f) => (!f.ascended && (f.dist < 250 || f.dist > 340)) || !f.cage || !f.inCage || !f.inArena)
  const stages = {}
  for (const stage of ['mid1', 'mid2', 'final']) {
    const k = fights.filter((f) => f.stage === stage && f.how === 'kill').map((f) => f.len)
    stages[stage] = {
      kills: k.length,
      median: median(k),
      min: k.length ? Math.min(...k) : null,
      max: k.length ? Math.max(...k) : null,
      lens: k,
      unfinished: fights.filter((f) => f.stage === stage && f.how !== 'kill').map((f) => ({ how: f.how, len: f.len, run: f.run })),
    }
  }
  const gaps = out.flatMap((s) => s.killGaps)
  return {
    fights,
    arrivals: { n: fights.length, ascended: fights.length - placed.length, distMin: Math.min(...dists), distMax: Math.max(...dists), cageInside: fights.filter((f) => f.cage && f.inCage).length, inArena: fights.filter((f) => f.inArena).length, bad },
    stages,
    gaps: { n: gaps.length, min: gaps.length ? Math.min(...gaps) : null },
  }
}

/** A3 beat fidelity and density over the runs that carry beats (OVERTIME runs have their own rows after the win, so they stay out). */
export function a3Stats(out) {
  const runs = out.filter((s) => s.a3 && !s.ot)
  if (!runs.length) return null
  const per = runs.map((s) => {
    const off = s.a3.filter((b) => !b.ok)
    const d = s.a3Density
    return { file: s.file, mode: s.mode, ok: s.a3.length - off.length, total: s.a3.length, off: off.length, ...d, beats: s.a3 }
  })
  return {
    runs: per,
    offRule: per.reduce((n, p) => n + p.off, 0),
    maxAlive: Math.max(...per.map((p) => p.maxAlive)),
    overRowMax: Math.max(...per.map((p) => p.overRowMax)),
    overRowCageMax: per.some((p) => p.overRowCage === null) ? null : Math.max(...per.map((p) => p.overRowCage)),
    satMax: Math.max(...per.map((p) => p.satFrac)),
  }
}

/** A10 readable deaths: seconds from the last moment at 50%+ HP to death. */
export function a10Stats(out) {
  const v = out.map((s) => s.fromHalfHp).filter((x) => x !== null).sort((a, b) => a - b)
  if (!v.length) return null
  return { deaths: v.length, median: median(v), min: v[0] }
}

/** A12 ladder: win rate per world, bot and THREAT level. An OVERTIME run counts its win before OVERTIME. */
export function ladderStats(out) {
  const ladder = new Map()
  for (const s of out) {
    const k = `${s.arena} ${s.mode}`
    if (!ladder.has(k)) ladder.set(k, new Map())
    const byT = ladder.get(k)
    if (!byT.has(s.threat)) byT.set(s.threat, { runs: 0, wins: 0, ends: [] })
    const e = byT.get(s.threat)
    e.runs++
    if (s.won) e.wins++
    e.ends.push(s.ot && s.won ? s.otStart : s.endTime)
  }
  return [...ladder.entries()].map(([key, byT]) => ({
    key,
    byThreat: [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([threat, e]) => ({ threat, runs: e.runs, wins: e.wins, medianEnd: median(e.ends) })),
  }))
}

/** A13 OVERTIME end over the runs that won and went on (cfg.ot): dead by 20:00 (1200 s), alive past 24:00 (1440 s).
 *  Per OVERTIME set too: set n holds T0 seeds 1001 x 30(n-1)+1..30n and T1 to T3 seeds 1001 x 10(n-1)+1..10n. */
export function a13Stats(out) {
  const runs = out.filter((s) => s.ot && s.won)
  if (!runs.length) return null
  const count = (rs) => ({ n: rs.length, by20: rs.filter((s) => s.dead && s.endTime <= 1200).length, past24: rs.filter((s) => !s.dead || s.endTime > 1440).length })
  const setOf = (s) => Math.ceil(s.seed / 1001 / (s.threat ? 10 : 30))
  const bySet = {}
  for (const k of [...new Set(runs.map(setOf))].sort((a, b) => a - b)) bySet[k] = count(runs.filter((s) => setOf(s) === k))
  return {
    runs: runs.map((s) => ({ file: s.file, set: setOf(s), otStart: s.otStart, otCycle: s.otCycle, dead: s.dead, endTime: s.endTime, level: s.finalLevel })),
    ...count(runs),
    bySet,
  }
}

function printReport(out) {
  for (const s of out) {
    console.log(
      [
        s.arena.padEnd(6),
        (s.mode + (s.threat ? ' T' + s.threat : '') + (s.ot ? ' OT' : '')).padEnd(8),
        String(s.seed).padEnd(5),
        `end=${s.endTime}${s.dead ? ' DEAD' : ''}`,
        `L=${s.finalLevel}`,
        `firstLv=${s.firstLevelUp}`,
        `L@1/2/3/5/8/10/12=${[60, 120, 180, 300, 480, 600, 720].map((t) => s.levelAt[t] ?? '-').join('/')}`,
        `kpm=${s.killsPerMin}`,
        `max=${s.maxEnemies} cap@${s.capFirstReachedChunkEnd} capFrac=${s.capStepFrac}`,
        `boss1=${s.bossFirstSpawn} bosses=${s.bossSpawns.length} killed=${s.bossKills.length}`,
        `elites=${s.elites}`,
        `pods=${s.podsSeen}(kill ${s.podsFromKills}) equips=${s.equips.length} onPickup=${s.secondsOnPickupWeapon}s`,
        `xp=${(s.xpCollectFrac * 100).toFixed(1)}% draft1=${s.firstDraftAt} fusion=${s.firstFusionAt ?? '-'}`,
        `podFail=${s.podDropFailedAtPickupCap} pkCap=${s.pickupCapStepFrac}`,
        `lv/min=${s.levelUpsPerMin.join(',')}`,
        `dash=${s.dashes} cc/min=${s.closeCallsPerMin}`,
        `50%->death=${s.fromHalfHp ?? '-'}s`,
      ].join(' | '),
    )
  }
  // A5 arrivals, A6 fight lengths and the wins (docs/NEXT-LEVEL.md section 11).
  const fs = fightStats(out)
  if (fs) {
    const a = fs.arrivals
    console.log(`A5 arrivals=${a.n} dist min=${a.distMin} max=${a.distMax} cage+inside=${a.cageInside} inArena=${a.inArena} bad=${a.bad.length} (pass: 250 to 340 u, cage active the same tick, boss inside the walls)`)
    for (const f of a.bad) console.log(`  A5 outlier ${f.run} ${f.stage} t=${f.spawnT} dist=${f.dist} cage=${f.cage} inCage=${f.inCage} inArena=${f.inArena}`)
    for (const [stage, st] of Object.entries(fs.stages)) {
      console.log(`A6 ${stage} kills=${st.kills} median=${st.median} min=${st.min ?? '-'} max=${st.max ?? '-'} lens=[${st.lens.join(', ')}] unfinished=[${st.unfinished.map((u) => `${u.how}@${u.len}`).join(', ')}]`)
    }
    console.log(`A6 kill-to-next-arrival gaps=${fs.gaps.n} min=${fs.gaps.min ?? '-'} (pass: at least 20 s)`)
  }
  console.log(`WINS ${out.filter((s) => s.won).length}/${out.length} stalemates=${out.filter((s) => s.stalemate).length} runs: ${out.filter((s) => s.won).map((s) => s.file).join(', ')}`)

  // A3 beat fidelity: each beat fired on time or where the deferral rules put it.
  const a3 = a3Stats(out)
  if (a3) {
    for (const p of a3.runs) {
      const line = p.beats.map((b) => `${b.label}@${b.at}${b.fired === null ? ':-' : b.fired < 0 ? ':drop' : b.fired === b.at ? '' : ':' + b.fired}${b.ok ? '' : '(want ' + b.want + ')'}`).join(' ')
      console.log(`A3 ${p.file} ok=${p.ok}/${p.total} alive max=${p.maxAlive} overRow=${p.overRowMax} sat=${p.satFrac} evUnits=${p.eventUnitsMax} | ${line}`)
    }
    console.log(`A3 beats off-rule=${a3.offRule} (pass: 0); alive max=${a3.maxAlive} (pass: <= 610); over row maxAlive max=${a3.overRowMax} (pass: <= 160); saturated share max=${a3.satMax} (pass: <= 0.25)`)
  }

  const a10 = a10Stats(out)
  if (a10) console.log(`A10 deaths=${a10.deaths} median=${a10.median.toFixed(2)}s min=${a10.min.toFixed(2)}s (pass: median >= 3.0, min >= 1.2)`)

  // A12 ladder (T4 at most 15% and below T0; T1 at most T0).
  for (const { key, byThreat } of ladderStats(out)) {
    if (byThreat.length < 2) continue
    console.log(`A12 ${key}: ${byThreat.map((e) => `T${e.threat} ${e.wins}/${e.runs} (${Math.round((100 * e.wins) / e.runs)}%) median end ${e.medianEnd}`).join(' | ')}`)
  }

  // A13 OVERTIME end: 90% or more dead by 20:00, none alive past 24:00.
  const a13 = a13Stats(out)
  if (a13) {
    for (const s of a13.runs) console.log(`A13 ${s.file} clear->OT at ${s.otStart} cycle ${s.otCycle} ${s.dead ? 'dead' : 'ALIVE'} at ${s.endTime} (${(s.endTime / 60).toFixed(2)} min) L${s.level}`)
    console.log(`A13 OT runs=${a13.n} dead by 20:00 ${a13.by20} (${Math.round((100 * a13.by20) / a13.n)}%, pass >= 90%); alive past 24:00 or unfinished ${a13.past24} (pass: 0)`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_DIR
  const out = loadSummaries(dir)
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(out, null, 1))
  printReport(out)
}
