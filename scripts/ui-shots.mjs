// SWARMGEDDON UI capture: every screen at phone (and optional desktop) sizes,
// DPR 2, plus a Pixi scene-graph dump per screen (text px, bounds, hit targets)
// and a summary of the standard checks (text under 12 px, targets under 44 px,
// overlapping text boxes).
//
// Usage: node scripts/ui-shots.mjs [sizes] [--out=DIR]
//   sizes  comma list of p375,l667,p390,l844,d1440 (default p375,l667)
//   --out  output folder (default <os tmp>/swarmgeddon-ui-shots)
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Network: the leaderboard API is mocked in-page (fetch override) and any
// request that is not same-origin and not a GET is aborted, so nothing
// reaches the live leaderboard.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const flags = {}
const pos = []
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/s.exec(a)
  if (m) flags[m[1]] = m[2]
  else pos.push(a)
}
const OUT = flags.out || path.join(os.tmpdir(), 'swarmgeddon-ui-shots')
fs.mkdirSync(OUT, { recursive: true })
const ONLY = (pos[0] || 'p375,l667').split(',')

const SIZES = [
  { name: 'p375', w: 375, h: 667, touch: true, insets: null },
  { name: 'l667', w: 667, h: 375, touch: true, insets: null },
  { name: 'p390', w: 390, h: 844, touch: true, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: 'l844', w: 844, h: 390, touch: true, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
  { name: 'd1440', w: 1440, h: 900, touch: false, insets: null },
].filter((s) => ONLY.includes(s.name))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  await acquireChromeLock('ui-shots')
  const opts = {
    executablePath: CHROME,
    headless: true,
    args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
  }
  try {
    return await puppeteer.launch(opts)
  } catch (e) {
    console.error('launch failed, retrying in 10s:', e.message)
    await sleep(10000)
    return await puppeteer.launch(opts)
  }
}

