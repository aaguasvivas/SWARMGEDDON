// Boss arrival and lunge probe (NEXT-LEVEL P6a, A5 and the lunge lane). Drives
// the DEV build's __SWARM handle headless; takes the machine-wide Chrome lock first.
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Usage: node scripts/probe-boss.mjs
//   spawnSweep: the player pinned at the 4 corners and the 4 wall midpoints of
//     Hive, the mid1 spawn angle forced in 15 degree steps (24 per spot). The
//     boss must emerge inside the walls, 250 to 340 u away, on the marker, with
//     the cage up the same tick.
//   pinnedFights: 25 s of the mid1 fight at each spot with the player pinned.
//     The boss center never leaves the walls, lunges happen, and each lunge
//     stops where its lane was drawn.
//   laneEdge: a QUEEN PRIME lunge (body radius 56, lane half width 50) with
//     the player just outside and just inside the drawn lane. Only the inside
//     one takes the 30 damage.
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
  const { ROYAL_LUNGE } = await import('/src/content/bosses.ts')
  const BS_IDLE = 1
  const BS_TELE = 2
  const BS_ACTIVE = 3
  const MID1_AT = 240
  const FINAL_AT = 630
  S.loop.stop()
  inp.update = () => {
    inp.move.x = inp.move.y = 0
    inp.aimDir.x = inp.aimDir.y = 0
    inp.firing = false
  }
  const b = w.arena.bounds
  const spots = [
    ['corner NW', b.x + 20, b.y + 20],
    ['corner NE', b.x + b.w - 20, b.y + 20],
    ['corner SW', b.x + 20, b.y + b.h - 20],
    ['corner SE', b.x + b.w - 20, b.y + b.h - 20],
    ['wall N', b.x + b.w / 2, b.y + 20],
    ['wall S', b.x + b.w / 2, b.y + b.h - 20],
    ['wall W', b.x + 20, b.y + b.h / 2],
    ['wall E', b.x + b.w - 20, b.y + b.h / 2],
  ]
  const pin = (x, y) => {
    pl.x = pl.prevX = x
    pl.y = pl.prevY = y
    pl.hp = pl.maxHp
  }
  /** Fresh Hive run a moment before the boss beat at `at`, the angle forced. */
  const arrive = (at, x, y, deg) => {
    S.setLoadout('nova', 'hive')
    S.startRun('endless')
    S.loop.stop()
    pl.maxHp = 1e9
    S.jumpTo(at - 1.6)
    pin(x, y)
    S.step(1)
    const d = w.director
    if (deg !== null) d.beatAng[w.script.drawOff[d.bossBeat]] = (deg * Math.PI) / 180
    let mx = NaN
    let my = NaN
    while (!w.bossAlive && w.time < at + 1) {
      pin(x, y)
      const m = d.marker
      if (m && m.alive) {
        mx = m.x
        my = m.y
      }
      S.step(1)
    }
    return { mx, my }
  }
  const outside = (e) => {
    const dx = Math.max(b.x + e.radius - e.x, e.x - (b.x + b.w - e.radius), 0)
    const dy = Math.max(b.y + e.radius - e.y, e.y - (b.y + b.h - e.radius), 0)
    return Math.hypot(dx, dy)
  }
  const out = {}

  const bad = []
  let n = 0
  let dMin = Infinity
  let dMax = 0
  let markerOff = 0
  for (const [name, x, y] of spots) {
    for (let k = 0; k < 24; k++) {
      const deg = k * 15
      const { mx, my } = arrive(MID1_AT, x, y, deg)
      const e = w.boss
      const c = w.director.cage
      n++
      if (!e) {
        bad.push({ name, deg, why: 'no boss' })
        continue
      }
      const dist = Math.hypot(e.x - pl.x, e.y - pl.y)
      const off = Math.hypot(e.x - mx, e.y - my)
      dMin = Math.min(dMin, dist)
      dMax = Math.max(dMax, dist)
      markerOff = Math.max(markerOff, off)
      const inCage = Math.hypot(e.x - c.x, e.y - c.y) <= c.r - e.radius
      if (outside(e) > 0 || dist < 250 || dist > 340 || !c.active || !inCage || !(off < 1)) {
        bad.push({ name, deg, boss: [Math.round(e.x), Math.round(e.y)], dist: Math.round(dist), marker: Math.round(off), cage: c.active, inCage })
      }
    }
  }
  out.spawnSweep = { arrivals: n, distMin: +dMin.toFixed(1), distMax: +dMax.toFixed(1), markerOffMax: +markerOff.toFixed(2), bad, pass: n === 192 && bad.length === 0 }

  const fights = []
  for (const [name, x, y] of spots) {
    arrive(MID1_AT, x, y, 0)
    const f = w.bossFight
    let worst = 0
    let lunges = 0
    let laneMiss = 0
    let prev = f.state
    let lane = 0
    for (let t = 0; t < 25 * 60 && w.boss; t++) {
      pin(x, y)
      S.step(1)
      const e = w.boss
      if (!e) break
      worst = Math.max(worst, outside(e))
      if (f.state === BS_TELE && prev !== BS_TELE && f.attack === 1) {
        const h = w.hazards.active.find((z) => z.alive && z.boss && z.shape === 1)
        if (h) lane = h.len - e.radius
      }
      if (prev === BS_ACTIVE && f.state !== BS_ACTIVE) {
        lunges++
        laneMiss = Math.max(laneMiss, Math.abs(Math.hypot(e.x - f.lungeX, e.y - f.lungeY) - lane))
      }
      prev = f.state
    }
    fights.push({ name, lunges, outsideMax: +worst.toFixed(2), laneMismatchMax: +laneMiss.toFixed(2) })
  }
  const spd = ROYAL_LUNGE.speed / 60
  out.pinnedFights = { fights, pass: fights.every((r) => r.lunges > 0 && r.outsideMax === 0 && r.laneMismatchMax <= spd) }

  const edge = (across) => {
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    arrive(FINAL_AT, cx, cy, 0)
    const e = w.boss
    const f = w.bossFight
    for (let t = 0; t < 120 && f.state !== BS_IDLE; t++) {
      pin(cx, cy)
      S.step(1)
    }
    f.rot = 1 // slot B: the royal lunge
    f.stateT = 1 / 60
    for (let t = 0; t < 10 && f.state !== BS_TELE; t++) {
      pin(cx, cy)
      S.step(1)
    }
    if (f.state !== BS_TELE || f.attack !== 1) return { error: 'no lunge telegraph', state: f.state, attack: f.attack }
    const px = f.lungeX + f.dirX * 200 - f.dirY * across
    const py = f.lungeY + f.dirY * 200 + f.dirX * across
    let lost = 0
    let sawActive = false
    for (let t = 0; t < 180; t++) {
      for (const o of w.enemies.active) if (o !== e) o.alive = false
      w.enemyProjectiles.clear()
      pl.x = pl.prevX = px
      pl.y = pl.prevY = py
      pl.biteCd = 10
      const hp = pl.hp
      S.step(1)
      lost += hp - pl.hp
      if (f.state === BS_ACTIVE) sawActive = true
      if (sawActive && f.state !== BS_ACTIVE) break
    }
    return { radius: e.radius, across, lost, sawActive }
  }
  const reach = ROYAL_LUNGE.halfW + pl.radius
  const outsideLane = edge(reach + 3)
  const insideLane = edge(reach - 3)
  out.laneEdge = {
    outsideLane,
    insideLane,
    pass: outsideLane.sawActive && insideLane.sawActive && outsideLane.lost === 0 && insideLane.lost === ROYAL_LUNGE.damage,
  }
  return out
}

await acquireChromeLock('probe-boss')
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
