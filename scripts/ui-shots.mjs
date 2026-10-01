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
//
// The leaderboard steps (opt-in card, name prompt, rank lines, JOIN, NO THANKS)
// need a dev server started with both leaderboard variables (any URL: the API
// is mocked), for example:
//   VITE_LEADERBOARD_URL=http://127.0.0.1:8788 VITE_LEADERBOARD_DEV_SUBMIT=1 npx vite --port 5177 --strictPort
// On a server without them the opt-in card never shows, so those steps are
// skipped and listed under `skipped` in the report.
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

/** Why the leaderboard steps cannot run on this server, or null when they can.
 *  A dev server injects its env at the top of each module it serves. */
async function leaderboardGap() {
  let src
  try {
    src = await (await fetch(ORIGIN + '/src/net/leaderboard.ts')).text()
  } catch (e) {
    return null
  }
  const m = /^import\.meta\.env = (\{.*?\});/.exec(src)
  if (!m) return null
  const env = JSON.parse(m[1])
  const missing = ['VITE_LEADERBOARD_URL', 'VITE_LEADERBOARD_DEV_SUBMIT'].filter((k) => !env[k])
  return missing.length ? `the dev server at ${ORIGIN} has no ${missing.join(' or ')}` : null
}
const LB_GAP = await leaderboardGap()
if (LB_GAP) console.error(`SKIPPING the leaderboard steps: ${LB_GAP}. Start a server with both variables (see the header of this script) to run them.`)

/** Steps that need the opt-in card or a post (skipped when LB_GAP is set). */
const LB_STEPS = ['16-recap-optin', '17-name-prompt', '18b-daily-rank-unlock', '21-leaderboard-join', '23-recap-nothanks']

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

