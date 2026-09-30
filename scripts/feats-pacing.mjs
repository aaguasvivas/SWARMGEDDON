// Feat pacing model (A12, section 10.3 P12b): plays a synthetic player through
// sessions S1 to S12 on the real save code (lifetime stats, feats, grants and
// pools, over an in-memory store; Node 22.18+ type stripping, no browser) and
// reports what each session unlocks. Fails unless every session S1 to S10
// unlocks at least one thing.
//
// Usage: node scripts/feats-pacing.mjs [--json]
//
// The model. Fixed by A12: a session is 15 min of run time over 4 runs, and
// session 1 is 10 min over 5 runs; kills come at 250 per minute. Assumed here
// (each one is a knob of the model, not a measurement):
//   - run lengths per session: RUN_TIMES below; the best run grows from 3:00
//     in S1 through 5:00 in S3 to a clear (11:20) from S7, which puts FIRST
//     CLEAR in its S6+ band
//   - the first run of each session from S3 is the ranked Daily (the date picks
//     the world and pilot); every other run takes the next owned pilot and world
//     in turn (the turn counts every run, so the long run moves on each session),
//     and a newly unlocked pilot or world is flown on the next Standard run
//   - level from the A9 targets; damage 100 + 0.25 HP per second of a run that
//     ends in death; the longest no-hit stretch min(run, 30 s x session); the
//     peak multiplier from the chain that stretch builds at 250 kills per minute
//   - pods: the first at 0:20, a new pickup weapon every 45 s after it
//   - beats (A7.1): elites at 1:30, 3:15, 5:10, 6:15 x2, 8:15 x2, 9:10 x3, each
//     killed 10 s after it arrives; bosses killed 30 s after 4:00 and 7:30, the
//     PRIME 50 s after 10:30, which clears the run
//   - close calls: 1 per minute in S1, +0.25 per session; a fusion by 4:00 from
//     S3; an evolution at the first Hive Core from S5; flawless boss fights from S5
import { register } from 'node:module'

const HOOKS = `
const map = {
  '@capacitor/core': 'data:text/javascript,' + encodeURIComponent('export const Capacitor = { isNativePlatform: () => false }'),
  '@capacitor/preferences': 'data:text/javascript,' + encodeURIComponent('export const Preferences = {}'),
}
export async function resolve(spec, ctx, next) {
  if (map[spec]) return { url: map[spec], shortCircuit: true }
  return next(spec, ctx)
}`
register('data:text/javascript,' + encodeURIComponent(HOOKS))
const mem = new Map()
globalThis.window = { addEventListener: () => {} }
globalThis.localStorage = {
  get length() { return mem.size },
  key: (i) => [...mem.keys()][i] ?? null,
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
}

const { initStorage } = await import('../src/platform/storage.ts')
const { migrateSave } = await import('../src/state/migrate.ts')
const { updateLifetime } = await import('../src/state/stats.ts')
const { evaluateFeats } = await import('../src/state/feats.ts')
const { isOwned, resolvePools } = await import('../src/state/unlocks.ts')
const { FEATS, validateFeats } = await import('../src/content/feats.ts')
const { TIER_STEPS, scoreOf } = await import('../src/core/rules.ts')

const JSON_OUT = process.argv.includes('--json')
const SESSIONS = 12
const KILLS_PER_S = 250 / 60
/** Run lengths (s) per session; S1 sums to 600 s, the others to 900 s. */
const RUN_TIMES = [
  [60, 90, 120, 150, 180],
  [170, 210, 240, 280],
  [150, 200, 250, 300],
  [120, 190, 250, 340],
  [100, 170, 230, 400],
  [80, 140, 180, 500],
  [40, 70, 110, 680],
  [40, 70, 110, 680],
  [40, 70, 110, 680],
  [40, 70, 110, 680],
  [40, 70, 110, 680],
  [40, 70, 110, 680],
]
const WORLDS = ['hive', 'depths', 'wastes']
const PILOTS = ['nova', 'ember', 'vesper']
const BOSS = { hive: ['queen', 'queenPrime'], depths: ['voidMatron', 'voidMatronPrime'], wastes: ['emberTyrant', 'emberTyrantPrime'] }
const ELITE_AT = [90, 195, 310, 375, 375, 495, 495, 550, 550, 550]
const MID1_KILL = 270
const MID2_KILL = 480
const PRIME_KILL = 680
/** Feats that read only runs, play time, kills and ranked Dailies: the A12
 *  session budget and kill rate alone decide when they complete. */
