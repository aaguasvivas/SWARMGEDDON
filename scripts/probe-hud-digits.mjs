// SWARMGEDDON HUD digit contrast probe (P19 polish): every HUD DigitStrip
// measured against the fill it sits on, from rendered pixels.
//
// The run HUD is held in four HP states (full 100, busy 62+18 with an
// overshield, half 48, low 20) with a boss alive, LEVEL UP x2, level 12,
// rockets and the three bonus rings. Per state the probe pauses the sim, takes
// a screenshot with the digits shown (A) and one with every DigitStrip hidden
// (B). Pixels that change between A and B are glyph pixels; the ones within 40
// of the strip's tint are its ink, and B at those pixels is the ground the ink
// sits on. It reports the ratio of the ink color against that ground per strip
// (median, p10, min over the ink pixels), and saves the A shots and a 3x crop
// of the top HUD band for a person to look at.
//
// Usage: node scripts/probe-hud-digits.mjs [sizes] [--out=DIR] [--world=hive]
//   sizes  comma list of p320,p375,l667,p390 (default p375,l667)
// Server origin: env SWG_URL (default http://localhost:5176).
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'
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
const OUT = flags.out || path.join(os.tmpdir(), 'swarmgeddon-hud-digits')
const WORLD = flags.world || 'hive'
fs.mkdirSync(OUT, { recursive: true })
const ONLY = (pos[0] || 'p375,l667').split(',')
const SIZES = [
  { name: 'p320', w: 320, h: 568 },
  { name: 'p375', w: 375, h: 667 },
  { name: 'l667', w: 667, h: 375 },
  { name: 'p390', w: 390, h: 844 },
].filter((s) => ONLY.includes(s.name))
const STATES = [
  { id: 'full', hp: 100, shield: 0 },
  { id: 'busy', hp: 62, shield: 18 },
  { id: 'half', hp: 48, shield: 0 },
  { id: 'low', hp: 20, shield: 0 },
]
const DPR = 2
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** In page: a run with a boss alive; a rAF hook holds HP, level and the rings
 *  at the values in window.__hudProbe. */
function stage(world) {
  const S = window.__SWARM
  const w = S.world
  window.__hudProbe = { hp: 100, shield: 0 }
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
  const hold = () => {
    const p = window.__hudProbe
    w.player.maxHp = 100
    w.player.hp = p.hp
    w.player.invuln = 5
    w.overshield = p.shield
    w.level = 12
    w.pendingLevelUps = 2
    w.freezeT = 2.5
    w.overdriveT = 5.5
    w.shieldT = 3.2
    w.draft.index = Math.max(1, w.draft.index)
    w.draft.lastOpenAt = w.time
    if (w.boss) w.boss.hp = w.boss.maxHp * 0.64
    S.feel.hurtFlash = 0
    requestAnimationFrame(hold)
  }
  hold()
}

/** In page: the HUD DigitStrips that show, with their screen boxes (CSS px) and tints. */
function strips() {
  const h = window.__SWARM.hud
  const list = [
    ['lvNum', h.lvNum, 12], ['hpNum', h.hpNum, 13], ['shieldNum', h.shieldNum, 13], ['time', h.time, 18], ['score', h.score, 13],
    ['chipNum', h.chipNum, 12], ['bossPct', h.bossPct, 12], ['ammo', h.ammo, 14],
    ['ring0', h.bonusRings[0].secs, 12], ['ring1', h.bonusRings[1].secs, 12], ['ring2', h.bonusRings[2].secs, 12],
  ]
  const shown = (o) => {
    for (let n = o; n; n = n.parent) if (!n.visible || n.alpha === 0) return false
    return true
  }
  const out = []
  for (const [name, d, px] of list) {
    if (!d || !shown(d.view) || d.width <= 0) continue
    const wt = d.view.worldTransform
    const k = wt.a / d.view.scale.x
    const w = d.width * k
    const x = d.align === 1 ? wt.tx - w : d.align === 0.5 ? wt.tx - w / 2 : wt.tx
    const hh = 0.5 * px * k
    out.push({ name, tint: d.sprites[0].tint, x: x - 2, y: wt.ty - hh - 2, w: w + 4, h: hh * 2 + 4 })
  }
  return out
}

function setDigitsAlpha(a) {
  const h = window.__SWARM.hud
  for (const d of [h.lvNum, h.hpNum, h.shieldNum, h.time, h.score, h.chipNum, h.bossPct, h.ammo, ...h.bonusRings.map((r) => r.secs)]) d.view.alpha = a
}

const frames = (page, n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) }), n)

async function raw(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

const lin = (c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) * p)] : NaN
}

