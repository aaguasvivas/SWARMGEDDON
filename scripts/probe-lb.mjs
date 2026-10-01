// P13 client probes: the leaderboard client and the Daily lifecycle in the real
// DEV build, against a LOCAL worker only.
//
// Setup: a local worker (see scripts/attack.mjs), then a dev server that may post to it:
//   VITE_LEADERBOARD_URL=http://127.0.0.1:8788 VITE_LEADERBOARD_DEV_SUBMIT=1 npx vite --port 5176 --strictPort
// Usage: node scripts/probe-lb.mjs [parts] [--codes=410,426,abort,500] [--out=DIR]
//   parts (default fresh,prompt,clear,errors,ckpt):
//   fresh   a fresh save plays 5 runs (Standard and Daily): 0 leaderboard requests,
//           and the opt-in card shows from the second counted run, at most 3 times
//   prompt  touch emulation: CHOOSE A NAME opens the prompt, taps on the field keep it
//           open, the backdrop is armed after 350 ms, SAVE opts in and posts the run
//   clear   the earliest possible clear (PRIME killed as it becomes targetable), as a
//           Standard EXTRACT and as the ranked Daily, posted to the worker
//   errors  the worker answers each of --codes (a status, or `abort` for a network
//           error; `live` makes no interception, for a v1-only worker that answers
//           404): one request per run, no retry, a recap line, the recap still takes
//           input, and the board shows its offline line
//   ckpt    a ranked Daily lost without ending (storage copied mid-run) is filed at
//           the next boot with end 'interrupted' and a toast; a second page opened
//           while the ranked run lives files nothing, and the live page's own
//           result is the ranked one
// Server origins: env SWG_URL (default http://localhost:5176) and LB_URL
// (default http://127.0.0.1:8788). Exits 1 when a check fails.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const LB = (process.env.LB_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const flags = {}
const pos = []
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/s.exec(a)
  if (m) flags[m[1]] = m[2]
  else pos.push(a)
}
const PARTS = (pos[0] || 'fresh,prompt,clear,errors,ckpt').split(',')
const CODES = (flags.codes || '410,426,abort,500').split(',')
const OUT = flags.out || '/tmp/swg-p13-probe'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const today = new Date().toISOString().slice(0, 10)

