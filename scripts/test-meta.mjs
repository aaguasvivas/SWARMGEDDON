// P12b acceptance saves (docs/NEXT-LEVEL.md 7.4, 10.3), in plain Node (22.18+,
// which strips TypeScript types). Drives the real save code: storage, the v2
// migration, the lifetime stats, the feats and the unlock pools, over an
// in-memory localStorage. Capacitor is replaced by a web-only stub. No browser.
//
// Usage: node scripts/test-meta.mjs
import { register } from 'node:module'
import assert from 'node:assert/strict'

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

class MemStorage {
  #m = new Map()
  get length() {
    return this.#m.size
  }
  key(i) {
    return [...this.#m.keys()][i] ?? null
  }
  getItem(k) {
    return this.#m.has(k) ? this.#m.get(k) : null
  }
  setItem(k, v) {
    this.#m.set(k, String(v))
  }
  removeItem(k) {
    this.#m.delete(k)
  }
}
globalThis.window = { addEventListener: () => {} }
let ls = new MemStorage()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => ls })

const storage = await import('../src/platform/storage.ts')
const { migrateSave } = await import('../src/state/migrate.ts')
const { loadStats, updateLifetime } = await import('../src/state/stats.ts')
const { evaluateFeats, loadFeats } = await import('../src/state/feats.ts')
const { isOwned, grant, resolvePools, ownedKeys } = await import('../src/state/unlocks.ts')
const { FEATS, validateFeats, featById } = await import('../src/content/feats.ts')
const { PERKS } = await import('../src/content/perks.ts')
const { PICKUP_WEAPON_IDS } = await import('../src/content/weapons.ts')

const TODAY = '2026-09-30'
const START_PERKS = ['adrenaline', 'heavy_rounds', 'twin_shot', 'piercing', 'long_barrel', 'ricochet', 'explosive_rounds', 'arc_rounds', 'cryo_rounds', 'vitality', 'regrowth', 'vampiric', 'bulwark', 'thorns', 'fleet_footed', 'phase_step', 'shock_step', 'deadeye', 'executioner', 'magnetic', 'scavenger']
const START_WEAPONS = ['smg', 'shotgun', 'minigun', 'plasma', 'flamethrower', 'rocket']

/** Boot on a save: a fresh in-memory localStorage holding `keys` (unprefixed). */
async function boot(keys = {}) {
  ls = new MemStorage()
  for (const [k, v] of Object.entries(keys)) ls.setItem('swarmgeddon:' + k, typeof v === 'string' && v.startsWith('RAW:') ? v.slice(4) : JSON.stringify(v))
  await storage.initStorage()
  return migrateSave(TODAY)
}

/** A RunResult with every field; `o` overrides. */
function run(o = {}) {
  return {
    v: 2, mode: 'endless', ranked: false, end: 'death', cleared: false, clearMs: 0, overtimeSec: 0, nextBeat: null,
    date: TODAY, dailyNumber: 0, seed: 1, character: 'nova', arena: 'hive', threat: 0, paint: 'factory',
    time: 60, kills: 50, level: 3, score: 1000, killPts: 500, xpSum: 60,
    bossesSlain: 0, bossesFlawless: 0, elitesSlain: 0, bestChain: 10, peakTier: 2, hits: 3, longestNoHit: 20, damageTaken: 40,
    revivesUsed: 0, podsEquipped: 1, weapons: ['smg'], dashes: 3, closeCalls: 0, fusions: [], evolutions: [],
    perks: [['heavy_rounds', 1]], killsByEnemy: { swarmer: 50 }, killer: 'swarmer', ...o,
  }
}

function endRun(r) {
  return evaluateFeats(r, updateLifetime(r))
}

const doneIds = () => Object.keys(loadFeats().done).sort()

let n = 0
async function test(name, fn) {
  await fn()
  n++
  console.log('PASS', name)
}

await test('the feat table passes the boot assertion', () => {
  assert.deepEqual(validateFeats(), [])
})

await test('a fresh save: no toast, nothing owned, start pools of 21 perks and 6 weapons, Daily canonical', async () => {
  assert.equal(await boot(), null)
  assert.equal(storage.loadJSON('meta:v', 0), 2)
  assert.equal(storage.loadJSON('stats', null), null)
  assert.equal(loadStats().importedV1, false)
  const std = resolvePools('endless')
  assert.deepEqual(std.perks.map((p) => p.id), PERKS.filter((p) => START_PERKS.includes(p.id)).map((p) => p.id))
  assert.equal(std.perks.length, 21)
  assert.deepEqual(std.weapons, PICKUP_WEAPON_IDS.filter((id) => START_WEAPONS.includes(id)))
  const daily = resolvePools('daily')
  assert.equal(daily.perks, PERKS)
  assert.equal(daily.weapons, PICKUP_WEAPON_IDS)
  assert.ok(!isOwned('ember') && !isOwned('depths') && !isOwned('paint:static') && !isOwned('perk:giant_slayer'))
  assert.ok(isOwned('nova') && isOwned('hive') && isOwned('perk:twin_shot'))
})

