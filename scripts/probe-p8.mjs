// Fusions, evolutions and pods acceptance probe (NEXT-LEVEL P8). Drives the DEV
// build's __SWARM handle headless with the render loop stopped, so only step()
// advances the sim; takes the machine-wide Chrome lock first.
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Usage: node scripts/probe-p8.mjs [weapons|pods|fusions|evolutions|perks|all]   (default all)
//   weapons     the A4 rebalance, the 9 evolved defs against A4.2 (stats, infinite
//               ammo, kickPx x1.2), and the SMG magazine at 20.0 +-0.1 s with and
//               without Adrenaline 5 (time-based ammo; Quartermaster scales it)
//   pods        A5.1: first timer pod at 20 s, 250 to 450 u away, inside the 60 u
//               inset, one timer pod at a time, inside cage.r - 40 while the cage is
//               up (the P6a carry-over), a pass at full speed never takes one,
//               standing takes it in 0.4 s (0.1 s with Quartermaster 3), the fill
//               decays at 2/s, life 20 s + 5 s per Quartermaster stack, the
//               affinity share, the held weapon never drops, elites drop at 0.35,
//               the boss pod lands 60 u from the corpse and prefers a 2+ pair
//   fusions     one check per A3 fusion, asserting its numbers
//   evolutions  one check per A4.2 behavior, asserting its numbers
//   perks       the P8 hand-off perks: Shock Step, Incendiary, Overpressure,
//               Ricochet, the Vampiric kill-heal cap, base Executioner, the blast
//               queue (a blast queued during a drain waits a tick; a full queue of
//               64 due blasts still queues the 64 blasts they set off)
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

// In-page helpers, installed once per page as window.__P8.
const HELPERS = `(() => {
  const S = window.__SWARM
  const w = S.world
  const pl = w.player
  const inp = S.input
  const DT = 1 / 60
  const ctl = { mx: 0, my: 0, ax: 0, ay: 0, fire: false }
  S.loop.stop()
  inp.update = () => {
    inp.move.x = ctl.mx
    inp.move.y = ctl.my
    inp.aimDir.x = ctl.ax
    inp.aimDir.y = ctl.ay
    inp.firing = ctl.fire
  }
  const CX = 1400
  const CY = 950
  /** A quiet run: the director is parked, the field is empty, the ship sits at
   *  (CX, CY - 400) with no input and long i-frames. */
  const fresh = (perks = [], char = 'nova') => {
    S.setLoadout(char, 'hive')
    S.startRun('endless')
    S.loop.stop()
    w.director.runState = 'stalemate'
    for (const id of perks) w.choosePerk(id)
    w.enemies.clear()
    w.projectiles.clear()
    w.enemyProjectiles.clear()
    w.pickups.clear()
    w.acid.clear()
    w.hazards.clear()
    w.blasts.reset()
    w.bankGem = null
    w.killHealBudget = w.mods.killHealCap
    w.weaponDropTimer = 1e9
    pl.x = pl.prevX = CX
    pl.y = pl.prevY = CY - 400
    pl.invuln = 1e9
    ctl.mx = ctl.my = ctl.ax = ctl.ay = 0
    ctl.fire = false
    w.feel.clear()
  }
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      w.pendingLevelUps = 0
      S.step(1)
      if (w.draft.open) S.skip()
      w.feel.clear()
    }
  }
  const enemyAt = (id, x, y, hp) => {
    S.spawn(id, 1)
    const e = w.enemies.active[w.enemies.active.length - 1]
    e.x = e.prevX = x
    e.y = e.prevY = y
    e.speed = 0
    if (hp !== undefined) e.hp = e.maxHp = hp
    return e
  }
  /** A player bullet placed so one projectileSystem step lands it at (x, y). */
  const shot = (x, y, dirX, dirY, dmg, o = {}) => {
    const sp = o.speed ?? 60
    const p = w.projectiles.acquire()
    p.x = p.prevX = x - dirX * sp * DT
    p.y = p.prevY = y - dirY * sp * DT
    p.vx = dirX * sp
    p.vy = dirY * sp
    p.facing = Math.atan2(dirY, dirX)
    p.damage = dmg
    p.radius = 4
    p.knockback = 0
    p.pierce = o.pierce ?? 0
    p.life = o.life ?? 1
    p.age = o.age ?? 0
    p.bounces = o.bounces ?? 0
    p.evo = o.evo ?? ''
    p.explodeRadius = o.explodeRadius ?? 0
    p.explodeDamage = o.explodeDamage ?? 0
    p.chain = o.chain ?? 0
    p.chainRange = o.chainRange ?? 0
    p.hitN = 0
    p.quad.scaleX = p.quad.scaleY = 1
    return p
  }
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
  const r3 = (v) => Math.round(v * 1000) / 1000
  const pods = () => w.pickups.active.filter((p) => p.alive && p.kind === 'weapon')
  /** Empty the field without restarting the run. */
  const clearField = () => {
    w.enemies.clear()
    w.projectiles.clear()
    w.enemyProjectiles.clear()
    w.pickups.clear()
    w.blasts.reset()
    w.bankGem = null
  }
  window.__P8 = { S, w, pl, inp, ctl, DT, CX, CY, fresh, step, enemyAt, shot, near, r3, pods, clearField }
})()`

