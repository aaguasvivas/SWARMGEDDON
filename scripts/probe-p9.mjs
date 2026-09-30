// Hive Cores, shards, bonuses and pilot rules acceptance probe (NEXT-LEVEL P9).
// Drives the DEV build headless with the render loop stopped, so only step()
// and the sim functions it imports from the dev server advance anything; takes
// the machine-wide Chrome lock first.
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Usage: node scripts/probe-p9.mjs [cores|shards|bonuses|pilots|all]   (default all)
//   cores    1,000 mid1 cores split 60/35/5 within 3% (one stream and 1,000
//            seeds; mid2 and overtime shown too); a core pauses the run behind
//            its reveal, the levels go to owned non-maxed perks (SHARPEN past
//            them), +1 reroll and +1 banish (capped); the evolution offer and
//            its result; one evolution completes EVOLVED (#37) and adds 1 to
//            stats.evolutions
//   shards   an elite kill drops a shard, the next one only 60 s later; contact
//            gives +1 level to an owned perk, SHARPEN when every one is maxed
//   bonuses  the first elite kill always drops one, the 8 s gap, the 40 s
//            pity, at most 2 on the field; NUKE (kills without score, elites
//            30%, bosses 6%, shots removed, BROOD and VOLATILE still fire, no
//            bonus), FIREBLAST (24 shots, x1.5, pierce +3, no bonus), FREEZE,
//            OVERDRIVE, SHIELD (and no Close Call), VACUUM
//   pilots   NOVA takes pods at once and they home in, her salvage; EMBER's two
//            charges, reload and x1.3; VESPER gets no medkit, kill healing
//            capped at 8 HP/s, +8 max HP per elite and +25 per boss
// Prints one JSON line per check and exits 1 if any check fails.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WHAT = process.argv[2] || 'all'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0

function report(group, checks) {
  for (const [k, v] of Object.entries(checks)) {
    const pass = v.pass !== false
    if (!pass) failed++
    console.log(JSON.stringify({ check: `${group}.${k}`, ...v, pass }))
  }
}

// In-page helpers, installed once per page as window.__P9.
const HELPERS = `(async () => {
  const S = window.__SWARM
  const w = S.world
  const pl = w.player
  const inp = S.input
  const DT = 1 / 60
  const M = {
    cores: await import('/src/systems/cores.ts'),
    bonuses: await import('/src/systems/bonuses.ts'),
    collision: await import('/src/systems/collision.ts'),
    pickups: await import('/src/systems/pickups.ts'),
    spawn: await import('/src/systems/spawn.ts'),
    damage: await import('/src/systems/damage.ts'),
    dash: await import('/src/systems/dash.ts'),
    config: await import('/src/config.ts'),
    content: await import('/src/content/bonuses.ts'),
  }
  const ctl = { mx: 0, my: 0, ax: 1, ay: 0, fire: false, dash: false }
  S.loop.stop()
  inp.update = () => {
    inp.move.x = ctl.mx
    inp.move.y = ctl.my
    inp.aimDir.x = ctl.ax
    inp.aimDir.y = ctl.ay
    inp.firing = ctl.fire
    if (ctl.dash) {
      inp.pressDash()
      ctl.dash = false
    }
  }
  /** A fresh run of pilot c in arena a with the director held back, the field
   *  empty and the ship at the arena center. */
  const fresh = (c = 'nova', a = 'hive', seed = 4242) => {
    S.setLoadout(c, a)
    S.startRun('endless')
    w.beginRun(seed >>> 0, 'endless')
    const d = w.director
    d.beatCursor = d.warnCursor = w.script.beats.length
    d.pulseT = 1e9
    w.enemies.clear()
    w.pickups.clear()
    w.pickupN.fill(0)
    w.bankGem = null
    ctl.mx = ctl.my = 0
    ctl.fire = false
    w.time = 1
    return w
  }
  /** No top-up while a check steps the sim. */
  const hold = () => {
    const row = w.script.minutes[Math.min(11, Math.floor(w.time / 60))]
    w.director.topupAcc = -1e9
    return row
  }
  const spawnAt = (id, dx, dy) => M.spawn.spawnEnemy(w, id, pl.x + dx, pl.y + dy)
  const kill = (e) => M.collision.blastHit(w, e, e.hp + 1e6, false)
  const count = (kind) => w.pickups.active.filter((p) => p.alive && p.kind === kind).length
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      hold()
      S.step(1)
    }
  }
  const sweep = () => {
    w.enemies.sweep()
    w.pickups.sweep()
    w.projectiles.sweep()
    w.enemyProjectiles.sweep()
    w.hazards.sweep()
  }
  // Shots fired: every projectile the pool hands out.
  const shots = { n: 0 }
  const acq = w.projectiles.acquire.bind(w.projectiles)
  w.projectiles.acquire = () => {
    shots.n++
    return acq()
  }
  window.__P9 = { S, w, pl, inp, ctl, M, DT, fresh, hold, spawnAt, kill, count, step, sweep, shots }
})()`

