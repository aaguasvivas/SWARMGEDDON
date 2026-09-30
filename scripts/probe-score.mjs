// Score acceptance probe (docs/NEXT-LEVEL.md 5, phase P10). Needs the dev server
// (origin from env SWG_URL, default http://localhost:5176).
//
//   node scripts/probe-score.mjs [sequences]
//
// halving: the real sim paths halve the chain on an enemy projectile hit, a
//   charger ram, 10 HP of contact (bites accumulate) and 2.0 s with no kill.
// parity: `sequences` (default 1000) random sequences of kills (weapon and
//   no-score), discrete hits, contact damage, Close Calls, idle ticks, boss
//   spawns and a clear, at a random THREAT. Each ends in a RunResult; the
//   client score must equal scoreOf() on the submitted fields (the server
//   path) and an independent model written from section 5 must agree on the
//   score, killPts, xpSum, hits, chain, bestChain, peakTier and flawless bosses.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const SEQUENCES = parseInt(process.argv[2] || '1000')

await acquireChromeLock('probe-score')
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 600000,
  args: ['--window-size=375,667', '--hide-scrollbars', '--mute-audio'],
  defaultViewport: { width: 375, height: 667 },
})
try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()))
  await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 15000 })

  const halving = await page.evaluate(async () => {
    const S = window.__SWARM
    const w = S.world
    const { spawnEnemy } = await import('/src/systems/spawn.ts')
    const { ENEMIES } = await import('/src/content/enemies.ts')
    const { tierOf } = await import('/src/core/rules.ts')
    S.loop.stop()
    S.setLoadout('nova', 'hive')
    S.startRun('endless')
    const inp = S.input
    inp.update = () => {
      inp.move.x = inp.move.y = 0
      inp.firing = false
    }
    const pl = w.player
    const quiet = () => {
      const d = w.director
      d.lullUntil = 1e9
      d.lullMin = 0
      d.beatCursor = d.warnCursor = w.script.beats.length
      d.bossBeat = -1
      for (const e of w.enemies.active) e.alive = false
      for (const p of w.enemyProjectiles.active) p.alive = false
      for (const p of w.acid.active) p.alive = false
      S.step(1)
      pl.hp = pl.maxHp
      pl.invuln = pl.hitCd = pl.biteCd = 0
      w.chain = 64
      w.tier = tierOf(64)
      w.chainT = 0
      w.contAcc = 0
    }
    const out = {}

    quiet()
    const p = w.enemyProjectiles.acquire()
    p.x = p.prevX = pl.x
    p.y = p.prevY = pl.y
    p.vx = p.vy = 0
    p.damage = 5
    p.radius = 7
    p.life = 3
    p.ownerIdx = ENEMIES.spitter.idx
    p.sprite.visible = true
    let hits = w.hits
    S.step(1)
    out.projectile = { chainBefore: 64, chainAfter: w.chain, hits: w.hits - hits, lastHitBy: w.lastHitBy === ENEMIES.spitter.idx ? 'spitter' : w.lastHitBy, pass: w.chain === 32 }

    quiet()
    const c = spawnEnemy(w, 'cinderCharger', pl.x - 12, pl.y)
    c.phase = 2
    c.stateTimer = 0.5
    c.phaseDir = 0
    c.dashHit = false
    hits = w.hits
    S.step(1)
    out.ram = { chainBefore: 64, chainAfter: w.chain, hits: w.hits - hits, lastHitBy: w.lastHitBy === ENEMIES.cinderCharger.idx ? 'cinderCharger' : w.lastHitBy, pass: w.chain === 32 && c.dashHit }

    quiet()
    spawnEnemy(w, 'swarmer', pl.x, pl.y)
    hits = w.hits
    const dmg0 = w.damageTaken
    const bites = []
    for (let t = 0; t < 60 && bites.length < 3; t++) {
      const hp = pl.hp
      S.step(1)
      if (pl.hp < hp) bites.push({ tick: t, hpTotal: +(w.damageTaken - dmg0).toFixed(2), chain: w.chain, hits: w.hits - hits })
    }
    out.contact = { chainBefore: 64, bites, pass: bites[0].hpTotal < 10 && bites[0].chain === 64 && bites[1].hpTotal >= 10 && bites[1].chain === 32 && bites[1].hits === 1 }

    quiet()
    const idle = []
    for (let t = 1; t <= 240; t++) {
      S.step(1)
      if (t === 119 || t === 120 || t === 239 || t === 240) idle.push({ tick: t, sec: +(t / 60).toFixed(3), chain: w.chain })
    }
    out.idle = { chainBefore: 64, idle, pass: idle[0].chain === 64 && idle[1].chain === 32 && idle[2].chain === 32 && idle[3].chain === 16 }
    return out
  })
  console.log(JSON.stringify({ probe: 'halving', ...halving, pass: Object.values(halving).every((v) => v.pass) }))

  const parity = await page.evaluate(async (n) => {
    const S = window.__SWARM
    const w = S.world
    const sc = await import('/src/game/scoring.ts')
    const { scoreOf } = await import('/src/core/rules.ts')
    const { buildRunResult } = await import('/src/state/runResult.ts')
    const { ENEMIES } = await import('/src/content/enemies.ts')
    const defs = Object.values(ENEMIES)
    S.loop.stop()
    let a = 0x9e3779b9
    const rnd = () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const irand = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
    // Independent model of section 5, stepping in whole ticks.
    const STEPS = [0, 10, 30, 70, 150, 300, 550, 900]
    const tier = (c) => { let t = 1; for (let i = 1; i < 8; i++) if (c >= STEPS[i]) t = i + 1; return t }
    let mismatches = 0
    let ops = 0
    let clears = 0
    let maxScore = 0
    let first = null
    for (let s = 0; s < n; s++) {
      w.beginRun(1000 + s, 'endless')
      const threat = irand(0, 4)
      w.threat = threat
      const m = { chain: 0, peak: 1, best: 0, killPts: 0, xpSum: 0, hits: 0, sinceKill: 0, acc: 0, idle: 0, clearMs: 0, hitsAtBoss: 0, flawless: 0 }
      const hit = () => { m.hits++; m.chain >>= 1 }
      const count = irand(1, 400)
      for (let k = 0; k < count; k++) {
        ops++
        const r = rnd()
        if (r < 0.55) {
          const def = defs[irand(0, defs.length - 1)]
          const weapon = rnd() < 0.9
          sc.scoreKill(w, def, weapon ? sc.KillSource?.Weapon ?? 0 : sc.KillSource?.NoScore ?? 1)
          m.xpSum += def.xp
          if (def.boss && m.hits === m.hitsAtBoss) m.flawless++
          if (weapon) {
            m.chain++
            m.sinceKill = 0
            m.best = Math.max(m.best, m.chain)
            m.killPts += 10 * def.xp * tier(m.chain)
          }
        } else if (r < 0.65) {
          sc.registerHit(w)
          hit()
        } else if (r < 0.75) {
          const hp = rnd() * 25
          sc.addContinuousDamage(w, hp)
          m.acc += hp
          m.idle = 0
          while (m.acc >= 10) { m.acc -= 10; hit() }
        } else if (r < 0.8) {
          sc.addChain(w, 15)
          m.chain += 15
          m.best = Math.max(m.best, m.chain)
        } else if (r < 0.82) {
          w.beginBossFight()
          m.hitsAtBoss = m.hits
        } else if (r < 0.83 && m.clearMs === 0) {
          w.time = 633 + rnd() * 300
          sc.scoreClear(w)
          m.clearMs = Math.round(w.time * 1000)
          clears++
        } else {
          const ticks = irand(1, 300)
          for (let t = 0; t < ticks; t++) {
            w.time += 1 / 60
            sc.scoreStep(w, 1 / 60)
            if (++m.idle >= 60) m.acc = 0
            if (++m.sinceKill >= 120) { m.sinceKill -= 120; m.chain >>= 1 }
          }
        }
        m.peak = Math.max(m.peak, tier(m.chain))
      }
      const res = buildRunResult(w, 'death', { date: '2026-09-30', ranked: false, dailyNumber: 0, paint: 'factory' })
      const server = scoreOf(res.killPts, res.xpSum, res.cleared ? res.clearMs : 0, res.threat)
      const kp = Math.min(m.killPts, 80 * m.xpSum)
      const cb = m.clearMs > 0 ? 50000 + 100 * Math.max(0, 840 - Math.floor(m.clearMs / 1000)) : 0
      const model = Math.floor(((kp + cb) * (10 + 2 * threat)) / 10)
      maxScore = Math.max(maxScore, w.score)
      const ok = w.score === server && w.score === model && res.score === w.score && res.killPts === m.killPts && res.xpSum === m.xpSum &&
        res.hits === m.hits && w.chain === m.chain && res.bestChain === m.best && res.peakTier === m.peak && res.bossesFlawless === m.flawless
      if (!ok) {
        mismatches++
        if (!first) first = { seq: s, client: w.score, server, model, killPts: [res.killPts, m.killPts], chain: [w.chain, m.chain], hits: [res.hits, m.hits], peak: [res.peakTier, m.peak], best: [res.bestChain, m.best], flawless: [res.bossesFlawless, m.flawless] }
      }
    }
    return { sequences: n, ops, clears, maxScore, mismatches, first }
  }, SEQUENCES)
  console.log(JSON.stringify({ probe: 'parity', ...parity, pass: parity.mismatches === 0 }))
  if (pageErrors.length) console.log(JSON.stringify({ pageErrors }))
} finally {
  await browser.close()
}