// --- weapons -----------------------------------------------------------------
function weaponChecks() {
  const { S, w, ctl, fresh, step, near } = window.__P8
  const out = {}
  // The registry is reachable through equipWeapon: equip an id and read w.weapon.
  const def = (id) => {
    w.equipWeapon(id)
    return w.weapon
  }
  fresh()
  const smg = def('smg')
  const vortex = def('vortex')
  const stiletto = def('stiletto')
  out.rebalance = {
    smg: smg.damage, vortex: [vortex.fireRate, vortex.damage], stiletto: stiletto.damage,
    pass: smg.damage === 8.5 && vortex.fireRate === 2.6 && vortex.damage === 32 && stiletto.damage === 12,
  }
  // A4.2 stats; unlisted fields come from the source weapon.
  const A42 = {
    gore_hose: ['smg', 'pierceOnKill', { fireRate: 18, damage: 10, spread: 0.08, projectileSpeed: 860, projectileLife: 0.6 }],
    devastator: ['shotgun', 'pointBlank', { fireRate: 2.4, projectilesPerShot: 12, damage: 7, spread: 0.34, knockback: 320, projectileLife: 0.38 }],
    hive_reaper: ['minigun', 'lockOn', { fireRate: 24, damage: 7, spread: 0.12 }],
    ion_spear: ['plasma', 'pierceRamp', { fireRate: 8, damage: 24, pierce: 6, projectileSpeed: 1100 }],
    skewer: ['railgun', 'firstHitCrit', { fireRate: 1.6, damage: 120, pierce: 20, projectileSpeed: 2000, knockback: 400 }],
    inferno: ['flamethrower', 'ignite', { fireRate: 22, projectilesPerShot: 3, damage: 4, pierce: 2, projectileLife: 0.45 }],
    plague_barrage: ['rocket', 'bomblets', { fireRate: 1.2, projectilesPerShot: 3, spread: 0.08, damage: 26, explodeRadius: 110, explodeDamage: 50 }],
    storm_lash: ['lightning', 'stormChain', { fireRate: 7, damage: 18, chain: 7, chainRange: 200 }],
    solar_lance: ['beam', 'rangeRamp', { fireRate: 24, damage: 6, pierce: 10, projectileLife: 0.6 }],
  }
  for (const [id, [src, evo, stats]] of Object.entries(A42)) {
    const s = def(src)
    const e = def(id)
    const bad = []
    for (const [k, v] of Object.entries(stats)) if (e[k] !== v) bad.push(`${k}=${e[k]} want ${v}`)
    for (const k of ['projectileRadius', 'tint', 'sfx']) if (e[k] !== s[k]) bad.push(`${k} differs from ${src}`)
    if (e.ammo !== -1) bad.push('ammo not infinite')
    if (!near(e.kickPx, s.kickPx * 1.2)) bad.push(`kickPx ${e.kickPx}`)
    if (e.evo !== evo) bad.push(`evo ${e.evo}`)
    if (s.evolvesTo !== id) bad.push(`${src}.evolvesTo ${s.evolvesTo}`)
    if (e.pair || e.evolvesTo) bad.push('evolved def keeps pair/evolvesTo')
    out['evolvedDef_' + id] = { bad, pass: bad.length === 0 }
  }
  // An evolved base weapon never runs dry.
  fresh()
  w.baseWeaponId = 'gore_hose'
  w.equipWeapon('gore_hose')
  ctl.ax = 1
  ctl.fire = true
  step(60 * 30)
  out.evolvedInfinite = { weapon: w.weapon.id, ammo: w.ammo, pass: w.weapon.id === 'gore_hose' && w.ammo === -1 }

  // SMG magazine: 260 rounds at 13/s last 20 s whatever the fire rate.
  const magazine = (perks) => {
    fresh(perks)
    w.equipWeapon('smg')
    const ammo0 = w.ammo
    ctl.ax = 1
    ctl.fire = true
    let shots = 0
    for (let t = 1; t <= 60 * 30; t++) {
      w.pendingLevelUps = 0
      S.step(1)
      for (let i = 0; i < w.feel.n; i++) if (w.feel.kind[i] === 1) shots++
      w.feel.clear()
      if (w.weapon.id !== 'smg') return { seconds: +(t / 60).toFixed(3), ammo0, shots }
    }
    return { seconds: -1, ammo0, shots }
  }
  const plain = magazine([])
  const adr5 = magazine(['adrenaline', 'adrenaline', 'adrenaline', 'adrenaline', 'adrenaline'])
  const qm1 = magazine(['quartermaster'])
  out.smgMagazine = {
    plain, adrenaline5: adr5, quartermaster1: qm1,
    pass: Math.abs(plain.seconds - 20) <= 0.1 && Math.abs(adr5.seconds - 20) <= 0.1 && plain.shots === 260 && adr5.shots === 442
      && near(qm1.ammo0, 260 * 1.3) && Math.abs(qm1.seconds - 26) <= 0.1,
  }
  // LowAmmo fires once per magazine, as the magazine crosses 20%.
  fresh()
  w.equipWeapon('smg')
  ctl.ax = 1
  ctl.fire = true
  let low = 0
  let lowAt = -1
  for (let t = 1; t <= 60 * 21 && w.weapon.id === 'smg'; t++) {
    window.__SWARM.step(1)
    w.pendingLevelUps = 0
    for (let i = 0; i < w.feel.n; i++) if (w.feel.kind[i] === 13) { low++; lowAt = w.ammo }
    w.feel.clear()
  }
  out.lowAmmoOnce = { count: low, ammoAt: lowAt, pass: low === 1 && lowAt < 52 && lowAt > 50 }
  S.loop.start()
  return out
}

