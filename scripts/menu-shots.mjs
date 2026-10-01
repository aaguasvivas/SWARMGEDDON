// P17 screens audit: the main menu (first launch, returning, a locked pick, the
// Daily card before and after the ranked run and across UTC midnight), every
// settings tab, the leaderboard (online, empty, no network, a server still on
// v1, an outdated client, not posting), RECORDS (both tabs), an in-run hint line
// and the `Pause` chip (checked against every HUD node). For each shot it walks
// the Pixi scene graph and checks: text at least 12 px effective, hit rects at
// least 44 x 44, text inside the safe area, no text overlap (boxes clipped by
// their masks), no text over the menu's hero ship, and text contrast sampled
// from the screenshot pixels in a ring just outside each text box.
//
// Usage: node scripts/menu-shots.mjs [sizes] [--out=DIR] [--only=a,b]
//   sizes  comma list of p375,l667,p390,l844,d1440 (default: all five)
// Server origin: env SWG_URL (default http://localhost:5176). The leaderboard
// API is mocked in the page; nothing leaves the machine.
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
const OUT = flags.out || path.join(os.tmpdir(), 'swarmgeddon-menu-shots')
fs.mkdirSync(OUT, { recursive: true })
const ONLY = (pos[0] || 'p375,l667,p390,l844,d1440').split(',')
const STEPS = flags.only ? flags.only.split(',') : null
const DPR = 2
const MIN_CONTRAST = 4.5

