// Paint readability sheet (A13): every paint, factory first, on every world
// floor at 375x667 mid-swarm. One crop around the ship per paint and world,
// laid out on one contact sheet per world, so a paint that makes the ship
// harder to find than FACTORY stands out.
//
// Usage: SWG_URL=http://localhost:5176 node scripts/paint-shots.mjs [pilot=nova] [--out=DIR]
// Writes <out>/paints-<world>.png (default out: <os tmp>/swarmgeddon-paints).
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
const PILOT = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'nova'
const OUT = flags.out || path.join(os.tmpdir(), 'swarmgeddon-paints')
const CROP = 110
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await acquireChromeLock('paint-shots')
const opts = { executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] }
let browser
try {
  browser = await puppeteer.launch(opts)
} catch (e) {
  console.error('launch failed, retrying in 10 s:', e.message)
  await sleep(10000)
  browser = await puppeteer.launch(opts)
}
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 })
  await page.goto(ORIGIN + '/?seed=777', { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  const paints = await page.evaluate(() => {
    window.__SWARM.unlockAll()
    return ['factory', ...JSON.parse(localStorage.getItem('swarmgeddon:unlocks')).filter((k) => k.startsWith('paint:')).map((k) => k.slice(6))]
  })
  for (const world of ['hive', 'depths', 'wastes']) {
    const cells = []
    for (const paint of paints) {
      const at = await page.evaluate((pilot, world, paint) => {
        const S = window.__SWARM
        const w = S.world
        S.setLoadout(pilot, world)
        S.setPaint(paint)
        S.startRun('endless')
        w.player.maxHp = w.player.hp = 1e9
        for (const [id, n] of [['swarmer', 30], ['biter', 12], ['flyer', 8], ['beetle', 4], ['spitter', 4]]) S.spawn(id, n)
        const px = w.player.x
        const py = w.player.y
        const GOLD = 2.399963
        w.enemies.active.forEach((e, i) => {
          const r = 34 + (i % 12) * 20
          e.x = e.prevX = px + Math.cos(i * GOLD) * r
          e.y = e.prevY = py + Math.sin(i * GOLD) * r
          e.bornAt = w.time - 1
        })
        S.step(2)
        w.paused = true
        S.feel.hurtFlash = 0
        return null
      }, PILOT, world, paint)
      void at
      await sleep(260)
      const c = await page.evaluate(() => {
        const S = window.__SWARM
        return { x: S.camera.worldToScreenX(S.world.player.x), y: S.camera.worldToScreenY(S.world.player.y) }
      })
      const buf = await page.screenshot({ clip: { x: c.x - CROP / 2, y: c.y - CROP / 2, width: CROP, height: CROP } })
      cells.push({ paint, src: 'data:image/png;base64,' + Buffer.from(buf).toString('base64') })
    }
    const sheet = await browser.newPage()
    await sheet.setViewport({ width: 6 * (CROP * 2 + 8) + 8, height: 800, deviceScaleFactor: 1 })
    await sheet.setContent(`<body style="margin:0;background:#111;font:12px monospace;color:#eee">
      <div style="padding:4px 8px">${world.toUpperCase()} · ${PILOT.toUpperCase()} · 375x667 mid-swarm</div>
      <div style="display:grid;grid-template-columns:repeat(6,${CROP * 2}px);gap:8px;padding:0 8px 8px">
      ${cells.map((c) => `<div><img src="${c.src}" width="${CROP * 2}" height="${CROP * 2}" style="display:block"><div>${c.paint}</div></div>`).join('')}
      </div></body>`)
    const file = path.join(OUT, `paints-${world}.png`)
    await sheet.screenshot({ path: file, fullPage: true })
    await sheet.close()
    console.log(file)
  }
  if (errors.length) console.log(JSON.stringify({ errors }))
} finally {
  await browser.close()
}