const CORES = `(async () => {
  const { S, w, pl, M, fresh, step, count } = window.__P9
  const out = {}
  const T = M.config.CORES.table
  // The split: 1,000 rolls on one loot stream, and the first roll of 1,000 seeds.
  const split = (rows) => {
    const n = [0, 0, 0]
    for (const v of rows) n[v === 1 ? 0 : v === 3 ? 1 : 2]++
    return n.map((k) => +(k / rows.length).toFixed(3))
  }
  const within = (f, want) => f.every((v, i) => Math.abs(v - want[i]) <= 0.03)
  for (const [row, name] of [[0, 'mid1'], [1, 'mid2'], [2, 'overtime']]) {
    fresh()
    const one = []
    for (let i = 0; i < 1000; i++) one.push(M.cores.rollCoreLevels(w, row))
    const seeds = []
    for (let s = 1; s <= 1000; s++) {
      w.rngs.begin(s * 7919)
      seeds.push(M.cores.rollCoreLevels(w, row))
    }
    const a = split(one)
    const b = split(seeds)
    out['split_' + name] = { want: T[name], oneStream: a, seeds1000: b, pass: row !== 0 || (within(a, T[name]) && within(b, T[name])) }
  }

  // A mid2 core, no evolution: the reveal pauses, the levels go to owned perks.
  fresh()
  for (const id of ['heavy_rounds', 'adrenaline', 'adrenaline', 'berserker']) w.choosePerk(id)
  const before = Object.fromEntries(w.perkStacks)
  w.draft.rerolls = 5
  w.draft.banishes = 1
  S.dropCore(1)
  const c = w.pickups.active.find((p) => p.alive && p.kind === 'core')
  const coreLife = c.life
  c.x = c.prevX = pl.x
  c.y = c.prevY = pl.y
  step(1)
  const pending = w.core.pending && w.paused
  const ids = w.core.ids.slice(0, w.core.levels)
  const levels = w.core.levels
  S.takeCore(false)
  const after = Object.fromEntries(w.perkStacks)
  let gained = 0
  for (const k of Object.keys(after)) gained += after[k] - (before[k] ?? 0)
  const onlyOpen = ids.every((id) => id === 'sharpen' || id === 'heavy_rounds' || id === 'adrenaline')
  out.levels = {
    levels, ids, gained, coreLife, rerolls: w.draft.rerolls, banishes: w.draft.banishes, resumed: !w.paused, invuln: +pl.invuln.toFixed(2),
    pass: pending && gained === levels && onlyOpen && !ids.includes('berserker') && coreLife === Infinity && w.draft.rerolls === 5 && w.draft.banishes === 2 && !w.paused && pl.invuln >= 0.74,
  }

  // All owned perks maxed: every level becomes SHARPEN.
  fresh()
  w.choosePerk('berserker')
  M.cores.grantPrimeCore(w)
  const sharp = w.core.ids.slice(0, w.core.levels)
  step(1)
  S.takeCore(false)
  out.overflow = { ids: sharp, sharpen: w.perkStacks.get('sharpen') ?? 0, pass: sharp.length === 5 && sharp.every((id) => id === 'sharpen') && w.perkStacks.get('sharpen') === 5 }

  // The evolution: RAIL SPIKE held with Deadeye 2 evolves to SKEWER, which
  // becomes the base weapon; the run records it; EVOLVED completes and
  // stats.evolutions grows by 1.
  fresh()
  const stats0 = S.loadJSON('stats', { evolutions: 0 }).evolutions ?? 0
  const feats0 = S.loadJSON('feats', { done: {} }).done
  w.choosePerk('deadeye')
  w.choosePerk('deadeye')
  S.give('railgun')
  S.dropCore(0)
  const c2 = w.pickups.active.find((p) => p.alive && p.kind === 'core')
  c2.x = c2.prevX = pl.x
  c2.y = c2.prevY = pl.y
  step(1)
  const offer = { from: w.core.evolveFrom, to: w.core.evolveTo }
  const deadeye = w.perkStacks.get('deadeye')
  S.takeCore(true)
  const evolved = { base: w.baseWeaponId, weapon: w.weapon.id, ammo: w.ammo, evolutions: [...w.evolutions], deadeye: w.perkStacks.get('deadeye') }
  // A pod after the evolution is temporary: empty it and the SKEWER returns.
  S.give('smg')
  w.ammo = 0.5
  w.fireCooldown = 0
  window.__P9.ctl.fire = true
  step(2)
  window.__P9.ctl.fire = false
  const back = w.weapon.id
  w.time = 30
  S.endRun('quit', 'menu')
  const r = S.lastResult
  const stats1 = S.loadJSON('stats', { evolutions: 0 }).evolutions ?? 0
  const feats1 = S.loadJSON('feats', { done: {} }).done
  out.evolve = {
    offer, evolved, back, result: r.evolutions, statsEvolutions: [stats0, stats1], evolvedFeat: [!!feats0.evolved, !!feats1.evolved],
    pass: offer.from === 'railgun' && offer.to === 'skewer' && evolved.base === 'skewer' && evolved.weapon === 'skewer' && evolved.ammo === -1 &&
      evolved.deadeye === deadeye && back === 'skewer' && r.evolutions.length === 1 && r.evolutions[0] === 'skewer' && stats1 === stats0 + 1 && !!feats1.evolved,
  }

  // No offer without the pair at 2 stacks, or on the base weapon.
  fresh()
  w.choosePerk('deadeye')
  S.give('railgun')
  M.cores.grantPrimeCore(w)
  const noPair = w.core.evolveTo
  w.core.reset()
  fresh()
  w.choosePerk('deadeye')
  w.choosePerk('deadeye')
  M.cores.grantPrimeCore(w)
  const noHeld = w.core.evolveTo
  w.core.reset()
  // Already evolved: a new RAIL SPIKE pod cannot evolve into the SKEWER again.
  w.baseWeaponId = 'skewer'
  w.equipWeapon('skewer')
  S.give('railgun')
  M.cores.grantPrimeCore(w)
  const again = w.core.evolveTo
  w.core.reset()
  out.noOffer = { pairAt1: noPair, onBase: noHeld, sameAsBase: again, pass: noPair === '' && noHeld === '' && again === '' }

  // The PRIME kill drops no core at the corpse (it comes with OVERTIME); a mid kill does.
  return out
})()`