await test('a fresh save unlocks FIRST CONTACT on its first 10 s run, not on a 9.9 s one', async () => {
  await boot()
  const short = endRun(run({ time: 9.9, kills: 4, level: 5 }))
  assert.deepEqual(short.map((u) => u.feat.id), [])
  assert.equal(loadStats().runs, 0)
  const first = endRun(run({ time: 10, kills: 4, level: 2, peakTier: 1 }))
  assert.deepEqual(first.map((u) => u.feat.id), ['first_contact'])
  assert.equal(first[0].line, 'New paint: STATIC')
  assert.ok(first[0].fresh && isOwned('paint:static'))
})

await test('acceptance save: unlocks ember + depths, best:world:hive 200 s / 900 kills', async () => {
  const toast = await boot({ unlocks: ['ember', 'depths'], 'best:world:hive': { time: 200, kills: 900 } })
  assert.ok(isOwned('ember') && isOwned('depths'))
  assert.deepEqual(doneIds(), ['deep_dive', 'overcharged', 'swatter'])
  for (const p of PERKS) assert.ok(isOwned('perk:' + p.id), p.id)
  for (const id of PICKUP_WEAPON_IDS) assert.ok(isOwned('weapon:' + id), id)
  assert.equal(resolvePools('endless').perks.length, 31)
  assert.equal(resolvePools('endless').weapons.length, 11)
  assert.equal(toast, 'Welcome to v2. Your records earned 3 feats. See RECORDS.')
  const s = loadStats()
  assert.equal(s.importedV1, true)
  assert.equal(s.perWorld.hive.bestTime, 200)
  assert.equal(s.runs, 0)
  // Veteran perk and weapon feats stay open and read Already yours.
  assert.equal(loadFeats().done.big_game, undefined)
  const r = endRun(run({ time: 30, elitesSlain: 1 }))
  const big = r.find((u) => u.feat.id === 'big_game')
  assert.ok(big && !big.fresh && big.line === 'Already yours')
})

await test('every v1 key shape: 13 keys read, none changed but unlocks (extended), today\'s Daily kept ranked', async () => {
  const V1 = {
    'best:endless': { score: 5234, time: 301, kills: 1500, level: 12 },
    'best:daily': { score: 1200, time: 140, kills: 400, level: 7 },
    'best:world:hive': { time: 200, kills: 900 },
    'best:world:depths': { time: 347, kills: 1209 },
    'best:world:wastes': { time: 90, kills: 210 },
    unlocks: ['ember', 'depths'],
    'sel:char': 'ember',
    'sel:arena': 'depths',
    settings: { master: 0.6, sfx: 0.8, music: 0.5, shake: 0.5, haptics: false },
    seenGemHint: true,
    seenTouchControls: true,
    'player:name': 'ACE',
    'daily:last': { date: TODAY, score: 1200 },
  }
  const toast = await boot(V1)
  for (const [k, v] of Object.entries(V1)) {
    if (k === 'unlocks') for (const id of v) assert.ok(ownedKeys().includes(id))
    else assert.deepEqual(storage.loadJSON(k, null), v, k)
  }
  // Level 12 credits #2 and #4, max time 347 #21, Hive 200 s #10, max kills 1,500 #6;
  // three worlds played credits #15 through the seeded best times.
  assert.deepEqual(doneIds(), ['deep_dive', 'field_promotion', 'five_alive', 'overcharged', 'swatter', 'world_tour'])
  assert.match(toast, /earned 6 feats/)
  assert.ok(isOwned('paint:hazard') && isOwned('paint:atlas'))
  assert.deepEqual(storage.loadJSON('daily:' + TODAY, null), { rankedStarted: true, ranked: { legacy: true } })
  assert.equal(loadStats().perWorld.depths.bestTime, 347)
})