// In-page mock of the leaderboard v2 API (installed before any app script runs).
function installMocks() {
  const names = ['XXXXXXXXXXXXXX', 'NOVA_ACE', 'HIVEBREAKER', 'mmmmmmmmmmmmmm', 'ICHORQUEEN', 'Zed', 'W1DE_NAME_W1DE', 'PILOT4F2A', 'swarmlord', 'EMBERMAIN', 'VOIDWALKER', 'PILOTQ9ZX']
  const countries = ['US', 'BR', null, 'DE', 'JP', 'US', 'GB', null, 'FR', 'KR', 'CA', null]
  const rows = names.map((n, i) => ({
    rank: i + 1, name: n, country: countries[i], pilot: ['nova', 'ember', 'vesper'][i % 3], paint: 'factory', threat: i % 5 === 0 ? 2 : 0,
    score: Math.round(2345678 / (i + 1)), timeMs: (400 - i * 10) * 1000, kills: 900 - i * 40, level: 20 - i, cleared: i < 3,
  }))
  const orig = window.fetch.bind(window)
  window.__apiCalls = []
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (url.includes('/api/v2/run')) {
      window.__apiCalls.push(['run', url])
      await new Promise((r) => setTimeout(r, 150))
      window.__apiCalls.push(['run:done', url])
      const daily = String(init && init.body).includes('"mode":"daily"')
      const ranks = daily ? { day: { rank: 37, of: 412 } } : { week: { rank: 42, of: 318 }, all: { rank: 140, of: 2118 } }
      return new Response(JSON.stringify({ ok: true, score: 98765, name: 'TESTER', renamed: false, ranks }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/v2/board')) {
      window.__apiCalls.push(['board', url])
      await new Promise((r) => setTimeout(r, 150))
      return new Response(JSON.stringify({ rows, total: 2118, me: { rank: 347, of: 2118, pct: 17, score: 48210 } }), { status: 200, headers: { 'content-type': 'application/json' } })
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

  const meta = { size, shots: {}, summary: {}, failed: [], skipped: [] }
  const shot = async (id) => {
    await page.screenshot({ path: path.join(OUT, `${size.name}-${id}.png`) })
    const d = await page.evaluate(dump)
    meta.shots[id] = d
    meta.summary[id] = summarize(d)
    console.log(size.name, id)
  }
  const step = async (id, fn) => {
    if (LB_GAP && LB_STEPS.includes(id)) {
      meta.skipped.push(`${id}: ${LB_GAP}`)
      return
    }
    try {
      await fn()
    } catch (e) {
      meta.failed.push(`${id}: ${e.message}`)
      console.error(size.name, id, 'FAILED', e.message)
    }
  }

  await step('01-menu-fresh', () => shot('01-menu-fresh'))
  // P13: the ranked Daily asks first (a fresh save has today's ranked attempt).
  await step('03b-daily-confirm', async () => {
    await tap(page, size, 'DAILY #')
    await sleep(400)
    await shot('03b-daily-confirm')
    await tap(page, size, 'BACK')
    await sleep(300)
  })
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
      w.score = 1234567
      w.chain = 180
      w.tier = 5
      S.jumpTo(754) // past every beat, so no stacked alerts fire on the next step
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
      w.draft.reset() // the next draft is the run's Keystone draft
      w.paused = false
      w.addXp(w.xpToNext + 1)
    })
    await sleep(1100)
    await shot('08-levelup')
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      if (w.paused && w.draft.open) S.pickCard(0)
    })
    await sleep(300)
  })
  // A built draft: a first fusion offer, a fusion completer, an evolution tag
  // and an owned perk (LV a to b); then banish mode; then the fallback fill.
  const draftWith = (owned, pool, weapon) =>
    page.evaluate((owned, pool, weapon) => {
      const S = window.__SWARM
      const w = S.world
      for (const id of owned) w.choosePerk(id)
      if (weapon) S.give(weapon)
      w.perkPool = w.perkPool.filter((p) => pool.includes(p.id))
      w.draft.lastOpenAt = w.time - 100
      w.player.hp = w.player.maxHp * 0.8
      w.paused = false
      w.addXp(w.xpToNext + 1)
    }, owned, pool, weapon)
  await step('08b-levelup-build', async () => {
    await draftWith(['cryo_rounds', 'giant_slayer', 'deadeye', 'heavy_rounds', 'heavy_rounds'], ['explosive_rounds', 'deadeye', 'heavy_rounds'], 'railgun')
    await sleep(1100)
    await shot('08b-levelup-build')
    await page.keyboard.press('b')
    await sleep(300)
    await shot('08c-levelup-banish')
    await page.keyboard.press('b')
    await page.evaluate(() => window.__SWARM.pickCard(0))
    await sleep(300)
  })
  await step('08d-levelup-fallback', async () => {
    await draftWith([], ['vitality'], null)
    await sleep(1100)
    await shot('08d-levelup-fallback')
    await page.evaluate(() => window.__SWARM.pickCard(0))
    await sleep(300)
  })
  // P9: the Hive Core reveal. The PRIME core (5 levels) with an evolution
  // choice (RAIL SPIKE held, Deadeye 2), then a plain mid1 core.
  await step('16-core-evolve', async () => {
    await page.evaluate(async () => {
      const S = window.__SWARM
      const w = S.world
      const cores = await import('/src/systems/cores.ts')
      for (const id of ['deadeye', 'deadeye', 'heavy_rounds', 'adrenaline', 'vitality', 'long_barrel']) w.choosePerk(id)
      S.give('railgun')
      w.player.hp = w.player.maxHp
      w.paused = false
      cores.grantPrimeCore(w)
      S.step(1)
    })
    await sleep(900)
    await shot('16-core-evolve')
    await page.evaluate(() => window.__SWARM.takeCore(true))
    await sleep(300)
  })
  await step('16b-core-plain', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      S.dropCore(1)
      const c = w.pickups.active.find((p) => p.alive && p.kind === 'core')
      c.x = c.prevX = w.player.x
      c.y = c.prevY = w.player.y
      S.step(1)
    })
    await sleep(700)
    await shot('16b-core-plain')
    await page.evaluate(() => window.__SWARM.world.core.pending && window.__SWARM.takeCore(false))
    await sleep(300)
  })
  await step('09-gameover', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      w.kills = 212
      w.level = 9
      w.time = 372.4
      w.score = 48210
      w.peakTier = 6
      S.endRun()
    })
    await sleep(900)
    await shot('09-gameover')
  })
  // P6a: the boss arrival marker, a telegraphed royal lunge inside the formed
  // cage, the WIN panel, and the clear and stalemate recap headers.
  await step('10a-boss-marker', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      S.setLoadout('nova', 'hive')
      S.startRun('endless')
      w.player.maxHp = w.player.hp = 1e9
      S.jumpTo(236)
      for (let i = 0; i < 60 * 8 && !(w.director.marker && w.director.marker.alive && w.director.marker.tele < 0.9); i++) S.step(1)
      w.paused = true
      S.feel.hurtFlash = 0
    })
    await sleep(700)
    await shot('10a-boss-marker')
  })
  await step('10b-boss-tele', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      w.paused = false
      // bossFight.state 2 is TELE, attack 1 the royal lunge; wait for the ring to form.
      const ready = () => w.bossAlive && w.bossFight.state === 2 && w.bossFight.attack === 1 && w.bossFight.stateT < 0.45 && w.time - w.director.cage.formingFrom > 1.6
      for (let i = 0; i < 60 * 30 && !ready(); i++) {
        S.step(1)
        while (w.paused && (w.core.pending || w.draft.open)) if (w.core.pending) S.takeCore(true); else S.pickCard(0)
        w.player.hp = 1e9
      }
      w.paused = true
      S.feel.hurtFlash = 0
    })
    await sleep(700)
    await shot('10b-boss-tele')
  })
  const toWin = () =>
    page.evaluate(() => {
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
        for (let i = 0; i < 60 * 30 && !w.pendingWin; i++) {
          if (w.bossAlive && w.boss && !w.boss.submerged) w.boss.hp = Math.min(w.boss.hp, 1)
          S.step(1)
          while (w.paused && (w.core.pending || w.draft.open)) if (w.core.pending) S.takeCore(true); else S.pickCard(0)
          w.player.hp = 1e9
        }
        S.step(1)
      } finally {
        inp.update = real
      }
      S.feel.hurtFlash = 0
    })
  await step('13-win', async () => {
    await toWin()
    await sleep(900)
    await shot('13-win')
  })
  await step('14-clear-recap', async () => {
    await tap(page, size, 'EXTRACT')
    await sleep(900)
    await shot('14-clear-recap')
  })
  // P9: OVERTIME grants the PRIME core; its reveal resumes the run.
  await step('17-overtime-core', async () => {
    await toWin()
    await sleep(700)
    await tap(page, size, 'OVERTIME')
    await sleep(600)
    // Checked before the shot: with no evolution offered the reveal closes itself after 2.4 s.
    const st = await page.evaluate(() => {
      const w = window.__SWARM.world
      return { pending: w.core.pending, prime: w.core.prime, levels: w.core.levels, runState: w.director.runState, paused: w.paused }
    })
    await shot('17-overtime-core')
    if (!st.pending || !st.prime || st.levels !== 5 || st.runState !== 'overtime' || !st.paused) throw new Error('overtime core: ' + JSON.stringify(st))
    await page.evaluate(() => window.__SWARM.takeCore(true))
    await sleep(300)
    const after = await page.evaluate(() => ({ paused: window.__SWARM.world.paused, pending: window.__SWARM.world.core.pending, screen: window.__SWARM.screen }))
    if (after.paused || after.pending || after.screen !== 'playing') throw new Error('overtime resume: ' + JSON.stringify(after))
    await page.evaluate(() => window.__SWARM.endRun('quit', 'menu'))
    await sleep(300)
  })
  await step('15-stalemate-recap', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      S.startRun('endless')
      S.step(60)
      S.endRun('stalemate')
    })
    await sleep(900)
    await shot('15-stalemate-recap')
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

  // P13: the recap's opt-in card, the name prompt, the posted rank line (a dev
  // server with VITE_LEADERBOARD_URL and VITE_LEADERBOARD_DEV_SUBMIT posts to the
  // in-page mock) and the leaderboard with the player's own row.
  await step('16-recap-optin', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      S.saveJSON('stats', { ...S.loadJSON('stats', {}), runs: 5 })
      S.saveJSON('lb:asked', 0)
      S.setLoadout('nova', 'depths')
      S.startRun('endless')
      S.step(30)
      w.kills = 212
      w.level = 9
      w.time = 372.4
      w.score = w.killPts = 48210
      w.xpSum = 900
      S.endRun('quit')
    })
    await sleep(900)
    await shot('16-recap-optin')
  })
  await step('17-name-prompt', async () => {
    await tap(page, size, 'CHOOSE A NAME')
    await sleep(500)
    await shot('17-name-prompt')
    await page.keyboard.type('TESTER')
    await page.keyboard.press('Enter')
    await sleep(900)
    await shot('18-recap-rank')
    const d = meta.shots['18-recap-rank']
    if (!d.texts.some((t) => t.t.includes('THIS WEEK'))) throw new Error('18: no rank line on the recap')
  })
  // The first ranked Daily completes DAYBREAK (#18): its rank line and the
  // unlock banner both show.
  await step('18b-daily-rank-unlock', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const today = new Date().toISOString().slice(0, 10)
      S.saveJSON('daily:' + today, { rankedStarted: false })
      S.saveJSON('lb:sent', {})
      const f = S.loadJSON('feats', { done: {}, prog: {} })
      delete f.done.daybreak
      S.saveJSON('feats', f)
      S.startDaily(today)
      S.step(30)
      const w = S.world
      w.kills = 180
      w.time = 312.5
      w.score = w.killPts = 36400
      w.xpSum = 700
      S.endRun('quit')
    })
    await sleep(900)
    await shot('18b-daily-rank-unlock')
    const d = meta.shots['18b-daily-rank-unlock']
    const rank = d.texts.some((t) => t.t.includes('RANK 37 OF 412 TODAY'))
    const banner = d.texts.some((t) => /UNLOCKED|FEATS? DONE/.test(t.t))
    if (!rank || !banner) throw new Error(`18b: the rank line (${rank}) and the unlock banner (${banner}) must both show`)
  })
  await step('19-leaderboard', async () => {
    await page.evaluate(() => window.__SWARM.toLeaderboard())
    await sleep(900)
    await shot('19-leaderboard')
    await tap(page, size, 'ALL TIME')
    await sleep(600)
    await shot('20-leaderboard-all')
    await tap(page, size, 'BACK')
    await sleep(300)
  })
  // JOIN on LEADERS posts today's ranked Daily; the board reloads after the post lands.
  await step('21-leaderboard-join', async () => {
    const before = await page.evaluate(() => {
      const S = window.__SWARM
      S.saveJSON('lb:optIn', null)
      S.saveJSON('lb:sent', {})
      S.toLeaderboard()
      return window.__apiCalls.length
    })
    await sleep(900)
    await shot('21-leaderboard-join')
    await tap(page, size, 'JOIN')
    await sleep(500)
    await page.keyboard.press('Enter')
    await sleep(1200)
    await shot('22-leaderboard-joined')
    const calls = (await page.evaluate(() => window.__apiCalls)).slice(before).map((c) => c[0])
    const posted = calls.indexOf('run:done')
    const board = calls.lastIndexOf('board')
    if (posted < 0 || board < posted) throw new Error('22: the board loaded before the post landed: ' + calls.join(','))
    await tap(page, size, 'BACK')
    await sleep(300)
  })
  // NO THANKS on the recap's opt-in card: the toast names a control that exists
  // and sits on screen.
  await step('23-recap-nothanks', async () => {
    await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      S.saveJSON('lb:optIn', null)
      S.saveJSON('lb:asked', 0)
      S.setLoadout('nova', 'hive')
      S.startRun('endless')
      S.step(30)
      w.kills = 40
      w.time = 95.5
      w.score = w.killPts = 5200
      w.xpSum = 120
      S.endRun('quit')
    })
    await sleep(900)
    await tap(page, size, 'NO THANKS')
    await sleep(400)
    await shot('23-recap-nothanks')
    const d = meta.shots['23-recap-nothanks']
    const t = d.texts.find((x) => x.t.includes('You can join later from LEADERS.'))
    if (!t || t.y < 0 || t.y + t.h > d.H) throw new Error('23: the NO THANKS toast is missing or off screen')
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
      report[s.name] = { failed: m.failed, skipped: m.skipped, errors: m.errors, summary: m.summary }
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