// --- pods --------------------------------------------------------------------
function podChecks() {
  const { S, w, pl, ctl, DT, CX, CY, fresh, step, near, r3, pods, enemyAt, shot, clearField } = window.__P8
  const out = {}
  const b = w.arena.bounds

  // First timer pod at 20 s; the 35 s slot is skipped while it is still there.
  fresh()
  w.weaponDropTimer = 20
  w.time = 0
  let firstAt = -1
  for (let t = 1; t <= 60 * 21; t++) {
    step(1)
    if (pods().length > 0) { firstAt = +w.time.toFixed(3); break }
  }
  const first = pods()[0]
  const dist = first ? Math.hypot(first.x - pl.x, first.y - pl.y) : -1
  step(60 * 15)
  const at35 = pods().length
  first.alive = false
  step(60 * 15 + 1)
  out.timerFirst = {
    firstAt, dist: r3(dist), life: first ? r3(first.life + 15) : -1, podsAt35: at35, afterTakenNextSlot: pods().length,
    pass: Math.abs(firstAt - 20) < 0.02 && dist >= 250 - 1e-6 && dist <= 450 + 1e-6 && at35 === 1 && pods().length === 1,
  }

  // Placement: 400 timer pods from ship spots all over the arena, including corners.
  const inset = 60
  let outsideArena = 0
  let outOfRange = 0
  let placed = 0
  let rng = 12345
  const rnd = () => ((rng = (Math.imul(rng, 1103515245) + 12345) >>> 0) / 4294967296)
  fresh()
  for (let i = 0; i < 400; i++) {
    clearField()
    pl.x = pl.prevX = b.x + 20 + rnd() * (b.w - 40)
    pl.y = pl.prevY = b.y + 20 + rnd() * (b.h - 40)
    w.weaponDropTimer = DT / 2
    step(1)
    const p = pods()[0]
    if (!p) continue
    placed++
    if (p.x < b.x + inset - 1e-6 || p.x > b.x + b.w - inset + 1e-6 || p.y < b.y + inset - 1e-6 || p.y > b.y + b.h - inset + 1e-6) outsideArena++
    const d = Math.hypot(p.x - pl.x, p.y - pl.y)
    // A pod pulled in by the inset clamp may come closer; never farther.
    if (d > 450 + 1e-6) outOfRange++
  }
  out.timerPlacement = { placed, outsideArena, outOfRange, pass: placed === 400 && outsideArena === 0 && outOfRange === 0 }

  // One timer pod at a time: slots pass while one is on the field.
  fresh()
  w.weaponDropTimer = DT / 2
  step(1)
  let maxTimer = 0
  for (let t = 0; t < 60 * 60; t++) {
    step(1)
    const n = pods().filter((p) => p.timer).length
    if (n > maxTimer) maxTimer = n
  }
  out.oneTimerPod = { maxTimer, pass: maxTimer === 1 }

  // Cage carry-over: while the cage is up, every pod lands inside cage.r - 40.
  let worst = -1e9
  let cageN = 0
  const cage = w.director.cage
  fresh()
  for (let i = 0; i < 300; i++) {
    clearField()
    const r = 340 + rnd() * 180
    cage.active = true
    cage.r = r
    cage.x = b.x + r + 30 + rnd() * (b.w - 2 * r - 60)
    cage.y = b.y + r + 30 + rnd() * (b.h - 2 * r - 60)
    const a = rnd() * Math.PI * 2
    const pr = rnd() * (r - 20)
    pl.x = pl.prevX = cage.x + Math.cos(a) * pr
    pl.y = pl.prevY = cage.y + Math.sin(a) * pr
    w.weaponDropTimer = DT / 2
    step(1)
    // An elite dying outside the ring drops its pod inside it too.
    const e = enemyAt('guardian', cage.x + Math.cos(a + 2) * (r + 60), cage.y + Math.sin(a + 2) * (r + 60), 1)
    w.rngs.loot.reseed(i * 7 + 1)
    for (let k = 0; k < 6 && e.alive; k++) {
      shot(e.x, e.y, 1, 0, 5)
      step(1)
    }
    for (const p of pods()) {
      cageN++
      const over = Math.hypot(p.x - cage.x, p.y - cage.y) - (cage.r - 40)
      if (over > worst) worst = over
    }
  }
  cage.active = false
  out.cageClamp = { pods: cageN, worstOverCageRMinus40: r3(worst), pass: cageN >= 300 && worst <= 1e-6 }

  // Hold to take: a pass at full speed never takes it; standing takes 0.4 s.
  const podAt = (x, y) => {
    w.weaponDropTimer = DT / 2
    step(1)
    const p = pods()[0]
    p.x = p.prevX = x
    p.y = p.prevY = y
    return p
  }
  fresh()
  let p = podAt(CX, CY)
  pl.x = pl.prevX = CX - 200
  pl.y = pl.prevY = CY
  ctl.mx = 1
  let maxFill = 0
  for (let t = 0; t < 90; t++) {
    step(1)
    if (p.alive && p.hold > maxFill) maxFill = p.hold
  }
  ctl.mx = 0
  const crossed = { taken: w.weapon.id !== 'pistol', podAlive: p.alive, maxFill: r3(maxFill), shipX: r3(pl.x - CX) }
  const decayFrom = p.hold
  out.crossNoTake = { ...crossed, pass: !crossed.taken && crossed.podAlive && crossed.shipX > 200 && maxFill > 0.5 && maxFill < 1 }
  out.fillDecay = { fillAfter90Ticks: r3(decayFrom), pass: decayFrom === 0 }

  const standTicks = (perks) => {
    fresh(perks)
    const pod = podAt(CX, CY)
    pl.x = pl.prevX = CX
    pl.y = pl.prevY = CY
    for (let t = 1; t <= 60; t++) {
      step(1)
      if (!pod.alive) return { ticks: t, weapon: w.weapon.id, life: 0 }
    }
    return { ticks: -1 }
  }
  const s0 = standTicks([])
  const s3 = standTicks(['quartermaster', 'quartermaster', 'quartermaster'])
  out.holdTime = { plain: s0, quartermaster3: s3, pass: s0.ticks === 24 && s3.ticks === 6 && s0.weapon !== 'pistol' }

  // Decay: fill 2/s off the pod.
  fresh()
  p = podAt(CX, CY)
  p.hold = 0.8
  step(15)
  out.holdDecay = { after15Ticks: r3(p.hold), pass: near(p.hold, 0.3, 1e-6) }

  // Life: 20 s + 5 s per Quartermaster stack.
  const lifeOf = (perks) => {
    fresh(perks)
    w.weaponDropTimer = DT / 2
    step(1)
    return r3(pods()[0].life + DT)
  }
  const l0 = lifeOf([])
  const l2 = lifeOf(['quartermaster', 'quartermaster'])
  out.podLife = { plain: l0, quartermaster2: l2, pass: near(l0, 20, 1e-3) && near(l2, 30, 1e-3) }

  // Type: affinity 0.5 toward owned pairs; the held weapon never drops. The
  // pool is this run's (P12b): the 6 start weapons on a fresh save, then all 11
  // once every feat reward is owned. Expected share 0.5 + 0.5 / (pool - 1).
  const affinity = () => {
    fresh(['adrenaline'])
    w.equipWeapon('shotgun')
    const counts = {}
    w.rngs.loot.reseed(99)
    for (let i = 0; i < 2000; i++) {
      for (const q of pods()) q.alive = false
      w.pickups.sweep()
      w.weaponDropTimer = DT / 2
      w.ammo = 1e9
      step(1)
      const q = pods()[0]
      counts[q.weaponId] = (counts[q.weaponId] ?? 0) + 1
    }
    const smgShare = (counts.smg ?? 0) / 2000
    const poolN = w.weaponPool.length
    const want = 0.5 + 0.5 / (poolN - 1)
    return { pool: poolN, smgShare: r3(smgShare), want: r3(want), held: counts.shotgun ?? 0, kinds: Object.keys(counts).length,
      ok: Math.abs(smgShare - want) < 0.04 && !counts.shotgun && Object.keys(counts).length === poolN - 1 }
  }
  const startPool = affinity()
  S.unlockAll()
  const fullPool = affinity()
  out.podAffinity = { startPool, fullPool, pass: startPool.ok && fullPool.ok && startPool.pool === 6 && fullPool.pool === 11 }

  // Elites drop a pod at 0.35.
  fresh()
  let elitePods = 0
  const N = 600
  for (let i = 0; i < N; i++) {
    const e = enemyAt('guardian', CX + 300, CY, 1)
    const before = pods().length
    shot(e.x, e.y, 1, 0, 5)
    step(1)
    if (pods().length > before) elitePods++
    for (const q of pods()) q.alive = false
    for (const q of w.pickups.active) q.alive = false
    w.pickups.sweep()
    w.bankGem = null
  }
  out.elitePodChance = { share: r3(elitePods / N), pass: Math.abs(elitePods / N - 0.35) < 0.06 }

  // Boss pod: 60 u from the corpse, preferring a paired weapon at 2+ stacks.
  const bossPod = (perks) => {
    fresh(perks)
    const e = enemyAt('queen', CX, CY, 1)
    e.submerged = false
    shot(e.x, e.y, 1, 0, 5)
    step(1)
    const q = pods()[0]
    return q ? { id: q.weaponId, dist: r3(Math.hypot(q.x - e.x, q.y - e.y)) } : null
  }
  const bp = []
  for (let i = 0; i < 6; i++) bp.push(bossPod(['heavy_rounds', 'heavy_rounds', 'twin_shot']))
  const one = bossPod(['twin_shot'])
  out.bossPod = {
    twoStacks: bp, oneStack: one,
    pass: bp.every((x) => x && x.id === 'minigun' && near(x.dist, 60, 1e-3)) && one && one.id === 'shotgun',
  }
  S.loop.start()
  return out
}