await test('vesper and wastes legacy unlocks credit #9 and #20; worlds at 300+ s credit #40', async () => {
  await boot({
    unlocks: ['ember', 'vesper', 'depths', 'wastes'],
    'best:world:hive': { time: 320, kills: 100 },
    'best:world:depths': { time: 300, kills: 100 },
    'best:world:wastes': { time: 310, kills: 100 },
  })
  const d = doneIds()
  for (const id of ['overcharged', 'thick_hide', 'deep_dive', 'void_walker', 'five_everywhere', 'five_alive', 'world_tour']) assert.ok(d.includes(id), id)
  assert.ok(isOwned('vesper') && isOwned('wastes') && isOwned('paint:tricolor'))
})

await test('a veteran with only a short run: all content, no feats, no toast', async () => {
  const toast = await boot({ 'best:endless': { score: 50, time: 20, kills: 10, level: 2 } })
  assert.equal(toast, null)
  assert.deepEqual(doneIds(), [])
  assert.equal(resolvePools('endless').perks.length, 31)
  assert.equal(loadStats().importedV1, true)
})

await test('malformed and foreign shapes never throw and never lose the save', async () => {
  const toast = await boot({
    'best:endless': 5234,
    'best:daily': 'RAW:{not json',
    'best:world:hive': 'x',
    'best:world:atlantis': { time: 999, kills: 5 },
    unlocks: 'ember',
    'daily:last': null,
    feats: [1, 2],
    stats: 'RAW:[',
  })
  assert.equal(toast, null)
  assert.equal(storage.loadJSON('meta:v', 0), 2)
  assert.equal(loadStats().perWorld.atlantis, undefined)
  assert.equal(storage.loadJSON('best:world:atlantis', null).time, 999)
})

await test('migration runs once; a second boot changes nothing', async () => {
  await boot({ unlocks: ['ember'], 'best:world:hive': { time: 200, kills: 900 } })
  const before = JSON.stringify([...Array(ls.length).keys()].map((i) => [ls.key(i), ls.getItem(ls.key(i))]).sort())
  assert.equal(migrateSave(TODAY), null)
  const after = JSON.stringify([...Array(ls.length).keys()].map((i) => [ls.key(i), ls.getItem(ls.key(i))]).sort())
  assert.equal(after, before)
})

await test('stats already on the save (a v2 test build) are merged, not replaced', async () => {
  await boot({
    stats: { runs: 5, seconds: 900, kills: 3000, perWorld: { hive: { runs: 5, seconds: 900, kills: 3000, bosses: 0, clears: 0, bestTime: 400, maxThreatCleared: -1 } } },
    'best:world:hive': { time: 200, kills: 900 },
  })
  const s = loadStats()
  assert.equal(s.runs, 5)
  assert.equal(s.kills, 3000)
  assert.equal(s.perWorld.hive.bestTime, 400)
  // The stored totals meet FIRST CONTACT and BACK FOR MORE (5 runs).
  const d = doneIds()
  assert.ok(d.includes('first_contact') && d.includes('back_for_more'))
})

await test('run feats keep the best run; totals read the lifetime stats; a grant mid-save never double-counts', async () => {
  await boot()
  endRun(run({ time: 100, level: 4 }))
  assert.equal(loadFeats().prog.field_promotion, 4)
  endRun(run({ time: 50, level: 2 }))
  assert.equal(loadFeats().prog.field_promotion, 4)
  const r = endRun(run({ time: 400, level: 9, kills: 350, arena: 'hive', peakTier: 5, longestNoHit: 130, weapons: ['smg', 'shotgun', 'minigun', 'plasma'], damageTaken: 950 }))
  const ids = r.map((u) => u.feat.id)
  for (const id of ['field_promotion', 'overcharged', 'rampage', 'swatter', 'deep_dive', 'arsenal', 'mayhem', 'untouchable', 'five_alive', 'thick_hide']) assert.ok(ids.includes(id), id)
  assert.equal(featById('thick_hide').kind, 'total')
  assert.ok(isOwned('vesper') && isOwned('depths') && isOwned('weapon:beam'))
  assert.equal(grant('vesper'), false)
  assert.equal(new Set(ownedKeys()).size, ownedKeys().length)
  assert.equal(resolvePools('endless').weapons.length, 8)
})

await test('a feat reward granted before its feat reads Already yours; no feat completes twice', async () => {
  await boot()
  grant('paint:static')
  const r = endRun(run({ time: 30 }))
  assert.equal(r[0].feat.id, 'first_contact')
  assert.equal(r[0].line, 'Already yours')
  assert.deepEqual(endRun(run({ time: 30 })).filter((u) => u.feat.id === 'first_contact'), [])
  assert.equal(FEATS.length, 48)
})

console.log(`${n} tests passed`)
