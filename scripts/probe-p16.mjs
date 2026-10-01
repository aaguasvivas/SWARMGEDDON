// SWARMGEDDON P16 acceptance probe (the start gate, the input locks, the
// background pause, and the pad on every P16 screen). Drives the DEV build's
// __SWARM handle in a live page (the render loop runs, as on a phone).
//
// Usage: node scripts/probe-p16.mjs
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Checks:
//   gate     a run started with no input holds at 0:00 for 10 s with full HP and
//            unmoved RNG streams; a held move key, a mouse move and a touch then
//            each open it, and time runs.
//   lock     a touch on a draft card in the first 450 ms is ignored, so is a
//            press that started inside the lock and ends after it; a fresh tap
//            after it picks. The recap's RETRY and the WIN panel's EXTRACT
//            ignore taps for 450 ms the same way.
//   gatedet  the same seed and bot played twice with the loop stopped: once
//            stepped through the harness (the gate opens at once), once through
//            the loop's own step with 2 s of no input first (the gate holds, then
//            the bot's first sample opens it). The run state hashes must match.
//   background  the page going hidden opens the pause sheet and holds the run.
//   pad      a fake standard gamepad: Start pauses and B resumes after the
//            countdown; on a draft the d-pad moves the focus and A picks the
//            focused card, Y rerolls, X arms banish, B skips; A on a Hive Core
//            continues; A on the WIN panel extracts; A on the recap retries.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** In page, before any app script: a standard pad whose buttons the probe sets. */
function fakePad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
  const pad = { index: 0, id: 'P16 fake pad', connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons, vibrationActuator: null }
  window.__PAD = pad
  navigator.getGamepads = () => [pad, null, null, null]
}