/** Contrast of one strip's ink against the ground under it, from shots A and B. */
function contrast(A, B, s) {
  const tr = (s.tint >> 16) & 255
  const tg = (s.tint >> 8) & 255
  const tb = s.tint & 255
  const x0 = Math.max(0, Math.floor(s.x * DPR))
  const y0 = Math.max(0, Math.floor(s.y * DPR))
  const x1 = Math.min(A.w, Math.ceil((s.x + s.w) * DPR))
  const y1 = Math.min(A.h, Math.ceil((s.y + s.h) * DPR))
  const ink = []
  let glyph = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * A.w + x) * 4
      const ar = A.data[i], ag = A.data[i + 1], ab = A.data[i + 2]
      const br = B.data[i], bg = B.data[i + 1], bb = B.data[i + 2]
      if (Math.max(Math.abs(ar - br), Math.abs(ag - bg), Math.abs(ab - bb)) < 60) continue
      glyph++
      if (Math.max(Math.abs(ar - tr), Math.abs(ag - tg), Math.abs(ab - tb)) <= 40) ink.push([ar, ag, ab, br, bg, bb])
    }
  }
  if (ink.length < 5) return { name: s.name, tint: hex(tr, tg, tb), glyph, ink: ink.length, note: 'ink not found' }
  const ir = median(ink.map((p) => p[0])), ig = median(ink.map((p) => p[1])), ib = median(ink.map((p) => p[2]))
  const li = lum(ir, ig, ib)
  const rs = ink.map((p) => ratio(li, lum(p[3], p[4], p[5])))
  const gr = median(ink.map((p) => p[3])), gg = median(ink.map((p) => p[4])), gb = median(ink.map((p) => p[5]))
  return {
    name: s.name, tint: hex(tr, tg, tb), ink: hex(ir, ig, ib), ground: hex(gr, gg, gb), glyph, inkPx: ink.length,
    median: +median(rs).toFixed(2), p10: +pct(rs, 0.1).toFixed(2), min: +Math.min(...rs).toFixed(2),
  }
}

await acquireChromeLock('probe-hud-digits')
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
let browser
try {
  browser = await launch()
} catch (e) {
  console.error('launch failed, retrying in 10s:', e.message)
  await sleep(10000)
  browser = await launch()
}
const report = { origin: ORIGIN, world: WORLD, sizes: {} }
try {
  for (const size of SIZES) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: DPR, isMobile: true, hasTouch: true })
    await page.goto(ORIGIN + '/?touch=1', { waitUntil: 'networkidle0', timeout: 45000 })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await sleep(600)
    await page.evaluate(stage, WORLD)
    await page.touchscreen.tap(size.w * 0.3, size.h * 0.7)
    await sleep(900)
    const rows = {}
    for (const st of STATES) {
      await page.evaluate((p) => Object.assign(window.__hudProbe, p), { hp: st.hp, shield: st.shield })
      // The HP bar eases and its ghost decays: let both settle, then freeze the sim.
      await sleep(1600)
      await page.evaluate(() => { window.__SWARM.world.paused = true })
      await frames(page, 4)
      const list = await page.evaluate(strips)
      const a = await page.screenshot()
      await page.evaluate(setDigitsAlpha, 0)
      await frames(page, 3)
      const b = await page.screenshot()
      await page.evaluate(setDigitsAlpha, 1)
      await page.evaluate(() => { window.__SWARM.world.paused = false })
      const file = path.join(OUT, `${size.name}-${st.id}.png`)
      fs.writeFileSync(file, a)
      const band = Math.round((size.h > size.w ? 0.27 : 0.4) * size.h * DPR)
      await sharp(a).extract({ left: 0, top: 0, width: size.w * DPR, height: band }).resize({ width: Math.round(size.w * DPR * 1.5), kernel: 'nearest' }).toFile(path.join(OUT, `${size.name}-${st.id}-top.png`))
      const A = await raw(a)
      const B = await raw(b)
      rows[st.id] = list.map((s) => contrast(A, B, s))
    }
    report.sizes[size.name] = { rows, errors }
    await ctx.close()
  }
} finally {
  await browser.close()
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
for (const [size, r] of Object.entries(report.sizes)) {
  console.log(`\n${size}${r.errors.length ? '  page errors: ' + r.errors.join(' | ') : ''}`)
  for (const [st, list] of Object.entries(r.rows)) {
    for (const c of list) {
      console.log(`  ${st.padEnd(5)} ${c.name.padEnd(9)} tint ${c.tint} ink ${c.ink ?? '-'} ground ${c.ground ?? '-'}  median ${c.median ?? '-'}  p10 ${c.p10 ?? '-'}  min ${c.min ?? '-'}  (ink px ${c.inkPx ?? c.ink}${c.note ? ', ' + c.note : ''})`)
    }
  }
}
console.log('\nshots and report.json in ' + OUT)
process.exit(0)
