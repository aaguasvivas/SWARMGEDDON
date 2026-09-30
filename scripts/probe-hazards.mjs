// Hazard acceptance probe (NEXT-LEVEL P6a task 1). Drives the DEV build's
// __SWARM handle headless; takes the machine-wide Chrome lock first.
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Usage: node scripts/probe-hazards.mjs
//   Every check runs with the render loop stopped and the director frozen, so
//   only the probe's hazards touch the player: detonation tick, circle / lane /
//   sweep tests with a hit and a miss each, one hit per cast, markers never
//   hurt, a live boss hazard pays a Close Call under dash i-frames (a plain one
//   does not), the 48 cap, and the three onEnd actions.
// Prints one JSON line per check and exits 1 if any check fails.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function checks() {
  const S = window.__SWARM
  const w = S.world
  const pl = w.player
  const inp = S.input
  const { spawnHazard } = await import('/src/systems/hazards.ts')
  const HZ = await import('/src/game/hazard.ts')
  const CLOSE_CALL = 24
  S.loop.stop()
  inp.update = () => {
    inp.move.x = inp.move.y = 0
    inp.aimDir.x = inp.aimDir.y = 0
    inp.firing = false
  }
  const fresh = () => {
    S.setLoadout('nova', 'hive')
    S.startRun('endless')
    S.loop.stop()
    w.director.runState = 'stalemate' // freezes the director: no beats, no spawns
    w.enemies.clear()
    w.enemyProjectiles.clear()
    w.acid.clear()
    w.hazards.clear()
    const b = w.arena.bounds
    pl.x = pl.prevX = b.x + b.w / 2
    pl.y = pl.prevY = b.y + b.h / 2
    pl.maxHp = pl.hp = 1000
    pl.invuln = pl.hitCd = pl.biteCd = 0
  }
  const feelCount = (kind) => {
    let n = 0
    for (let i = 0; i < w.feel.n; i++) if (w.feel.kind[i] === kind) n++
    return n
  }
  /** Step until the hazard pool is empty (or `max` ticks); returns [tick, hpLost] per damage. */
  const run = (max) => {
    const hits = []
    for (let t = 1; t <= max; t++) {
      const hp = pl.hp
      S.step(1)
      if (pl.hp < hp) hits.push([t, +(hp - pl.hp).toFixed(3)])
      if (w.hazards.size === 0) break
    }
    return hits
  }
  const out = {}

  fresh()
  spawnHazard(w, HZ.HZ_CIRCLE, pl.x, pl.y, 60, 0.5, 0, 20)
  let hits = run(60)
  out.detonationTick = { hits, poolAfter: w.hazards.size, pass: hits.length === 1 && hits[0][0] === 30 && hits[0][1] === 20 && w.hazards.size === 0 }

  const reach = 60 + pl.radius
  fresh()
  spawnHazard(w, HZ.HZ_CIRCLE, pl.x + reach + 1, pl.y, 60, 0.1, 0, 20)
  const miss = run(20)
  fresh()
  spawnHazard(w, HZ.HZ_CIRCLE, pl.x + reach - 1, pl.y, 60, 0.1, 0, 20)
  const edge = run(20)
  out.circle = { miss, edge, pass: miss.length === 0 && edge.length === 1 }

  const lane = (dy, dx0) => {
    fresh()
    const h = spawnHazard(w, HZ.HZ_LANE, pl.x + dx0, pl.y + dy, 20, 0.1, 0, 15)
    h.ang = 0
    h.len = 300
    return run(20).length
  }
  out.lane = { beside: lane(30, -100), outside: lane(50, -100), behindStart: lane(0, 60), pass: lane(30, -100) === 1 && lane(50, -100) === 0 && lane(0, 60) === 0 }

  const sweep = (px, py) => {
    fresh()
    const h = spawnHazard(w, HZ.HZ_SWEEP, pl.x - 200, pl.y, 15, 0.1, 1.2, 25)
    h.len = 300
    h.ang = -Math.PI / 3
    h.arc = (2 * Math.PI) / 3
    pl.x = pl.prevX = pl.x + px
    pl.y = pl.prevY = pl.y + py
    const hits = run(120)
    return { n: hits.length, tick: hits.length ? hits[0][0] : null }
  }
  const inArc = sweep(0, 0)
  const outArc = sweep(-200, 230)
  // The line points at the player halfway through the 72-tick live window (tele 6 ticks).
  out.sweep = { inArc, outArc, pass: inArc.n === 1 && inArc.tick >= 36 && inArc.tick <= 48 && outArc.n === 0 }

  fresh()
  spawnHazard(w, HZ.HZ_CIRCLE, pl.x, pl.y, 60, 0.1, 1.0, 10)
  hits = run(90)
  out.oneHitPerCast = { hits, pass: hits.length === 1 && hits[0][1] === 10 }

  fresh()
  w.feel.clear()
  spawnHazard(w, HZ.HZ_CIRCLE, pl.x, pl.y, 60, 0.1, 1.0, 0)
  hits = run(90)
  out.markerNeverHurts = { hits, pass: hits.length === 0 }

  const closeCall = (boss) => {
    fresh()
    const h = spawnHazard(w, HZ.HZ_CIRCLE, pl.x, pl.y, 400, 1 / 60, 0.1, 30)
    h.boss = boss
    w.feel.clear()
    inp.pressDash()
    let cc = 0
    let lost = 0
    for (let t = 0; t < 12; t++) {
      const hp = pl.hp
      S.step(1)
      cc += feelCount(CLOSE_CALL)
      w.feel.clear()
      lost += hp - pl.hp
    }
    return { closeCalls: w.closeCalls, feel: cc, hpLost: lost }
  }
  const ccBoss = closeCall(true)
  const ccPlain = closeCall(false)
  out.closeCall = { boss: ccBoss, plain: ccPlain, pass: ccBoss.closeCalls === 1 && ccBoss.feel === 1 && ccBoss.hpLost === 0 && ccPlain.closeCalls === 0 && ccPlain.hpLost === 0 }

  fresh()
  let made = 0
  for (let i = 0; i < 60; i++) if (spawnHazard(w, HZ.HZ_CIRCLE, pl.x + 3000, pl.y, 10, 0.2, 0, 0)) made++
  const live = w.hazards.size
  run(30)
  out.cap = { made, live, after: w.hazards.size, pass: made === 48 && live === 48 && w.hazards.size === 0 }

  fresh()
  const far = pl.x + 600
  let h = spawnHazard(w, HZ.HZ_CIRCLE, far, pl.y, 50, 0.1, 0, 20)
  h.onEnd = HZ.HZ_END_MAGMA
  run(20)
  const acid = w.acid.size
  fresh()
  h = spawnHazard(w, HZ.HZ_CIRCLE, far, pl.y, 50, 0.1, 0, 20)
  h.onEnd = HZ.HZ_END_SPAWN
  h.unit = 'swarmer'
  run(20)
  const spawned = w.enemies.active.filter((e) => e.alive && e.def.id === 'swarmer' && Math.abs(e.x - far) < 80).length
  fresh()
  S.spawn('queen', 1)
  const q = w.enemies.active[w.enemies.active.length - 1]
  q.x = q.prevX = pl.x - 400
  q.y = q.prevY = pl.y
  w.boss = q
  w.bossAlive = true
  h = spawnHazard(w, HZ.HZ_CIRCLE, far, pl.y + 100, 50, 0.1, 0, 0)
  h.onEnd = HZ.HZ_END_BLINK
  run(20)
  const blinked = Math.hypot(q.x - far, q.y - (pl.y + 100)) < 60
  out.onEnd = { acid, spawned, blinked, pass: acid === 1 && spawned === 1 && blinked }
  return out
}

await acquireChromeLock('probe-hazards')
let browser
for (let attempt = 1; attempt <= 3 && !browser; attempt++) {
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
  } catch (e) {
    console.error(`launch failed (${e.message}); retrying in 10 s`)
    await sleep(10000)
  }
}
if (!browser) throw new Error('could not launch Chrome')
let failed = 0
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: 390, height: 844 })
  await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  const out = await page.evaluate(checks)
  out.errors = { list: errors, pass: errors.length === 0 }
  for (const [k, v] of Object.entries(out)) {
    if (!v.pass) failed++
    console.log(JSON.stringify({ check: k, ...v }))
  }
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