// In-page mock of the leaderboard API (installed before any app script runs).
function installMocks() {
  const names = ['XXXXXXXXXXXXXX', 'NOVA_ACE', 'HIVEBREAKER', 'mmmmmmmmmmmmmm', 'ICHORQUEEN', 'Zed', 'W1DE_NAME_W1DE', 'ANON', 'swarmlord', 'EMBERMAIN', 'VOIDWALKER', 'ANON']
  const countries = ['US', 'BR', null, 'DE', 'JP', 'US', 'GB', null, 'FR', 'KR', 'CA', null]
  const entries = names.map((n, i) => ({ rank: i + 1, name: n, score: Math.round(2345678 / (i + 1)), time: 400 - i * 10, kills: 900 - i * 40, level: 20 - i, country: countries[i] }))
  const orig = window.fetch.bind(window)
  window.__apiCalls = []
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.includes('/api/score') || url.includes('/api/v2/run')) {
      window.__apiCalls.push(['score', url])
      await new Promise((r) => setTimeout(r, 150))
      return new Response(JSON.stringify({ score: 98765, rank: 42 }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/leaderboard') || url.includes('/api/v2/board')) {
      window.__apiCalls.push(['board', url])
      await new Promise((r) => setTimeout(r, 150))
      return new Response(JSON.stringify({ entries, region: 'US' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return orig(input, init)
  }
}

// Walk the Pixi stage: visible Text nodes (effective px size, bounds, fill,
// cumulative alpha) and interactive hit targets (global rect).
function dump() {
  const S = window.__SWARM
  const W = S.app.screen.width
  const H = S.app.screen.height
  const texts = []
  const targets = []
  const hex = (v) => {
    if (typeof v === 'number') return '#' + v.toString(16).padStart(6, '0')
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && 'color' in v) return hex(v.color)
    if (v && typeof v === 'object' && 'fill' in v) return hex(v.fill)
    return String(v)
  }
  const walk = (o, alpha) => {
    if (!o.visible || o.renderable === false) return
    const a = alpha * o.alpha
    if (a <= 0.02) return
    const isText = o.style && typeof o.text === 'string' && o.anchor
    if (isText && o.text.trim()) {
      const b = o.getBounds()
      const wt = o.worldTransform
      const sc = Math.hypot(wt.a, wt.b)
      const fsz = typeof o.style.fontSize === 'number' ? o.style.fontSize : parseFloat(o.style.fontSize)
      texts.push({
        t: o.text.replace(/\n/g, ' / ').slice(0, 90),
        px: +(fsz * sc).toFixed(1),
        x: Math.round(b.minX), y: Math.round(b.minY), w: Math.round(b.width), h: Math.round(b.height),
        a: +a.toFixed(2), fill: hex(o.style._originalFill ?? o.style.fill),
      })
    }
    if (o.eventMode === 'static' && o.hitArea) {
      const lbl = o.children.find((c) => c.style && typeof c.text === 'string')
      if (typeof o.hitArea.width === 'number') {
        const p0 = o.toGlobal({ x: o.hitArea.x, y: o.hitArea.y })
        const p1 = o.toGlobal({ x: o.hitArea.x + o.hitArea.width, y: o.hitArea.y + o.hitArea.height })
        targets.push({ label: lbl ? lbl.text.slice(0, 40) : '(no label)', x: Math.round(p0.x), y: Math.round(p0.y), w: Math.round(p1.x - p0.x), h: Math.round(p1.y - p0.y) })
      }
    }
    for (const c of o.children) walk(c, a)
  }
  walk(S.app.stage, 1)
  return { W, H, screen: S.screen, texts, targets }
}

/** The standard checks over one scene dump. */
function summarize(d) {
  const small = d.texts.filter((t) => t.px < 12).map((t) => `${t.t} (${t.px}px)`)
  const tiny = d.targets.filter((t) => t.w < 44 || t.h < 44).map((t) => `${t.label} ${t.w}x${t.h}`)
  const offscreen = d.texts.filter((t) => t.x < 0 || t.y < 0 || t.x + t.w > d.W || t.y + t.h > d.H).map((t) => t.t)
  const overlaps = []
  for (let i = 0; i < d.texts.length; i++) {
    for (let j = i + 1; j < d.texts.length; j++) {
      const a = d.texts[i]
      const b = d.texts[j]
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 2 && oy > 2) overlaps.push(`${a.t} / ${b.t}`)
    }
  }
  return { small, tiny, offscreen, overlaps }
}

async function findText(page, needle) {
  return page.evaluate((needle) => {
    const S = window.__SWARM
    let hit = null
    const walk = (o) => {
      if (!o.visible || hit) return
      if (o.style && typeof o.text === 'string' && o.text.includes(needle)) {
        const b = o.getBounds()
        hit = { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }
        return
      }
      for (const c of o.children) walk(c)
    }
    walk(S.app.stage)
    return hit
  }, needle)
}

async function tap(page, size, needle) {
  const p = await findText(page, needle)
  if (!p) throw new Error('not found: ' + needle)
  if (size.touch) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
  return p
}

async function runSize(browser, size) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 2, isMobile: size.touch, hasTouch: size.touch })
  const cdp = await page.createCDPSession()
  if (size.insets) {
    try {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets })
    } catch (e) {
      errors.push('insets unsupported: ' + e.message)
    }
  }
  const origin = new URL(ORIGIN).origin
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const u = req.url()
    const local = u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('ws:')
    if (!local && req.method() !== 'GET') return req.abort()
    if (!local && u.includes('/api/')) return req.abort()
    req.continue()
  })
  await page.evaluateOnNewDocument(installMocks)
  const q = size.touch ? '?touch=1' : ''
  await page.goto(ORIGIN + '/' + q, { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  // Fresh save per size.
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await sleep(900)

  const meta = { size, shots: {}, summary: {}, failed: [] }
  const shot = async (id) => {
    await page.screenshot({ path: path.join(OUT, `${size.name}-${id}.png`) })
    const d = await page.evaluate(dump)
    meta.shots[id] = d
    meta.summary[id] = summarize(d)
    console.log(size.name, id)
  }
  const step = async (id, fn) => {
    try {
      await fn()
    } catch (e) {
      meta.failed.push(`${id}: ${e.message}`)
      console.error(size.name, id, 'FAILED', e.message)
    }
  }

  await step('01-menu-fresh', () => shot('01-menu-fresh'))
  await step('03-settings', async () => {
    await tap(page, size, 'SETTINGS')
    await sleep(400)
    await shot('03-settings')
    await tap(page, size, 'BACK')
    await sleep(300)
  })
  await step('06-run-start', async () => {
    await page.evaluate(() => window.__SWARM.startRun('endless'))
    await sleep(1000)
    await shot('06-run-start')
  })
  await step('07-combat-boss', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      w.player.maxHp = 1e9
      w.player.hp = 1e9
      S.flood(260)
      S.step(90)
      const px = w.player.x, py = w.player.y
      const GOLD = 2.399963
      w.enemies.active.forEach((e, i) => {
        const r = 110 + (i % 11) * 30
        e.x = e.prevX = px + Math.cos(i * GOLD) * r
        e.y = e.prevY = py + Math.sin(i * GOLD) * r * 1.2
        e.bornAt = w.time - 1
      })
      S.jumpTo(240)
      S.step(2)
      if (w.boss) { w.boss.x = w.player.x + 170; w.boss.y = w.player.y - 90; w.boss.prevX = w.boss.x; w.boss.prevY = w.boss.y; w.boss.hp = w.boss.maxHp * 0.64 }
      S.give('rocket')
      S.step(20)
      w.player.maxHp = w.character.maxHp
      w.player.hp = Math.round(w.character.maxHp * 0.62)
      w.kills = 1287
      w.time = 754
      w.pendingLevelUps = 0
      w.paused = true
      S.feel.hurtFlash = 0
    })
    await sleep(900)
    await shot('07-combat-boss')
  })
  await step('08-levelup', async () => {
    await page.evaluate(() => {
      const w = window.__SWARM.world
      w.player.hp = w.character.maxHp * 0.8
      w.paused = false
      w.addXp(w.xpToNext + 1)
    })
    await sleep(1100)
    await shot('08-levelup')
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      if (w.paused && w.draftCards.length) S.pickPerk(w.draftCards[0].id)
    })
    await sleep(300)
  })
  await step('09-gameover', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      w.kills = 212
      w.level = 9
      w.time = 372.4
      S.endRun()
    })
    await sleep(900)
    await shot('09-gameover')
  })
  await step('11-daily-start', async () => {
    await page.evaluate(() => window.__SWARM.startRun('daily'))
    await sleep(1000)
    await shot('11-daily-start')
    await page.evaluate(() => window.__SWARM.endRun())
    await sleep(900)
    await shot('12-daily-gameover')
  })
  await step('02-menu-returning', async () => {
    await page.keyboard.press('Escape')
    await sleep(600)
    await shot('02-menu-returning')
  })

  meta.apiCalls = await page.evaluate(() => window.__apiCalls)
  meta.errors = errors
  fs.writeFileSync(path.join(OUT, `${size.name}-meta.json`), JSON.stringify(meta, null, 1))
  await ctx.close()
  return meta
}

const browser = await launch()
const report = {}
try {
  for (const s of SIZES) {
    try {
      const m = await runSize(browser, s)
      report[s.name] = { failed: m.failed, errors: m.errors, summary: m.summary }
    } catch (e) {
      console.error('SIZE FAILED', s.name, e)
      report[s.name] = { fatal: String(e) }
    }
  }
} finally {
  await browser.close()
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1))
console.log(JSON.stringify({ out: OUT, report }, null, 1))