const SHARDS = `(async () => {
  const { w, pl, fresh, spawnAt, kill, count, sweep, M, step } = window.__P9
  const out = {}
  fresh()
  w.time = 90
  const e1 = spawnAt('guardian', 200, 0)
  kill(e1)
  sweep()
  const s1 = count('shard')
  const ready1 = w.eliteCoreReadyAt
  w.time = 120
  kill(spawnAt('guardian', -200, 0))
  sweep()
  const s2 = count('shard')
  w.time = 150.02
  kill(spawnAt('guardian', 0, 200))
  sweep()
  const s3 = count('shard')
  const shard = w.pickups.active.find((p) => p.alive && p.kind === 'shard')
  out.cooldown = { firstAt90: s1, readyAt: ready1, at120: s2, at150: s3, life: +shard.life.toFixed(2), pass: s1 === 1 && Math.abs(ready1 - 150) < 1e-6 && s2 === 1 && s3 === 2 && Math.abs(shard.life - 30) < 1e-6 }

  // Contact: +1 level to an owned non-maxed perk.
  fresh()
  w.choosePerk('adrenaline')
  w.choosePerk('adrenaline')
  w.choosePerk('berserker')
  M.pickups.dropShard(w, pl.x, pl.y)
  step(1)
  const adr = w.perkStacks.get('adrenaline')
  // Only maxed perks: SHARPEN.
  fresh()
  w.choosePerk('berserker')
  M.pickups.dropShard(w, pl.x, pl.y)
  step(1)
  out.contact = { adrenaline: adr, sharpenWhenMaxed: w.perkStacks.get('sharpen') ?? 0, noPause: !w.paused, pass: adr === 3 && w.perkStacks.get('sharpen') === 1 && !w.paused }
  return out
})()`