// --- fusions -----------------------------------------------------------------
function fusionChecks() {
  const { S, w, pl, ctl, DT, CX, CY, fresh, step, enemyAt, shot, near, r3, inp } = window.__P8
  const out = {}

  // SHATTER: a slowed death queues 70 u, 12 + 25% of its maxHp, x damageMul.
  fresh(['cryo_rounds', 'explosive_rounds', 'f_shatter'])
  let a = enemyAt('swarmer', CX, CY, 40)
  a.hp = 1
  a.slow = 1
  a.slowFactor = 0.2
  const bIn = enemyAt('brute', CX + 66, CY, 1000)
  const bOut = enemyAt('brute', CX + 71, CY, 1000)
  shot(CX, CY, 0, 1, 5)
  step(1)
  const want = (12 + 0.25 * 40) * w.mods.damageMul
  out.shatter = {
    inside66: r3(1000 - bIn.hp), outside71: r3(1000 - bOut.hp), want: r3(want),
    pass: !a.alive && near(1000 - bIn.hp, want, 1e-3) && bOut.hp === 1000,
  }
  fresh(['cryo_rounds', 'explosive_rounds', 'f_shatter'])
  a = enemyAt('swarmer', CX, CY, 40)
  a.hp = 1
  const c = enemyAt('brute', CX + 66, CY, 1000)
  shot(CX, CY, 0, 1, 5)
  step(1)
  const q = enemyAt('queen', CX - 300, CY, 50)
  q.slow = 1
  const qn = enemyAt('brute', CX - 300, CY + 60, 1000)
  shot(q.x, q.y, 0, 1, 60)
  step(1)
  out.shatterOnlySlowedNoBoss = { unslowedBlast: r3(1000 - c.hp), bossBlast: r3(1000 - qn.hp), pass: c.hp === 1000 && !q.alive && qn.hp === 1000 }

  // FIRESTORM: arc hops ignite; a burning target takes +50% arc damage.
  fresh(['arc_rounds', 'incendiary', 'f_firestorm'])
  w.equipWeapon('lightning')
  const A = enemyAt('brute', CX, CY, 1000)
  const B = enemyAt('brute', CX + 100, CY, 1000)
  const C = enemyAt('brute', CX + 200, CY, 1000)
  B.burnT = 1
  B.burnDps = 0
  shot(CX, CY, 1, 0, 16, { chain: 5, chainRange: 150 })
  step(1)
  const hop = 16 * 0.6
  const tick = (6 * w.mods.damageMul) / 60
  out.firestorm = {
    burning: r3(1000 - B.hp), fresh: r3(1000 - C.hp), cBurn: [r3(C.burnT), r3(C.burnDps)],
    pass: near(1000 - B.hp, hop * 1.5 + tick, 1e-3) && near(1000 - C.hp, hop + tick, 1e-3) && near(C.burnDps, 6 * w.mods.damageMul) && C.burnT > 1.9,
  }
  void A

  // PINBALL: a seek bounce restores 1 pierce and multiplies the bullet's damage by 1.15.
  fresh(['ricochet', 'piercing', 'f_pinball'])
  const P1 = enemyAt('brute', CX, CY, 1000)
  const P2 = enemyAt('brute', CX + 200, CY + 100, 1000)
  const bl = shot(CX, CY, 1, 0, 20, { speed: 600, bounces: 1, life: 0.05 })
  step(1)
  const after = { pierce: bl.pierce, bounces: bl.bounces, damage: r3(bl.damage), life: r3(bl.life), alive: bl.alive }
  let hitP2 = -1
  for (let t = 0; t < 40 && hitP2 < 0; t++) {
    step(1)
    if (P2.hp < 1000) hitP2 = r3(1000 - P2.hp)
  }
  out.pinball = {
    after, p2Damage: hitP2,
    pass: P1.hp === 980 && after.alive && after.pierce === 1 && after.bounces === 0 && near(after.damage, 23) && near(after.life, 0.35, 1e-6) && near(hitP2, 23, 1e-3),
  }

  // HEADHUNTER: crits ignore front armor; a crit kill queues 55 u at 40% of the killing hit.
  fresh(['deadeye', 'hollow_point', 'f_headhunter'])
  w.mods.critChance = 1
  const cm = w.mods.critMul
  const beetle = enemyAt('beetle', CX, CY, 1000)
  shot(CX, CY, -1, 0, 10)
  step(1)
  const armored = r3(1000 - beetle.hp)
  const K = enemyAt('swarmer', CX + 300, CY, 3)
  const Nb = enemyAt('brute', CX + 350, CY, 1000)
  const Nf = enemyAt('brute', CX + 300, CY + 56, 1000)
  shot(K.x, K.y, 0, 1, 10)
  step(1)
  out.headhunter = {
    critThroughArmor: armored, want: r3(10 * cm), blast: r3(1000 - Nb.hp), wantBlast: r3(10 * cm * 0.4), outside55: r3(1000 - Nf.hp),
    pass: near(armored, 10 * cm, 1e-3) && near(1000 - Nb.hp, 10 * cm * 0.4, 1e-3) && Nf.hp === 1000,
  }
  // A crit that kills an elite: the blast is 40% of the hit before eliteDamageMul,
  // which each elite target then takes once.
  fresh(['deadeye', 'hollow_point', 'f_headhunter', 'giant_slayer', 'giant_slayer', 'giant_slayer'])
  w.mods.critChance = 1
  const hcm = w.mods.critMul
  const hgs = w.mods.eliteDamageMul
  const KE = enemyAt('guardian', CX, CY, 3)
  const NE = enemyAt('guardian', CX + 45, CY, 1000)
  const NN = enemyAt('brute', CX - 45, CY, 1000)
  shot(KE.x, KE.y, 0, 1, 10)
  step(1)
  out.headhunterElite = {
    killed: !KE.alive, eliteNeighbor: r3(1000 - NE.hp), wantElite: r3(10 * hcm * 0.4 * hgs), plainNeighbor: r3(1000 - NN.hp), wantPlain: r3(10 * hcm * 0.4),
    pass: !KE.alive && near(1000 - NE.hp, 10 * hcm * 0.4 * hgs, 1e-3) && near(1000 - NN.hp, 10 * hcm * 0.4, 1e-3),
  }

  // GUILLOTINE: elites culled at half the threshold (6% at Executioner 1); culls drop double XP.
  const cull = (perks, id, hpFrac) => {
    fresh(perks)
    const e = enemyAt(id, CX, CY, 1000)
    e.hp = 1000 * hpFrac + 1
    shot(CX, CY, 0, 1, 1)
    step(1)
    const gem = w.pickups.active.find((p) => p.alive && p.kind === 'xp')
    return { culled: !e.alive, gemXp: gem ? r3(gem.xp) : 0, xpScale: w.xpScale }
  }
  const g1 = cull(['executioner', 'giant_slayer', 'f_guillotine'], 'guardian', 0.059)
  const g2 = cull(['executioner', 'giant_slayer', 'f_guillotine'], 'guardian', 0.065)
  const g3 = cull(['executioner', 'giant_slayer'], 'guardian', 0.02)
  const g4 = cull(['executioner', 'giant_slayer', 'f_guillotine'], 'swarmer', 0.1)
  const g5 = cull(['executioner'], 'swarmer', 0.1)
  out.guillotine = {
    elite5_9: g1, elite6_5: g2, eliteNoFusion: g3, swarmerCull: g4, swarmerPlain: g5,
    pass: g1.culled && g1.gemXp === 40 && !g2.culled && !g3.culled && g4.culled && near(g4.gemXp, 2 * g5.gemXp) && g5.culled,
  }

  // BLOODRUSH: below 50% HP, kill healing x2, kill-heal cap x1.5, move speed x1.2.
  fresh(['vampiric', 'berserker', 'f_bloodrush'])
  pl.hp = 40
  pl.invuln = 1e9
  let e1 = enemyAt('swarmer', CX, CY, 1)
  shot(CX, CY, 0, 1, 5)
  step(1)
  const healOne = r3(pl.hp - 40)
  pl.hp = 40
  w.killHealBudget = 1e9
  step(1)
  const cap = r3(w.killHealBudget)
  for (let i = 0; i < 20; i++) {
    const e = enemyAt('swarmer', CX + i * 40 - 400, CY + 200, 1)
    shot(e.x, e.y, 0, 1, 5)
  }
  step(1)
  const healMany = r3(pl.hp - 40)
  pl.hp = 40
  const x0 = pl.x
  ctl.mx = 1
  step(1)
  const moved = pl.x - x0
  ctl.mx = 0
  pl.hp = 90
  const x1 = pl.x
  ctl.mx = 1
  step(1)
  const movedHigh = pl.x - x1
  ctl.mx = 0
  pl.hp = 90
  w.killHealBudget = w.mods.killHealCap
  e1 = enemyAt('swarmer', CX, CY, 1)
  shot(CX, CY, 0, 1, 5)
  step(1)
  const healHigh = r3(pl.hp - 90)
  const capMods = w.mods.killHealCap
  out.bloodrush = {
    healOneKill: healOne, bucketFull: cap, healTwentyKills: healMany, speed: r3(moved), speedAbove: r3(movedHigh), healAbove: healHigh,
    pass: near(healOne, 2, 1e-6) && near(cap, capMods * 1.5, 1e-3) && healMany <= capMods * 1.5 + capMods * 1.5 * DT + 1e-6 && healMany > capMods * 1.4
      && near(moved, 285 * 1.2 * DT, 1e-6) && near(movedHigh, 285 * DT, 1e-6) && near(healHigh, 1, 1e-6),
  }
  void e1

  // LIVING ARMOR: overheal becomes overshield up to 25% of max HP; it absorbs first and never decays.
  fresh(['regrowth', 'bulwark', 'f_living_armor'])
  pl.invuln = 0
  pl.hp = pl.maxHp
  step(600)
  const os10 = r3(w.overshield)
  step(600)
  const os20 = r3(w.overshield)
  const hp0 = pl.hp
  const sh = w.enemyProjectiles.acquire()
  sh.x = sh.prevX = pl.x
  sh.y = sh.prevY = pl.y
  sh.vx = sh.vy = 0
  sh.damage = 10
  sh.radius = 7
  sh.life = 3
  sh.leavesAcid = false
  sh.ownerIdx = -1
  sh.quad.scaleX = sh.quad.scaleY = 1
  const hits0 = w.hits
  w.pendingLevelUps = 0
  S.step(1)
  // PlayerHurt is FeelKind 5; the absorbed hit carries a = damage absorbed and FF_DISCRETE (16).
  const fq = w.feel
  const ev = []
  for (let i = 0; i < fq.n; i++) ev.push({ k: fq.kind[i], f: fq.flags[i], a: r3(fq.a[i]) })
  w.feel.clear()
  const shieldEv = ev.filter((e) => e.k !== 5 && (e.f & 16) && near(e.a, 10 * 0.85, 1e-3))
  const osHit = r3(w.overshield)
  out.livingArmor = {
    after10s: os10, after20s: os20, cap: 0.25 * pl.maxHp, afterHit10: osHit, hpAfterHit: r3(pl.hp - hp0), shotGone: !sh.alive, hitsCounted: w.hits - hits0,
    shieldEvents: shieldEv, playerHurt: ev.filter((e) => e.k === 5).length,
    pass: near(os10, 1.4 * 10, 0.05) && near(os20, 25, 1e-6) && near(osHit, 25 - 10 * 0.85 + 1.4 * DT, 1e-3) && pl.hp === hp0 && !sh.alive && w.hits === hits0
      && shieldEv.length === 1 && !ev.some((e) => e.k === 5),
  }

  // RAM: each enemy the dash passes within radius + 30 takes 6x thorns x damageMul once; non-elites go 40 u sideways.
  fresh(['phase_step', 'thorns', 'f_ram'])
  pl.x = pl.prevX = CX - 150
  pl.y = pl.prevY = CY
  const r1 = enemyAt('swarmer', CX - 60, CY + 44, 1000)
  const r2 = enemyAt('swarmer', CX - 20, CY - 44, 1000)
  const rE = enemyAt('guardian', CX + 10, CY + 60, 5000)
  const rFar = enemyAt('swarmer', CX - 60, CY + 120, 1000)
  const y1 = r1.y
  const y2 = r2.y
  const yE = rE.y
  ctl.mx = 1
  inp.pressDash()
  step(10)
  ctl.mx = 0
  const ramDmg = 6 * 18 * w.mods.damageMul
  out.ram = {
    dmg: [r3(1000 - r1.hp), r3(1000 - r2.hp), r3(5000 - rE.hp), r3(1000 - rFar.hp)], want: ramDmg, pushY: [r3(r1.y - y1), r3(r2.y - y2), r3(rE.y - yE)],
    pass: near(1000 - r1.hp, ramDmg) && near(1000 - r2.hp, ramDmg) && near(5000 - rE.hp, ramDmg) && rFar.hp === 1000
      && near(r1.y - y1, 40, 1e-6) && near(r2.y - y2, -40, 1e-6) && rE.y === yE,
  }

  // SALVO STEP: every dash start fires a ring of 12 shots at 60% damage, no ammo cost.
  fresh(['adrenal_wake', 'twin_shot', 'f_salvo'])
  w.equipWeapon('smg')
  const ammo0 = w.ammo
  ctl.mx = 1
  inp.pressDash()
  const n0 = w.projectiles.size
  step(1)
  ctl.mx = 0
  const ring = w.projectiles.active.slice(n0)
  const angs = ring.map((p) => Math.atan2(p.vy, p.vx)).sort((x, y) => x - y)
  let even = true
  for (let i = 1; i < angs.length; i++) if (Math.abs(angs[i] - angs[i - 1] - Math.PI / 6) > 1e-6) even = false
  out.salvo = {
    shots: ring.length, damage: ring.length ? r3(ring[0].damage) : 0, want: r3(8.5 * w.mods.damageMul * 0.6), ammoSpent: ammo0 - w.ammo,
    pass: ring.length === 12 && even && ring.every((p) => near(p.damage, 8.5 * w.mods.damageMul * 0.6)) && ammo0 === w.ammo,
  }
  const salvoWith = (id) => {
    fresh(['adrenal_wake', 'twin_shot', 'f_salvo'])
    w.equipWeapon(id)
    const wd = w.weapon
    ctl.mx = 1
    inp.pressDash()
    const k0 = w.projectiles.size
    step(1)
    ctl.mx = 0
    const rp = w.projectiles.active.slice(k0)
    const dm = w.mods.damageMul
    return {
      shots: rp.length, damage: rp.length ? r3(rp[0].damage) : 0, want: r3(wd.damage * dm * 0.6),
      explode: rp.length ? r3(rp[0].explodeDamage) : 0, wantExplode: r3(wd.explodeDamage * dm * 0.6),
      ok: rp.length === 12 && rp.every((p) => near(p.damage, wd.damage * dm * 0.6, 1e-4) && near(p.explodeDamage, wd.explodeDamage * dm * 0.6, 1e-4)),
    }
  }
  const sm = salvoWith('rocket')
  const sp = salvoWith('plague_barrage')
  out.salvoExplosion = { rocket: sm, plague: sp, pass: sm.ok && sp.ok }

  // COLD BLOOD: slowed elites and bosses take +30%; hits apply the full Cryo slow (bosses 30% max).
  fresh(['cryo_rounds', 'cryo_rounds', 'cryo_rounds', 'giant_slayer', 'f_cold_blood'])
  const el = enemyAt('guardian', CX, CY, 1000)
  shot(CX, CY, 0, 1, 10)
  step(1)
  const firstHit = r3(1000 - el.hp)
  const hp1 = el.hp
  shot(CX, CY, 0, 1, 10)
  step(1)
  const secondHit = r3(hp1 - el.hp)
  const bo = enemyAt('queen', CX + 300, CY, 5000)
  bo.submerged = false
  shot(bo.x, bo.y, 0, 1, 10)
  step(1)
  const gs = w.mods.eliteDamageMul
  out.coldBlood = {
    firstHit, secondHit, eliteSlow: r3(el.slowFactor), bossSlow: r3(bo.slowFactor),
    pass: near(firstHit, 10 * gs, 1e-3) && near(secondHit, 10 * gs * 1.3, 1e-3) && near(el.slowFactor, 0.6) && near(bo.slowFactor, 0.3),
  }
  S.loop.start()
  return out
}

