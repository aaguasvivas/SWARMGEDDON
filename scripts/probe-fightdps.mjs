// Boss fight damage probe (NEXT-LEVEL section 11, A6 note). Runs the playtest
// harness bot through whole runs and records, for every boss fight, the boss
// damage taken per boss state and per attack, the bot's mean distance to the
// boss and how often it aims at her. It answers why a world's fights run
// short or long: a flat damage rate across states means the kit's timing does
// not feed the bot, so the fight length is HP against the bot's damage.
// Takes the machine-wide Chrome lock first. Server origin: env SWG_URL
// (default http://localhost:5176).
//
// Usage: node scripts/probe-fightdps.mjs <world> <mode[+focus]:seed[:minutes[:char[:perkPolicy]]]>...
//   e.g. node scripts/probe-fightdps.mjs depths smart+focus:1001:14:nova:priority smart+focus:2002:14:nova:priority
// Prints one JSON line per run, then one summary per stage (kill fights only).
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const STATES = ['EMERGE', 'IDLE', 'TELE', 'ACTIVE', 'RECOVER', 'ROAR']
const world = process.argv[2]
const configs = process.argv.slice(3).map((s) => {
  const [modeTok, seed, min, char, perkPolicy] = s.split(':')
  const [mode, ...opts] = modeTok.split('+')
  return { mode, focus: opts.includes('focus'), seed: parseInt(seed), minutes: min ? parseFloat(min) : 14, char: char || 'nova', perkPolicy: perkPolicy || 'first' }
})

/** Wrap __SWARM.step so every sim tick of a boss fight is tallied. */
function install() {
  const S = window.__SWARM
  const w = S.world
  if (S.__fdOrig) S.step = S.__fdOrig
  const orig = S.step
  S.__fdOrig = orig
  const R = (window.__FD = { fights: [], cur: null })
  S.step = (n = 60) => {
    for (let i = 0; i < n; i++) {
      const b = w.bossAlive ? w.boss : null
      let hp0 = 0
      let st = -1
      let att = -1
      let d = 0
      if (b) {
        if (!R.cur || R.cur.boss !== b) {
          R.cur = { boss: b, id: b.def.id, stage: w.bossFight.stage, t0: w.time, maxHp: b.maxHp, level: w.level, weapon: w.weapon.id, tS: [0, 0, 0, 0, 0, 0], dS: [0, 0, 0, 0, 0, 0], tAtt: {}, dAtt: {}, dist: 0, aimed: 0, n: 0 }
          R.fights.push(R.cur)
        }
        hp0 = b.hp
        st = w.bossFight.state
        att = w.bossFight.attack
        d = Math.hypot(b.x - w.player.x, b.y - w.player.y)
      }
      const t0 = w.time
      orig(1)
      if (!b || w.time <= t0 || !R.cur || R.cur.boss !== b) continue
      const c = R.cur
      const dmg = hp0 - Math.max(0, b.hp)
      c.tS[st] += 1 / 60
      c.dS[st] += dmg
      const key = st >= 2 && st <= 4 ? att : -1
      c.tAtt[key] = (c.tAtt[key] || 0) + 1 / 60
      c.dAtt[key] = (c.dAtt[key] || 0) + dmg
      c.dist += d
      c.n++
      const pl = w.player
      if (S.input.aimDir.x * (b.x - pl.x) + S.input.aimDir.y * (b.y - pl.y) > 0.995 * (d || 1)) c.aimed++
      if (!b.alive || w.boss !== b) {
        c.t1 = w.time
        c.end = b.alive ? 'other' : 'kill'
        R.cur = null
      }
    }
  }
}

function collect() {
  const w = window.__SWARM.world
  const r2 = (x) => +x.toFixed(2)
  return window.__FD.fights.map((c) => {
    const len = (c.t1 ?? w.time) - c.t0
    return {
      id: c.id, stage: c.stage, t0: r2(c.t0), len: r2(len), end: c.end ?? 'open', maxHp: Math.round(c.maxHp), level: c.level, weapon: c.weapon,
      meanDist: Math.round(c.dist / Math.max(1, c.n)), aimFrac: r2(c.aimed / Math.max(1, c.n)),
      tS: c.tS.map(r2), dS: c.dS.map((x) => Math.round(x)),
      tAtt: Object.fromEntries(Object.entries(c.tAtt).map(([k, v]) => [k, r2(v)])), dAtt: Object.fromEntries(Object.entries(c.dAtt).map(([k, v]) => [k, Math.round(v)])),
    }
  })
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length ? +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2) : null
}

async function launch() {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 900000, timeout: 120000, args: ['--window-size=390,844', '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'], defaultViewport: { width: 390, height: 844 } })
      const page = await browser.newPage()
      page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message))
      await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 60000 })
      await page.waitForFunction('!!window.__SWARM', { timeout: 30000 })
      return { browser, page }
    } catch (e) {
      console.error(`launch attempt ${attempt} failed: ${e.message}; retrying in 10s`)
      await new Promise((r) => setTimeout(r, 10000))
    }
  }
  throw new Error('could not launch Chrome')
}

await acquireChromeLock('probe-fightdps')
const { browser, page } = await launch()
const all = []
try {
  await page.evaluate(readFileSync(join(HERE, 'playtest/harness.js'), 'utf8'))
  for (const cfg of configs) {
    await page.evaluate((c) => window.__PT_init(c), { arena: world, mode: cfg.mode, dash: false, focus: cfg.focus, seed: cfg.seed, char: cfg.char, invincible: false, perkPolicy: cfg.perkPolicy, threat: 0, ot: false })
    await page.evaluate(install)
    for (let t = 30; t <= cfg.minutes * 60 + 1e-6; t += 30) {
      const r = await page.evaluate((u) => window.__PT_run(u, 1e7), t)
      if (r.dead || r.won || r.stalemate) break
    }
    const fights = await page.evaluate(collect)
    const end = await page.evaluate(() => ({ t: +window.__SWARM.world.time.toFixed(2), dead: window.__PT.dead, won: window.__PT.won }))
    all.push(...fights)
    console.log(JSON.stringify({ world, cfg: `${cfg.mode}${cfg.focus ? '+focus' : ''}:${cfg.seed}`, ...end, fights }))
  }
} finally {
  await browser.close()
}

for (const stage of ['mid1', 'mid2', 'final']) {
  const k = all.filter((f) => f.stage === stage && f.end === 'kill')
  if (!k.length) continue
  const T = [0, 0, 0, 0, 0, 0]
  const D = [0, 0, 0, 0, 0, 0]
  for (const f of k) for (let i = 0; i < 6; i++) (T[i] += f.tS[i]), (D[i] += f.dS[i])
  const rate = D.reduce((a, b) => a + b, 0) / T.reduce((a, b) => a + b, 0)
  const rel = STATES.map((s, i) => `${s} ${T[i] ? (D[i] / T[i] / rate).toFixed(2) : '-'}`).join(', ')
  console.log(
    `${stage}: kills ${k.length}, median ${median(k.map((f) => f.len))} s, max ${Math.max(...k.map((f) => f.len))} s, median HP ${median(k.map((f) => f.maxHp))}, mean distance ${median(k.map((f) => f.meanDist))} u, aim ${median(k.map((f) => f.aimFrac))}; damage rate by state vs the mean: ${rel}`,
  )
}