const BONUSES = `(async () => {
  const { S, w, pl, ctl, M, fresh, spawnAt, kill, count, step, sweep, shots } = window.__P9
  const { BONUS_NUKE, BONUS_FREEZE, BONUS_OVERDRIVE, BONUS_SHIELD, BONUS_FIREBLAST, BONUS_VACUUM } = M.content
  const out = {}
  // Drop rules.
  fresh()
  w.time = 10
  kill(spawnAt('guardian', 300, 0))
  sweep()
  const firstElite = count('bonus')
  const t0 = w.lastBonusAt
  w.time = 12
  for (let i = 0; i < 400; i++) kill(spawnAt('brute', 300, 40))
  sweep()
  const inGap = count('bonus')
  w.time = t0 + 41
  kill(spawnAt('swarmer', 300, 80))
  sweep()
  const pityXp1 = count('bonus')
  kill(spawnAt('brute', 300, 80))
  sweep()
  const pityXp2 = count('bonus')
  w.time = t0 + 200
  for (let i = 0; i < 400; i++) kill(spawnAt('brute', 300, 120))
  sweep()
  const cap = count('bonus')
  const types = w.pickups.active.filter((p) => p.alive && p.kind === 'bonus').map((p) => p.sub)
  out.dropRules = { firstElite, inGap, pityXp1, pityXp2, capAfter400: cap, types, pass: firstElite === 1 && inGap === 1 && pityXp1 === 1 && pityXp2 === 2 && cap === 2 && types[0] !== types[1] }

  // NUKE.
  fresh()
  w.time = 60
  w.lastBonusAt = -100 // pity armed: any 2+ XP kill would drop a bonus
  const near = []
  for (let i = 0; i < 12; i++) near.push(spawnAt('brute', Math.cos(i) * 300, Math.sin(i) * 300))
  const far = spawnAt('brute', 420, 0)
  const elite = spawnAt('guardian', 0, 200)
  const eHp = elite.hp
  const brood = spawnAt('guardian', 0, -200)
  brood.affix = 4 | 8 // BROOD + VOLATILE
  brood.hp = brood.maxHp * 0.2
  const boss = spawnAt('queen', -250, 0)
  const bHp = boss.hp
  const shot = w.enemyProjectiles.acquire()
  shot.x = pl.x + 100
  shot.y = pl.y
  shot.vx = shot.vy = 0
  shot.life = 5
  const score0 = w.score
  const kills0 = w.kills
  const xp0 = w.xpDropped
  const alive0 = w.enemies.size
  const hz0 = w.hazards.size
  M.bonuses.takeBonus(w, BONUS_NUKE)
  const nearDead = near.every((e) => !e.alive)
  const res = {
    nearDead, farAlive: far.alive, eliteFrac: +(1 - elite.hp / eHp).toFixed(3), bossFrac: +(1 - boss.hp / bHp).toFixed(3),
    broodDead: !brood.alive, shotRemoved: !shot.alive, scoreDelta: w.score - score0, kills: w.kills - kills0, xpDropped: +(w.xpDropped - xp0).toFixed(1),
    hazards: w.hazards.size - hz0, bonuses: count('bonus'),
  }
  sweep()
  res.broodSpawned = w.enemies.size - (alive0 - 13)
  out.nuke = { ...res, pass: nearDead && far.alive && Math.abs(res.eliteFrac - 0.3) < 0.002 && Math.abs(res.bossFrac - 0.06) < 0.002 && res.broodDead && res.shotRemoved && res.scoreDelta === 0 && res.kills === 13 && res.xpDropped > 0 && res.hazards === 1 && res.bonuses === 0 && res.broodSpawned === 8 }

  // FIREBLAST: 24 shots of the current weapon, x1.5, pierce +3; its kills drop no bonus.
  fresh()
  w.time = 60
  w.lastBonusAt = -100
  const p0 = w.projectiles.size
  M.bonuses.takeBonus(w, BONUS_FIREBLAST)
  const ring = w.projectiles.active.slice(p0)
  const dmg = ring.map((p) => p.damage)
  const pierce = ring.map((p) => p.pierce)
  for (let i = 0; i < 24; i++) spawnAt('brute', Math.cos((i / 24) * Math.PI * 2 + pl.facing) * 60, Math.sin((i / 24) * Math.PI * 2 + pl.facing) * 60).hp = 1
  const k0 = w.kills
  step(20)
  out.fireblast = {
    shots: ring.length, damage: dmg[0], pierce: pierce[0], noBonus: ring.every((p) => p.noBonus), kills: w.kills - k0, bonuses: count('bonus'),
    pass: ring.length === 24 && Math.abs(dmg[0] - 16 * 1.5) < 1e-6 && pierce.every((v) => v === 3) && w.kills - k0 >= 24 && count('bonus') === 0,
  }

  // FREEZE: non-boss enemies stand still, hold fire and do not bite; +20% damage.
  fresh()
  const hp0 = pl.hp
  const sw = spawnAt('swarmer', 0, 0)
  sw.hp = sw.maxHp = 100
  const sp = spawnAt('spitter', 250, 0)
  sp.fireTimer = 0.05
  M.bonuses.takeBonus(w, BONUS_FREEZE)
  const x0 = [sw.x, sp.x]
  const eps0 = w.enemyProjectiles.size
  step(60)
  const moved = sw.x !== x0[0] || sp.x !== x0[1]
  const bit = pl.hp < hp0
  const enemyShots = w.enemyProjectiles.size - eps0
  M.collision.blastHit(w, sw, 10, false)
  const took = 100 - sw.hp
  const tLeft = w.freezeT
  step(3 * 60 + 5)
  out.freeze = { moved, bit, enemyShots, damageTaken: +took.toFixed(2), leftAfter1s: +tLeft.toFixed(2), endedAt4s: w.freezeT === 0, pass: !moved && !bit && enemyShots === 0 && Math.abs(took - 12) < 1e-6 && Math.abs(tLeft - 3) < 0.02 && w.freezeT === 0 }

  // OVERDRIVE: fire rate x1.6, no ammo cost, move x1.15, for 8 s.
  fresh()
  S.give('smg')
  const ammo0 = w.ammo
  M.bonuses.takeBonus(w, BONUS_OVERDRIVE)
  ctl.fire = true
  const pr0 = shots.n
  w.fireCooldown = 0
  step(60)
  ctl.fire = false
  const fired = shots.n - pr0
  const speed = M.damage.playerSpeedMul(w)
  out.overdrive = { fired1s: fired, ammoUsed: ammo0 - w.ammo, speedMul: +speed.toFixed(3), pass: fired >= 20 && fired <= 22 && ammo0 === w.ammo && Math.abs(speed - 1.15) < 1e-9 && Math.abs(w.overdriveT - 7) < 0.02 }

  // SHIELD: no damage of any kind, and no Close Call.
  fresh()
  M.bonuses.takeBonus(w, BONUS_SHIELD)
  const hpS = pl.hp
  const a = M.damage.hurtPlayer(w, 50, 'discrete', -1, pl.x, pl.y)
  const b = M.damage.hurtPlayer(w, 50, 'bite', -1, pl.x, pl.y)
  const z = M.damage.hurtPlayer(w, 50, 'zone', -1, pl.x, pl.y)
  ctl.dash = true
  step(1)
  const armed = M.dash.closeCallArmed(w)
  out.shield = { removed: [a, b, z], hp: [hpS, pl.hp], dashing: pl.invuln > 0 && pl.invulnSrc === 1, closeCallArmed: armed, pass: a === 0 && b === 0 && z === 0 && pl.hp === hpS && pl.invuln > 0 && !armed }

  // VACUUM: every gem and medkit, never a bonus, a shard or a core.
  fresh()
  for (let i = 0; i < 30; i++) M.pickups.dropGem(w, pl.x + 600 + i * 5, pl.y + 300, 1)
  M.pickups.dropHealth(w, pl.x - 600, pl.y, 5)
  M.pickups.dropBonus(w, pl.x + 500, pl.y - 400, BONUS_FREEZE)
  M.pickups.dropShard(w, pl.x - 500, pl.y - 400)
  M.pickups.dropHiveCore(w, pl.x + 500, pl.y + 400, 0)
  M.bonuses.takeBonus(w, BONUS_VACUUM)
  const cap2 = w.pickups.active.filter((p) => p.alive).map((p) => p.kind + ':' + p.captured)
  const gemsCaptured = w.pickups.active.filter((p) => p.alive && (p.kind === 'xp' || p.kind === 'health')).every((p) => p.captured)
  const othersFree = w.pickups.active.filter((p) => p.alive && (p.kind === 'bonus' || p.kind === 'shard' || p.kind === 'core')).every((p) => !p.captured)
  out.vacuum = { gemsCaptured, othersFree, pass: gemsCaptured && othersFree && cap2.length === 34 }
  return out
})()`

