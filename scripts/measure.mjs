// SWARMGEDDON headless verification harness (real system Chrome via puppeteer-core).
//
// Setup (one-time, not a repo dependency):  npm i --no-save puppeteer-core
// Start the dev server first:               npm run dev -- --port 5176 --strictPort
// Server origin: env SWG_URL (default http://localhost:5176), so parallel
// worktrees can each point at their own dev server.
//
// Usage: node scripts/measure.mjs <width> <height> <mode> [args] [--dpr=N] [--settings=JSON]
//   det  [charId] [arenaId|all] [steps]
//                                  determinism probe: ?seed=777, flood(200), a scripted
//                                  bot (aim at nearest, fire, walk to pickups or circle,
//                                  always pick card 1, dash presses at sim ticks 60, 200,
//                                  330 and 331), `steps` ticks (default 600). One line
//                                  per world with an FNV hash of enemies, player, progress
//                                  and all 7 RNG stream states. Default world: all three.
//                                  Hashes MUST match across viewports, DPR, injected
//                                  settings and reruns (hard invariant).
//   perf                           6s live combat at flood(500) + auto-fire; reports
//                                  fps / p95 / max / long(>20ms) / bad(>33.4ms) frames.
//   thrash                         perf variant re-injecting layout thrash (A/B baseline).
//   shot <charId> <arenaId> <out>  screenshot of live combat with a varied enemy pack
//                                  pulled into view (for visual audits / galleries).
//   --dpr=N                        device pixel ratio for the page (default 1).
//   --settings=JSON                settings merged into the save before boot, e.g.
//                                  '{"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
//
// Notes: drives the DEV build's __SWARM handle (world/step/flood/give/setLoadout/loop).
// rAF runs normally in headless "new"; sim-only checks use step() (no wall clock).
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const flags = {}
const pos = []
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/s.exec(a)
  if (m) flags[m[1]] = m[2]
  else pos.push(a)
}
const [W, H] = [parseInt(pos[0] || '1920'), parseInt(pos[1] || '1080')]
const MODE = pos[2] || 'perf'
const DPR = flags.dpr ? parseFloat(flags.dpr) : 1
const SETTINGS = flags.settings ? JSON.parse(flags.settings) : null
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

await acquireChromeLock('measure')
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: DPR },
})
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => {
  pageErrors.push(e.message)
  console.error('PAGE ERROR:', e.message)
})
page.on('console', (m) => {
  if (m.type() === 'error') {
    pageErrors.push(m.text())
    console.error('CONSOLE ERROR:', m.text())
  }
})
if (SETTINGS) {
  await page.evaluateOnNewDocument((s) => {
    try {
      localStorage.setItem('swarmgeddon:settings', JSON.stringify(s))
    } catch {}
  }, SETTINGS)
}
await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 30000 })
await page.waitForFunction('!!window.__SWARM', { timeout: 15000 })

const glInfo = await page.evaluate(() => {
  const c = document.createElement('canvas')
  const gl = c.getContext('webgl2') || c.getContext('webgl')
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown'
})

