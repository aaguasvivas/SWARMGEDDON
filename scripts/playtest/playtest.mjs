// Simulated playtest driver (modeled on scripts/measure.mjs).
// Server origin: env SWG_URL (default http://localhost:5176).
// (see Usage below)
//   mode: turret (invincible, stationary) | roam (invincible, kite+collect)
//         crude (normal HP, flee centroid) | smart (normal HP, kite+dodge+collect)
//         append +dash (e.g. smart+dash) for the dash policy
import puppeteer from '/Users/Adelson/Desktop/personal/SWARMGEDDON/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
import { acquireChromeLock } from '../lib/chromeLock.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'playtest')
mkdirSync(OUT, { recursive: true })

// Usage: node playtest.mjs <arena> <mode:seed:minutes[:char]> [...more configs]
const arena = process.argv[2] || 'hive'
const configs = process.argv.slice(3).map((s) => {
  const [modeTok, seed, min, char, perkPolicy] = s.split(':')
  const [mode, ...opts] = modeTok.split('+')
  return { mode, dash: opts.includes('dash'), seed: parseInt(seed), minutes: parseFloat(min), char: char || 'nova', perkPolicy: perkPolicy || 'first' }
})
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
await page.evaluate(readFileSync(join(HERE, 'harness.js'), 'utf8'))
for (const { mode, dash, seed, minutes, char, perkPolicy } of configs) {
  const invincible = mode === 'turret' || mode === 'roam'
  const init = await page.evaluate((cfg) => window.__PT_init(cfg), { arena, mode, dash, seed, char, invincible, perkPolicy })
  const t0 = Date.now()
  const end = minutes * 60
  for (let t = 30; t <= end + 1e-6; t += 30) {
    const r = await page.evaluate((u) => window.__PT_run(u, 1e7), t)
    const c = await page.evaluate(() => window.__PT_chunk())
    console.error(
      `[${arena}/${mode}${dash ? '+dash' : ''}/${seed}] t=${c.t} L${c.level} kills=${c.kills} (+${c.killsDelta}) en=${c.enemies} max=${c.maxEnemiesChunk} wpn=${c.weapon} boss=${c.bossAlive}${c.bossHp != null ? '(' + c.bossHp + ')' : ''} hp=${c.hp} lv+${c.levelUps} xpExp=${c.xpExpired} dash=${c.dashes}/cc${c.closeCalls} wall=${((Date.now() - t0) / 1000).toFixed(0)}s`,
    )
    if (r.dead) break
  }
  const fin = await page.evaluate(() => window.__PT_final())
  fin.init = init
  fin.wallSeconds = (Date.now() - t0) / 1000
  const file = join(OUT, `${arena}_${mode}${dash ? '_dash' : ''}_${seed}${char !== 'nova' ? '_' + char : ''}${perkPolicy !== 'first' ? '_' + perkPolicy : ''}.json`)
  writeFileSync(file, JSON.stringify(fin, null, 1))
  console.log(JSON.stringify({ file, arena, mode, dash, seed, endTime: fin.endTime, dead: fin.dead, fromHalfHp: fin.death?.fromHalfHp ?? null, level: fin.level, kills: fin.kills, dashes: fin.dashes, closeCalls: fin.closeCalls, maxEnemies: fin.maxEnemies, wall: fin.wallSeconds }))
}
await browser.close()