const SIZES = [
  { name: 'p375', w: 375, h: 667, touch: true, insets: null },
  { name: 'l667', w: 667, h: 375, touch: true, insets: null },
  { name: 'p390', w: 390, h: 844, touch: true, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: 'l844', w: 844, h: 390, touch: true, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
  { name: 'd1440', w: 1440, h: 900, touch: false, insets: null },
].filter((s) => ONLY.includes(s.name))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function launch() {
  await acquireChromeLock('menu-shots')
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

// In-page mock of the leaderboard v2 API. `window.__lbMode` picks the answer.
function installMocks() {
  const names = ['XXXXXXXXXXXXXX', 'NOVA_ACE', 'HIVEBREAKER', 'mmmmmmmmmmmmmm', 'ICHORQUEEN', 'Zed', 'W1DE_NAME_W1DE', 'PILOT4F2A', 'swarmlord', 'EMBERMAIN', 'VOIDWALKER', 'PILOTQ9ZX']
  const countries = ['US', 'BR', null, 'DE', 'JP', 'US', 'GB', null, 'FR', 'KR', 'CA', null]
  const paints = ['factory', 'cobalt', 'apex', 'factory', 'magma', 'extinction']
  const rows = []
  for (let i = 0; i < 50; i++) {
    rows.push({
      rank: i + 1, name: names[i % names.length], country: countries[i % countries.length], pilot: ['nova', 'ember', 'vesper'][i % 3],
      paint: paints[i % paints.length], threat: i % 5 === 0 ? 3 : i % 7 === 0 ? 1 : 0,
      score: Math.round(9876543 / (i + 1)), timeMs: (900 - i * 10) * 1000, kills: 21000 - i * 300, level: 40 - Math.floor(i / 2), cleared: i < 3,
    })
  }
  window.__lbMode = 'ok'
  window.__apiCalls = []
  const orig = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (!url.includes('/api/')) return orig(input, init)
    window.__apiCalls.push(url)
    const mode = window.__lbMode
    await new Promise((r) => setTimeout(r, 120))
    if (mode === 'offline') throw new TypeError('Failed to fetch')
    if (mode === 'gone') return new Response('gone', { status: 410 })
    if (mode === 'outdated') return new Response('update the game', { status: 426 })
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/api/v2/board')) return json(mode === 'empty' ? { rows: [], total: 0, me: null } : { rows, total: 2118, me: { rank: 347, of: 2118, pct: 17, score: 48210 } })
    if (url.includes('/api/v2/player/')) return json({ ok: true })
    return json({ ok: true, score: 48210, name: 'TESTER', renamed: false, ranks: { week: { rank: 42, of: 318 }, all: { rank: 140, of: 2118 } } })
  }
}

// Walk the stage: visible Text nodes (effective px, bounds clipped by masks, fill,
// alpha) and interactive hit rects; plus the menu hero ship's bounds.
function dump() {
  const S = window.__SWARM
  const W = S.app.screen.width
  const H = S.app.screen.height
  const texts = []
  const targets = []
  const num = (v) => {
    if (typeof v === 'number') return v
    if (typeof v === 'string' && v[0] === '#') return parseInt(v.slice(1), 16)
    if (v && typeof v === 'object' && 'color' in v) return num(v.color)
    if (v && typeof v === 'object' && 'fill' in v) return num(v.fill)
    return 0xffffff
  }
  const toastView = S.toast && S.toast.view.visible ? S.toast.view : null
  const walk = (o, alpha, clip, inToast = false) => {
    if (!o.visible || o.renderable === false) return
    if (o === toastView) inToast = true
    const a = alpha * o.alpha
    if (a <= 0.02) return
    if (o.mask && o.mask.getBounds) {
      const m = o.mask.getBounds()
      clip = clip ? { x0: Math.max(clip.x0, m.minX), y0: Math.max(clip.y0, m.minY), x1: Math.min(clip.x1, m.maxX), y1: Math.min(clip.y1, m.maxY) } : { x0: m.minX, y0: m.minY, x1: m.maxX, y1: m.maxY }
    }
    const isText = o.style && typeof o.text === 'string' && o.anchor
    if (isText && o.text.trim()) {
      const b = o.getBounds()
      let x0 = b.minX, y0 = b.minY, x1 = b.maxX, y1 = b.maxY
      if (clip) {
        x0 = Math.max(x0, clip.x0); y0 = Math.max(y0, clip.y0); x1 = Math.min(x1, clip.x1); y1 = Math.min(y1, clip.y1)
      }
      if (x1 - x0 > 1 && y1 - y0 > 1) {
        const wt = o.worldTransform
        const sc = Math.hypot(wt.a, wt.b)
        const fsz = typeof o.style.fontSize === 'number' ? o.style.fontSize : parseFloat(o.style.fontSize)
        texts.push({
          t: o.text.replace(/\n/g, ' / ').slice(0, 70), px: +(fsz * sc).toFixed(1),
          x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0),
          a: +a.toFixed(2), fill: num(o.style._originalFill ?? o.style.fill), stroke: !!(o.style.stroke && o.style.stroke.width), toast: inToast,
        })
      }
    }
    if (o.eventMode === 'static' && o.hitArea && typeof o.hitArea.width === 'number') {
      const p0 = o.toGlobal({ x: o.hitArea.x, y: o.hitArea.y })
      const p1 = o.toGlobal({ x: o.hitArea.x + o.hitArea.width, y: o.hitArea.y + o.hitArea.height })
      const lbl = o.children.find((c) => c.style && typeof c.text === 'string')
      const lbl2 = !lbl && o.children[0] && o.children[0].children ? o.children[0].children.find((c) => c.style && typeof c.text === 'string') : null
      targets.push({ label: (lbl || lbl2)?.text?.slice(0, 30) ?? '(icon)', x: Math.round(p0.x), y: Math.round(p0.y), w: Math.round(p1.x - p0.x), h: Math.round(p1.y - p0.y) })
    }
    for (const c of o.children) walk(c, a, clip, inToast)
  }
  // A confirm sheet's scrim hides everything under it: only its own nodes count.
  walk(S.confirm && S.confirm.view.visible ? S.confirm.view : S.app.stage, 1, null)
  let hero = null
  if (S.screen === 'menu' && S.mainMenu.view.visible) {
    const b = S.world.player.view.getBounds()
    hero = { x: Math.round(b.minX), y: Math.round(b.minY), w: Math.round(b.width), h: Math.round(b.height) }
  }
  // The toast plate (alpha 0.96) hides the text under it.
  if (toastView) {
    const b = toastView.children[0].getBounds()
    const hidden = (t) => {
      if (t.toast) return false
      const ox = Math.min(t.x + t.w, b.maxX) - Math.max(t.x, b.minX)
      const oy = Math.min(t.y + t.h, b.maxY) - Math.max(t.y, b.minY)
      return ox > 0 && oy > 0 && ox * oy > 0.5 * t.w * t.h
    }
    for (let i = texts.length - 1; i >= 0; i--) if (hidden(texts[i])) texts.splice(i, 1)
  }
  return { W, H, screen: S.screen, texts, targets, hero }
}