let failures = 0
function check(name, pass, detail) {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`)
}

const OPTED_IN = {
  'meta:v': 2,
  stats: { runs: 5 },
  'lb:optIn': true,
  'lb:id': 'probeP13' + Math.random().toString(36).slice(2, 10).padEnd(14, 'x'),
  'player:name': 'PROBE',
}

/** A fresh browser context with `save` (unprefixed keys) in storage before boot. */
async function open(browser, { w = 375, h = 667, touch = true, save = null, intercept = null } = {}) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const st = { lb: [], pre: 0, pageErrors: [], consoleErrors: [] }
  page.on('pageerror', (e) => st.pageErrors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') st.consoleErrors.push(m.text())
  })
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch })
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const u = req.url()
    if (u.startsWith(LB)) {
      if (req.method() !== 'OPTIONS') st.lb.push(`${req.method()} ${u.slice(LB.length)}`)
      else st.pre++
      if (intercept) return intercept(req)
      return req.continue()
    }
    // Nothing leaves the machine.
    if (!u.startsWith(ORIGIN) && !/^(data|blob):/.test(u)) return req.abort()
    req.continue()
  })
  if (save) {
    await page.evaluateOnNewDocument((s) => {
      if (sessionStorage.getItem('probe:seeded')) return
      sessionStorage.setItem('probe:seeded', '1')
      for (const [k, v] of Object.entries(s)) localStorage.setItem('swarmgeddon:' + k, JSON.stringify(v))
    }, save)
  }
  await page.goto(ORIGIN + '/' + (touch ? '?touch=1' : ''), { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await sleep(700)
  return { ctx, page, st }
}

/** A Standard or Daily run of `sec` sim seconds (invincible, firing at the
 *  nearest enemy), ended by `end`. */
async function playRun(page, mode, sec, end = 'quit') {
  await page.evaluate((mode, sec, end) => {
    const S = window.__SWARM
    const w = S.world
    const inp = S.input
    const real = inp.update
    inp.update = () => {
      let best = null
      let bd = Infinity
      for (const e of w.enemies.active) {
        const d = Math.hypot(e.x - w.player.x, e.y - w.player.y)
        if (e.alive && d < bd) { bd = d; best = e }
      }
      inp.move.x = inp.move.y = 0
      inp.firing = !!best
      if (best) {
        inp.aimDir.x = (best.x - w.player.x) / (bd || 1)
        inp.aimDir.y = (best.y - w.player.y) / (bd || 1)
      }
    }
    S.startRun(mode)
    try {
      for (let i = 0; i < sec * 60; i++) {
        w.player.hp = w.player.maxHp = 1e9
        S.step(1)
        while (w.paused && w.draft.open) S.pickCard(0)
      }
    } finally {
      inp.update = real
    }
    S.endRun(end)
  }, mode, sec, end)
  await sleep(700)
}

async function findText(page, needle) {
  return page.evaluate((needle) => {
    let hit = null
    const walk = (o) => {
      if (!o.visible || hit) return
      if (o.style && typeof o.text === 'string' && o.text.includes(needle)) {
        const b = o.getBounds()
        hit = { x: b.minX + b.width / 2, y: b.minY + b.height / 2, text: o.text }
        return
      }
      for (const c of o.children) walk(c)
    }
    walk(window.__SWARM.app.stage)
    return hit
  }, needle)
}

/** Every feat done, so the recap shows the rank line alone (ui-shots 18b covers
 *  it beside an unlock banner). */
const featsDone = (page) =>
  page.evaluate(async () => {
    const { FEATS } = await import('/src/content/feats.ts')
    window.__SWARM.saveJSON('feats', { done: Object.fromEntries(FEATS.map((f) => [f.id, '2026-01-01'])), prog: {} })
  })
const isPost = (r) => r.url().startsWith(LB + '/api/v2/run') && r.request().method() === 'POST'

const promptOpen = (page) => page.evaluate(() => !!document.querySelector('input'))
const store = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem('swarmgeddon:' + k) ?? 'null'), key)

async function fresh(browser) {
  const { ctx, page, st } = await open(browser)
  const seen = []
  for (const mode of ['endless', 'endless', 'daily', 'daily', 'endless']) {
    await playRun(page, mode, 12)
    const card = !!(await findText(page, 'JOIN THE LEADERBOARD?'))
    const r = await page.evaluate(() => window.__SWARM.lastResult)
    seen.push({ mode, ranked: r.ranked, card, asked: await store(page, 'lb:asked') })
    if (seen.length === 2) await page.screenshot({ path: path.join(OUT, 'fresh-recap-optin-375x667.png') })
  }
  check('fresh save: 0 leaderboard requests over 5 runs', st.lb.length === 0, st.lb)
  check('opt-in card from the 2nd counted run, at most 3 times', seen.map((s) => s.card).join() === 'false,true,true,true,false', seen)
  check('first Daily ranked, second practice', seen[2].ranked === true && seen[3].ranked === false)
  check('fresh: no page errors', st.pageErrors.length === 0, st.pageErrors)
  await ctx.close()
}

async function prompt(browser) {
  const { ctx, page, st } = await open(browser, { save: { 'meta:v': 2, stats: { runs: 5 } } })
  await featsDone(page)
  await playRun(page, 'endless', 12)
  const btn = await findText(page, 'CHOOSE A NAME')
  check('opt-in card shows CHOOSE A NAME', !!btn)
  await page.touchscreen.tap(btn.x, btn.y)
  await sleep(600)
  check('touch tap on CHOOSE A NAME opens the prompt and it stays open', await promptOpen(page))
  const input = await page.evaluate(() => {
    const b = document.querySelector('input').getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  })
  await page.touchscreen.tap(input.x, input.y)
  await sleep(600)
  check('a tap on the name field keeps the prompt open', await promptOpen(page))
  await page.screenshot({ path: path.join(OUT, 'prompt-375x667.png') })
  await page.evaluate(() => {
    document.querySelector('input').value = ''
  })
  await page.keyboard.type('A')
  await page.keyboard.press('Enter')
  await sleep(200)
  const err = await page.evaluate(() => [...document.querySelectorAll('div')].map((d) => d.textContent).find((t) => t === 'Use 2 to 14 visible characters.') ?? null)
  check('one character is refused with the A15 line', (await promptOpen(page)) && err !== null, err)
  await page.keyboard.type('CE')
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'SAVE').getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, h: b.height }
  })
  const resP = page.waitForResponse(isPost, { timeout: 10000 }).catch(() => null)
  await page.touchscreen.tap(save.x, save.y)
  const res = await resP
  await sleep(500)
  const line = await findText(page, 'THIS WEEK')
  check('SAVE opts in, posts the run once and shows the week and all-time ranks',
    !(await promptOpen(page)) && res && res.status() === 200 && !!line && st.lb.length === 1 && (await store(page, 'lb:optIn')) === true && /^[A-Za-z0-9_-]{22}$/.test(await store(page, 'lb:id')),
    { status: res && res.status(), line: line && line.text, requests: st.lb, buttonH: save.h })
  await page.screenshot({ path: path.join(OUT, 'recap-rank-375x667.png') })

  // The backdrop is armed only 350 ms after open.
  await page.evaluate(() => { void import('/src/ui/namePrompt.ts').then((m) => { window.__p = m.promptName('XY') }) })
  await sleep(80)
  await page.touchscreen.tap(12, 12)
  await sleep(150)
  const early = await promptOpen(page)
  await sleep(400)
  await page.touchscreen.tap(12, 12)
  await sleep(200)
  check('backdrop tap before 350 ms keeps the prompt, after 350 ms closes it', early && !(await promptOpen(page)))
  check('prompt: no page errors', st.pageErrors.length === 0, st.pageErrors)
  await ctx.close()
}

/** Jump to the PRIME beat and let the first shot that can land kill it. */
const EARLIEST_CLEAR = `(() => {
  const S = window.__SWARM
  const w = S.world
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
    for (let i = 0; i < 60 * 30 && S.screen === 'playing' && !(w.paused && !w.draft.open); i++) {
      if (w.bossAlive && w.boss && !w.boss.submerged) w.boss.hp = Math.min(w.boss.hp, 1)
      S.step(1)
      while (w.paused && w.draft.open) S.pickCard(0)
      w.player.hp = 1e9
    }
  } finally {
    inp.update = real
  }
  return { clearMs: w.clearMs, time: w.time, bosses: w.bossesSlain, screen: S.screen }
})()`

async function clear(browser) {
  const { ctx, page, st } = await open(browser, { w: 667, h: 375, save: OPTED_IN })
  await featsDone(page)
  await page.evaluate(() => {
    window.__SWARM.setLoadout('nova', 'hive')
    window.__SWARM.startRun('endless')
  })
  const std = await page.evaluate(EARLIEST_CLEAR)
  await sleep(700)
  const resP = page.waitForResponse(isPost, { timeout: 10000 }).catch(() => null)
  const extract = await findText(page, 'EXTRACT')
  await page.touchscreen.tap(extract.x, extract.y)
  const res = await resP
  const body = res ? await res.json().catch(() => null) : null
  const r = await page.evaluate(() => window.__SWARM.lastResult)
  check('earliest Standard clear posts 200', res && res.status() === 200 && r.cleared && r.end === 'clear',
    { clearMs: r.clearMs, timeMs: Math.round(r.time * 1000), bosses: r.bossesSlain, status: res && res.status(), ranks: body && body.ranks, std })
  await sleep(600)
  await page.screenshot({ path: path.join(OUT, 'clear-recap-667x375.png') })

  const resD = page.waitForResponse(isPost, { timeout: 10000 }).catch(() => null)
  await page.evaluate((d) => window.__SWARM.startDaily(d), today)
  const daily = await page.evaluate(EARLIEST_CLEAR)
  const rd = await resD
  const bd = rd ? await rd.json().catch(() => null) : null
  const r2 = await page.evaluate(() => window.__SWARM.lastResult)
  check('earliest ranked Daily clear posts 200 with a day rank', rd && rd.status() === 200 && r2.ranked && r2.cleared && bd && bd.ranks && bd.ranks.day,
    { clearMs: r2.clearMs, timeMs: Math.round(r2.time * 1000), bosses: r2.bossesSlain, status: rd && rd.status(), body: bd, daily })
  check('clear: no page errors', st.pageErrors.length === 0, st.pageErrors)
  await ctx.close()
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type' }

async function errors(browser) {
  for (const code of CODES) {
    const intercept =
      code === 'live' ? null
        : code === 'abort' ? (req) => req.abort('failed')
          : (req) =>
            req.method() === 'OPTIONS'
              ? req.respond({ status: 204, headers: CORS })
              : req.respond({ status: Number(code), contentType: 'application/json', headers: CORS, body: JSON.stringify({ error: 'x' }) })
    const { ctx, page, st } = await open(browser, { save: OPTED_IN, intercept })
    await featsDone(page)
    await playRun(page, 'endless', 12)
    await sleep(800)
    const line = await page.evaluate(() => {
      const found = []
      const walk = (o) => {
        if (!o.visible) return
        if (o.style && typeof o.text === 'string' && /Score not posted|already posted|THIS WEEK/.test(o.text)) found.push(o.text)
        for (const c of o.children) walk(c)
      }
      walk(window.__SWARM.app.stage)
      return found[0] ?? null
    })
    const attempts = () => Math.max(st.lb.filter((x) => x.startsWith('POST')).length, st.pre)
    const first = attempts()
    const menu = await findText(page, 'MENU')
    await page.touchscreen.tap(menu.x, menu.y)
    await sleep(400)
    const screen = await page.evaluate(() => window.__SWARM.screen)
    await playRun(page, 'endless', 12)
    await sleep(800)
    const second = attempts()
    await page.evaluate(() => window.__SWARM.toLeaderboard())
    await sleep(1200)
    const board = await page.evaluate(() => {
      const found = []
      const walk = (o) => {
        if (!o.visible) return
        if (o.style && typeof o.text === 'string' && /leaderboard|No scores/i.test(o.text) && o.text !== 'LEADERBOARD') found.push(o.text)
        for (const c of o.children) walk(c)
      }
      walk(window.__SWARM.app.stage)
      return found
    })
    const sessionOff = code === 'live' || code === '404' || code === '410' || code === '426'
    check(`worker answers ${code}: one request per run at most, a recap line, the recap takes input, an offline board`,
      first === 1 && second === (sessionOff ? 1 : 2) && line !== null && screen === 'menu' && board.length > 0 && st.pageErrors.length === 0,
      { line, requests: st.lb, screen, board, pageErrors: st.pageErrors, consoleErrors: st.consoleErrors })
    if (code === (flags.shot || '410') || code === 'live') await page.screenshot({ path: path.join(OUT, `board-offline-${code}-375x667.png`) })
    await ctx.close()
  }
}

async function ckpt(browser) {
  const a = await open(browser, { save: { 'meta:v': 2 } })
  await a.page.evaluate((d) => {
    const S = window.__SWARM
    const w = S.world
    S.startDaily(d)
    for (let i = 0; i < 12 * 60; i++) {
      w.player.hp = w.player.maxHp = 1e9
      S.step(1)
      while (w.paused && w.draft.open) S.pickCard(0)
    }
  }, today)
  await sleep(400) // a render frame writes the 10 s checkpoint
  const saved = await a.page.evaluate(() => {
    const out = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k.startsWith('swarmgeddon:')) out[k.slice(12)] = JSON.parse(localStorage.getItem(k))
    }
    return out
  })
  await a.ctx.close()
  const ck = saved['daily:ckpt']
  check('the ranked Daily writes a checkpoint every 10 s of sim time', !!ck && ck.ranked && ck.time >= 10, ck && { time: ck.time, end: ck.end, dailyNumber: ck.dailyNumber })

  const b = await open(browser, { save: saved })
  await sleep(500)
  const toast = await findText(b.page, 'when the app closed')
  const day = await store(b.page, 'daily:' + today)
  const stats = await store(b.page, 'stats')
  check('a leftover checkpoint becomes the ranked result at boot, with its toast',
    !!toast && day && day.ranked && day.ranked.end === 'interrupted' && (await store(b.page, 'daily:ckpt')) === null && stats.dailyRanked === 1,
    { toast: toast && toast.text, ranked: day && day.ranked && { end: day.ranked.end, time: day.ranked.time }, dailyRanked: stats && stats.dailyRanked })
  await b.page.screenshot({ path: path.join(OUT, 'ckpt-toast-375x667.png') })
  // P17's Daily card: the title reads DAILY #N and its button PRACTICE (PLAY RANKED before the ranked run).
  const label = await findText(b.page, 'DAILY #')
  const ranked = await findText(b.page, 'PLAY RANKED')
  const practice = await b.page.evaluate(() => {
    let hit = false
    const walk = (o) => {
      if (!o.visible || hit) return
      if (o.style && o.text === 'PRACTICE') hit = true
      else for (const c of o.children) walk(c)
    }
    walk(window.__SWARM.app.stage)
    return hit
  })
  check('the menu then offers practice', !!label && !ranked && practice, label && { daily: label.text, practiceButton: practice, rankedButton: !!ranked })
  check('ckpt: no page errors', a.st.pageErrors.length + b.st.pageErrors.length === 0, [...a.st.pageErrors, ...b.st.pageErrors])
  await b.ctx.close()

  // A second tab or window on the origin while the ranked run lives.
  const c = await open(browser, { save: { 'meta:v': 2 } })
  await c.page.evaluate((d) => {
    const S = window.__SWARM
    const w = S.world
    S.startDaily(d)
    for (let i = 0; i < 12 * 60; i++) {
      w.player.hp = w.player.maxHp = 1e9
      S.step(1)
      while (w.paused && w.draft.open) S.pickCard(0)
    }
  }, today)
  await sleep(400)
  const second = await c.ctx.newPage()
  const secondErrors = []
  second.on('pageerror', (e) => secondErrors.push(e.message))
  await second.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await second.goto(ORIGIN + '/?touch=1', { waitUntil: 'networkidle0', timeout: 45000 })
  await second.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await sleep(700)
  const liveToast = await findText(second, 'when the app closed')
  const liveDay = await store(second, 'daily:' + today)
  const liveCk = await store(second, 'daily:ckpt')
  check('a second page opened while the ranked run lives files nothing',
    !liveToast && !(liveDay && liveDay.ranked) && !!liveCk,
    { toast: liveToast && liveToast.text, ranked: liveDay && liveDay.ranked && liveDay.ranked.end, ckpt: !!liveCk })
  await second.close()
  const end = await c.page.evaluate(async (d) => {
    const S = window.__SWARM
    S.endRun('quit')
    await new Promise((r) => setTimeout(r, 100))
    const q = await navigator.locks.query()
    const day = S.loadJSON('daily:' + d, {})
    return { ranked: day.ranked && day.ranked.end, time: day.ranked && day.ranked.time, held: (q.held || []).map((l) => l.name) }
  }, today)
  check('the live page files its own run as the ranked one and releases the lock',
    end.ranked === 'quit' && end.time >= 12 && !end.held.includes('swarmgeddon:ranked-run'), end)
  check('ckpt (two pages): no page errors', c.st.pageErrors.length + secondErrors.length === 0, [...c.st.pageErrors, ...secondErrors])
  await c.ctx.close()
}

await acquireChromeLock('probe-lb')
const opts = { executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] }
let browser
try {
  browser = await puppeteer.launch(opts)
} catch (e) {
  console.error('launch failed, retrying in 10s:', e.message)
  await sleep(10000)
  browser = await puppeteer.launch(opts)
}
try {
  const parts = { fresh, prompt, clear, errors, ckpt }
  for (const p of PARTS) {
    console.log(`--- ${p}`)
    try {
      await parts[p](browser)
    } catch (e) {
      failures++
      console.log(`FAIL  ${p} threw: ${e.message}`)
    }
  }
} finally {
  await browser.close()
}
console.log(JSON.stringify({ failures, out: OUT }))
process.exit(failures ? 1 : 0)
