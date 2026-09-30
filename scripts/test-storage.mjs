// Unit check for src/platform/storage.ts on both backends, in plain Node (22.18+,
// which strips TypeScript types). Capacitor core and the Preferences plugin are
// replaced by in-memory mocks through a module resolve hook; localStorage and
// window are replaced by globals. No browser, no dev server.
//
// Usage: node scripts/test-storage.mjs
import { register } from 'node:module'
import assert from 'node:assert/strict'

const CORE = `export const Capacitor = { isNativePlatform: () => globalThis.__mock.native }`
const PREFS = `
const m = () => globalThis.__mock
const wait = () => new Promise((r) => setTimeout(r, m().latencyMs()))
export const Preferences = {
  async keys() {
    m().calls.keys++
    await wait()
    if (m().fail.keys) throw new Error('keys unavailable')
    return { keys: [...m().prefs.keys()] }
  },
  async get({ key }) {
    m().calls.get++
    await wait()
    return { value: m().prefs.has(key) ? m().prefs.get(key) : null }
  },
  async set({ key, value }) {
    m().calls.set++
    m().writes.push(key)
    await wait()
    if (m().fail.set(key)) throw new Error('set failed')
    m().prefs.set(key, value)
  },
  async remove({ key }) {
    m().calls.remove++
    await wait()
    m().prefs.delete(key)
  },
}`
const HOOKS = `
const map = {
  '@capacitor/core': 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(CORE)}),
  '@capacitor/preferences': 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(PREFS)}),
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
  clear() {
    this.#m.clear()
  }
  snapshot() {
    return new Map(this.#m)
  }
}

// Installs a fresh backend world. `ls` is the localStorage mock, or a function
// that throws (storage blocked), or 'quota' (reads work, every write throws).
function reset({ native = false, ls = new MemStorage(), prefs = new Map(), latency = 0 } = {}) {
  const listeners = {}
  globalThis.window = { addEventListener: (t, fn) => (listeners[t] = fn) }
  if (typeof ls === 'function') {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: ls })
  } else {
    if (ls === 'quota') {
      ls = new MemStorage()
      ls.setItem = () => {
        throw new Error('QuotaExceededError')
      }
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => ls })
  }
  globalThis.__mock = {
    native,
    prefs,
    latencyMs: typeof latency === 'function' ? latency : () => latency,
    fail: { keys: false, set: () => false },
    calls: { keys: 0, get: 0, set: 0, remove: 0 },
    writes: [],
  }
  return { ls, prefs, listeners, mock: globalThis.__mock }
}

const S = await import('../src/platform/storage.ts')

// The 13 v1 keys (docs/NEXT-LEVEL.md 3.3), with v1-shaped values.
const V1 = {
  'best:endless': { score: 5234, time: 301, kills: 1500, date: '2026-09-01' },
  'best:daily': { score: 1200, time: 140, kills: 400, date: '2026-09-02' },
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
  'daily:last': { date: '2026-09-02', score: 1200 },
}
const V1_KEYS = Object.keys(V1)
assert.equal(V1_KEYS.length, 13)
function seedV1(ls) {
  for (const k of V1_KEYS) ls.setItem('swarmgeddon:' + k, JSON.stringify(V1[k]))
  ls.setItem('other-app:key', '"not ours"')
}
function assertV1Readable(label) {
  for (const k of V1_KEYS) assert.deepEqual(S.loadJSON(k, null), V1[k], `${label}: ${k}`)
}

let n = 0
async function test(name, fn) {
  await fn()
  n++
  console.log('PASS', name)
}

await test('web: v1 save hydrates, all 13 keys read back, no Preferences calls', async () => {
  const { ls, mock } = reset()
  seedV1(ls)
  await S.initStorage()
  assertV1Readable('web')
  assert.deepEqual(S.keysWithPrefix('best:world:').sort(), ['best:world:depths', 'best:world:hive', 'best:world:wastes'])
  assert.equal(S.loadJSON('missing', 'fb'), 'fb')
  assert.deepEqual(mock.calls, { keys: 0, get: 0, set: 0, remove: 0 })
})

await test('web: write-through, remove, undefined removes, unparsable value falls back', async () => {
  const { ls } = reset()
  await S.initStorage()
  S.saveJSON('settings', { master: 0.3 })
  assert.equal(ls.getItem('swarmgeddon:settings'), '{"master":0.3}')
  assert.deepEqual(S.loadJSON('settings', null), { master: 0.3 })
  const a = S.loadJSON('settings', null)
  a.master = 9
  assert.deepEqual(S.loadJSON('settings', null), { master: 0.3 }, 'loads return fresh objects')
  S.removeKey('settings')
  assert.equal(ls.getItem('swarmgeddon:settings'), null)
  assert.equal(S.loadJSON('settings', 'fb'), 'fb')
  S.saveJSON('x', 1)
  S.saveJSON('x', undefined)
  assert.equal(ls.getItem('swarmgeddon:x'), null)
  assert.equal(S.loadJSON('x', 'fb'), 'fb')
  ls.setItem('swarmgeddon:broken', '{nope')
  await S.initStorage()
  assert.equal(S.loadJSON('broken', 'fb'), 'fb')
  const circ = {}
  circ.self = circ
  S.saveJSON('circ', circ)
  assert.equal(S.loadJSON('circ', 'fb'), 'fb')
})

await test('web private mode: localStorage access throws, game still reads and writes in memory', async () => {
  reset({
    ls: () => {
      throw new Error('SecurityError: access denied')
    },
  })
  await S.initStorage()
  assert.equal(S.loadJSON('settings', 'fb'), 'fb')
  S.saveJSON('player:name', 'ACE')
  assert.equal(S.loadJSON('player:name', ''), 'ACE')
  S.removeKey('player:name')
  assert.equal(S.loadJSON('player:name', ''), '')
  await S.flushStorage()
})

await test('web quota: every setItem throws, session keeps working', async () => {
  const { ls } = reset({ ls: 'quota' })
  await S.initStorage()
  S.saveJSON('sel:char', 'vesper')
  assert.equal(S.loadJSON('sel:char', 'nova'), 'vesper')
  assert.equal(ls.getItem('swarmgeddon:sel:char'), null)
})

await test('web: another tab writes, removes and clears', async () => {
  const { ls, listeners } = reset()
  seedV1(ls)
  await S.initStorage()
  listeners.storage({ key: 'swarmgeddon:best:world:hive', newValue: '{"time":500,"kills":2}' })
  assert.deepEqual(S.loadJSON('best:world:hive', null), { time: 500, kills: 2 })
  listeners.storage({ key: 'swarmgeddon:sel:char', newValue: null })
  assert.equal(S.loadJSON('sel:char', 'nova'), 'nova')
  listeners.storage({ key: 'other-app:key', newValue: '"x"' })
  assert.equal(S.keysWithPrefix('other').length, 0)
  ls.clear()
  ls.setItem('swarmgeddon:unlocks', '["wastes"]')
  listeners.storage({ key: null, newValue: null })
  assert.deepEqual(S.keysWithPrefix(''), ['unlocks'])
})

await test('native first launch: copies the 13 v1 keys once, keeps localStorage, sets the marker', async () => {
  const { ls, prefs } = reset({ native: true, latency: 1 })
  seedV1(ls)
  const before = ls.snapshot()
  await S.initStorage()
  assertV1Readable('native first launch')
  for (const k of V1_KEYS) assert.equal(prefs.get('swarmgeddon:' + k), JSON.stringify(V1[k]), 'prefs ' + k)
  assert.ok(!prefs.has('other-app:key'), 'foreign keys are not copied')
  await S.flushStorage()
  assert.equal(prefs.get('swarmgeddon:storage:native'), 'true')
  assert.deepEqual(ls.snapshot(), before, 'localStorage untouched')
})

await test('native: write-through, flush, relaunch after an iOS localStorage purge keeps the name', async () => {
  const { ls, prefs } = reset({ native: true, latency: 1 })
  seedV1(ls)
  await S.initStorage()
  S.saveJSON('player:name', 'NOVA7')
  assert.equal(S.loadJSON('player:name', ''), 'NOVA7', 'reads are synchronous')
  assert.equal(ls.getItem('swarmgeddon:player:name'), '"ACE"', 'native never writes localStorage')
  await S.flushStorage()
  assert.equal(prefs.get('swarmgeddon:player:name'), '"NOVA7"')
  ls.clear()
  const again = reset({ native: true, prefs, ls, latency: 1 })
  await S.initStorage()
  assert.equal(S.loadJSON('player:name', ''), 'NOVA7')
  assert.deepEqual(S.loadJSON('unlocks', []), ['ember', 'depths'])
  assert.equal(again.mock.calls.set, 0, 'a relaunch writes nothing')
})

await test('native: marker present, Preferences wins over a stale localStorage', async () => {
  const prefs = new Map([
    ['swarmgeddon:storage:native', 'true'],
    ['swarmgeddon:sel:char', '"vesper"'],
  ])
  const { ls } = reset({ native: true, prefs })
  seedV1(ls)
  await S.initStorage()
  assert.equal(S.loadJSON('sel:char', ''), 'vesper')
  assert.equal(S.loadJSON('unlocks', null), null, 'no second copy')
})

await test('native: writes to one key coalesce and stay ordered; remove reaches Preferences', async () => {
  // `slow` makes the next plugin call take 30 ms, so an unchained later write
  // would land first and then be overwritten by the older value.
  let slow = false
  const latency = () => {
    if (!slow) return 1
    slow = false
    return 30
  }
  const { prefs, mock } = reset({ native: true, latency })
  await S.initStorage()
  await S.flushStorage()
  const setsBefore = mock.calls.set
  for (let i = 0; i <= 50; i++) S.saveJSON('settings', { master: i / 50 })
  await S.flushStorage()
  assert.equal(prefs.get('swarmgeddon:settings'), '{"master":1}')
  assert.ok(mock.calls.set - setsBefore <= 2, `51 saves coalesced into ${mock.calls.set - setsBefore} writes`)
  S.saveJSON('k', 'a')
  S.removeKey('k')
  await S.flushStorage()
  assert.ok(!prefs.has('swarmgeddon:k'))
  slow = true
  S.saveJSON('k', 'a')
  await Promise.resolve()
  S.removeKey('k')
  S.saveJSON('k', 'b')
  await S.flushStorage()
  await new Promise((r) => setTimeout(r, 60)) // let any stray older write land
  assert.equal(prefs.get('swarmgeddon:k'), '"b"')
  assert.equal(S.loadJSON('k', ''), 'b')
})

await test('native: a failed copy leaves the marker unset and is retried next launch', async () => {
  const { ls, prefs, mock } = reset({ native: true })
  seedV1(ls)
  mock.fail.set = (k) => k === 'swarmgeddon:unlocks'
  await S.initStorage()
  await S.flushStorage()
  assertV1Readable('session with a failed copy')
  assert.ok(!prefs.has('swarmgeddon:unlocks'))
  assert.ok(!prefs.has('swarmgeddon:storage:native'))
  prefs.set('swarmgeddon:sel:char', '"vesper"') // a native write made after the copy
  reset({ native: true, prefs, ls })
  await S.initStorage()
  await S.flushStorage()
  assert.equal(prefs.get('swarmgeddon:unlocks'), '["ember","depths"]')
  assert.equal(prefs.get('swarmgeddon:storage:native'), 'true')
  assert.equal(S.loadJSON('sel:char', ''), 'vesper', 'existing Preferences value kept')
})

await test('native: Preferences unusable, session falls back to localStorage', async () => {
  const { ls, mock } = reset({ native: true })
  seedV1(ls)
  mock.fail.keys = true
  await S.initStorage()
  assertV1Readable('fallback')
  S.saveJSON('sel:arena', 'wastes')
  assert.equal(ls.getItem('swarmgeddon:sel:arena'), '"wastes"')
  assert.equal(mock.calls.set, 0)
})

await test('native: initStorage under 150 ms with 40 keys (simulated 4 ms bridge latency per call)', async () => {
  const prefs = new Map([['swarmgeddon:storage:native', 'true']])
  for (let i = 0; i < 39; i++) prefs.set('swarmgeddon:key' + i, JSON.stringify({ i, pad: 'x'.repeat(200) }))
  reset({ native: true, prefs, latency: 4 })
  const t0 = performance.now()
  await S.initStorage()
  const ms = performance.now() - t0
  assert.equal(S.keysWithPrefix('key').length, 39)
  console.log(`  initStorage with 40 keys: ${ms.toFixed(1)} ms`)
  assert.ok(ms < 150)
})

console.log(`${n} storage tests passed`)