function rel(c) {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
function ratio(a, b) {
  const la = rel(a), lb = rel(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Contrast of each text's fill against the pixels in a ring 1 to 2 px outside its box. */
function contrast(d, img) {
  const out = []
  const { data, info } = img
  const px = (x, y) => {
    const X = Math.round(x * DPR), Y = Math.round(y * DPR)
    if (X < 0 || Y < 0 || X >= info.width || Y >= info.height) return null
    const i = (Y * info.width + X) * info.channels
    return [data[i], data[i + 1], data[i + 2]]
  }
  for (const t of d.texts) {
    if (t.stroke) continue // a stroked line reads on its own ink outline
    const fill = [(t.fill >> 16) & 255, (t.fill >> 8) & 255, t.fill & 255]
    const rs = []
    for (let r = 1; r <= 2; r++) {
      for (let x = t.x - r; x <= t.x + t.w + r; x++) for (const y of [t.y - r, t.y + t.h + r]) {
        const p = px(x, y)
        if (p) rs.push(ratio(t.a >= 0.98 ? fill : fill.map((v, k) => v * t.a + p[k] * (1 - t.a)), p))
      }
      for (let y = t.y - r; y <= t.y + t.h + r; y++) for (const x of [t.x - r, t.x + t.w + r]) {
        const p = px(x, y)
        if (p) rs.push(ratio(t.a >= 0.98 ? fill : fill.map((v, k) => v * t.a + p[k] * (1 - t.a)), p))
      }
    }
    if (rs.length === 0) continue
    rs.sort((a, b) => a - b)
    out.push({ t: t.t, p10: +rs[Math.floor(rs.length * 0.1)].toFixed(2), min: +rs[0].toFixed(2), med: +rs[Math.floor(rs.length / 2)].toFixed(2) })
  }
  return out
}

function check(d, size, cons) {
  const ins = size.insets || { top: 0, right: 0, bottom: 0, left: 0 }
  const small = d.texts.filter((t) => t.px < 11.95).map((t) => `${t.t} (${t.px}px)`)
  const tiny = d.targets.filter((t) => t.w < 44 || t.h < 44).map((t) => `${t.label} ${t.w}x${t.h}`)
  const unsafe = d.texts
    .filter((t) => t.x < ins.left - 0.5 || t.y < ins.top - 0.5 || t.x + t.w > d.W - ins.right + 0.5 || t.y + t.h > d.H - ins.bottom + 0.5)
    .map((t) => `${t.t} [${t.x},${t.y} ${t.w}x${t.h}]`)
  const overlaps = []
  for (let i = 0; i < d.texts.length; i++) {
    for (let j = i + 1; j < d.texts.length; j++) {
      const a = d.texts[i], b = d.texts[j]
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 2 && oy > 2) overlaps.push(`${a.t} / ${b.t}`)
    }
  }
  const hero = []
  if (d.hero) {
    for (const t of d.texts) {
      const ox = Math.min(t.x + t.w, d.hero.x + d.hero.w) - Math.max(t.x, d.hero.x)
      const oy = Math.min(t.y + t.h, d.hero.y + d.hero.h) - Math.max(t.y, d.hero.y)
      if (ox > 0 && oy > 0) hero.push(t.t)
    }
  }
  const lowContrast = cons.filter((c) => c.p10 < MIN_CONTRAST).map((c) => `${c.t} p10 ${c.p10} min ${c.min}`)
  const worst = cons.reduce((m, c) => (m && m.p10 <= c.p10 ? m : c), null)
  return { small, tiny, unsafe, overlaps, hero, lowContrast, worstContrast: worst ? `${worst.t}: p10 ${worst.p10}, median ${worst.med}` : null }
}

async function findText(page, needle) {
  return page.evaluate((needle) => {
    let hit = null
    const walk = (o) => {
      if (!o.visible || hit) return
      if (o.style && typeof o.text === 'string' && o.text === needle) {
        const b = o.getBounds()
        hit = { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }
        return
      }
      for (const c of o.children) walk(c)
    }
    walk(window.__SWARM.app.stage)
    return hit
  }, needle)
}

async function tap(page, size, needle) {
  const p = await findText(page, needle)
  if (!p) throw new Error('not found: ' + needle)
  if (size.touch) await page.touchscreen.tap(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
}

/** A v1 player's save, before the boot migration runs over it. */
function seedV1() {
  localStorage.clear()
  localStorage.setItem('swarmgeddon:best:endless', JSON.stringify({ score: 5234, time: 300, kills: 900, level: 12 }))
}

/**
 * A returning player, built by the game's own end-of-run path: a v1 veteran
 * (migrated at boot) who then played 9 v2 runs, cleared Hive at THREAT 0 and 1
 * as NOVA (so THREAT 2 is open), owns EMBER and DEPTHS, has VESPER locked
 * (THICK HIDE short of 1,000 damage), posts scores, and played the last two ranked
 * Dailies. Each run goes through `__SWARM.fileRun`, the function endRun files
 * a run with (stats, THREAT, world bests, feats, the Daily record), so the
 * stats, feats, unlocks, bests, THREAT and streak agree. The app's own debug
 * handle, not a module import by URL: after an HMR update the URL import would
 * load a second copy of the storage module. `dailyDone` adds today's ranked
 * Daily and two practice runs.
 */
function seedSave(opts) {
  const S = window.__SWARM
  const day = (k) => new Date(Date.now() - k * 86400000).toISOString().slice(0, 10)
  const base = {
    v: 2, mode: 'endless', ranked: false, end: 'death', cleared: false, clearMs: 0, overtimeSec: 0, nextBeat: null,
    dailyNumber: 0, seed: 1, character: 'nova', arena: 'hive', threat: 0, paint: 'factory',
    bossesSlain: 0, bossesFlawless: 0, elitesSlain: 1, bestChain: 40, peakTier: 3, hits: 20, longestNoHit: 40,
    revivesUsed: 0, podsEquipped: 1, weapons: ['lightning'], dashes: 30, closeCalls: 1, fusions: [], evolutions: [],
    perks: [], killsByEnemy: {}, killer: 'swarmer',
  }
  const runs = [
    { date: day(9), time: 170, kills: 480, level: 9, score: 21400, bestChain: 52, damageTaken: 104 },
    { date: day(8), time: 290, kills: 1100, level: 13, score: 52800, peakTier: 4, bestChain: 96, damageTaken: 112, elitesSlain: 2, podsEquipped: 2 },
    { date: day(7), arena: 'depths', time: 210, kills: 760, level: 10, score: 30100, bestChain: 60, damageTaken: 101, closeCalls: 0 },
    {
      date: day(6), end: 'clear', cleared: true, clearMs: 655000, time: 668, kills: 3400, level: 24, score: 182345, peakTier: 4, bestChain: 140,
      damageTaken: 46, elitesSlain: 6, bossesSlain: 3, longestNoHit: 95, closeCalls: 2, weapons: ['lightning', 'railgun'], podsEquipped: 3,
      killsByEnemy: { queen: 2, queenPrime: 1 }, killer: null,
    },
    { date: day(5), character: 'ember', time: 240, kills: 900, level: 10, score: 33600, bestChain: 66, damageTaken: 103 },
    {
      date: day(4), threat: 1, end: 'clear', cleared: true, clearMs: 660000, time: 672, kills: 3300, level: 23, score: 171000, peakTier: 4, bestChain: 128,
      damageTaken: 52, elitesSlain: 7, bossesSlain: 3, longestNoHit: 80, closeCalls: 2, weapons: ['lightning', 'beam'], podsEquipped: 3,
      killsByEnemy: { queen: 2, queenPrime: 1 }, killer: null,
    },
    { date: day(3), threat: 1, end: 'quit', time: 120, kills: 380, level: 7, score: 14200, damageTaken: 30, elitesSlain: 0, podsEquipped: 0, weapons: [], closeCalls: 0, killer: null },
  ]
  const dailyRun = (date, ranked, over) => {
    const spec = S.dailySpec(date)
    return { date, mode: 'daily', ranked, dailyNumber: spec.number, seed: spec.seed, character: spec.pilot, arena: spec.world, threat: spec.threat, ...over }
  }
  // A death takes at least the pilot's max HP (the Daily pilot can be VESPER, 120).
  runs.push(dailyRun(day(2), true, { time: 260, kills: 820, level: 11, score: 36900, damageTaken: 125 }))
  runs.push(dailyRun(day(1), true, { time: 230, kills: 700, level: 10, score: 31500, damageTaken: 124 }))
  if (opts.dailyDone) {
    S.markRankedStarted(day(0))
    runs.push(dailyRun(day(0), true, { time: 420, kills: 1500, level: 16, score: 48210, damageTaken: 122 }))
    runs.push(dailyRun(day(0), false, { end: 'quit', killer: null, time: 510, kills: 1800, level: 18, score: 61000, damageTaken: 31 }))
    runs.push(dailyRun(day(0), false, { end: 'quit', killer: null, time: 300, kills: 1000, level: 13, score: 52000, damageTaken: 26 }))
  }
  for (const over of runs) {
    const r = { ...base, ...over }
    r.xpSum = r.kills * 2
    r.killPts = r.kills * 10
    S.fileRun(r)
  }
  S.saveJSON('sel:char', 'nova')
  S.saveJSON('sel:arena', 'hive')
  S.saveJSON('sel:paint', 'hazard')
  S.saveJSON('sel:threat', { hive: 1 })
  S.saveJSON('player:name', 'TESTER')
  S.saveJSON('lb:id', 'AAAAAAAAAAAAAAAAAAAAAA')
  S.saveJSON('lb:optIn', opts.posting)
  S.saveJSON('hints', { daily: 1, feats: 1 })
  // Self-check: every run counted, the save is the scenario above, and no feat
  // the stats meet is left open.
  const L = S.loadJSON('stats', {})
  const left = S.metOpenFeats()
  const bad = []
  if (L.runs !== runs.length) bad.push('stats.runs ' + L.runs + ' != ' + runs.length)
  if (left.length) bad.push('open feats already met: ' + left.join(','))
  if (S.isOwned('vesper') || !S.isOwned('ember') || !S.isOwned('depths') || !S.isOwned('paint:hazard')) bad.push('unlocks differ from the scenario')
  if (S.loadJSON('threat', {}).hive !== 2) bad.push('THREAT on hive is not 2')
  if (!L.importedV1) bad.push('the v1 migration did not run')
  if (bad.length) throw new Error('seed: ' + bad.join('; '))
  const done = Object.keys(S.loadJSON('feats', {}).done || {}).length
  return { runs: L.runs, damage: L.damage, kills: L.kills, done, paints: S.loadJSON('unlocks', []).filter((k) => k.startsWith('paint:')).length + 1 }
}

async function runSize(browser, size) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text())
  })
  await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: DPR, isMobile: size.touch, hasTouch: size.touch })
  const cdp = await page.createCDPSession()
  if (size.insets) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets })
  const origin = new URL(ORIGIN).origin
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const u = req.url()
    const local = u.startsWith(origin) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('ws:')
    if (!local) return req.abort()
    req.continue()
  })
  await page.evaluateOnNewDocument(installMocks)
  const q = size.touch ? '?touch=1' : ''
  await page.goto(ORIGIN + '/' + q, { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await page.evaluate(() => localStorage.clear())
  const reload = async () => {
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await sleep(700)
  }
  await reload()

  const meta = { size, checks: {}, failed: [] }
  const shot = async (id) => {
    const file = path.join(OUT, `${size.name}-${id}.png`)
    await page.screenshot({ path: file })
    const d = await page.evaluate(dump)
    const img = await sharp(file).raw().toBuffer({ resolveWithObject: true })
    const cons = contrast(d, img)
    meta.checks[id] = check(d, size, cons)
    console.log(size.name, id)
  }
  const step = async (id, fn) => {
    if (STEPS && !STEPS.some((s) => id.startsWith(s))) return
    try {
      await fn()
    } catch (e) {
      meta.failed.push(`${id}: ${e.message}`)
      console.error(size.name, id, 'FAILED', e.message)
    }
  }
  const seed = async (opts) => {
    await page.evaluate(seedV1)
    await reload()
    ;(meta.seeds ??= []).push(await page.evaluate(seedSave, opts))
    await reload()
  }

  await step('01-menu-first', () => shot('01-menu-first'))
  await step('02-menu-returning', async () => {
    await seed({ posting: true, dailyDone: false })
    await shot('02-menu-returning')
  })
  await step('03-menu-locked', async () => {
    await page.evaluate(() => {
      const m = window.__SWARM.mainMenu
      m.onPilot(-1) // nova -> vesper (locked)
    })
    await sleep(300)
    await shot('03-menu-locked')
    await page.evaluate(() => window.__SWARM.mainMenu.onPilot(1))
  })
  await step('04-menu-daily-done', async () => {
    await seed({ posting: true, dailyDone: true })
    await shot('04-menu-daily-done')
  })
  // The boot toast (migration and a recovered Daily) in the menu's toast slot.
  await step('04b-menu-toast', async () => {
    await page.evaluate((ins) => {
      const S = window.__SWARM
      S.toast.layout(S.app.screen.width, ins, S.mainMenu.toastSlot)
      S.toast.show('Ranked Daily #12 saved at 4:10 when the app closed.\nWelcome to v2. Your records earned 6 feats. See RECORDS.', 6)
    }, size.insets || { top: 0, right: 0, bottom: 0, left: 0 })
    await sleep(300)
    await shot('04b-menu-toast')
    await page.evaluate(() => window.__SWARM.toast.hide())
  })
  // UTC midnight under an open menu: a card built for yesterday (number, unranked)
  // must rebuild itself for today on the next tick.
  await step('04c-menu-new-day', async () => {
    const r = await page.evaluate(() => {
      const S = window.__SWARM
      const menu = S.mainMenu
      const card = menu.daily
      const read = () => [card.title.text, card.status.text, card.play.view.visible, card.practice.view.visible].join(' | ')
      const today = read()
      const m = menu.model
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      menu.setModel({ ...m, daily: { ...m.daily, date: yesterday, number: m.daily.number - 1, rankedOpen: true, rankedScore: null } })
      const stale = read()
      menu.tick(Date.now(), 0.016)
      return { today, stale, after: read() }
    })
    meta.checks['04c-menu-new-day'] = { newDay: r.after === r.today && r.stale !== r.today ? [] : [JSON.stringify(r)] }
    console.log(size.name, '04c-menu-new-day', JSON.stringify(r))
  })
  for (const tab of ['AUDIO', 'VISUALS', 'CONTROLS', 'ACCOUNT']) {
    await step('05-settings-' + tab.toLowerCase(), async () => {
      await page.evaluate(() => window.__SWARM.openSettings())
      await sleep(300)
      if (tab !== 'AUDIO') await tap(page, size, tab)
      await sleep(300)
      await shot('05-settings-' + tab.toLowerCase())
    })
  }
  await step('06-settings-remove', async () => {
    await tap(page, size, 'REMOVE MY SCORES')
    await sleep(500)
    await shot('06-settings-remove')
    await page.keyboard.press('Escape')
    await sleep(400)
    await page.keyboard.press('Escape')
    await sleep(300)
  })
  await step('07-leaderboard-daily', async () => {
    await page.evaluate(() => window.__SWARM.toLeaderboard())
    await sleep(700)
    await shot('07-leaderboard-daily')
    await tap(page, size, 'THIS WEEK')
    await sleep(600)
    await shot('08-leaderboard-week')
    await page.evaluate(() => {
      // Scroll the list part way, as a drag would.
      const lb = window.__SWARM.leaderboard
      lb.scroll.scrollTo(200)
    })
    await sleep(200)
    await shot('09-leaderboard-scrolled')
    await page.keyboard.press('Escape')
    await sleep(300)
  })
  await step('10-leaderboard-join', async () => {
    await page.evaluate(() => {
      window.__SWARM.saveJSON('lb:optIn', null)
      window.__SWARM.toLeaderboard()
    })
    await sleep(700)
    await shot('10-leaderboard-join')
    await page.keyboard.press('Escape')
  })
  for (const mode of ['empty', 'offline', 'gone', 'outdated']) {
    await step('11-leaderboard-' + mode, async () => {
      await page.evaluate((mode) => {
        window.__lbMode = mode
        window.__SWARM.saveJSON('lb:optIn', true)
        window.__SWARM.toLeaderboard()
      }, mode)
      await sleep(800)
      await shot('11-leaderboard-' + mode)
      await page.keyboard.press('Escape')
      await page.evaluate(() => (window.__lbMode = 'ok'))
    })
  }
  await step('12-records', async () => {
    await reload()
    await page.evaluate(() => window.__SWARM.toRecords())
    await sleep(500)
    await shot('12-records-feats')
    await page.evaluate(() => window.__SWARM.records.scroll.scrollTo(1400))
    await sleep(200)
    await shot('13-records-feats-scrolled')
    await page.evaluate(() => {
      const t = window.__SWARM.records.tabs
      t.set(1)
      t.onChange(1)
    })
    await sleep(400)
    await shot('14-records-records')
    await page.evaluate(() => window.__SWARM.records.scroll.scrollTo(4000))
    await sleep(200)
    await shot('15-records-records-end')
    await page.keyboard.press('Escape')
    await sleep(300)
  })
  await step('16-run-hint', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      S.settingsPanel.onShowTips() // SHOW TIPS AGAIN: the gem hint and the touch guide show again
      S.startRun('endless')
      S.world.player.maxHp = S.world.player.hp = 1e9
      // The first gem drop (the sim's own marker), 60 u from the ship.
      S.step(30)
      const w = S.world
      w.firstGemAt = w.time
      w.firstGemX = w.player.x + 60
      w.firstGemY = w.player.y
    })
    // The world intro holds the lane 2.2 s; the gem hint shows after it.
    let shown = false
    for (let i = 0; i < 70 && !shown; i++) {
      await sleep(150)
      shown = await page.evaluate(() => !!(window.__SWARM.callouts.view.children[0].visible && window.__SWARM.callouts.view.children[0].children[1].text === 'COLLECT FOR XP'))
    }
    await sleep(400) // past the 140 ms entrance; the run keeps going so the touch guides show
    await shot('16-run-hint')
    if (!shown) throw new Error('the gem hint line never showed')
    await page.evaluate(() => window.__SWARM.endRun('quit', 'menu'))
    await sleep(300)
  })
  // The `Pause` chip (first touch run, 20 s in) against every HUD node, the touch
  // banner and the callout lane; then a LEVEL UP chip takes its slot, and the
  // chip comes back when the LEVEL UP chip goes.
  await step('17-run-pause-chip', async () => {
    if (!size.touch) return
    await page.evaluate(() => {
      const S = window.__SWARM
      S.hints.reset()
      S.startRun('endless')
      S.world.player.maxHp = S.world.player.hp = 1e9
      for (let k = 0; k < 80 && S.world.time < 20.5; k++) {
        S.step(30)
        if (S.world.draft.open) S.pickCard(0)
      }
      S.world.pendingLevelUps = 0
    })
    let shown = false
    for (let i = 0; i < 30 && !shown; i++) {
      await sleep(100)
      shown = await page.evaluate(() => window.__SWARM.hints.chip.visible)
    }
    if (!shown) throw new Error('the Pause chip never showed')
    const hits = await page.evaluate(() => {
      const S = window.__SWARM
      const c = S.hints.chip.getBounds()
      const out = []
      const test = (o, label) => {
        if (!o.visible || o.alpha <= 0.02) return
        const b = o.getBounds()
        const ox = Math.min(c.maxX, b.maxX) - Math.max(c.minX, b.minX)
        const oy = Math.min(c.maxY, b.maxY) - Math.max(c.minY, b.minY)
        if (b.width > 0 && ox > 0.5 && oy > 0.5) out.push(`${label} [${Math.round(b.minX)},${Math.round(b.minY)},${Math.round(b.maxX)},${Math.round(b.maxY)}]`)
      }
      S.hud.view.children.forEach((k, i) => {
        if (k !== S.hud.plate.view) test(k, typeof k.text === 'string' ? k.text : `hud#${i}`)
      })
      if (S.touchHint.view.visible) S.touchHint.view.children.forEach((k, i) => test(k, `touch hint#${i}`))
      S.callouts.view.children.forEach((k, i) => test(k, `callout#${i}`))
      out.unshift(`chip [${Math.round(c.minX)},${Math.round(c.minY)},${Math.round(c.maxX)},${Math.round(c.maxY)}]`)
      return out
    })
    await shot('17-run-pause-chip')
    meta.checks['17-run-pause-chip'].chipBox = hits[0]
    meta.checks['17-run-pause-chip'].chipOverlaps = hits.slice(1)
    const yielded = await page.evaluate(async () => {
      const S = window.__SWARM
      // The draft gap holds the draft back, so the sim stays live.
      S.world.draft.index = Math.max(1, S.world.draft.index)
      S.world.draft.lastOpenAt = S.world.time
      S.world.pendingLevelUps = 2
      await new Promise((r) => setTimeout(r, 250))
      const under = { pending: S.hud.pendingShown, chip: S.hints.chip.visible, paused: S.world.paused }
      S.world.pendingLevelUps = 0
      await new Promise((r) => setTimeout(r, 250))
      return { under, back: S.hints.chip.visible }
    })
    const ok = yielded.under.pending && !yielded.under.chip && !yielded.under.paused && yielded.back
    meta.checks['17-run-pause-chip'].chipUnderLevelUp = ok ? [] : [JSON.stringify(yielded)]
    await page.evaluate(() => window.__SWARM.endRun('quit', 'menu'))
    await sleep(300)
  })
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
      const issues = {}
      for (const [id, c] of Object.entries(m.checks)) {
        const bad = Object.fromEntries(Object.entries(c).filter(([k, v]) => Array.isArray(v) && v.length > 0))
        if (Object.keys(bad).length) issues[id] = bad
      }
      const worst = Object.entries(m.checks).map(([id, c]) => [id, c.worstContrast]).filter(([, w]) => w)
      report[s.name] = { failed: m.failed, errors: m.errors, issues, worstContrast: worst }
    } catch (e) {
      console.error('SIZE FAILED', s.name, e)
      report[s.name] = { fatal: String(e) }
    }
  }
} finally {
  await browser.close()
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1))
console.log(JSON.stringify({ out: OUT }, null, 1))