async function open(browser, { touch, pad }) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text())
  })
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch })
  if (pad) await page.evaluateOnNewDocument(fakePad)
  await page.goto(ORIGIN + '/' + (touch ? '?touch=1' : ''), { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await sleep(600)
  return { page, errors }
}

/** In page: the run state the gate must leave untouched. */
function gateState() {
  const S = window.__SWARM
  const w = S.world
  const streams = {}
  for (const k of ['spawn', 'script', 'boss', 'loot', 'draft', 'combat']) streams[k] = w.rngs[k].state
  return { gate: S.gateOpen, time: w.time, hp: w.player.hp, maxHp: w.player.maxHp, enemies: w.enemies.size, x: w.player.x, y: w.player.y, streams: JSON.stringify(streams) }
}

async function checkGate(browser, out) {
  const { page, errors } = await open(browser, { touch: false, pad: false })
  await page.evaluate(() => window.__SWARM.startRun('endless'))
  await sleep(100)
  const start = await page.evaluate(gateState)
  await sleep(10000)
  const idle = await page.evaluate(gateState)
  const held = idle.time === 0 && idle.hp === idle.maxHp && idle.streams === start.streams && idle.x === start.x && idle.y === start.y && !idle.gate
  await page.keyboard.down('w')
  await sleep(1000)
  await page.keyboard.up('w')
  const keyed = await page.evaluate(gateState)
  // A mouse that only moves opens it too (its cursor is the aim).
  await page.evaluate(() => window.__SWARM.startRun('endless'))
  await sleep(1500)
  const before = await page.evaluate(gateState)
  await page.mouse.move(120, 300)
  await page.mouse.move(220, 360, { steps: 6 })
  await sleep(800)
  const moused = await page.evaluate(gateState)
  await page.close()

  const t = await open(browser, { touch: true, pad: false })
  await t.page.evaluate(() => window.__SWARM.startRun('endless'))
  await sleep(1500)
  const tBefore = await t.page.evaluate(gateState)
  await t.page.touchscreen.touchStart(90, 520)
  await sleep(300)
  await t.page.touchscreen.touchEnd()
  await sleep(500)
  const touched = await t.page.evaluate(gateState)
  await t.page.close()
  out.gate = {
    pass: held && keyed.gate && keyed.time > 0.5 && before.time === 0 && moused.gate && moused.time > 0 && tBefore.time === 0 && touched.gate && touched.time > 0,
    idle10s: { time: idle.time, hp: idle.hp, maxHp: idle.maxHp, streamsUnmoved: idle.streams === start.streams, gate: idle.gate },
    afterKey: { gate: keyed.gate, time: +keyed.time.toFixed(2) },
    mouse: { before: before.time, gate: moused.gate, time: +moused.time.toFixed(2) },
    touch: { before: tBefore.time, gate: touched.gate, time: +touched.time.toFixed(2) },
    errors: [...errors, ...t.errors],
  }
}

/** In page: a run past the first-draft gate, a level ready, invincible. */
function readyDraft() {
  const S = window.__SWARM
  const w = S.world
  S.setLoadout('nova', 'hive')
  S.startRun('endless')
  w.player.maxHp = w.player.hp = 1e9
  S.step(6 * 60 + 10)
  w.player.hp = 1e9
  w.addXp(w.xpToNext + 1)
}

/** In page: a Standard run to its WIN panel (the PRIME at 1 HP, a bot aiming at it). */
function toWin() {
  const S = window.__SWARM
  const w = S.world
  S.setLoadout('nova', 'hive')
  S.startRun('endless')
  w.player.maxHp = w.player.hp = 1e9
  S.jumpTo(626)
  const inp = S.input
  const real = inp.update
  inp.update = () => {
    const b = w.boss
    inp.move.x = inp.move.y = 0
    inp.firing = !!b
    if (b) {
      const d = Math.hypot(b.x - w.player.x, b.y - w.player.y) || 1
      inp.aimDir.x = (b.x - w.player.x) / d
      inp.aimDir.y = (b.y - w.player.y) / d
    }
  }
  try {
    for (let i = 0; i < 60 * 40 && !w.pendingWin; i++) {
      if (w.bossAlive && w.boss && !w.boss.submerged) w.boss.hp = Math.min(w.boss.hp, 1)
      S.step(1)
      while (w.paused && (w.core.pending || w.draft.open)) if (w.core.pending) S.takeCore(true); else S.pickCard(0)
      w.player.hp = 1e9
    }
    S.step(1)
  } finally {
    inp.update = real
  }
}

async function cardCenter(page, i) {
  return page.evaluate((i) => {
    const v = window.__SWARM.modal.views[i]
    const b = v.root.getBounds()
    return { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }
  }, i)
}

async function checkLock(browser, out) {
  const { page, errors } = await open(browser, { touch: true, pad: false })
  await page.evaluate(readyDraft)
  await page.waitForFunction(() => window.__SWARM.modal.isOpen(), { timeout: 5000 })
  const t0 = Date.now()
  const c = await cardCenter(page, 1)
  await page.touchscreen.tap(c.x, c.y)
  const early = await page.evaluate(() => window.__SWARM.world.draft.open)
  // Measured from the modal's own open time, which the tap followed.
  const earlyMs = await page.evaluate(() => Math.round(performance.now() - window.__SWARM.modal.openAt))
  // A press that began inside the lock and lifts after it.
  await page.touchscreen.touchStart(c.x, c.y)
  await sleep(Math.max(0, 600 - (Date.now() - t0)))
  await page.touchscreen.touchEnd()
  await sleep(50)
  const straddle = await page.evaluate(() => window.__SWARM.world.draft.open)
  await page.touchscreen.tap(c.x, c.y)
  await sleep(100)
  const late = await page.evaluate(() => ({ open: window.__SWARM.world.draft.open, paused: window.__SWARM.world.paused }))

  // The recap: RETRY in the first 450 ms does nothing; after it, it retries.
  await page.evaluate(() => {
    const S = window.__SWARM
    S.step(30)
    S.world.time = 61
    S.world.kills = 40
    S.endRun('death')
  })
  const r0 = Date.now()
  const retryAt = await page.evaluate(() => {
    const b = window.__SWARM.recap.retry.view.getBounds()
    return { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }
  })
  await page.touchscreen.tap(retryAt.x, retryAt.y)
  const recapEarly = await page.evaluate(() => window.__SWARM.screen)
  const recapEarlyMs = Date.now() - r0
  await sleep(Math.max(0, 550 - (Date.now() - r0)))
  await page.touchscreen.tap(retryAt.x, retryAt.y)
  await sleep(150)
  const recapLate = await page.evaluate(() => window.__SWARM.screen)

  // The WIN panel: EXTRACT ignores the first 450 ms.
  await page.evaluate(toWin)
  const w0 = Date.now()
  const winUp = await page.evaluate(() => window.__SWARM.pauseReason)
  const extractAt = await page.evaluate(() => {
    const S = window.__SWARM
    let hit = null
    const walk = (o) => {
      if (!o.visible || hit) return
      if (o.style && o.text === 'EXTRACT') {
        const b = o.getBounds()
        hit = { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }
      }
      for (const ch of o.children) walk(ch)
    }
    walk(S.winPanel.view)
    return hit
  })
  if (!extractAt) {
    const st = await page.evaluate(() => ({ reason: window.__SWARM.pauseReason, screen: window.__SWARM.screen, pendingWin: window.__SWARM.world.pendingWin, t: window.__SWARM.world.time, win: window.__SWARM.winPanel.isOpen() }))
    throw new Error('lock: no WIN panel: ' + JSON.stringify(st))
  }
  await page.touchscreen.tap(extractAt.x, extractAt.y)
  const winEarly = await page.evaluate(() => window.__SWARM.screen)
  const winEarlyMs = Date.now() - w0
  await sleep(Math.max(0, 550 - (Date.now() - w0)))
  await page.touchscreen.tap(extractAt.x, extractAt.y)
  await sleep(150)
  const winLate = await page.evaluate(() => ({ screen: window.__SWARM.screen, end: window.__SWARM.lastResult?.end }))
  await page.close()
  out.lock = {
    pass:
      early && earlyMs < 450 && straddle && !late.open && !late.paused && recapEarly === 'gameover' && recapEarlyMs < 450 && recapLate === 'playing' &&
      winUp === 'win' && winEarly === 'playing' && winEarlyMs < 450 && winLate.screen === 'gameover' && winLate.end === 'clear',
    draft: { earlyTapIgnored: early, earlyMs, straddlingPressIgnored: straddle, lateTapPicked: !late.open, resumed: !late.paused },
    recap: { earlyTap: recapEarly, earlyMs: recapEarlyMs, lateTap: recapLate },
    win: { open: winUp, earlyTap: winEarly, earlyMs: winEarlyMs, lateTap: winLate },
    errors,
  }
}

/** In page: play `steps` ticks of a scripted bot from a fresh seeded run;
 *  `idle` ticks of no input go first through the loop's own step (the gate
 *  holds them). Returns a hash of the run state. */
function gatedRun(idle, steps) {
  const S = window.__SWARM
  const w = S.world
  const inp = S.input
  S.loop.stop()
  S.setLoadout('nova', 'hive')
  // startRun closes the gate; the world then restarts on a fixed seed (the
  // harness hook beginSeed would open it).
  S.startRun('endless')
  w.beginRun({ ...w.run, seed: 777 })
  const real = inp.update
  const stepOnce = S.loop.onUpdate
  let tick = 0
  inp.update = () => {
    inp.move.x = inp.move.y = 0
    inp.aimDir.x = inp.aimDir.y = 0
    inp.firing = false
  }
  for (let i = 0; i < idle; i++) stepOnce(1 / 60)
  const heldAt = w.time
  inp.update = () => {
    if (tick === 60) inp.pressDash()
    tick++
    let best = null
    let bd = Infinity
    for (const e of w.enemies.active) {
      if (!e.alive) continue
      const d = (e.x - w.player.x) ** 2 + (e.y - w.player.y) ** 2
      if (d < bd) {
        bd = d
        best = e
      }
    }
    inp.move.x = Math.cos(0.7 * w.time)
    inp.move.y = Math.sin(0.9 * w.time)
    inp.firing = true
    if (best) {
      const d = Math.sqrt(bd) || 1
      inp.aimDir.x = (best.x - w.player.x) / d
      inp.aimDir.y = (best.y - w.player.y) / d
    } else {
      inp.aimDir.x = 1
      inp.aimDir.y = 0
    }
  }
  try {
    for (let i = 0; i < steps; i++) {
      stepOnce(1 / 60)
      while (w.paused && w.core.pending) S.takeCore(true)
      while (w.paused && w.draft.open) S.pickCard(0)
      w.player.hp = w.player.maxHp
    }
  } finally {
    inp.update = real
  }
  let h = 0x811c9dc5
  const mix = (n) => {
    const v = Math.round(n * 16)
    for (let k = 0; k < 4; k++) {
      h ^= (v >>> (8 * k)) & 0xff
      h = Math.imul(h, 0x01000193)
    }
  }
  for (const k of ['spawn', 'script', 'boss', 'loot', 'draft', 'combat', 'fx']) mix(w.rngs[k].state)
  mix(w.time)
  mix(w.kills)
  mix(w.player.x)
  mix(w.player.y)
  mix(w.enemies.size)
  for (const e of w.enemies.active) {
    mix(e.x)
    mix(e.y)
    mix(e.hp)
  }
  S.loop.start()
  return { hash: (h >>> 0).toString(16), heldAt, time: +w.time.toFixed(3), kills: w.kills, enemies: w.enemies.size, gate: S.gateOpen }
}

async function checkGateDet(browser, out) {
  const { page, errors } = await open(browser, { touch: false, pad: false })
  const now = await page.evaluate(gatedRun, 0, 1200)
  const held = await page.evaluate(gatedRun, 120, 1200)
  await page.close()
  out.gatedet = { pass: now.hash === held.hash && held.heldAt === 0 && now.time === held.time, immediate: now, afterIdle: held, errors }
}

async function checkBackground(browser, out) {
  const { page, errors } = await open(browser, { touch: true, pad: false })
  await page.evaluate(() => {
    const S = window.__SWARM
    S.startRun('endless')
    S.world.player.maxHp = S.world.player.hp = 1e9
    S.step(120)
  })
  await sleep(400)
  const before = await page.evaluate(() => ({ t: window.__SWARM.world.time, paused: window.__SWARM.world.paused }))
  // Another tab in front hides this one (a real visibilitychange).
  const other = await browser.newPage()
  await other.bringToFront()
  await sleep(600)
  const hidden = await page.evaluate(() => ({
    vis: document.visibilityState,
    paused: window.__SWARM.world.paused,
    reason: window.__SWARM.pauseReason,
    sheet: window.__SWARM.pauseSheet.isOpen(),
    t: window.__SWARM.world.time,
  }))
  await page.bringToFront()
  await other.close()
  await sleep(700)
  const back = await page.evaluate(() => ({ paused: window.__SWARM.world.paused, sheet: window.__SWARM.pauseSheet.isOpen(), t: window.__SWARM.world.time }))
  await page.close()
  out.background = {
    pass: hidden.vis === 'hidden' && hidden.paused && hidden.reason === 'pause' && hidden.sheet && back.paused && back.sheet && back.t === hidden.t,
    before,
    hidden,
    afterReturn: back,
    errors,
  }
}

async function checkPad(browser, out) {
  const { page, errors } = await open(browser, { touch: false, pad: true })
  const press = async (button, holdMs = 80) => {
    await page.evaluate((b) => {
      window.__PAD.buttons[b].pressed = true
      window.__PAD.buttons[b].value = 1
    }, button)
    await sleep(holdMs)
    await page.evaluate((b) => {
      window.__PAD.buttons[b].pressed = false
      window.__PAD.buttons[b].value = 0
    }, button)
    await sleep(80)
  }
  const A = 0, B = 1, X = 2, Y = 3, START = 9, DOWN = 13
  const r = {}
  // Start pauses; B starts the countdown, and the run moves again after it.
  await page.evaluate(() => {
    const S = window.__SWARM
    S.startRun('endless')
    S.world.player.maxHp = S.world.player.hp = 1e9
    S.step(60)
  })
  await press(START)
  r.startPauses = await page.evaluate(() => window.__SWARM.pauseSheet.isOpen() && window.__SWARM.world.paused)
  await press(B)
  await sleep(1500)
  r.bResumes = await page.evaluate(() => !window.__SWARM.world.paused && !window.__SWARM.pauseSheet.isShown())

  // A draft: Y rerolls, X arms banish (X again disarms), down + A picks card 2, then B skips the next.
  await page.evaluate(readyDraft)
  await page.waitForFunction(() => window.__SWARM.modal.isOpen(), { timeout: 5000 })
  await sleep(500)
  const rerolls0 = await page.evaluate(() => window.__SWARM.world.draft.rerolls)
  await press(Y)
  r.yRerolls = (await page.evaluate(() => window.__SWARM.world.draft.rerolls)) === rerolls0 - 1
  await press(X)
  r.xBanishMode = await page.evaluate(() => window.__SWARM.modal.banishMode)
  await press(X)
  const card1 = await page.evaluate(() => window.__SWARM.world.draft.cards[1].id)
  await press(DOWN)
  await press(A)
  r.downAPicksCard2 = await page.evaluate((id) => !window.__SWARM.world.draft.open && (window.__SWARM.world.perkStacks.get(id) ?? 0) > 0, card1)
  await sleep(300)
  await page.evaluate(() => {
    const w = window.__SWARM.world
    w.draft.lastOpenAt = -100
    w.addXp(w.xpToNext + 1)
  })
  await page.waitForFunction(() => window.__SWARM.modal.isOpen(), { timeout: 5000 })
  await sleep(500)
  await press(B)
  r.bSkips = await page.evaluate(() => !window.__SWARM.world.draft.open)

  // A Hive Core with no choice: A continues.
  await sleep(300)
  await page.evaluate(() => {
    const S = window.__SWARM
    S.dropCore(0)
    const w = S.world
    const c = w.pickups.active.find((p) => p.alive && p.kind === 'core')
    c.x = c.prevX = w.player.x
    c.y = c.prevY = w.player.y
  })
  await page.waitForFunction(() => window.__SWARM.coreReveal.isOpen(), { timeout: 5000 })
  const choice = await page.evaluate(() => window.__SWARM.coreReveal.choice)
  await sleep(400)
  await press(A)
  r.aClosesCore = await page.evaluate(() => !window.__SWARM.coreReveal.isOpen() && !window.__SWARM.world.core.pending)
  r.coreHadChoice = choice

  // The WIN panel: A on EXTRACT; then the recap: A on RETRY.
  await page.evaluate(toWin)
  await sleep(600)
  r.winOpen = await page.evaluate(() => window.__SWARM.pauseReason === 'win')
  await press(A)
  r.aExtracts = await page.evaluate(() => window.__SWARM.screen === 'gameover' && window.__SWARM.lastResult.end === 'clear')
  await sleep(600)
  await press(A)
  await sleep(200)
  r.aRetries = await page.evaluate(() => window.__SWARM.screen === 'playing')
  await page.close()
  out.pad = { pass: Object.entries(r).every(([k, v]) => k === 'coreHadChoice' || v === true), ...r, errors }
}

await acquireChromeLock('probe-p16')
let browser
for (let attempt = 1; ; attempt++) {
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      protocolTimeout: 300000,
      args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
    })
    break
  } catch (e) {
    if (attempt >= 2) throw e
    console.error('launch failed, retrying in 10 s:', e.message)
    await sleep(10000)
  }
}
const out = {}
const only = process.argv.slice(2)
const want = (k) => only.length === 0 || only.includes(k)
try {
  if (want('gate')) await checkGate(browser, out)
  if (want('gatedet')) await checkGateDet(browser, out)
  if (want('lock')) await checkLock(browser, out)
  if (want('background')) await checkBackground(browser, out)
  if (want('pad')) await checkPad(browser, out)
} finally {
  await browser.close()
}
const pass = Object.values(out).every((v) => v.pass && v.errors.length === 0)
console.log(JSON.stringify({ pass, ...out }, null, 1))
process.exitCode = pass ? 0 : 1