// --- evolutions --------------------------------------------------------------
function evolutionChecks() {
  const { S, w, DT, CX, CY, fresh, step, enemyAt, shot, near, r3 } = window.__P8
  const out = {}
  const hold = (id) => {
    w.baseWeaponId = id
    w.equipWeapon(id)
  }

  // GORE HOSE pierceOnKill: a bullet that kills gains +1 pierce.
  fresh()
  hold('gore_hose')
  const k1 = enemyAt('swarmer', CX, CY, 1)
  const k2 = enemyAt('brute', CX + 40, CY, 1000)
  const g = shot(CX, CY, 1, 0, 10, { speed: 600, evo: 'pierceOnKill' })
  step(1)
  const pierceAfterKill = g.pierce
  step(6)
  out.goreHose = { pierceAfterKill, behindDamage: r3(1000 - k2.hp), pass: !k1.alive && pierceAfterKill === 0 && g.alive === false && near(1000 - k2.hp, 10) }

  // DEVASTATOR pointBlank: x2 damage in the first 0.12 s of flight.
  fresh()
  hold('devastator')
  const d1 = enemyAt('brute', CX, CY, 1000)
  shot(CX, CY, 1, 0, 7, { evo: 'pointBlank', age: 0.1 - DT })
  step(1)
  const d2e = enemyAt('brute', CX + 300, CY, 1000)
  shot(d2e.x, d2e.y, 1, 0, 7, { evo: 'pointBlank', age: 0.12 })
  step(1)
  out.devastator = { at0_10: r3(1000 - d1.hp), at0_13: r3(1000 - d2e.hp), pass: near(1000 - d1.hp, 14) && near(1000 - d2e.hp, 7) }

  // HIVE REAPER lockOn: +5% per consecutive hit on one uid, max +75%, reset after 0.4 s.
  fresh()
  hold('hive_reaper')
  const L = enemyAt('brute', CX, CY, 100000)
  const L2 = enemyAt('brute', CX + 300, CY, 100000)
  const seq = []
  let prev = L.hp
  for (let i = 0; i < 18; i++) {
    shot(CX, CY, 1, 0, 7, { evo: 'lockOn' })
    step(1)
    seq.push(r3((prev - L.hp) / 7))
    prev = L.hp
  }
  step(Math.ceil(0.41 / DT))
  shot(CX, CY, 1, 0, 7, { evo: 'lockOn' })
  step(1)
  const afterGap = r3((prev - L.hp) / 7)
  prev = L.hp
  shot(CX, CY, 1, 0, 7, { evo: 'lockOn' })
  step(1)
  const second = r3((prev - L.hp) / 7)
  shot(L2.x, L2.y, 1, 0, 7, { evo: 'lockOn' })
  step(1)
  prev = L.hp
  shot(CX, CY, 1, 0, 7, { evo: 'lockOn' })
  step(1)
  const afterSwitch = r3((prev - L.hp) / 7)
  const wantSeq = seq.map((_, i) => r3(1 + Math.min(0.75, 0.05 * i)))
  out.hiveReaper = { seq, afterGap, second, afterSwitch, pass: JSON.stringify(seq) === JSON.stringify(wantSeq) && afterGap === 1 && second === 1.05 && afterSwitch === 1 }

  // ION SPEAR pierceRamp: x1.2 per enemy pierced, cap x2.5.
  fresh()
  hold('ion_spear')
  const line = []
  for (let i = 0; i < 7; i++) line.push(enemyAt('brute', CX + i * 60, CY, 1000))
  const sp = shot(CX, CY, 1, 0, 24, { evo: 'pierceRamp', pierce: 6, speed: 1100 })
  step(30)
  const got = line.map((e) => r3((1000 - e.hp) / 24))
  const wantR = [1, 1.2, 1.44, 1.728, 2.074, 2.488, 2.5]
  out.ionSpear = { mults: got, pass: got.every((v, i) => near(v, wantR[i], 1e-3)) && !sp.alive }

  // SKEWER firstHitCrit: the first hit of each bullet always crits.
  fresh()
  hold('skewer')
  const s1 = enemyAt('brute', CX, CY, 1000)
  const s2 = enemyAt('brute', CX + 60, CY, 1000)
  shot(CX, CY, 1, 0, 120, { evo: 'firstHitCrit', pierce: 20, speed: 2000 })
  step(10)
  out.skewer = { first: r3(1000 - s1.hp), second: r3(1000 - s2.hp), critMul: w.mods.critMul, pass: near(1000 - s1.hp, 120 * w.mods.critMul) && near(1000 - s2.hp, 120) }

  // INFERNO ignite: burn 10 dps for 2 s; burning enemies take +25% while INFERNO is held.
  fresh()
  hold('inferno')
  const f1 = enemyAt('brute', CX, CY, 1000)
  shot(CX, CY, 1, 0, 4, { evo: 'ignite' })
  step(1)
  const firstI = 1000 - f1.hp
  const burnT = f1.burnT
  const hpB = f1.hp
  shot(CX, CY, 1, 0, 4, { evo: 'ignite' })
  step(1)
  const secondI = hpB - f1.hp
  let burnTotal = 0
  const f2 = enemyAt('brute', CX + 300, CY, 1000)
  shot(f2.x, f2.y, 1, 0, 4, { evo: 'ignite' })
  step(1)
  const h2 = f2.hp
  w.equipWeapon('smg')
  step(150)
  burnTotal = h2 - f2.hp
  out.inferno = {
    firstHit: r3(firstI), burnT: r3(burnT), secondHitWithBurn: r3(secondI), burnOffInferno2s: r3(burnTotal),
    pass: near(firstI, 4 + (10 / 60) * 1.25, 1e-3) && near(burnT, 2 - DT, 1e-6) && near(secondI, (4 + 10 / 60) * 1.25, 1e-3) && near(burnTotal, 10 * (2 - DT), 1e-6) && f2.burnT === 0,
  }

  // PLAGUE BARRAGE bomblets: 3 blasts 0.25 s later at 55 u, radius 50, 35% of the explosion.
  fresh()
  hold('plague_barrage')
  const imp = enemyAt('swarmer', CX, CY, 1)
  const t55 = enemyAt('brute', CX + 55, CY, 1000)
  const t130 = enemyAt('brute', CX - 28, CY - 48, 1000)
  shot(CX, CY, 1, 0, 26, { evo: 'bomblets', explodeRadius: 110, explodeDamage: 50 })
  step(1)
  const afterImpact = 1000 - t55.hp
  const hist = []
  for (let t = 0; t < 20; t++) {
    const h = t55.hp
    step(1)
    if (t55.hp < h) hist.push([t + 1, r3(h - t55.hp)])
  }
  out.plagueBarrage = {
    impact: r3(afterImpact), bomblet: hist, other: r3(1000 - t130.hp),
    pass: !imp.alive && near(afterImpact, 50) && hist.length === 1 && hist[0][0] === 15 && near(hist[0][1], 50 * 0.35, 1e-3) && near(1000 - t130.hp, 50 + 17.5, 1e-3),
  }

  // STORM LASH: hops deal 75% of the hit; the last hop queues a 70 u blast at 50%.
  fresh()
  hold('storm_lash')
  const c0 = enemyAt('brute', CX, CY, 1000)
  const c1 = enemyAt('brute', CX + 150, CY, 1000)
  const c2 = enemyAt('brute', CX + 300, CY, 1000)
  // The chain ends on `by` (65 u from c2); its blast reaches c2 too, not `by2` (out of hop range).
  const by = enemyAt('brute', CX + 300, CY + 65, 1000)
  const by2 = enemyAt('brute', CX + 300, CY + 65 + 250, 1000)
  shot(CX, CY, 1, 0, 18, { chain: 7, chainRange: 200, evo: 'stormChain' })
  step(1)
  out.stormLash = {
    dmg: [c0, c1, c2, by, by2].map((e) => r3(1000 - e.hp)),
    pass: near(1000 - c0.hp, 18) && near(1000 - c1.hp, 13.5) && near(1000 - by.hp, 13.5 + 9) && near(1000 - c2.hp, 13.5 + 9) && by2.hp === 1000,
  }

  // SOLAR LANCE rangeRamp: +12% per 100 u traveled, max +90%.
  fresh()
  hold('solar_lance')
  const sl1 = enemyAt('brute', CX, CY, 1000)
  const sl2 = enemyAt('brute', CX + 300, CY, 1000)
  shot(CX, CY, 1, 0, 6, { evo: 'rangeRamp', speed: 1500, age: 0.2 - DT })
  step(1)
  shot(sl2.x, sl2.y, 1, 0, 6, { evo: 'rangeRamp', speed: 1500, age: 0.55 - DT })
  step(1)
  out.solarLance = { at300u: r3(1000 - sl1.hp), at825u: r3(1000 - sl2.hp), pass: near(1000 - sl1.hp, 6 * 1.36, 1e-3) && near(1000 - sl2.hp, 6 * 1.9, 1e-3) }
  S.loop.start()
  return out
}

