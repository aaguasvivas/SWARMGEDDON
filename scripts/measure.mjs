// SWARMGEDDON headless verification harness (real system Chrome via puppeteer-core).
//
// Setup (one-time, not a repo dependency):  npm i --no-save puppeteer-core
// Start the dev server first:               npm run dev -- --port 5176 --strictPort
//
// Usage: node scripts/measure.mjs <width> <height> <mode> [args]
//   det  [charId] [arenaId]        determinism probe: ?seed=777, step(600), FNV hash of
//                                  enemy positions+hp+player pos. Run at TWO different
//                                  viewport sizes — hashes MUST be identical (hard invariant).
//   perf                           6s live combat at flood(500) + auto-fire; reports
//                                  fps / p95 / max / long(>20ms) / bad(>33.4ms) frames.
//   thrash                         perf variant re-injecting layout thrash (A/B baseline).
//   shot <charId> <arenaId> <out>  screenshot of live combat with a varied enemy pack
//                                  pulled into view (for visual audits / galleries).
//
// Notes: drives the DEV build's __SWARM handle (world/step/flood/give/setLoadout/loop).
// rAF runs normally in headless "new"; sim-only checks use step() (no wall clock).
import puppeteer from 'puppeteer-core'

const [W, H] = [parseInt(process.argv[2] || '1920'), parseInt(process.argv[3] || '1080')]
const MODE = process.argv[4] || 'perf'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'],
  defaultViewport: { width: W, height: H },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message))
await page.goto(`http://localhost:5176/?seed=777`, { waitUntil: 'networkidle0', timeout: 30000 })
await page.waitForFunction('!!window.__SWARM', { timeout: 15000 })

const glInfo = await page.evaluate(() => {
  const c = document.createElement('canvas')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'
})

if (MODE === 'shot') {
  const [charId, arenaId, outfile] = [process.argv[5], process.argv[6], process.argv[7]]
  await page.evaluate((c, a) => {
    const S = window.__SWARM
    S.setLoadout(c, a)
    S.startRun('endless')
    const w = S.world
    w.player.maxHp = 1e9
    w.player.hp = 1e9
    for (const [id, n] of [['swarmer', 26], ['flyer', 8], ['beetle', 5], ['spitter', 5], ['splitter', 5], ['guardian', 1]]) S.spawn(id, n)
    const px = w.player.x, py = w.player.y
    const GOLD = 2.399963
    w.enemies.active.forEach((e, i) => {
      const r = 130 + (i % 7) * 38
      e.x = e.prevX = px + Math.cos(i * GOLD) * r
      e.y = e.prevY = py + Math.sin(i * GOLD) * r * 0.62
      e.bornAt = w.time - 1
    })
    S.step(3)
  }, charId, arenaId)
  await new Promise((r) => setTimeout(r, 450))
  await page.screenshot({ path: outfile, type: 'jpeg', quality: 62 })
  console.log(JSON.stringify({ mode: 'shot', charId, arenaId, outfile }))
} else if (MODE === 'det') {
  const charId = process.argv[5] || 'nova'
  const arenaId = process.argv[6] || 'hive'
  const hash = await page.evaluate((c, a) => {
    const S = window.__SWARM
    S.setLoadout(c, a)
    S.startRun('endless')
    S.flood(200)
    S.step(600) // 10 sim-seconds, no wall clock involved
    let h = 0x811c9dc5
    const mix = (n) => {
      const v = Math.round(n * 16)
      h ^= v & 0xff; h = Math.imul(h, 0x01000193)
      h ^= (v >> 8) & 0xff; h = Math.imul(h, 0x01000193)
    }
    for (const e of S.world.enemies.active) { mix(e.x); mix(e.y); mix(e.hp) }
    mix(S.world.player.x); mix(S.world.player.y)
    return { hash: (h >>> 0).toString(16), enemies: S.world.enemies.active.length, time: S.world.time.toFixed(2) }
  }, charId, arenaId)
  console.log(JSON.stringify({ mode: 'det', W, H, charId, arenaId, ...hash }))
} else {
  await page.evaluate(() => {
    const S = window.__SWARM
    S.startRun('endless')
    S.world.player.maxHp = 1e9
    S.world.player.hp = 1e9
    S.input.autoFire = true
    S.give('hailstorm')
    S.flood(500)
  })
  if (MODE === 'thrash') {
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      const dirt = document.createElement('div')
      dirt.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px'
      document.body.appendChild(dirt)
      let flip = false
      const dirty = () => { flip = !flip; dirt.style.width = flip ? '2px' : '1px'; requestAnimationFrame(dirty) }
      requestAnimationFrame(dirty)
      window.addEventListener('pointermove', () => {
        void canvas.getBoundingClientRect().left
        void canvas.getBoundingClientRect().top
      })
    })
  }
  await page.mouse.move(W / 2 + 180, H / 2 + 40)
  await new Promise((r) => setTimeout(r, 1200))
  await page.evaluate(() => window.__SWARM.perfReset())
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(W / 2 + Math.sin(i * 0.7) * 320, H / 2 + Math.cos(i * 0.9) * 200, { steps: 40 })
    await new Promise((r) => setTimeout(r, 210))
  }
  const stats = await page.evaluate(() => {
    const S = window.__SWARM
    return {
      fps: +S.loop.fps.toFixed(1),
      p95: +S.loop.p95().toFixed(2),
      max: +S.loop.maxMs.toFixed(1),
      long: S.loop.longFrames,
      bad: S.loop.badFrames,
      total: S.loop.totalFrames,
      enemies: S.world.enemies.active.length,
      particles: S.world.particles.active.length,
    }
  })
  console.log(JSON.stringify({ mode: MODE, W, H, gl: String(glInfo).slice(0, 60), ...stats }))
}
await browser.close()
