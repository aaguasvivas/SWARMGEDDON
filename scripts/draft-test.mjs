// Draft stress test (section 10.3, P5 acceptance): drives the real draft code
// (src/systems/draft.ts, loaded with Node's TypeScript type stripping, Node 22.18+)
// through a minimal world stub. No browser.
//
// Usage: node scripts/draft-test.mjs [drafts=10000]
// Each simulated run opens drafts until the budget is spent, answering them
// with a seeded mix of rerolls, banishes, picks and skips, and a random held
// weapon. Checks on every roll: exactly 3 cards, no duplicate ids, no banned
// id, no maxed or out-of-pool perk, no owned or locked fusion, NEW tags match
// the stacks, and the Keystone draft (with its rerolls and banishes) always
// shows a keystone of the pilot family. Then replays one run twice and
// compares every card (determinism), and runs the exhaustion case: every perk
// maxed and every fusion owned, 6 drafts in a row, each 3 fallback cards.
import { DraftState, openDraft, rerollDraft, banishCard, pickCard, skipDraft, canReroll, canBanish, TAG_NEW } from '../src/systems/draft.ts'
import { PERKS, FUSIONS, FAMILY_OF_PILOT, FALLBACKS } from '../src/content/perks.ts'
import { WEAPONS, PICKUP_WEAPON_IDS } from '../src/content/weapons.ts'
import { RunRngs, Rng } from '../src/core/rng.ts'

const TOTAL = parseInt(process.argv[2] || '10000')
const PILOTS = ['nova', 'ember', 'vesper']
const START_POOL = new Set(['adrenaline', 'heavy_rounds', 'twin_shot', 'piercing', 'long_barrel', 'ricochet', 'explosive_rounds', 'arc_rounds', 'cryo_rounds', 'vitality', 'regrowth', 'vampiric', 'bulwark', 'thorns', 'fleet_footed', 'phase_step', 'shock_step', 'deadeye', 'executioner', 'magnetic', 'scavenger'])
const PERK = new Map(PERKS.map((p) => [p.id, p]))
const FALLBACK_IDS = new Set(FALLBACKS.map((f) => f.id))

function makeWorld(seed, pilot, pool) {
  const w = {
    seed,
    time: 0,
    pendingLevelUps: 0,
    pendingGameOver: false,
    draft: new DraftState(),
    rngs: new RunRngs(),
    perkStacks: new Map(),
    perkPool: pool,
    character: { id: pilot },
    weapon: WEAPONS.pistol,
    baseWeaponId: 'pistol',
    player: { hp: 100, maxHp: 100 },
    choosePerk(id) {
      this.perkStacks.set(id, (this.perkStacks.get(id) ?? 0) + 1)
    },
  }
  w.rngs.begin(seed)
  return w
}

const fail = []
const stats = { opens: 0, rolls: 0, rerolls: 0, rerollsRefused: 0, banishes: 0, picks: 0, skips: 0, keystoneDrafts: 0, fusionCards: 0, fusionFirst: 0, fallbackCards: 0, rare: 0, common: 0, tagged: 0, prevRepeats: 0 }

function check(w, where, prevIds) {
  const d = w.draft
  const ctx = `seed ${w.seed} ${w.character.id} draft ${d.index} ${where}`
  stats.rolls++
  if (d.count !== 3) fail.push(`${ctx}: count ${d.count}`)
  const ids = d.cards.slice(0, d.count).map((c) => c.id)
  if (new Set(ids).size !== ids.length) fail.push(`${ctx}: duplicate ${ids}`)
  const inPool = new Set(w.perkPool.map((p) => p.id))
  for (const c of d.cards.slice(0, d.count)) {
    const s = w.perkStacks.get(c.id) ?? 0
    if (d.banned.has(c.id)) fail.push(`${ctx}: banned ${c.id}`)
    if (c.kind === 'perk') {
      const p = PERK.get(c.id)
      if (!p) fail.push(`${ctx}: unknown perk ${c.id}`)
      else if (s >= p.max) fail.push(`${ctx}: maxed ${c.id}`)
      if (!inPool.has(c.id)) fail.push(`${ctx}: out of pool ${c.id}`)
      if (c.rarity === 'rare') stats.rare++
      else stats.common++
    } else if (c.kind === 'fusion') {
      stats.fusionCards++
      const f = FUSIONS.find((x) => x.id === c.id)
      if (!f) fail.push(`${ctx}: unknown fusion ${c.id}`)
      else if (!(w.perkStacks.get(f.a) > 0 && w.perkStacks.get(f.b) > 0)) fail.push(`${ctx}: fusion ${c.id} without parents`)
      if (s > 0) fail.push(`${ctx}: owned fusion ${c.id}`)
      if (c.tags & 4) stats.fusionFirst++
    } else {
      stats.fallbackCards++
      if (!FALLBACK_IDS.has(c.id)) fail.push(`${ctx}: unknown fallback ${c.id}`)
    }
    if (c.kind !== 'fallback' && !!(c.tags & TAG_NEW) !== (s === 0)) fail.push(`${ctx}: NEW tag wrong on ${c.id}`)
    if (c.tagText) stats.tagged++
    if (!c.name || (c.kind !== 'fusion' && !c.stat) || !c.desc) fail.push(`${ctx}: empty text on ${c.id}`)
  }
  if (d.index === 1) {
    const pf = FAMILY_OF_PILOT[w.character.id]
    if (!d.cards.slice(0, d.count).some((c) => c.keystone && c.family === pf)) fail.push(`${ctx}: keystone draft without the pilot family: ${ids}`)
    if (!d.cards.slice(0, d.count).every((c) => c.keystone)) fail.push(`${ctx}: non-keystone in the Keystone draft: ${ids}`)
  }
  if (prevIds) {
    // A reroll shows none of the previous perks or fusions while 3 other eligible perks remain.
    const others = w.perkPool.filter((p) => (w.perkStacks.get(p.id) ?? 0) < p.max && !d.banned.has(p.id) && !prevIds.includes(p.id)).length
    for (const c of d.cards.slice(0, d.count)) {
      if (!prevIds.includes(c.id) || c.kind === 'fallback') continue
      stats.prevRepeats++
      if (others >= 3 && d.index !== 1) fail.push(`${ctx}: reroll repeated ${c.id} with ${others} others eligible`)
    }
  }
  return ids
}

