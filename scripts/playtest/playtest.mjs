// Simulated playtest driver (modeled on scripts/measure.mjs).
// Server origin: env SWG_URL (default http://localhost:5176).
// (see Usage below)
//   mode: turret (invincible, stationary) | roam (invincible, kite+collect)
//         crude (normal HP, flee centroid) | smart (normal HP, kite+dodge+collect)
//         append +dash (e.g. smart+dash) for the dash policy, +focus to shoot
//         the boss during a fight instead of the nearest enemy, +nostream to
//         switch off the stream dodge (an A/B of the dodge on one seed)
import puppeteer from '/Users/Adelson/Desktop/personal/SWARMGEDDON/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
import { acquireChromeLock } from '../lib/chromeLock.mjs'
import { parseConfig, runFile } from './configs.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// Usage: node playtest.mjs <arena> <mode[+dash]:seed[:minutes[:char[:perkPolicy[:threat[:ot]]]]]> [...more configs]
//          [--out=DIR] [--harness=FILE]
//   minutes defaults to 14; threat 0..4; ot = 'ot' to push into OVERTIME after a win.
//   --out: where the run JSONs go (default scripts/playtest/playtest, which analyze.mjs reads
//   by default). --harness: an in-page harness file other than harness.js (an A/B of a bot change).
const flags = {}
const pos = []
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/s.exec(a)
  if (m) flags[m[1]] = m[2]
  else pos.push(a)
}
const OUT = flags.out ? resolve(flags.out) : join(HERE, 'playtest')
const HARNESS = flags.harness ? resolve(flags.harness) : join(HERE, 'harness.js')
mkdirSync(OUT, { recursive: true })
const arena = pos[0] || 'hive'
const configs = pos.slice(1).map(parseConfig)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const W = 390
const H = 844

async function launch() {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        protocolTimeout: 900000,
        timeout: 120000,
        args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'],
        defaultViewport: { width: W, height: H },
      })
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

await acquireChromeLock('playtest')
const { browser, page } = await launch()
await page.evaluate(readFileSync(HARNESS, 'utf8'))
for (const cfg of configs) {
  const { mode, dash, focus, noStreamDodge, seed, minutes, char, perkPolicy, threat, ot } = cfg
  const invincible = mode === 'turret' || mode === 'roam'
  const init = await page.evaluate((c) => window.__PT_init(c), { arena, mode, dash, focus, noStreamDodge, seed, minutes, char, invincible, perkPolicy, threat, ot })
  const t0 = Date.now()
  const end = minutes * 60
  for (let t = 30; t <= end + 1e-6; t += 30) {
    const r = await page.evaluate((u) => window.__PT_run(u, 1e7), t)
    const c = await page.evaluate(() => window.__PT_chunk())
    console.error(
      `[${arena}/${mode}${dash ? '+dash' : ''}/${seed}] t=${c.t} L${c.level} kills=${c.kills} (+${c.killsDelta}) en=${c.enemies} mean=${c.aliveMean} max=${c.maxEnemiesChunk} wpn=${c.weapon} boss=${c.bossAlive}${c.bossHp != null ? '(' + c.bossHp + ')' : ''} hp=${c.hp} lv+${c.levelUps} pend=${c.pendingLevelUps} xp=${c.xpCollected}/${c.xpDropped} dash=${c.dashes}/cc${c.closeCalls} alerts=${c.alerts} wall=${((Date.now() - t0) / 1000).toFixed(0)}s`,
    )
    if (r.dead || r.won || r.stalemate) break
  }
  const fin = await page.evaluate(() => window.__PT_final())
  fin.init = init
  fin.wallSeconds = (Date.now() - t0) / 1000
  const file = join(OUT, runFile(arena, cfg))
  writeFileSync(file, JSON.stringify(fin, null, 1))
  console.log(JSON.stringify({ file, arena, mode, dash, focus, seed, perkPolicy, endTime: fin.endTime, dead: fin.dead, won: fin.won, stalemate: fin.stalemate, firstDraftAt: fin.firstDraftAt, firstFusionAt: fin.firstFusionAt, xpCollectFrac: fin.xpCollectFrac, xpCollectFrac30: fin.xpCollectFrac30, fromHalfHp: fin.death?.fromHalfHp ?? null, level: fin.level, kills: fin.kills, dashes: fin.dashes, closeCalls: fin.closeCalls, maxEnemies: fin.maxEnemies, streamDmg: fin.streamDmg, dodgeSteps: fin.dodgeSteps, hzSteps: fin.hzSteps, wall: fin.wallSeconds }))
}
await browser.close()