// --- P8 hand-off perks and the blast queue -------------------------------------
function perkChecks() {
  const { S, w, pl, ctl, DT, CX, CY, fresh, step, enemyAt, shot, near, r3, inp } = window.__P8
  const out = {}

  // Shock Step: dash end blast 90/110/130 u, 25/40/55 x damageMul, knockback.
  const shock = (stacks) => {
    fresh(Array(stacks).fill('shock_step'))
    pl.x = pl.prevX = CX - 170
    pl.y = pl.prevY = CY
    const r = 70 + 20 * stacks
    const inE = enemyAt('brute', CX + r - 5, CY, 1000)
    const outE = enemyAt('brute', CX + r + 5, CY, 1000)
    const eliteE = enemyAt('guardian', CX, CY + r - 5, 5000)
    ctl.mx = 1
    inp.pressDash()
    step(1)
    ctl.mx = 0
    const x0 = inE.x
    const ey0 = eliteE.y
    step(10)
    return { endX: r3(pl.x - CX), inside: r3(1000 - inE.hp), outside: r3(1000 - outE.hp), push: r3(inE.x - x0), elitePush: r3(eliteE.y - ey0), want: (10 + 15 * stacks) * w.mods.damageMul }
  }
  const sh = [1, 2, 3].map(shock)
  out.shockStep = { byStacks: sh, pass: sh.every((s) => near(s.inside, s.want, 1e-3) && s.outside === 0 && near(s.push, 40, 1e-3) && s.elitePush === 0 && near(s.endX, 0, 1)) }

  // Incendiary: burn 6s x damageMul dps for 2 s, refreshes, does not stack.
  fresh(['incendiary'])
  const b1 = enemyAt('brute', CX, CY, 1000)
  shot(CX, CY, 0, 1, 1)
  step(1)
  const h1 = b1.hp
  step(60)
  shot(b1.x, b1.y, 0, 1, 1)
  step(1)
  const refreshT = b1.burnT
  step(200)
  const total = 1000 - b1.hp - 2
  const dps = 6 * w.mods.damageMul
  // The first burn runs 61 ticks until the refresh, then the refreshed burn runs 2 s.
  const wantBurn = dps * (61 * DT + 2)
  out.incendiary = { total: r3(total), want: r3(wantBurn), refreshedTo: r3(refreshT), firstTick: r3(1000 - h1 - 1), pass: near(total, wantBurn, 1e-6) && near(refreshT, 2 - DT) && b1.burnT === 0 && near(1000 - h1 - 1, dps * DT) }

  // Overpressure: stagger 0.08/0.12/0.16 s on non-elites (no movement), never on elites.
  const stag = (stacks, id) => {
    fresh(Array(stacks).fill('overpressure'))
    const e = enemyAt(id, CX, CY, 1000)
    e.speed = 60
    shot(CX, CY, 0, 1, 1)
    step(1)
    let still = 0
    for (let t = 0; t < 30; t++) {
      const x = e.x
      const y = e.y
      step(1)
      if (x === e.x && y === e.y) still++
      else break
    }
    return still
  }
  const st = [stag(1, 'swarmer'), stag(2, 'swarmer'), stag(3, 'swarmer'), stag(3, 'guardian')]
  out.overpressure = { stillTicks: st, want: [Math.ceil(0.08 * 60) - 1, Math.ceil(0.12 * 60) - 1, Math.ceil(0.16 * 60) - 1, 0], pass: st[0] === 4 && st[1] === 7 && st[2] === 9 && st[3] === 0 }

  // Ricochet: no wall bounce; a spent bullet seeks the nearest unhit enemy within 280 u.
  fresh(['ricochet'])
  const wallShot = shot(w.arena.bounds.x + 30, CY, -1, 0, 5, { speed: 900, bounces: 1, life: 2 })
  step(3)
  const R1 = enemyAt('brute', CX, CY, 1000)
  const R2 = enemyAt('brute', CX + 270, CY + 40, 1000)
  const bsh = shot(CX, CY, 0, 1, 5, { speed: 600, bounces: 1, life: 1 })
  step(1)
  const seekAt = { bounces: bsh.bounces, dir: r3(Math.atan2(bsh.vy, bsh.vx)), want: r3(Math.atan2(R2.y - bsh.y, R2.x - bsh.x)), firstHit: 1000 - R1.hp }
  fresh(['ricochet'])
  enemyAt('brute', CX, CY, 1000)
  enemyAt('brute', CX + 290, CY, 1000)
  const far = shot(CX, CY, 0, 1, 5, { speed: 600, bounces: 1, life: 1 })
  step(1)
  out.ricochet = { wallDies: !wallShot.alive, seek: seekAt, beyond280: far.alive, pass: !wallShot.alive && seekAt.bounces === 0 && near(seekAt.dir, seekAt.want, 1e-3) && !far.alive && seekAt.firstHit === 5 }

  // Vampiric: +1 HP per kill per stack, capped at killHealCap HP/s (6 + 4 per stack).
  fresh(['vampiric', 'vampiric'])
  pl.hp = 20
  w.killHealBudget = w.mods.killHealCap
  for (let i = 0; i < 30; i++) {
    const e = enemyAt('swarmer', CX + (i % 10) * 40 - 200, CY + Math.floor(i / 10) * 40, 1)
    shot(e.x, e.y, 0, 1, 5)
  }
  step(1)
  const burst = r3(pl.hp - 20)
  let heal60 = 0
  for (let t = 0; t < 60; t++) {
    for (let i = 0; i < 5; i++) {
      const e = enemyAt('swarmer', CX + i * 40 - 100, CY + 300, 1)
      shot(e.x, e.y, 0, 1, 5)
    }
    pl.hp = 20
    step(1)
    heal60 += pl.hp - 20
  }
  out.vampiricCap = { cap: w.mods.killHealCap, perKill: w.mods.lifestealPerKill, burst, perSecond: r3(heal60), pass: w.mods.killHealCap === 14 && near(burst, 14, 1e-6) && near(heal60, 14, 1e-3) }

  // Executioner without GUILLOTINE: non-elites only.
  fresh(['executioner'])
  const x1 = enemyAt('swarmer', CX, CY, 100)
  x1.hp = 12
  const x2 = enemyAt('guardian', CX + 300, CY, 100)
  x2.hp = 5
  shot(x1.x, x1.y, 0, 1, 1)
  shot(x2.x, x2.y, 0, 1, 1)
  step(1)
  out.executioner = { swarmerCulled: !x1.alive, eliteCulled: !x2.alive, pass: !x1.alive && x2.alive }

  // Blast queue: a blast queued during a drain waits for the next tick.
  fresh(['cryo_rounds', 'explosive_rounds', 'f_shatter'])
  const ch = []
  for (let i = 0; i < 4; i++) {
    const e = enemyAt('swarmer', CX + i * 60, CY, 40)
    e.hp = i === 0 ? 1 : 20
    e.slow = 10
    ch.push(e)
  }
  shot(CX, CY, 0, 1, 5)
  const deaths = []
  for (let t = 1; t <= 6; t++) {
    step(1)
    deaths.push(ch.filter((e) => !e.alive).length)
  }
  out.blastChain = { deadPerTick: deaths, queued: w.blasts.n, pass: deaths.join() === '2,3,4,4,4,4' && w.blasts.n === 0 }

  // A full queue of 64 due blasts each kills a slowed A; each A's SHATTER blast must
  // queue (the detonated slots are free) and kill its B 60 u away on the next tick,
  // where each B queues the next wave.
  fresh(['cryo_rounds', 'explosive_rounds', 'f_shatter'])
  const G = 64
  const As = []
  const Bs = []
  const qb = w.blasts
  for (let g = 0; g < G; g++) {
    const gx = CX - 700 + (g % 8) * 200
    const gy = CY - 700 + Math.floor(g / 8) * 200
    const A = enemyAt('swarmer', gx, gy, 1)
    const B = enemyAt('swarmer', gx + 60, gy, 1)
    A.slow = B.slow = 10
    As.push(A)
    Bs.push(B)
    const o = qb.n++ * 6
    qb.buf[o] = gx - 60
    qb.buf[o + 1] = gy
    qb.buf[o + 2] = 70
    qb.buf[o + 3] = 5
    qb.buf[o + 4] = w.time
    qb.buf[o + 5] = 0
  }
  step(1)
  const aDead = As.filter((e) => !e.alive).length
  const queued = qb.n
  const bAfter1 = Bs.filter((e) => !e.alive).length
  step(1)
  const bDead = Bs.filter((e) => !e.alive).length
  out.blastCap = { groups: G, aDead, queuedAfterTick1: queued, bDeadTick1: bAfter1, bDead, queuedAfterTick2: qb.n,
    pass: aDead === G && queued === G && bAfter1 === 0 && bDead === G && qb.n === G }
  S.loop.start()
  return out
}

async function openPage(browser) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await page.evaluate(HELPERS)
  return { ctx, page, errors }
}

await acquireChromeLock('probe-p8')
let browser
for (let attempt = 1; attempt <= 3 && !browser; attempt++) {
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
  } catch (e) {
    console.error(`launch failed (${e.message}); retrying in 10 s`)
    await sleep(10000)
  }
}
if (!browser) throw new Error('could not launch Chrome')
try {
  const { ctx, page, errors } = await openPage(browser)
  const groups = { weapons: weaponChecks, pods: podChecks, fusions: fusionChecks, evolutions: evolutionChecks, perks: perkChecks }
  for (const [name, fn] of Object.entries(groups)) {
    if (WHAT !== 'all' && WHAT !== name) continue
    report(name, await page.evaluate(fn))
  }
  report('page', { errors: { list: errors, pass: errors.length === 0 } })
  await ctx.close()
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