/** One simulated run; returns every roll's ids (for the determinism replay). */
function run(seed, draftsWanted, log) {
  const act = new Rng(seed ^ 0x5bd1e995)
  const pilot = PILOTS[seed % 3]
  const pool = seed % 4 === 0 ? PERKS.filter((p) => START_POOL.has(p.id)) : PERKS
  const w = makeWorld(seed, pilot, pool)
  for (let k = 0; k < draftsWanted; k++) {
    w.time += 12 + act.int(0, 20)
    w.pendingLevelUps = 1
    if (act.bool(0.3)) {
      const id = PICKUP_WEAPON_IDS[act.int(0, PICKUP_WEAPON_IDS.length - 1)]
      w.weapon = WEAPONS[id]
    } else w.weapon = WEAPONS.pistol
    if (act.bool(0.02)) w.draft.rerolls = Math.min(5, w.draft.rerolls + 1)
    if (act.bool(0.02)) w.draft.banishes = Math.min(3, w.draft.banishes + 1)
    openDraft(w)
    stats.opens++
    if (w.draft.index === 1) stats.keystoneDrafts++
    let ids = check(w, 'open')
    log?.push(ids.join(','))
    for (let guard = 0; guard < 6; guard++) {
      const r = act.float()
      if (r < 0.25 && w.draft.rerolls > 0) {
        const left = w.draft.rerolls
        const able = canReroll(w)
        if (rerollDraft(w) !== able) fail.push(`seed ${seed}: rerollDraft disagrees with canReroll`)
        if (!able) {
          stats.rerollsRefused++
          if (w.draft.rerolls !== left) fail.push(`seed ${seed}: a refused reroll was spent`)
          if (!w.draft.cards.slice(0, w.draft.count).every((c) => c.kind === 'fallback')) fail.push(`seed ${seed}: reroll refused with a perk or fusion on show`)
          break
        }
        stats.rerolls++
        ids = check(w, 'reroll', ids)
      } else if (r < 0.4 && w.draft.banishes > 0) {
        const i = act.int(0, 2)
        if (banishCard(w, i)) {
          stats.banishes++
          ids = check(w, 'banish')
        }
      } else break
      log?.push(ids.join(','))
    }
    if (act.bool(0.05)) {
      skipDraft(w)
      stats.skips++
    } else {
      pickCard(w, act.int(0, 2))
      stats.picks++
    }
    if (w.draft.open) fail.push(`seed ${seed}: draft still open after the answer`)
  }
}

let seed = 1
let left = TOTAL
while (left > 0) {
  const n = Math.min(left, 20 + (seed % 7) * 20) // runs of 20 to 140 drafts (the long ones exhaust the pool)
  run(seed, n)
  left -= n
  seed++
}
const loop = { ...stats }
const a = []
const b = []
run(4242, 120, a)
run(4242, 120, b)
const deterministic = JSON.stringify(a) === JSON.stringify(b)
if (!deterministic) fail.push('replay of seed 4242 differs')

const ex = makeWorld(99, 'nova', PERKS)
for (const p of PERKS) ex.perkStacks.set(p.id, p.max)
for (const fu of FUSIONS) ex.perkStacks.set(fu.id, 1)
const exhaustion = []
for (let k = 0; k < 6; k++) {
  ex.time += 12
  ex.pendingLevelUps = 1
  openDraft(ex)
  const ids = ex.draft.cards.slice(0, ex.draft.count).map((c) => c.id)
  exhaustion.push(ids.join(','))
  if (ids.length !== 3 || !ex.draft.cards.slice(0, 3).every((c) => c.kind === 'fallback')) fail.push('exhaustion draft ' + k + ': ' + ids)
  // Only fallbacks can come up: REROLL and BANISH have nothing to act on and spend nothing.
  const left = [ex.draft.rerolls, ex.draft.banishes]
  if (canReroll(ex) || canBanish(ex.draft)) fail.push('exhaustion draft ' + k + ': REROLL or BANISH enabled on fallbacks')
  if (rerollDraft(ex) || banishCard(ex, 0) || ex.draft.rerolls !== left[0] || ex.draft.banishes !== left[1]) fail.push('exhaustion draft ' + k + ': a reroll or banish was spent on fallbacks')
  pickCard(ex, k % 3)
  if (ex.draft.open || ex.pendingLevelUps !== 0) fail.push('exhaustion draft ' + k + ' did not close')
}

console.log(JSON.stringify({ drafts: loop.opens, runs: seed - 1, ...loop, replayDrafts: stats.opens - loop.opens, deterministic, exhaustion, failures: fail.length, firstFailures: fail.slice(0, 12) }, null, 1))
process.exit(fail.length ? 1 : 0)
