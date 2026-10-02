// OVERTIME cycle banner (P19 closeout): the callout each OVERTIME cycle opens
// with, `OVERTIME` over `CYCLE n`, and from cycle 2 a second sub line naming
// the healing cuts (`FEWER MEDKITS · OTHER HEALING -75%`, the percentage from
// OVERTIME.healMul). Plays a Hive run into OVERTIME (the ship held alive),
// screenshots the cycle 1 and cycle 2 banners at each size, and checks per
// banner: the lines read as written, the callout sits inside the safe width
// and clears the HUD stack, every Text is at least 12 px, and the rendered
// fill of each line against its INK stroke is 4.5:1 or more (the glyph and
// stroke pixels inside the line's box in the screenshot).
//
// Usage: node scripts/probe-ot-banner.mjs [sizes] [--out=DIR] [--prefix=NAME]
//   sizes  comma list of p375,l667,p390 (default all three; p390 has the
//          47/34 safe-area insets)
// Server origin: env SWG_URL (default http://localhost:5176).
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
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
const OUT = flags.out || path.join(os.tmpdir(), 'swarmgeddon-ot-banner')
const PREFIX = flags.prefix || 'ot-banner-'
fs.mkdirSync(OUT, { recursive: true })
const ONLY = (pos[0] || 'p375,l667,p390').split(',')
const SIZES = [
  { name: 'p375', file: '375x667', w: 375, h: 667, insets: null },
  { name: 'l667', file: '667x375', w: 667, h: 375, insets: null },
  { name: 'p390', file: '390x844', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
].filter((s) => ONLY.includes(s.name))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const INK = [5, 7, 13]

/** In page: a Hive run at 11:40 with the ship held at 80 of 100 HP (and
 *  unkillable while the probe steps the sim in bulk). */
function stage() {
  const S = window.__SWARM
  const w = S.world
  S.setLoadout('nova', 'hive')
  S.startRun('endless')
  S.jumpTo(700)
  const keep = () => {
    w.player.maxHp = 100
    w.player.hp = 80
  }
  for (let i = 0; i < 30; i++) {
    w.player.maxHp = w.player.hp = 1e9
    S.step(60)
    while (w.paused && w.draft.open) S.pickCard(0)
  }
  keep()
  window.__otKeep = () => {
    keep()
    requestAnimationFrame(window.__otKeep)
  }
  window.__otKeep()
}

/** In page: cycle 1 starts OVERTIME (as the win panel's button does, without
 *  the core reveal); cycle 2 plays the sim to the next cycle's start. Then it
 *  waits for that cycle's banner past its enter animation. */
async function toCycle(cycle) {
  const S = window.__SWARM
  const w = S.world
  const c = S.callouts
  c.clear()
  if (cycle === 1) w.startOvertime()
  for (let i = 0; i < 400 && w.director.otCycle < cycle; i++) {
    w.player.maxHp = w.player.hp = 1e9
    S.step(60)
    while (w.paused && w.draft.open) S.pickCard(0)
    if (S.coreReveal.isOpen()) S.takeCore(false)
  }
  w.player.maxHp = 100
  w.player.hp = 80
  const t0 = performance.now()
  while (performance.now() - t0 < 4000 && !(c.box.visible && c.title.text === 'OVERTIME' && c.age > 0.5)) await new Promise((r) => setTimeout(r, 30))
  return { cycle, otCycle: w.director.otCycle, time: +w.time.toFixed(2), title: c.title.text, sub: c.sub.text, visible: c.box.visible, age: +c.age.toFixed(2), paused: w.paused, pauseReason: S.pauseReason, draft: w.draft.open, screen: S.screen, runState: w.director.runState, dead: w.player.hp <= 0 }
}

/** In page: the callout's line boxes, the HUD stack bottom and every Text's px. */
function measure() {
  const S = window.__SWARM
  const c = S.callouts
  const box = (o) => {
    const b = o.getBounds()
    return { x: b.minX, y: b.minY, w: b.width, h: b.height }
  }
  const texts = []
  const walk = (o, a) => {
    if (!o.visible) return
    const al = a * o.alpha
    if (o.style && typeof o.text === 'string' && o.text.trim() && al > 0.02) {
      const wt = o.worldTransform
      const fs = typeof o.style.fontSize === 'number' ? o.style.fontSize : parseFloat(o.style.fontSize)
      texts.push({ t: o.text, px: +(fs * Math.hypot(wt.a, wt.b)).toFixed(1) })
    }
    for (const ch of o.children) walk(ch, al)
  }
  walk(S.app.stage, 1)
  return { W: S.app.screen.width, H: S.app.screen.height, title: box(c.title), sub: box(c.sub), lane: box(c.box), hudBottom: S.hud.stackBottom, texts, titleFill: c.title.style.fill, subFill: c.sub.style.fill }
}

const lum = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** The rendered fill of a line against its INK stroke. Inside the line's box
 *  (CSS px; the PNG is at deviceScaleFactor 2), the pixels within 24 levels of
 *  the line's fill color are its glyphs and those within 12 levels of INK its
 *  stroke; the glyphs' median color is read against INK. Swarm sprites behind
 *  the line fall in neither group. */
function lineContrast(png, b, fillHex) {
  const want = [(fillHex >> 16) & 255, (fillHex >> 8) & 255, fillHex & 255]
  const near = (p, c, d) => p.every((v, j) => Math.abs(v - c[j]) <= d)
  const glyph = []
  let ink = 0
  const k = 2
  for (let y = Math.max(0, Math.floor(b.y * k)); y < Math.min(png.height, Math.ceil((b.y + b.h) * k)); y++) {
    for (let x = Math.max(0, Math.floor(b.x * k)); x < Math.min(png.width, Math.ceil((b.x + b.w) * k)); x++) {
      const i = (y * png.width + x) * 4
      const p = [png.data[i], png.data[i + 1], png.data[i + 2]]
      if (near(p, want, 24)) glyph.push(p)
      else if (near(p, INK, 12)) ink++
    }
  }
  const mid = (j) => [...glyph].sort((u, v) => u[j] - v[j])[glyph.length >> 1]?.[j] ?? 0
  const fill = [mid(0), mid(1), mid(2)]
  return { want: fillHex.toString(16).padStart(6, '0'), fill: fill.map((v) => v.toString(16).padStart(2, '0')).join(''), glyphPixels: glyph.length, inkPixels: ink, ratio: glyph.length ? +ratio(fill, INK).toFixed(2) : 0 }
}

await acquireChromeLock('probe-ot-banner')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
const report = {}
let failed = 0
try {
  for (const size of SIZES) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    if (size.insets) {
      const cdp = await page.createCDPSession()
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets })
    }
    await page.goto(ORIGIN + '/?touch=1&seed=777', { waitUntil: 'networkidle0', timeout: 45000 })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await sleep(600)
    await page.evaluate(stage)
    await page.touchscreen.tap(size.w * 0.3, size.h * 0.7)
    await sleep(300)
    const out = []
    for (const [cycle, want] of [
      [1, 'CYCLE 1'],
      [2, 'CYCLE 2\nFEWER MEDKITS \u00b7 OTHER HEALING -75%'],
    ]) {
      const st = await page.evaluate(toCycle, cycle)
      const file = path.join(OUT, `${PREFIX}c${cycle}-${size.file}.png`)
      await page.screenshot({ path: file })
      const m = await page.evaluate(measure)
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const png = { data, width: info.width, height: info.height }
      const fails = []
      if (!st.visible || st.title !== 'OVERTIME' || st.sub !== want) fails.push(`banner reads ${JSON.stringify(st)}, want OVERTIME / ${JSON.stringify(want)}`)
      const L = size.insets ? size.insets.left : 0
      const R = size.insets ? size.insets.right : 0
      for (const [name, b] of [['title', m.title], ['sub', m.sub]]) {
        if (b.x < L || b.x + b.w > m.W - R) fails.push(`${name} outside the safe width: ${JSON.stringify(b)}`)
        if (b.y < m.hudBottom) fails.push(`${name} top ${b.y.toFixed(1)} above the HUD stack bottom ${m.hudBottom}`)
      }
      if (m.title.y + m.title.h > m.sub.y + 2) fails.push(`title and sub overlap: ${JSON.stringify({ title: m.title, sub: m.sub })}`)
      for (const t of m.texts) if (t.px < 12) fails.push(`text under 12 px: ${t.t} (${t.px})`)
      const contrast = { title: lineContrast(png, m.title, m.titleFill), sub: lineContrast(png, m.sub, m.subFill) }
      for (const [name, c] of Object.entries(contrast)) {
        if (c.glyphPixels < 30 || c.inkPixels < 30) fails.push(`${name}: ${c.glyphPixels} glyph and ${c.inkPixels} stroke pixels in its box (fill #${c.want})`)
        if (c.ratio < 4.5) fails.push(`${name} fill #${c.fill} on INK ${c.ratio}:1`)
      }
      failed += fails.length
      out.push({ cycle, file, state: st, title: m.title, sub: m.sub, hudBottom: m.hudBottom, contrast, fails })
    }
    report[size.name] = { banners: out, errors }
    failed += errors.length
    await ctx.close()
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify(report, null, 1))
console.log(failed ? `FAIL: ${failed} problem(s)` : 'PASS')
process.exit(failed ? 1 : 0)
