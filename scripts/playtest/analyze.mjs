// Summarize playtest/*.json into pacing metrics -> playtest/summary.json (+ stdout table).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'playtest')
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'summary.json').sort()
const out = []
for (const f of files) {
  const r = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
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
  const elites = ev.filter((e) => e.type === 'elite')
  const pods = ev.filter((e) => e.type === 'pod')
  const equips = ev.filter((e) => e.type === 'equip')
  const capChunk = r.chunks.find((c) => c.maxEnemiesChunk >= 700)
  out.push({
    file: f,
    arena: r.cfg.arena,
    mode: r.cfg.mode + (r.cfg.dash ? '+dash' : '') + ({ priority: '+P', random: '+R', evolve: '+E' }[r.cfg.perkPolicy] ?? ''),
    seed: r.cfg.seed,
    endTime: r.endTime,
    dead: r.dead,
    timeToDeath: r.dead ? r.endTime : null,
    finalLevel: r.level,
    kills: r.kills,
    killsPerMin: +(r.kills / (r.endTime / 60)).toFixed(1),
    firstLevelUp: lv[0]?.t ?? null,
    levelAt: { 60: at(60)?.level, 120: at(120)?.level, 180: at(180)?.level, 300: at(300)?.level, 480: at(480)?.level, 600: at(600)?.level, 720: at(720)?.level },
    killsAt: { 300: at(300)?.kills, 600: at(600)?.kills },
    maxEnemies: r.maxEnemies,
    capFirstReachedChunkEnd: capChunk?.t ?? null,
    capStepFrac: +(r.capSteps / (r.endTime * 60)).toFixed(3),
    bossFirstSpawn: bossSpawns[0]?.t ?? null,
    bossSpawns: bossSpawns.map((e) => ({ t: e.t, id: e.id, hp: e.hp })),
    bossKills: bossKills.map((e) => e.t),
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
    firstDraftAt: r.firstDraftAt,
    firstFusionAt: r.firstFusionAt,
    dmgTaken: r.dmgTaken,
    healed: r.healed,
    dashes: r.dashes ?? 0,
    closeCalls: r.closeCalls ?? 0,
    closeCallsPerMin: +((r.closeCalls ?? 0) / (r.endTime / 60)).toFixed(2),
    fromHalfHp: r.death?.fromHalfHp ?? null,
    frozenSteps: r.frozenSteps,
    perMin,
    levelUpGapsOver60s: lvGaps,
    stallsOver40s: stalls,
    firstSeen: r.firstSeen,
    perks: r.perks,
    death: r.death,
    wallSeconds: r.wallSeconds,
  })
}
writeFileSync(join(DIR, 'summary.json'), JSON.stringify(out, null, 1))
for (const s of out) {
  console.log(
    [
      s.arena.padEnd(6),
      s.mode.padEnd(8),
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
// A10 readable deaths: seconds from the last moment at 50%+ HP to death.
const readable = out.map((s) => s.fromHalfHp).filter((v) => v !== null).sort((a, b) => a - b)
if (readable.length) {
  const mid = readable.length >> 1
  const median = readable.length % 2 ? readable[mid] : (readable[mid - 1] + readable[mid]) / 2
  console.log(`A10 deaths=${readable.length} median=${median.toFixed(2)}s min=${readable[0].toFixed(2)}s (pass: median >= 3.0, min >= 1.2)`)
}