if (MODE === 'shot') {
  // node scripts/measure.mjs W H shot <charId> <arenaId> <outfile> [simSeconds]
  // With simSeconds: steps the ORGANIC sim to that time (real roster, real
  // hazards, boss if due), then fans the live pack around the player so the
  // world's roster is readable in one frame.
  const [charId, arenaId, outfile] = [pos[3], pos[4], pos[5]]
  const simSeconds = parseInt(pos[6] || '0')
  await page.evaluate((c, a, simS) => {
    const S = window.__SWARM
    S.setLoadout(c, a)
    S.startRun('endless')
    const w = S.world
    w.player.maxHp = 1e9
    w.player.hp = 1e9
    if (simS > 0) {
      // Step in chunks with cap relief: a stationary zero-kill probe pins the
      // pool at MAX_ENEMIES, which (correctly) makes the boss retry forever.
      // Cull chaff so elites/bosses actually appear in the frame.
      for (let s = 0; s < simS; s += 5) {
        S.step(5 * 60)
        const act = w.enemies.active
        if (act.length > 520) {
          let toCull = act.length - 450
          for (const e of act) {
            if (toCull <= 0) break
            if (!e.def.elite && !e.def.boss) { e.alive = false; toCull-- }
          }
          S.step(1) // sweep
        }
      }
    } else {
      for (const [id, n] of [['swarmer', 26], ['flyer', 8], ['beetle', 5], ['spitter', 5], ['splitter', 5], ['guardian', 1]]) S.spawn(id, n)
    }
    const px = w.player.x, py = w.player.y
    const GOLD = 2.399963
    w.enemies.active.forEach((e, i) => {
      const r = 120 + (i % 9) * 34
      e.x = e.prevX = px + Math.cos(i * GOLD) * r
      e.y = e.prevY = py + Math.sin(i * GOLD) * r * 0.62
      e.bornAt = w.time - 1
    })
    S.step(3)
    // Freeze for the shot: pause the live loop's sim and clear the hurt
    // vignette (an invincible probe being chewed saturates it maroon).
    w.paused = true
    S.feel.hurtFlash = 0
  }, charId, arenaId, simSeconds)
  await new Promise((r) => setTimeout(r, 450))
  await page.screenshot({ path: outfile, type: 'jpeg', quality: 62 })
  console.log(JSON.stringify({ mode: 'shot', charId, arenaId, simSeconds, outfile }))
} else if (MODE === 'det') {
  // Runs the same (seed, pilot, arena) sim TWICE in one page: hash1 must equal
  // hash2 (catches state leaking across beginRun), and both must match the
  // other-viewport / other-settings invocations (device independence).
  const charId = pos[3] || 'nova'
  const arenaArg = pos[4] || 'all'
  const steps = parseInt(pos[5] || '600')
  const arenas = arenaArg === 'all' ? ['hive', 'depths', 'wastes'] : [arenaArg]
  const applied = await page.evaluate(() => window.__SWARM.settings)
  for (const arenaId of arenas) {
    const res = await page.evaluate((c, a, nSteps) => {
      const S = window.__SWARM
      const w = S.world
      const inp = S.input
      // Scripted input: a pure function of sim state, so the camera, viewport
      // and pointer never reach the sim.
      const DASH_TICKS = [60, 200, 330, 331]
      let tick = 0
      const bot = () => {
        if (DASH_TICKS.includes(tick)) inp.pressDash()
        tick++
        const pl = w.player
        let best = null
        let bd = Infinity
        for (const e of w.enemies.active) {
          if (!e.alive || e.submerged) continue
          const d2 = (e.x - pl.x) ** 2 + (e.y - pl.y) ** 2
          if (d2 < bd) { bd = d2; best = e }
        }
        if (best) {
          const d = Math.sqrt(bd) || 1
          inp.aimDir.x = (best.x - pl.x) / d
          inp.aimDir.y = (best.y - pl.y) / d
          inp.firing = true
        } else {
          inp.aimDir.x = 0
          inp.aimDir.y = 0
          inp.firing = false
        }
        // Walk to the nearest pickup, else circle-strafe.
        let gem = null
        let gd = 600 * 600
        for (const p of w.pickups.active) {
          const d2 = (p.x - pl.x) ** 2 + (p.y - pl.y) ** 2
          if (p.alive && d2 < gd) { gd = d2; gem = p }
        }
        if (gem) {
          const d = Math.sqrt(gd) || 1
          inp.move.x = (gem.x - pl.x) / d
          inp.move.y = (gem.y - pl.y) / d
        } else {
          inp.move.x = Math.cos(w.time * 0.7) * 0.8
          inp.move.y = Math.sin(w.time * 0.7) * 0.8
        }
      }
      const runOnce = () => {
        S.setLoadout(c, a)
        S.startRun('endless')
        w.player.maxHp = 1e9
        w.player.hp = 1e9
        S.flood(200)
        const realUpdate = inp.update
        tick = 0
        inp.update = bot
        let drafts = 0
        try {
          for (let i = 0; i < nSteps; i++) {
            S.step(1)
            while (w.paused && w.pendingLevelUps > 0 && w.draftCards.length > 0) {
              drafts++
              S.pickPerk(w.draftCards[0].id)
            }
            w.player.maxHp = 1e9
            w.player.hp = 1e9
          }
        } finally {
          inp.update = realUpdate
        }
        let h = 0x811c9dc5
        const byte = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193) }
        const mix = (n) => { const v = Math.round(n * 16); byte(v); byte(v >> 8); byte(v >> 16); byte(v >> 24) }
        const mix32 = (v) => { byte(v); byte(v >>> 8); byte(v >>> 16); byte(v >>> 24) }
        const byType = {}
        for (const e of w.enemies.active) {
          mix(e.x); mix(e.y); mix(e.hp); mix32(e.uid)
          byType[e.def.id] = (byType[e.def.id] ?? 0) + 1
        }
        for (const p of w.pickups.active) { mix(p.x); mix(p.y); mix(p.xp) }
        mix(w.player.x); mix(w.player.y)
        mix(w.kills); mix(w.level); mix(w.xp); mix(w.time); mix(w.ammo)
        mix(w.projectiles.size); mix(w.enemyProjectiles.size); mix(w.acid.size); mix(w.particles.size)
        mix(w.dashes); mix(w.closeCalls); mix(w.dashCharges); mix(w.dashRecharge)
        for (const ch of w.weapon.id) byte(ch.charCodeAt(0))
        for (const [id, n] of w.perkStacks) { for (const ch of id) byte(ch.charCodeAt(0)); mix(n) }
        const streams = {}
        for (const k of ['spawn', 'script', 'boss', 'loot', 'draft', 'combat', 'fx']) {
          const st = w.rngs[k].state
          mix32(st)
          streams[k] = st.toString(16)
        }
        return {
          hash: (h >>> 0).toString(16), enemies: w.enemies.active.length, kills: w.kills, level: w.level,
          drafts, pickups: w.pickups.active.length, time: +w.time.toFixed(2), byType, streams,
          dashes: w.dashes, closeCalls: w.closeCalls, damageTaken: Math.round(w.damageTaken),
        }
      }
      const r1 = runOnce()
      const r2 = runOnce()
      return { r1, r2, rerunMatch: r1.hash === r2.hash }
    }, charId, arenaId, steps)
    const r = res.r1
    console.log(JSON.stringify({
      mode: 'det', W, H, dpr: DPR, settings: SETTINGS ? applied : null, charId, arenaId, steps,
      hash: r.hash, rerunMatch: res.rerunMatch, enemies: r.enemies, kills: r.kills, level: r.level,
      drafts: r.drafts, dashes: r.dashes, closeCalls: r.closeCalls, damageTaken: r.damageTaken,
      pickups: r.pickups, time: r.time, streams: r.streams, byType: r.byType,
    }))
  }
  if (pageErrors.length) console.log(JSON.stringify({ mode: 'det', pageErrors }))
} else {
  // perf [charId] [arenaId]: live combat in any world (default nova/hive).
  const pChar = pos[3] || 'nova'
  const pArena = pos[4] || 'hive'
  await page.evaluate((c, a) => {
    const S = window.__SWARM
    S.setLoadout(c, a)
    S.startRun('endless')
    S.world.player.maxHp = 1e9
    S.world.player.hp = 1e9
    S.input.autoFire = true
    S.give('hailstorm')
    S.flood(500)
    S.step(90 * 60) // deep into the run: full roster, elites, projectile hail
  }, pChar, pArena)
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