const COUNT_FEATS = new Set(['first_contact', 'pest_control', 'back_for_more', 'culler', 'on_shift', 'daybreak', 'regular', 'exterminator', 'long_watch', 'plague', 'infestation', 'devoted', 'creature_of_habit', 'dedicated', 'veteran', 'extinction'])
const LEVEL_AT = [[0, 1], [12, 2], [60, 5], [180, 10.5], [480, 20.5], [660, 25.5], [840, 28]]

function levelAt(t) {
  for (let i = 1; i < LEVEL_AT.length; i++) {
    const [t1, l1] = LEVEL_AT[i]
    const [t0, l0] = LEVEL_AT[i - 1]
    if (t <= t1) return Math.floor(l0 + ((l1 - l0) * (t - t0)) / (t1 - t0))
  }
  return 28
}

function tierOf(chain) {
  let tier = 1
  for (let i = 1; i < TIER_STEPS.length; i++) if (chain >= TIER_STEPS[i]) tier = i + 1
  return tier
}

function makeRun(s, date, mode, pilot, world, t, weaponPool) {
  const cleared = t >= PRIME_KILL
  const kills = Math.round(t * KILLS_PER_S)
  const noHit = Math.min(t, 30 * s)
  const peakTier = tierOf(noHit * KILLS_PER_S)
  const [mid, prime] = BOSS[world]
  const killsByEnemy = { swarmer: kills }
  let bosses = 0
  if (t >= MID1_KILL) { killsByEnemy[mid] = 1; bosses++ }
  if (t >= MID2_KILL) { killsByEnemy[mid] = 2; bosses++ }
  if (cleared) { killsByEnemy[prime] = 1; bosses++ }
  const elites = ELITE_AT.filter((at) => t >= at).length
  const pickups = t >= 25 ? Math.min(weaponPool.length, 1 + Math.floor((t - 20) / 45)) : 0
  const xpSum = Math.round(kills * 1.4)
  const killPts = Math.round(kills * 10 * 1.4 * Math.max(1, peakTier - 1))
  const clearMs = cleared ? PRIME_KILL * 1000 : 0
  return {
    v: 2, mode, ranked: mode === 'daily', end: cleared ? 'clear' : 'death', cleared, clearMs, overtimeSec: 0, nextBeat: null,
    date, dailyNumber: 0, seed: 1, character: pilot, arena: world, threat: 0, paint: 'factory',
    time: t, kills, level: levelAt(t), score: scoreOf(killPts, xpSum, clearMs, 0), killPts, xpSum,
    bossesSlain: bosses, bossesFlawless: s >= 5 ? bosses : 0, elitesSlain: elites,
    bestChain: Math.round(noHit * KILLS_PER_S), peakTier, hits: Math.round(t / 20), longestNoHit: noHit,
    damageTaken: cleared ? Math.round(0.25 * t) : Math.round(100 + 0.25 * t),
    revivesUsed: 0, podsEquipped: pickups, weapons: weaponPool.slice(0, pickups),
    dashes: Math.round(t / 4), closeCalls: Math.round((t / 60) * (1 + 0.25 * (s - 1))),
    fusions: s >= 3 && t >= 240 ? ['f_shatter'] : [], evolutions: s >= 5 && t >= MID1_KILL ? ['gore_hose'] : [],
    perks: [], killsByEnemy, killer: cleared ? null : 'swarmer',
  }
}

