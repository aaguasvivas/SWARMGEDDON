// Dash and damage-model acceptance probe (NEXT-LEVEL P3). Drives the DEV build's
// __SWARM handle headless; takes the machine-wide Chrome lock first.
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Usage: node scripts/probe-dash.mjs [sim|touch|all]   (default all)
//   sim    dash distance and i-frame ticks, end-lag, buffer, charges, Close Call
//          once per dash per trigger type and never on grace, bite cadence and cap,
//          discrete hit cooldown, revive grace
//   touch  at 375x667, 667x375 and 390x844 (safe-area insets 47/34): DASH tap dashes
//          and claims no stick, the exclusion ring spawns nothing, a slide onto the
//          button does nothing, the fire latch, DASH clear of the aim rest point
// Prints one JSON line per check group and exits 1 if any check fails.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WHAT = process.argv[2] || 'all'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0

function report(group, checks) {
  const bad = Object.entries(checks).filter(([, v]) => v && v.pass === false)
  failed += bad.length
  console.log(JSON.stringify({ group, pass: bad.length === 0, checks }))
}

async function openPage(browser, size) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1, isMobile: !!size.touch, hasTouch: !!size.touch })
  if (size.insets) {
    const cdp = await page.createCDPSession()
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets })
  }
  await page.goto(`${ORIGIN}/?seed=777${size.touch ? '&touch=1' : ''}`, { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  return { ctx, page, errors }
}

// In-page sim checks. Everything runs synchronously with the loop stopped, so
// only these step() calls advance the sim.
function simChecks() {
  const S = window.__SWARM
  const w = S.world
  const pl = w.player
  const inp = S.input
  const DT = 1 / 60
  const ctl = { mx: 0, my: 0 }
  S.loop.stop()
  inp.update = () => {
    inp.move.x = ctl.mx
    inp.move.y = ctl.my
    inp.aimDir.x = 0
    inp.aimDir.y = 0
    inp.firing = false
  }
  const fresh = (perks = []) => {
    S.setLoadout('nova', 'hive')
    S.startRun('endless')
    S.loop.stop()
    for (const id of perks) w.choosePerk(id)
    w.dashCharges = w.maxDashCharges
    w.enemies.clear()
    w.enemyProjectiles.clear()
    w.acid.clear()
    const b = w.arena.bounds
    pl.x = pl.prevX = b.x + b.w / 2
    pl.y = pl.prevY = b.y + b.h / 2
    pl.facing = 0
    ctl.mx = 1
    ctl.my = 0
  }
  const spawnAt = (id, x, y) => {
    S.spawn(id, 1)
    const e = w.enemies.active[w.enemies.active.length - 1]
    e.x = e.prevX = x
    e.y = e.prevY = y
    return e
  }
  const shotAt = (x, y, dmg = 14) => {
    const p = w.enemyProjectiles.acquire()
    p.x = p.prevX = x
    p.y = p.prevY = y
    p.vx = 0
    p.vy = 0
    p.damage = dmg
    p.radius = 7
    p.life = 3
    p.leavesAcid = false
    return p
  }
  const feelCount = (kind) => {
    let n = 0
    for (let i = 0; i < w.feel.n; i++) if (w.feel.kind[i] === kind) n++
    return n
  }
  const out = {}

  // 1. Distance, end-lag and i-frames (ticks 0 to 11 take no damage).
  fresh()
  const x0 = pl.x
  inp.pressDash()
  S.step(9)
  const d9 = pl.x - x0
  const lagX = pl.x
  S.step(6)
  const lagMove = pl.x - lagX
  S.step(1)
  const fullMove = pl.x - lagX - lagMove
  out.distance = { d9: +d9.toFixed(3), pass: Math.abs(d9 - 170) <= 1 }
  out.endLag = { sixTicks: +lagMove.toFixed(2), next: +fullMove.toFixed(3), pass: Math.abs(lagMove - 6 * 285 * 0.5 * DT) < 0.5 && Math.abs(fullMove - 285 * DT) < 0.05 }

  fresh()
  ctl.mx = 0
  inp.pressDash()
  const hpAt = []
  for (let t = 0; t < 16; t++) {
    for (const e of w.enemies.active) e.alive = false
    w.enemies.sweep()
    for (let k = 0; k < 4; k++) spawnAt('swarmer', pl.x, pl.y)
    shotAt(pl.x, pl.y)
    const before = pl.hp
    S.step(1)
    hpAt.push(+(before - pl.hp).toFixed(2))
  }
  const firstHurt = hpAt.findIndex((v) => v > 0)
  out.iframes = { dmgPerTick: hpAt, firstHurtTick: firstHurt, pass: firstHurt === 12 }

  // 2. Buffer: a press waits up to 0.15 s for a charge.
  const bufferCase = (lead) => {
    fresh()
    w.dashCharges = 0
    w.dashRecharge = lead
    inp.pressDash()
    for (let t = 0; t < 30; t++) {
      S.step(1)
      if (w.dashes > 0) return t
    }
    return -1
  }
  const b1 = bufferCase(0.1)
  const b2 = bufferCase(0.14)
  const b3 = bufferCase(0.2)
  fresh(['phase_step'])
  inp.pressDash()
  S.step(3)
  inp.pressDash()
  let chained = -1
  for (let t = 0; t < 20; t++) {
    S.step(1)
    if (w.dashes === 2) { chained = t; break }
  }
  out.buffer = { chargeIn0_10: b1, chargeIn0_14: b2, chargeIn0_20: b3, pressDuringDashFiresAfter: chained, pass: b1 >= 0 && b1 <= 9 && b2 >= 0 && b2 <= 9 && b3 === -1 && chained >= 0 && chained <= 9 }

  // 3. Charges and recharge: one at a time, 2.0 s each.
  fresh(['phase_step', 'phase_step', 'phase_step'])
  const max = w.maxDashCharges
  inp.pressDash()
  S.step(1)
  inp.pressDash()
  S.step(12)
  inp.pressDash()
  S.step(12)
  const afterThree = w.dashCharges
  let back1 = -1
  for (let t = 0; t < 400; t++) {
    S.step(1)
    if (back1 < 0 && w.dashCharges === afterThree + 1) back1 = t
  }
  out.charges = { max, iframes: w.mods.dashIframes, afterThree, firstBackTicks: back1, finalCharges: w.dashCharges, pass: max === 3 && afterThree === 0 && w.dashCharges === 3 && back1 > 90 && back1 < 120 }

  // 4. Close Call: once per dash per trigger type; never on grace.
  const trigger = {
    shot: () => shotAt(pl.x, pl.y),
    charger: () => {
      const e = spawnAt('cinderCharger', pl.x, pl.y)
      e.phase = 2
      e.stateTimer = 0.5
      e.dashHit = false
      e.phaseDir = 0
      return e
    },
    elite: () => spawnAt('guardian', pl.x, pl.y),
    boss: () => spawnAt('queen', pl.x, pl.y),
    burrowerNear: () => {
      const e = spawnAt('burrower', pl.x + 16 + 50, pl.y)
      e.submerged = false
      e.stateTimer = e.def.burrow.surfaceTime - 0.1
      return e
    },
    leviathanNear: () => {
      const e = spawnAt('duneLeviathan', pl.x + 28 + 55, pl.y)
      e.submerged = false
      e.stateTimer = e.def.burrow.surfaceTime - 0.05
      return e
    },
  }
  const negative = {
    burrowerOld: () => {
      const e = spawnAt('burrower', pl.x + 16 + 50, pl.y)
      e.submerged = false
      e.stateTimer = e.def.burrow.surfaceTime - 1
      return e
    },
    burrowerFar: () => {
      const e = spawnAt('burrower', pl.x + 16 + 75, pl.y)
      e.submerged = false
      e.stateTimer = e.def.burrow.surfaceTime - 0.05
      return e
    },
    fodder: () => spawnAt('swarmer', pl.x, pl.y),
  }
  const ccRun = (make, mode) => {
    fresh()
    ctl.mx = 0
    if (mode === 'grace') w.resumeFromDraft()
    else if (mode === 'graceDash') { w.resumeFromDraft(); inp.pressDash() }
    else inp.pressDash()
    S.step(1)
    w.dashRecharge = 1.5
    w.feel.n = 0
    const src = pl.invulnSrc
    for (let t = 0; t < 8; t++) {
      make()
      S.step(1)
      for (const e of w.enemies.active) e.alive = false
      for (const p of w.enemyProjectiles.active) p.alive = false
      w.enemies.sweep()
      w.enemyProjectiles.sweep()
    }
    return { cc: w.closeCalls, feel: feelCount(24), src, refund: +(1.5 - 8 * DT - w.dashRecharge).toFixed(3) }
  }
  const cc = {}
  let ccPass = true
  for (const [k, f] of Object.entries(trigger)) {
    const r = ccRun(f, 'dash')
    const g = ccRun(f, 'grace')
    const gd = ccRun(f, 'graceDash')
    cc[k] = { dash: r.cc, feel: r.feel, refund: r.refund, grace: g.cc, dashInsideGrace: gd.cc, srcInsideGrace: gd.src }
    if (r.cc !== 1 || r.feel !== 1 || Math.abs(r.refund - 0.8) > 0.02 || g.cc !== 0 || gd.cc !== 0) ccPass = false
  }
  for (const [k, f] of Object.entries(negative)) {
    const r = ccRun(f, 'dash')
    cc[k] = { dash: r.cc }
    if (r.cc !== 0) ccPass = false
  }
  out.closeCall = { ...cc, pass: ccPass }

  // 5. Bites: top 3 weighted, capped at 0.16 maxHp, one per 0.4 s.
  const biteRun = (ids, ticks) => {
    fresh()
    ctl.mx = 0
    const es = ids.map((id) => spawnAt(id, pl.x, pl.y))
    const hits = []
    for (let t = 0; t < ticks; t++) {
      for (const e of es) {
        e.x = e.prevX = pl.x
        e.y = e.prevY = pl.y
        e.hp = e.maxHp = 1e9
      }
      const before = pl.hp
      S.step(1)
      if (pl.hp < before) hits.push([t, +(before - pl.hp).toFixed(2)])
      pl.hp = pl.maxHp
    }
    return hits
  }
  const swarm30 = biteRun(Array(30).fill('swarmer'), 60)
  const brute = biteRun(['brute', 'swarmer', 'swarmer', 'swarmer'], 60)
  out.bites = {
    swarm30, brute,
    pass: swarm30.length === 3 && swarm30[1][0] - swarm30[0][0] === 24 && Math.abs(swarm30[0][1] - 14) < 0.01 && brute.length === 3 && Math.abs(brute[0][1] - 16) < 0.01,
  }

  // 6. Discrete hits: 0.5 s hit cooldown; a blocked shot is not consumed.
  fresh()
  ctl.mx = 0
  const discrete = []
  for (let t = 0; t < 40; t++) {
    if (t === 0 || t === 10 || t === 30) shotAt(pl.x, pl.y, 10)
    const before = pl.hp
    S.step(1)
    if (pl.hp < before) discrete.push(t)
  }
  out.hitCooldown = { hitTicks: discrete, pass: discrete.join() === '0,30' }

  // 7. Revive grace 1.5 s.
  fresh(['second_wind'])
  ctl.mx = 0
  pl.hp = 1
  shotAt(pl.x, pl.y, 50)
  S.step(1)
  const inv = pl.invuln
  out.revive = { revivesUsed: w.revivesUsed, invuln: +inv.toFixed(3), src: pl.invulnSrc, pass: w.revivesUsed === 1 && Math.abs(inv - 1.5) < 1e-6 && pl.invulnSrc === 2 }

  // 8. Draft grace 0.75 s with source 2.
  fresh()
  w.resumeFromDraft()
  out.draftGrace = { invuln: pl.invuln, src: pl.invulnSrc, pass: pl.invuln === 0.75 && pl.invulnSrc === 2 }
  return out
}

async function runSim(browser) {
  const { ctx, page, errors } = await openPage(browser, { w: 390, h: 844 })
  const out = await page.evaluate(simChecks)
  for (const [k, v] of Object.entries(out)) report('sim.' + k, { [k]: v })
  report('sim.errors', { errors: { list: errors, pass: errors.length === 0 } })
  await ctx.close()
}

async function runTouch(browser, size) {
  const { ctx, page, errors } = await openPage(browser, { ...size, touch: true })
  await page.evaluate(() => {
    const S = window.__SWARM
    S.startRun('endless')
    S.world.player.maxHp = 1e9
    S.world.player.hp = 1e9
  })
  await sleep(400)
  const geo = await page.evaluate(() => {
    const S = window.__SWARM
    const t = S.input.touch
    const r = S.touchHint.right.view.position
    return { dashX: t.dashX, dashY: t.dashY, restX: r.x, restY: r.y, W: S.app.screen.width, H: S.app.screen.height, visible: t.view.visible }
  })
  const restDist = Math.hypot(geo.dashX - geo.restX, geo.dashY - geo.restY)
  const inside = geo.dashX - 44 >= 0 && geo.dashX + 44 <= geo.W && geo.dashY - 44 >= 0 && geo.dashY + 44 <= geo.H
  const state = () => page.evaluate(() => {
    const S = window.__SWARM
    return { dashes: S.world.dashes, aimId: S.input.touch.aimId, moveId: S.input.touch.moveId }
  })
  const refill = () => page.evaluate(() => { const w = window.__SWARM.world; w.dashCharges = w.maxDashCharges; w.player.hp = 1e9 })

  const s0 = await state()
  await page.touchscreen.touchStart(geo.dashX + 10, geo.dashY - 8)
  await sleep(120)
  const held = await state()
  await page.touchscreen.touchEnd()
  await sleep(150)
  const tapOk = held.dashes === s0.dashes + 1 && held.aimId === -1 && held.moveId === -1

  await refill()
  const s1 = await state()
  await page.touchscreen.touchStart(geo.dashX + 48, geo.dashY)
  await sleep(120)
  const ring = await state()
  await page.touchscreen.touchEnd()
  await sleep(120)
  const ringOk = ring.dashes === s1.dashes && ring.aimId === -1

  await refill()
  const s2 = await state()
  await page.touchscreen.touchStart(geo.dashX - 110, geo.dashY + 90)
  await page.touchscreen.touchMove(geo.dashX - 50, geo.dashY + 40)
  await page.touchscreen.touchMove(geo.dashX, geo.dashY)
  await sleep(120)
  const slid = await state()
  await page.touchscreen.touchEnd()
  await sleep(150)
  const slideOk = slid.dashes === s2.dashes && slid.aimId !== -1

  // Fire latch: aim, lift, tap DASH within 0.25 s -> keeps firing for 0.45 s.
  await refill()
  await page.touchscreen.touchStart(geo.dashX - 90, geo.dashY + 100)
  await page.touchscreen.touchMove(geo.dashX - 50, geo.dashY + 100)
  await sleep(100)
  await page.touchscreen.touchEnd()
  await page.touchscreen.touchStart(geo.dashX, geo.dashY)
  await page.touchscreen.touchEnd()
  const samples = await page.evaluate(() => new Promise((res) => {
    const S = window.__SWARM
    const t0 = performance.now()
    const out = []
    const f = () => {
      const dt = performance.now() - t0
      out.push([Math.round(dt), S.input.firing, +S.input.aimDir.x.toFixed(2)])
      if (dt < 700) requestAnimationFrame(f)
      else res(out)
    }
    requestAnimationFrame(f)
  }))
  const firingEarly = samples.filter(([t]) => t > 40 && t < 250).every(([, f, ax]) => f && ax > 0.9)
  const stoppedLate = samples.filter(([t]) => t > 520).every(([, f]) => !f)
  // Live combat frame with a boss bar and a pickup weapon, for the layout check.
  await page.evaluate(() => {
    const S = window.__SWARM
    S.world.bossTimer = 0.01
    S.give('minigun')
    S.world.player.hp = 1e9
  })
  await sleep(700)
  await page.screenshot({ path: `/tmp/swg-P3-dash-${size.name}.png` })
  report(`touch.${size.name}`, {
    geometry: { ...geo, restDist: +restDist.toFixed(1), pass: geo.visible && inside && restDist > 44 + 8 },
    tapDashes: { before: s0, held, pass: tapOk },
    exclusionRing: { ring, pass: ringOk },
    slideOnto: { slid, pass: slideOk },
    fireLatch: { samples: samples.length, firingEarly, stoppedLate, pass: firingEarly && stoppedLate },
    errors: { list: errors, pass: errors.length === 0 },
  })
  await ctx.close()
}

await acquireChromeLock('probe-dash')
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
try {
  if (WHAT === 'sim' || WHAT === 'all') await runSim(browser)
  if (WHAT === 'touch' || WHAT === 'all') {
    for (const size of [
      { name: 'p375', w: 375, h: 667 },
      { name: 'l667', w: 667, h: 375 },
      { name: 'p390', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
    ]) await runTouch(browser, size)
  }
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
