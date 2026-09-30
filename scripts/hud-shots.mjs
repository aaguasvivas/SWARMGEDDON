// SWARMGEDDON HUD capture (P15): the run HUD with a boss alive (in FRENZY), a
// LEVEL UP x2 chip, tier x5, an overshield and a callout in the lane, at phone sizes with
// safe-area insets. Writes one PNG per size plus the HUD element boxes, and
// checks: no two HUD boxes overlap (bitmap DigitStrips included, which a Text
// dump misses), the DASH hit circle clears the weapon pill, the boss plate and
// the pause button and the stick rest points, and every Text is at least 12 px.
//
// Usage: node scripts/hud-shots.mjs [sizes] [--out=DIR] [--world=hive]
//   sizes  comma list of p320,l568,p375,l667,p390,l844 (default p375,l667,p390;
//          p320 and l568 are the narrowest phones)
// Server origin: env SWG_URL (default http://localhost:5176).
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const flags = {}
const pos = []
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/s.exec(a)
  if (m) flags[m[1]] = m[2]
  else pos.push(a)
}
const OUT = flags.out || path.join(os.tmpdir(), 'swarmgeddon-hud-shots')
const WORLD = flags.world || 'hive'
fs.mkdirSync(OUT, { recursive: true })
const ONLY = (pos[0] || 'p375,l667,p390').split(',')
const SIZES = [
  { name: 'p320', w: 320, h: 568, insets: null },
  { name: 'l568', w: 568, h: 320, insets: null },
  { name: 'p375', w: 375, h: 667, insets: null },
  { name: 'l667', w: 667, h: 375, insets: null },
  { name: 'p390', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: 'l844', w: 844, h: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
].filter((s) => ONLY.includes(s.name))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** In page: the run HUD in its busiest state; the rAF hook holds it there. */
function stage(world) {
  const S = window.__SWARM
  const w = S.world
  S.setLoadout('nova', world)
  S.startRun('endless')
  w.player.maxHp = w.player.hp = 1e9
  S.jumpTo(236)
  for (let i = 0; i < 60 * 12 && !(w.bossAlive && w.boss && w.time - w.boss.bornAt > 1.2); i++) {
    S.step(1)
    while (w.paused && w.draft.open) S.pickCard(0)
    w.player.hp = 1e9
  }
  S.give('rocket')
  w.player.maxHp = 100
  const hold = () => {
    w.player.maxHp = 100
    w.player.hp = 62
    w.player.invuln = 0
    w.overshield = 18
    w.chain = 180
    w.tier = 5
    w.score = 1234567
    w.pendingLevelUps = 2
    w.draft.index = Math.max(1, w.draft.index)
    w.draft.lastOpenAt = w.time
    if (w.boss) w.boss.hp = w.boss.maxHp * 0.64
    w.director.frenzy = Math.max(1, w.director.frenzy)
    requestAnimationFrame(hold)
  }
  hold()
  S.feel.hurtFlash = 0
  S.callouts.show({ prio: 3, hold: 30 }, w.script.text.mid1.title, w.script.text.mid1.sub, 0xff6aa8)
}

/** In page: HUD element boxes (screen px), the DASH circle and the rest points. */
function measure() {
  const S = window.__SWARM
  const h = S.hud
  const box = (o) => {
    if (!o || !o.visible) return null
    const b = o.getBounds()
    return { x: Math.round(b.minX), y: Math.round(b.minY), w: Math.round(b.width), h: Math.round(b.height) }
  }
  // A DigitStrip's sprites carry the atlas padding; its ink is `width` wide
  // (align 0 or 1) and about 0.8 of its font size tall around its center.
  const strip = (d, px) => {
    if (!d || !d.view.visible) return null
    const wt = d.view.worldTransform
    const k = wt.a / d.view.scale.x
    const w = d.width * k
    const x = d.align === 1 ? wt.tx - w : d.align === 0.5 ? wt.tx - w / 2 : wt.tx
    const hh = 0.4 * px * k
    return { x: Math.round(x), y: Math.round(wt.ty - hh), w: Math.round(w), h: Math.round(hh * 2) }
  }
  const boxes = {
    pause: box(h.pause), lvChip: box(h.lvChip.view), hpBar: box(h.hpBack.view), hpNum: strip(h.hpNum, 13), shieldNum: strip(h.shieldNum, 13),
    xpBar: box(h.xpBack.view), timeline: box(h.timeline), time: strip(h.time, 18), score: strip(h.score, 13), daily: box(h.daily),
    chip: box(h.chip), badge: box(h.badge), boss: box(h.boss), pill: box(h.pill),
    callout: box(S.callouts.box),
    arrow0: box(S.arrows.slots[0]), arrow1: box(S.arrows.slots[1]), arrow2: box(S.arrows.slots[2]),
  }
  const t = S.input.touch
  const hint = S.touchHint
  const texts = []
  const walk = (o, a) => {
    if (!o.visible) return
    const al = a * o.alpha
    if (o.style && typeof o.text === 'string' && o.text.trim() && al > 0.02) {
      const wt = o.worldTransform
      const fs = typeof o.style.fontSize === 'number' ? o.style.fontSize : parseFloat(o.style.fontSize)
      texts.push({ t: o.text, px: +(fs * Math.hypot(wt.a, wt.b)).toFixed(1) })
    }
    for (const c of o.children) walk(c, al)
  }
  walk(S.app.stage, 1)
  return {
    W: S.app.screen.width, H: S.app.screen.height, boxes,
    dash: { x: t.dashX, y: t.dashY, r: 44 },
    rest: [{ x: hint.left.view.x, y: hint.left.view.y }, { x: hint.right.view.x, y: hint.right.view.y }],
    laneY: h.laneY, texts,
    emerge: { started: S.emerge.started, dropped: S.emerge.dropped },
  }
}

function check(m) {
  const fails = []
  const b = m.boxes
  const overlap = (p, q) => p && q && Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 0 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 0
  const pairs = [
    ['time', 'hpBar'], ['time', 'xpBar'], ['time', 'score'], ['score', 'xpBar'], ['score', 'timeline'], ['daily', 'timeline'], ['daily', 'score'],
    ['lvChip', 'hpBar'], ['lvChip', 'pause'], ['hpBar', 'pause'], ['chip', 'badge'], ['chip', 'boss'], ['badge', 'boss'],
    ['callout', 'boss'], ['callout', 'badge'], ['callout', 'chip'], ['callout', 'pill'], ['hpNum', 'time'], ['hpNum', 'shieldNum'],
    ['arrow0', 'callout'], ['arrow1', 'callout'], ['arrow2', 'callout'],
  ]
  for (const [p, q] of pairs) if (overlap(b[p], b[q])) fails.push(`overlap ${p} / ${q}`)
  for (const [k, v] of Object.entries(b)) if (v && (v.x < 0 || v.y < 0 || v.x + v.w > m.W || v.y + v.h > m.H)) fails.push(`offscreen ${k}`)
  const circleHits = (c, r) => {
    if (!r) return false
    const nx = Math.max(r.x, Math.min(c.x, r.x + r.w))
    const ny = Math.max(r.y, Math.min(c.y, r.y + r.h))
    return (nx - c.x) ** 2 + (ny - c.y) ** 2 < c.r * c.r
  }
  if (circleHits(m.dash, b.pill)) fails.push('DASH hit circle overlaps the weapon pill')
  if (circleHits(m.dash, b.boss)) fails.push('DASH hit circle overlaps the boss plate')
  if (circleHits(m.dash, b.pause)) fails.push('DASH hit circle overlaps the pause button')
  for (const p of m.rest) if ((p.x - m.dash.x) ** 2 + (p.y - m.dash.y) ** 2 < m.dash.r ** 2) fails.push('DASH hit circle covers a stick rest point')
  for (const t of m.texts) if (t.px < 12) fails.push(`text under 12 px: ${t.t} (${t.px})`)
  return fails
}

await acquireChromeLock('hud-shots')
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
let browser
try {
  browser = await launch()
} catch (e) {
  console.error('launch failed, retrying in 10s:', e.message)
  await sleep(10000)
  browser = await launch()
}
const report = {}
try {
  for (const size of SIZES) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    if (size.insets) {
      const cdp = await page.createCDPSession()
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets })
    }
    await page.goto(ORIGIN + '/?touch=1', { waitUntil: 'networkidle0', timeout: 45000 })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await sleep(600)
    // A touch in the run area makes the touch UI (sticks and DASH) the live input.
    await page.evaluate(stage, WORLD)
    await page.touchscreen.tap(size.w * 0.3, size.h * 0.7)
    await sleep(700)
    const file = path.join(OUT, `${size.name}-${WORLD}-hud.png`)
    await page.screenshot({ path: file })
    const m = await page.evaluate(measure)
    const fails = check(m)
    report[size.name] = { file, fails, errors, ...m }
    console.log(JSON.stringify({ size: size.name, file, fails, errors, boxes: m.boxes, dash: m.dash, rest: m.rest, laneY: m.laneY }))
    await ctx.close()
  }
} finally {
  await browser.close()
}
fs.writeFileSync(path.join(OUT, 'hud-report.json'), JSON.stringify(report, null, 1))
process.exit(0)