const PILOTS = `(async () => {
  const { S, w, pl, ctl, M, fresh, hold, spawnAt, kill, count, step, sweep } = window.__P9
  const out = {}
  // NOVA: a pod on her is taken at once; one within the capture radius homes in.
  fresh('nova')
  const drop = (dx, dy) => {
    M.pickups.dropPod(w, pl.x + dx, pl.y + dy)
    return w.pickups.active[w.pickups.active.length - 1]
  }
  const pod1 = drop(0, 0)
  const id1 = pod1.weaponId
  step(1)
  const took1 = w.weapon.id === id1
  const pod2 = drop(110, 0)
  const id2 = pod2.weaponId
  let t = 0
  while (w.weapon.id !== id2 && t < 120) {
    step(1)
    t++
  }
  const pod3 = drop(320, 0)
  step(30)
  out.novaPods = { instant: took1, homedInTicks: t, farStays: pod3.alive && !pod3.captured, pass: took1 && t > 0 && t < 30 && pod3.alive && !pod3.captured }

  // NOVA salvage: +5% base weapon damage per emptied pickup magazine, max +50%.
  fresh('nova')
  const dmgOf = () => {
    const n0 = w.projectiles.size
    w.fireCooldown = 0
    ctl.fire = true
    step(1)
    ctl.fire = false
    return w.projectiles.active[n0].damage
  }
  const d0 = dmgOf()
  for (let i = 0; i < 12; i++) {
    S.give('smg')
    w.ammo = 0.01
    dmgOf()
  }
  const d12 = dmgOf()
  out.novaSalvage = { base: d0, after12: +d12.toFixed(3), salvage: w.salvage, pass: w.salvage === 12 && Math.abs(d12 - d0 * 1.5) < 1e-6 }

  // EMBER: two charges; every dash readies the gun and gives x1.3 for 1.5 s.
  fresh('ember')
  const charges = w.dashCharges
  const base = dmgOf()
  w.fireCooldown = 5
  ctl.dash = true
  hold()
  S.step(1)
  const cd = w.fireCooldown
  const burn = w.afterburnT
  const boosted = dmgOf()
  ctl.dash = true
  step(12)
  const second = w.dashCharges
  step(100)
  const later = dmgOf()
  out.ember = {
    charges, fireCooldownAfterDash: +cd.toFixed(3), afterburn: +burn.toFixed(3), damage: [base, +boosted.toFixed(3), later], chargesAfter2: second,
    pass: charges === 2 && cd <= 0 && Math.abs(burn - 1.5) < 0.02 && Math.abs(boosted - base * 1.3) < 1e-6 && second === 0 && later === base,
  }

  // VESPER: no medkit ever drops; the rolls still run.
  const medkits = {}
  for (const c of ['nova', 'vesper']) {
    fresh(c)
    w.time = 100
    let drops = 0
    const loot0 = w.rngs.loot.state
    for (let i = 0; i < 400; i++) {
      pl.hp = pl.maxHp * 0.1
      const n0 = count('health')
      kill(spawnAt('swarmer', 300, 0))
      drops += count('health') - n0
      sweep()
      w.pickups.active.forEach((p) => { if (p.kind === 'health') p.alive = false })
      w.pickups.sweep()
    }
    const n1 = count('health')
    kill(spawnAt('guardian', 300, 0))
    drops += count('health') - n1
    medkits[c] = drops
  }
  // VESPER kill healing: 1 HP per kill, 8 HP/s at most.
  fresh('vesper')
  w.time = 100
  pl.hp = 50
  for (let i = 0; i < 20; i++) kill(spawnAt('swarmer', 300, 0))
  const healed1 = pl.hp - 50
  // Elite +8 max HP, boss +25, healed the same.
  const max0 = pl.maxHp
  const hpA = pl.hp
  kill(spawnAt('guardian', 300, 0))
  const eliteGrow = [pl.maxHp - max0, pl.hp - hpA]
  const max1 = pl.maxHp
  const hpB = pl.hp
  const q = spawnAt('queen', -300, 0)
  w.bossAlive = true
  w.boss = q
  w.bossFight.begin('mid1')
  kill(q)
  const bossGrow = [pl.maxHp - max1, pl.hp - hpB]
  sweep()
  // A later perk pick keeps the growth.
  w.choosePerk('vitality')
  out.vesper = {
    medkits, killHealFrom20Kills: +healed1.toFixed(2), eliteGrow, bossGrow, maxHpAfterVitality: pl.maxHp,
    pass: medkits.vesper === 0 && medkits.nova > 20 && healed1 > 7.9 && healed1 <= 8.0001 && eliteGrow[0] === 8 && eliteGrow[1] >= 8 && bossGrow[0] === 25 && bossGrow[1] >= 25 && pl.maxHp === 120 + 8 + 25 + 25,
  }
  return out
})()`

await acquireChromeLock('probe-p9')
let browser
for (let attempt = 1; ; attempt++) {
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      protocolTimeout: 600000,
      args: ['--window-size=390,844', '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'],
      defaultViewport: { width: 390, height: 844 },
    })
    break
  } catch (e) {
    if (attempt >= 3) throw e
    console.error('launch failed, retrying in 10s:', e.message)
    await sleep(10000)
  }
}
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 30000 })
  await page.evaluate(HELPERS)
  const groups = { cores: CORES, shards: SHARDS, bonuses: BONUSES, pilots: PILOTS }
  for (const [name, src] of Object.entries(groups)) {
    if (WHAT !== 'all' && WHAT !== name) continue
    try {
      report(name, await page.evaluate(src))
    } catch (e) {
      failed++
      console.log(JSON.stringify({ check: name, error: String(e.message || e).slice(0, 400), pass: false }))
    }
  }
  if (errors.length) {
    failed++
    console.log(JSON.stringify({ check: 'pageErrors', errors, pass: false }))
  }
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