const tableErrors = validateFeats()
if (tableErrors.length) {
  console.error('feat table:', tableErrors)
  process.exit(1)
}
await initStorage()
migrateSave('2026-10-01')

const doneIn = {}
const report = []
let turn = 0
let nextPilot = null
let nextWorld = null
for (let s = 1; s <= SESSIONS; s++) {
  const date = `2026-10-${String(s).padStart(2, '0')}`
  const unlocked = []
  RUN_TIMES[s - 1].forEach((t, i) => {
    turn++
    const daily = s >= 3 && i === 0
    let pilot
    let world
    if (daily) {
      world = WORLDS[s % 3]
      pilot = PILOTS[(s + Math.floor(s / 3)) % 3]
    } else {
      const pilots = PILOTS.filter((id) => isOwned(id))
      const worlds = WORLDS.filter((id) => isOwned(id))
      pilot = nextPilot ?? pilots[turn % pilots.length]
      world = nextWorld ?? worlds[turn % worlds.length]
      nextPilot = nextWorld = null
    }
    const mode = daily ? 'daily' : 'endless'
    const r = makeRun(s, date, mode, pilot, world, t, resolvePools(mode).weapons)
    for (const u of evaluateFeats(r, updateLifetime(r))) {
      doneIn[u.feat.id] = s
      unlocked.push({ n: u.feat.n, feat: u.feat.name, band: u.feat.band, reward: u.fresh ? u.name : 'Already yours', run: i + 1, count: COUNT_FEATS.has(u.feat.id) })
      if (PILOTS.includes(u.feat.reward)) nextPilot = u.feat.reward
      if (WORLDS.includes(u.feat.reward)) nextWorld = u.feat.reward
    }
  })
  report.push({ session: `S${s}`, runs: RUN_TIMES[s - 1].length, minutes: RUN_TIMES[s - 1].reduce((a, b) => a + b, 0) / 60, unlocks: unlocked })
}

const empty = report.slice(0, 10).filter((r) => r.unlocks.length === 0).map((r) => r.session)
const noCount = report.slice(0, 10).filter((r) => !r.unlocks.some((u) => u.count)).map((r) => r.session)
const open = FEATS.filter((f) => !doneIn[f.id]).map((f) => `#${f.n} ${f.name} (${f.band})`)
const offBand = FEATS.filter((f) => doneIn[f.id] && /^S\d+$/.test(f.band) && Math.abs(doneIn[f.id] - Number(f.band.slice(1))) > 1).map((f) => `#${f.n} ${f.name}: band ${f.band}, model S${doneIn[f.id]}`)

if (JSON_OUT) {
  console.log(JSON.stringify({ report, open, offBand, empty, noCount }, null, 1))
} else {
  for (const r of report) {
    console.log(`${r.session.padEnd(4)} ${r.runs} runs, ${r.minutes} min, ${r.unlocks.length} unlock${r.unlocks.length === 1 ? '' : 's'}`)
    for (const u of r.unlocks) console.log(`     ${u.count ? '*' : ' '} #${String(u.n).padEnd(2)} ${u.feat.padEnd(18)} band ${u.band.padEnd(5)} run ${u.run}  ${u.reward}`)
  }
  console.log('\n* a count feat: only the A12 session budget, 250 kills per minute and one ranked Daily per session from S3 decide it')
  console.log(`sessions S1 to S10 without a count feat: ${noCount.length ? noCount.join(', ') : 'none'}`)
  console.log(`open after S${SESSIONS}: ${open.length ? open.join(', ') : 'none'}`)
  console.log(`more than one session off band: ${offBand.length ? '\n  ' + offBand.join('\n  ') : 'none'}`)
}
if (empty.length) {
  console.error(`FAIL: no unlock in ${empty.join(', ')}`)
  process.exit(1)
}
console.log('PASS: every session S1 to S10 unlocks at least one thing')
