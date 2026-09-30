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
//                                  per world with an FNV hash of enemies, player, progress,
//                                  director state and all 7 RNG stream states. Default
//                                  world: all three. Hashes MUST match across viewports,
//                                  DPR, injected settings and reruns (hard invariant).
//   det-death [charId] [arenaId|all] [seconds]
//                                  real HP: the det bot (no flood) plays until it dies
//                                  or `seconds` pass (default 600), the run ends through
//                                  endRun ('death' after 60 death-sequence ticks, else
//                                  'quit'), and one FNV hash covers the RunResult (all
//                                  fields but date, ranked and paint) and all 7 RNG stream
//                                  states. Same invariant as det.
//   det-long [charId] [arenaId|all] [seconds]
//                                  the full run arc: invincible, no flood, move
//                                  (cos 0.7t, sin 0.9t), aim at the nearest enemy, fire
//                                  always, pick card 1, `seconds` of sim (default 780 =
//                                  12:00 + 60 s). Same hash, same invariant as det.
//   rerolls [arenaId|all] [seconds]
//                                  P5 reroll independence: the det-long bot plays
//                                  `seconds` (default 180) twice per world with the same
//                                  forced picks (a fixed perk order, whatever the cards
//                                  show), once with 0 rerolls and once rerolling twice on
//                                  every draft that still has rerolls. The spawn and loot
//                                  stream states and the field must be equal. (The draft
//                                  stream is reseeded per roll, so it only shows the last.)
//   opening [viewW viewH]          A1 opening probe: 5 seeds per world, stationary, aim
//                                  at the nearest enemy in view. Reports first enemy in
//                                  view, first kill and empty-view seconds over the first
//                                  60 s. The view is the camera's world view at W x H
//                                  (W / baseZoom by H / baseZoom) unless viewW viewH
//                                  override it.
//   ringview [arenaId|all] [seconds]
//                                  C27 check: the det-long bot plays `seconds` (default
//                                  300, so the 4:00 boss fight is in it). Every non-boss
//                                  spawn on the spawn ring is tested against the camera
//                                  this W x H device gets, with the look-ahead, touch
//                                  portrait bias and boss pull fully blended in: centered
//                                  (kbm, no aim), aim (kbm, 8 aim directions) and touch
//                                  (portrait only, 9 aims). Counts spawns whose body is
//                                  inside the view and the deepest overlap in world units;
//                                  visibleNoWallClamp repeats the test without the arena
//                                  clamp, to separate the offsets from the wall effect.
//   perf [charId] [arenaId]        6s live combat at flood(500) + auto-fire; reports
//                                  fps / p95 / max / long(>20ms) / bad(>33.4ms) frames.
//                                  Drafts are answered with card 1 and the field is kept
//                                  at 500, so the sim runs for the whole window
//                                  (simTimeStart, simTimeEnd and picks in the output show it did).
//   perf-final [charId] [arenaId]  S.jumpTo(600) (the FINAL SWARM beat fires at once),
//                                  then 10 s of live combat; same stats plus peak alive.
//   thrash                         perf variant re-injecting layout thrash (A/B baseline).
//   shot <charId> <arenaId> <out>  screenshot of live combat with a varied enemy pack
//                                  pulled into view (for visual audits / galleries).
//   --dpr=N                        device pixel ratio for the page (default 1).
//   --settings=JSON                settings merged into the save before boot, e.g.
//                                  '{"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
//   --mode=daily                   det / det-long / det-death start Daily runs (the date
//                                  picks the pilot, world and threat, so the pilot and
//                                  arena arguments are ignored). Each result line carries
//                                  `offers`, a hash of every draft's cards, and the run's
//                                  Daily identity.
//   --date=YYYY-MM-DD              with --mode=daily: play that day's Daily (default today).
//   --save=unlocked                det modes own every feat reward first, so Standard
//                                  drafts and drops from the canonical pools (default:
//                                  the fresh save plus the pilot and world, the start pools).
//                                  A 600-step det hashes the same for both saves, so it
//                                  cannot show a pool difference; det-long and det-death can.
//   --perks=a,b,...                perf modes take these perks and fusions at run start
//                                  (P8: --perks=cryo_rounds,explosive_rounds,f_shatter).
//   --paint=<id>                   det modes fly this paint (granted first). Paints are
//                                  cosmetic, so the hash must not change.
//                                  Every det pass restores the owned set it started from,
//                                  so a feat granted by pass 1 (det-death ends the run)
//                                  never changes pass 2's pools.
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
const RUN_MODE = flags.mode === 'daily' ? 'daily' : 'endless'
const DAILY_DATE = flags.date || null
const SAVE_PREP = { unlocked: flags.save === 'unlocked', paint: flags.paint || null }
const PERF_PERKS = flags.perks ? flags.perks.split(',') : []
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// In-page determinism driver. Installed with page.evaluate(DET_HELPER); state
// lives on window.__DET between chunked run() calls so a 13-minute run never
// hits the protocol timeout. The render loop is stopped so only run() steps the
// sim. Input is a pure function of sim state.
const DET_HELPER = `(() => {
  const S = window.__SWARM
  const w = S.world
  const inp = S.input
  const PREP = ${JSON.stringify(SAVE_PREP)}
  const DATE = ${JSON.stringify(DAILY_DATE)}
  let st = null
  let owned = null
  const nearest = () => {
    const pl = w.player
    let best = null
    let bd = Infinity
    for (const e of w.enemies.active) {
      if (!e.alive || e.submerged) continue
      const d2 = (e.x - pl.x) ** 2 + (e.y - pl.y) ** 2
      if (d2 < bd) { bd = d2; best = e }
    }
    return best ? [best, Math.sqrt(bd) || 1] : null
  }
  const DASH_TICKS = [60, 200, 330, 331]
  const FORCED = ['heavy_rounds', 'twin_shot', 'adrenaline', 'piercing', 'vitality', 'regrowth', 'cryo_rounds', 'magnetic']
  const MAX_OF = { heavy_rounds: 5, twin_shot: 3, adrenaline: 5, piercing: 4, vitality: 5, regrowth: 4, cryo_rounds: 3, magnetic: 3 }
  const botShort = () => {
    if (DASH_TICKS.includes(st.tick)) inp.pressDash()
    st.tick++
    const pl = w.player
    const n = nearest()
    if (n) {
      inp.aimDir.x = (n[0].x - pl.x) / n[1]
      inp.aimDir.y = (n[0].y - pl.y) / n[1]
      inp.firing = true
    } else {
      inp.aimDir.x = 0
      inp.aimDir.y = 0
      inp.firing = false
    }
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
  const botLong = () => {
    const pl = w.player
    const n = nearest()
    inp.firing = true
    if (n) {
      inp.aimDir.x = (n[0].x - pl.x) / n[1]
      inp.aimDir.y = (n[0].y - pl.y) / n[1]
    } else {
      inp.aimDir.x = 1
      inp.aimDir.y = 0
    }
    inp.move.x = Math.cos(0.7 * w.time)
    inp.move.y = Math.sin(0.9 * w.time)
  }
  const identity = () => {
    let h = 0x811c9dc5
    const all = st.offers.join('|')
    for (let i = 0; i < all.length; i++) { h ^= all.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    const r = w.run
    return {
      offers: (h >>> 0).toString(16), offerCount: st.offers.length, firstOffers: st.offers.slice(0, 3),
      daily: r.mode === 'daily' ? { date: r.date, number: r.dailyNumber, ranked: r.ranked, pilot: r.character.id, world: r.theme.id, threat: r.threat, seed: r.seed } : null,
    }
  }
  window.__DET = {
    start(c, a, runMode, long, realHp, rerolls = -1) {
      S.loop.stop()
      if (owned === null) {
        if (PREP.unlocked) S.unlockAll()
        if (PREP.paint) S.setPaint(PREP.paint)
        owned = S.loadJSON('unlocks', [])
      } else {
        S.saveJSON('unlocks', owned)
      }
      if (runMode !== 'daily') {
        S.setLoadout(c, a)
        S.startRun(runMode)
      } else if (DATE) {
        S.startDaily(DATE)
      } else {
        S.startRun('daily')
      }
      st = { drafts: 0, bosses: 0, realUpdate: inp.update, wasBoss: false, tick: 0, realHp: !!realHp, rerolls, rerollsUsed: 0, offers: [] }
      if (!realHp) {
        w.player.maxHp = 1e9
        w.player.hp = 1e9
        if (!long) S.flood(200)
      }
      inp.update = long ? botLong : botShort
    },
    run(n) {
      for (let i = 0; i < n; i++) {
        if (st.realHp && w.pendingGameOver) return true
        S.step(1)
        while (w.paused && w.draft.open) {
          st.drafts++
          st.offers.push(w.draft.cards.slice(0, w.draft.count).map((c) => c.id).join(','))
          if (st.rerolls < 0) {
            S.pickCard(0)
            continue
          }
          for (let r = 0; r < st.rerolls && w.draft.rerolls > 0; r++) {
            S.reroll()
            st.rerollsUsed++
          }
          const next = FORCED.find((id) => (w.perkStacks.get(id) ?? 0) < MAX_OF[id])
          if (next) S.forcePick(next)
          else S.skip()
        }
        if (w.bossAlive && !st.wasBoss) st.bosses++
        st.wasBoss = w.bossAlive
        if (!st.realHp) {
          w.player.maxHp = 1e9
          w.player.hp = 1e9
        }
      }
      return st.realHp && w.pendingGameOver
    },
    /** det-death: end the run through endRun and hash its RunResult and the streams. */
    finishDeath() {
      const dead = w.pendingGameOver
      if (dead) S.step(60)
      S.endRun(dead ? 'death' : 'quit', 'recap')
      inp.update = st.realUpdate
      const r = S.lastResult
      let h = 0x811c9dc5
      const byte = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193) }
      const mix32 = (v) => { byte(v); byte(v >>> 8); byte(v >>> 16); byte(v >>> 24) }
      // date, ranked and paint are run identity, not sim: a Daily's second pass
      // is practice, and a Daily flown in any paint must hash the same.
      const { date, ranked, paint, ...rest } = r
      const canon = JSON.stringify(rest)
      for (let i = 0; i < canon.length; i++) byte(canon.charCodeAt(i))
      const streams = {}
      for (const k of ['spawn', 'script', 'boss', 'loot', 'draft', 'combat', 'fx']) {
        const s = w.rngs[k].state
        mix32(s)
        streams[k] = s.toString(16)
      }
      return { hash: (h >>> 0).toString(16), result: rest, streams, drafts: st.drafts, screen: S.screen, ...identity() }
    },
    finish() {
      inp.update = st.realUpdate
      let h = 0x811c9dc5
      const byte = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193) }
      const mix = (n) => { const v = Math.round(n * 16); byte(v); byte(v >> 8); byte(v >> 16); byte(v >> 24) }
      const mix32 = (v) => { byte(v); byte(v >>> 8); byte(v >>> 16); byte(v >>> 24) }
      const byType = {}
      let streams_ = 0
      let affixed = 0
      for (const e of w.enemies.active) {
        mix(e.x); mix(e.y); mix(e.hp); mix32(e.uid); byte(e.affix); byte(e.stream ? 1 : 0)
        byType[e.def.id] = (byType[e.def.id] ?? 0) + 1
        if (e.stream) streams_++
        if (e.affix) affixed++
      }
      for (const p of w.pickups.active) { mix(p.x); mix(p.y); mix(p.xp) }
      mix(w.player.x); mix(w.player.y)
      mix(w.kills); mix(w.level); mix(w.xp); mix(w.time); mix(w.ammo)
      mix(w.projectiles.size); mix(w.enemyProjectiles.size); mix(w.acid.size); mix(w.particles.size)
      mix(w.dashes); mix(w.closeCalls); mix(w.dashCharges); mix(w.dashRecharge)
      const dr = w.draft
      mix(dr.index); mix(dr.rerolls); mix(dr.banishes); mix(dr.sinceRare); mix(w.pendingLevelUps)
      mix(w.xpDropped); mix(w.xpCollected); mix(w.lastLevelAt)
      mix(w.score); mix(w.killPts); mix(w.xpSum); mix(w.chain); mix(w.tier); mix(w.hits); mix(w.longestNoHit)
      for (const ch of w.weapon.id) byte(ch.charCodeAt(0))
      for (const [id, n] of w.perkStacks) { for (const ch of id) byte(ch.charCodeAt(0)); mix(n) }
      const d = w.director
      const director = {
        beat: d.beatCursor, warn: d.warnCursor, pulseT: +d.pulseT.toFixed(3), topupAcc: +d.topupAcc.toFixed(3),
        lullUntil: d.lullUntil, bossBeat: d.bossBeat, lastBossKillAt: d.lastBossKillAt > 0 ? +d.lastBossKillAt.toFixed(2) : null,
        deferred: Array.from(d.deferred),
        runState: d.runState, bossesKilled: d.bossesKilled, cage: d.cage.active ? Math.round(d.cage.r) : 0, hazards: w.hazards.active.length,
        eventsActive: d.events.filter((r) => r.active).length, streamUnits: streams_, affixedElites: affixed,
        fired: Array.from(d.firedAt.slice(0, w.script.beats.length), (f) => (Number.isNaN(f) ? null : +f.toFixed(2))),
      }
      mix(d.beatCursor); mix(d.warnCursor); mix(d.pulseT); mix(d.topupAcc); mix(d.lullUntil); mix(d.bossBeat)
      mix(d.lastBossKillAt > 0 ? d.lastBossKillAt : 0)
      for (let k = 0; k < d.deferred.length; k++) mix(d.deferred[k])
      for (const r of d.events) { byte(r.active ? 1 : 0); mix(r.beat); mix(r.wait); mix(r.emitted); mix(r.t); mix(r.ang); mix(r.ox); mix(r.oy) }
      for (let k = 0; k < w.script.beats.length; k++) { mix(Number.isNaN(d.firedAt[k]) ? -2 : d.firedAt[k]); byte(d.warned[k]) }
      for (let k = 0; k < d.beatAng.length; k++) { mix(d.beatAng[k]); mix(d.beatAffix[k]) }
      mix(w.boss ? w.boss.hp : -1); mix(st.bosses)
      const bf = w.bossFight
      mix(bf.state); mix(bf.phase); mix(bf.rot); mix(bf.stateT)
      mix(d.cage.active ? 1 : 0); mix(d.cage.x); mix(d.cage.y); mix(d.cage.r); mix(d.frenzy); mix(d.broodCount); mix(d.bossesKilled)
      for (const ch of d.runState) byte(ch.charCodeAt(0))
      for (const hz of w.hazards.active) { mix(hz.x); mix(hz.y); mix(hz.tele); mix(hz.shape) }
      const streams = {}
      for (const k of ['spawn', 'script', 'boss', 'loot', 'draft', 'combat', 'fx']) {
        const s = w.rngs[k].state
        mix32(s)
        streams[k] = s.toString(16)
      }
      return {
        hash: (h >>> 0).toString(16), arena: w.arenaTheme.id, enemies: w.enemies.active.length, kills: w.kills,
        level: w.level, drafts: st.drafts, pickups: w.pickups.active.length, time: +w.time.toFixed(2),
        bosses: st.bosses, director, byType, streams,
        dashes: w.dashes, closeCalls: w.closeCalls, damageTaken: Math.round(w.damageTaken),
        rerollsUsed: st.rerollsUsed, xpDropped: +w.xpDropped.toFixed(1), xpCollected: +w.xpCollected.toFixed(1),
        perks: Object.fromEntries(w.perkStacks),
        score: w.score, chain: w.chain, peakTier: w.peakTier, hits: w.hits, ...identity(),
      }
    },
  }
})()`

await acquireChromeLock('measure')
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 900000,
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
} else if (MODE === 'det' || MODE === 'det-long') {
  // Runs the same (seed, pilot, arena) sim TWICE in one page: hash1 must equal
  // hash2 (catches state leaking across beginRun), and both must match the
  // other-viewport / other-settings invocations (device independence).
  const long = MODE === 'det-long'
  const charId = pos[3] || 'nova'
  const arenaArg = pos[4] || 'all'
  const steps = long ? Math.round(parseFloat(pos[5] || '780') * 60) : parseInt(pos[5] || '600')
  const arenas = RUN_MODE === 'daily' ? ['daily'] : arenaArg === 'all' ? ['hive', 'depths', 'wastes'] : [arenaArg]
  const applied = await page.evaluate(() => window.__SWARM.settings)
  await page.evaluate(DET_HELPER)
  const CHUNK = 3600
  for (const arenaId of arenas) {
    const runs = []
    for (let pass = 0; pass < 2; pass++) {
      await page.evaluate((c, a, m, lg) => window.__DET.start(c, a, m, lg), charId, arenaId, RUN_MODE, long)
      for (let done = 0; done < steps; done += CHUNK) {
        await page.evaluate((n) => window.__DET.run(n), Math.min(CHUNK, steps - done))
      }
      runs.push(await page.evaluate(() => window.__DET.finish()))
    }
    const r = runs[0]
    console.log(JSON.stringify({
      mode: MODE, runMode: RUN_MODE, W, H, dpr: DPR, settings: SETTINGS ? applied : null, charId, arenaId: r.arena, steps,
      hash: r.hash, rerunMatch: r.hash === runs[1].hash && r.offers === runs[1].offers, save: flags.save || 'fresh', paint: flags.paint || 'factory',
      offers: r.offers, offerCount: r.offerCount, firstOffers: r.firstOffers, daily: r.daily, enemies: r.enemies, kills: r.kills, level: r.level,
      drafts: r.drafts, dashes: r.dashes, closeCalls: r.closeCalls, damageTaken: r.damageTaken,
      score: r.score, chain: r.chain, peakTier: r.peakTier, hits: r.hits, pickups: r.pickups, time: r.time, bosses: r.bosses, director: r.director, streams: r.streams, byType: r.byType,
    }))
  }
  if (pageErrors.length) console.log(JSON.stringify({ mode: MODE, pageErrors }))
} else if (MODE === 'det-death') {
  const charId = pos[3] || 'nova'
  const arenaArg = pos[4] || 'all'
  const steps = Math.round(parseFloat(pos[5] || '600') * 60)
  const arenas = RUN_MODE === 'daily' ? ['daily'] : arenaArg === 'all' ? ['hive', 'depths', 'wastes'] : [arenaArg]
  const applied = await page.evaluate(() => window.__SWARM.settings)
  await page.evaluate(DET_HELPER)
  const CHUNK = 3600
  for (const arenaId of arenas) {
    const runs = []
    for (let pass = 0; pass < 2; pass++) {
      await page.evaluate((c, a, m) => window.__DET.start(c, a, m, false, true), charId, arenaId, RUN_MODE)
      for (let done = 0; done < steps; done += CHUNK) {
        if (await page.evaluate((n) => window.__DET.run(n), Math.min(CHUNK, steps - done))) break
      }
      runs.push(await page.evaluate(() => window.__DET.finishDeath()))
    }
    const r = runs[0]
    const x = r.result
    console.log(JSON.stringify({
      mode: MODE, runMode: RUN_MODE, W, H, dpr: DPR, settings: SETTINGS ? applied : null, charId, arenaId: x.arena,
      hash: r.hash, rerunMatch: r.hash === runs[1].hash && r.offers === runs[1].offers, save: flags.save || 'fresh', paint: flags.paint || 'factory', screen: r.screen, end: x.end, time: +x.time.toFixed(2),
      offers: r.offers, offerCount: r.offerCount, daily: r.daily,
      kills: x.kills, level: x.level, score: x.score, killPts: x.killPts, xpSum: x.xpSum, bestChain: x.bestChain,
      peakTier: x.peakTier, hits: x.hits, damageTaken: x.damageTaken, killer: x.killer, nextBeat: x.nextBeat,
      revivesUsed: x.revivesUsed, podsEquipped: x.podsEquipped, weapons: x.weapons, drafts: r.drafts, streams: r.streams,
    }))
  }
  if (pageErrors.length) console.log(JSON.stringify({ mode: MODE, pageErrors }))
} else if (MODE === 'rerolls') {
  const arenaArg = pos[3] || 'all'
  const steps = Math.round(parseFloat(pos[4] || '180') * 60)
  const arenas = arenaArg === 'all' ? ['hive', 'depths', 'wastes'] : [arenaArg]
  await page.evaluate(DET_HELPER)
  for (const arenaId of arenas) {
    const runs = []
    for (const rerolls of [0, 2]) {
      await page.evaluate((a, r) => window.__DET.start('nova', a, 'endless', true, false, r), arenaId, rerolls)
      for (let done = 0; done < steps; done += 3600) await page.evaluate((n) => window.__DET.run(n), Math.min(3600, steps - done))
      runs.push(await page.evaluate(() => window.__DET.finish()))
    }
    const [a, b] = runs
    const same = (k) => JSON.stringify(a[k]) === JSON.stringify(b[k])
    const pass = a.streams.spawn === b.streams.spawn && a.streams.loot === b.streams.loot &&
      same('perks') && a.kills === b.kills && a.enemies === b.enemies && a.pickups === b.pickups && b.rerollsUsed > 0
    console.log(JSON.stringify({
      mode: MODE, arenaId, seconds: steps / 60, drafts: [a.drafts, b.drafts], rerollsUsed: [a.rerollsUsed, b.rerollsUsed],
      spawn: [a.streams.spawn, b.streams.spawn], loot: [a.streams.loot, b.streams.loot], draft: [a.streams.draft, b.streams.draft],
      kills: [a.kills, b.kills], level: [a.level, b.level], enemies: [a.enemies, b.enemies], pickups: [a.pickups, b.pickups],
      samePerks: same('perks'), pass,
    }))
  }
  if (pageErrors.length) console.log(JSON.stringify({ mode: MODE, pageErrors }))
} else if (MODE === 'opening') {
  const zoom = await page.evaluate(() => window.__SWARM.camera.baseZoom)
  const view = [parseFloat(pos[3]) || +(W / zoom).toFixed(1), parseFloat(pos[4]) || +(H / zoom).toFixed(1)]
  const res = await page.evaluate((hw, hh) => {
    const S = window.__SWARM
    S.loop.stop()
    const out = {}
    for (const arena of ['hive', 'depths', 'wastes']) {
      for (const seed of [777, 1001, 2002, 3003, 4004]) {
        S.setLoadout('nova', arena)
        S.startRun('endless')
        const w = S.world
        S.beginSeed(seed)
        w.player.maxHp = w.player.hp = 1e9
        const inView = (e) => e.alive && !e.submerged && Math.abs(e.x - w.player.x) < hw && Math.abs(e.y - w.player.y) < hh
        const realUpdate = S.input.update
        S.input.update = () => {
          const pl = w.player
          let best = null
          let bd = Infinity
          for (const e of w.enemies.active) {
            if (!inView(e)) continue
            const d = Math.hypot(e.x - pl.x, e.y - pl.y)
            if (d < bd) { bd = d; best = e }
          }
          S.input.move.x = S.input.move.y = 0
          if (best) {
            S.input.aimDir.x = (best.x - pl.x) / bd
            S.input.aimDir.y = (best.y - pl.y) / bd
            S.input.firing = true
          } else {
            S.input.aimDir.x = S.input.aimDir.y = 0
            S.input.firing = false
          }
        }
        const r = { firstInView: null, firstKill: null, emptyViewSec: 0 }
        try {
          while (w.time < 60) {
            const t0 = w.time
            S.step(1)
            while (w.paused && w.draft.open) S.pickCard(0)
            w.player.maxHp = w.player.hp = 1e9
            if (w.time === t0) continue
            if (w.enemies.active.some(inView)) {
              if (r.firstInView === null) r.firstInView = +w.time.toFixed(2)
            } else r.emptyViewSec += 1 / 60
            if (r.firstKill === null && w.kills > 0) r.firstKill = +w.time.toFixed(2)
          }
        } finally {
          S.input.update = realUpdate
        }
        r.emptyViewSec = +r.emptyViewSec.toFixed(2)
        r.killsAt60 = w.kills
        r.levelAt60 = w.level
        out[arena + '_' + seed] = r
      }
    }
    return out
  }, view[0] / 2, view[1] / 2)
  const worst = { firstInView: 0, firstKill: 0, emptyViewSec: 0 }
  for (const [k, v] of Object.entries(res)) {
    console.log(JSON.stringify({ mode: 'opening', W, H, view, run: k, ...v }))
    for (const m of Object.keys(worst)) worst[m] = Math.max(worst[m], v[m] ?? Infinity)
  }
  const pass = worst.firstInView <= 1.0 && worst.firstKill <= 2.5 && worst.emptyViewSec <= 2.0
  console.log(JSON.stringify({ mode: 'opening', W, H, view, worst, pass }))
  if (pageErrors.length) console.log(JSON.stringify({ mode: 'opening', pageErrors }))
} else if (MODE === 'ringview') {
  const arenaArg = pos[3] || 'hive'
  const seconds = parseFloat(pos[4] || '300')
  const arenas = arenaArg === 'all' ? ['hive', 'depths', 'wastes'] : [arenaArg]
  await page.evaluate(DET_HELPER)
  for (const arenaId of arenas) {
    await page.evaluate((a) => window.__DET.start('nova', a, 'endless', true), arenaId)
    const r = await page.evaluate(async (steps) => {
      const S = window.__SWARM
      const w = S.world
      const { RING_NEAR, RING_STD, RING_NEAR_UNTIL } = await import('/src/config.ts')
      const cam = new S.camera.constructor()
      const sw = S.app.screen.width
      const sh = S.app.screen.height
      cam.resize(sw, sh)
      const touches = sh > sw ? [false, true] : [false]
      const AIMS = [[0, 0]]
      for (let k = 0; k < 8; k++) AIMS.push([Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)])
      const cls = ['centered', 'aim', 'touch']
      const out = { ring: 0, elites: 0, duringBoss: 0, visible: {}, visibleDuringBoss: 0, visibleNoWallClamp: 0, maxInside: {}, worst: {} }
      const NO_WALLS = { x: -1e5, y: -1e5, w: 2e5, h: 2e5 }
      for (const c of cls) { out.visible[c] = 0; out.maxInside[c] = 0 }
      const depth = (e) => {
        const rr = e.radius
        return Math.min(e.x + rr - cam.x, cam.x + cam.w - (e.x - rr), e.y + rr - cam.y, cam.y + cam.h - (e.y - rr))
      }
      for (let i = 0; i < steps; i++) {
        const seq = w.enemyUidSeq
        const ring = w.time < RING_NEAR_UNTIL ? RING_NEAR : RING_STD
        window.__DET.run(1)
        const pl = w.player
        const boss = w.bossAlive && w.boss ? w.boss : null
        for (const e of w.enemies.active) {
          if (e.uid < seq || !e.alive || e.def.boss) continue
          if (Math.max(Math.abs(e.x - pl.x) / ring.halfW, Math.abs(e.y - pl.y) / ring.halfH) < 0.9) continue
          out.ring++
          if (e.def.elite) out.elites++
          if (boss) out.duringBoss++
          const hit = { centered: 0, aim: 0, touch: 0 }
          let open = 0
          for (const touch of touches) {
            for (let a = 0; a < AIMS.length; a++) {
              // A 100 s update settles the eased look-ahead and fight blend.
              cam.reset()
              cam.update(100, pl.x, pl.y, AIMS[a][0], AIMS[a][1], touch, boss, w.arena.bounds)
              const c = touch ? 'touch' : a === 0 ? 'centered' : 'aim'
              hit[c] = Math.max(hit[c], depth(e))
              // The same view with no wall clamp: what the offsets alone expose.
              cam.reset()
              cam.update(100, pl.x, pl.y, AIMS[a][0], AIMS[a][1], touch, boss, NO_WALLS)
              open = Math.max(open, depth(e))
            }
          }
          if (open > 0) out.visibleNoWallClamp++
          for (const c of cls) {
            if (hit[c] <= 0) continue
            out.visible[c]++
            if (hit[c] > out.maxInside[c]) {
              const b = w.arena.bounds
              out.maxInside[c] = Math.round(hit[c])
              out.worst[c] = {
                t: +w.time.toFixed(2), id: e.def.id, dx: Math.round(e.x - pl.x), dy: Math.round(e.y - pl.y), boss: !!boss,
                wall: [Math.round(pl.y - b.y), Math.round(b.x + b.w - pl.x), Math.round(b.y + b.h - pl.y), Math.round(pl.x - b.x)],
              }
            }
          }
          if (boss && (hit.centered > 0 || hit.aim > 0 || hit.touch > 0)) out.visibleDuringBoss++
        }
      }
      cam.reset()
      cam.update(100, 0, 0, 0, 0, false, null, NO_WALLS)
      out.view = [Math.round(cam.w), Math.round(cam.h)]
      out.rings = { near: RING_NEAR, std: RING_STD }
      out.time = +w.time.toFixed(1)
      return out
    }, Math.round(seconds * 60))
    const pass = r.visible.centered + r.visible.aim + r.visible.touch === 0
    console.log(JSON.stringify({ mode: 'ringview', W, H, arenaId, ...r, pass }))
  }
  if (pageErrors.length) console.log(JSON.stringify({ mode: 'ringview', pageErrors }))
} else {
  // perf [charId] [arenaId]: live combat in any world (default nova/hive).
  // perf-final: the same live measure from the FINAL SWARM beat (10 s).
  const final = MODE === 'perf-final'
  const pChar = pos[3] || 'nova'
  const pArena = pos[4] || 'hive'
  await page.evaluate((c, a, fin, perks) => {
    const S = window.__SWARM
    S.setLoadout(c, a)
    S.startRun('endless')
    for (const id of perks) S.world.choosePerk(id)
    S.world.player.maxHp = 1e9
    S.world.player.hp = 1e9
    S.input.autoFire = true
    S.give('hailstorm')
    if (fin) {
      S.jumpTo(600)
      return
    }
    S.flood(500)
    S.step(90 * 60) // deep into the run: full roster, elites, projectile hail
  }, pChar, pArena, final, PERF_PERKS)
  // Keep the window live: a level-up draft would otherwise pause the sim about
  // 0.5 s in and the stats would time a frozen scene. Drafts are answered with
  // card 1 (as the det bot does), the ship stays invincible (a pick recomputes
  // maxHp), and perf tops the field back up to 500.
  await page.evaluate((fin) => {
    const S = window.__SWARM
    const w = S.world
    window.__PERF_PICKS = 0
    const keepLive = () => {
      if (w.paused && w.draft.open) {
        S.pickCard(0)
        window.__PERF_PICKS++
      }
      w.player.maxHp = 1e9
      w.player.hp = 1e9
      if (!fin && w.enemies.size < 500) S.flood(500 - w.enemies.size)
      requestAnimationFrame(keepLive)
    }
    requestAnimationFrame(keepLive)
  }, final)
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
  let peakAlive = 0
  if (final) {
    await page.evaluate(() => { window.__SWARM.perfReset(); window.__PERF_T0 = window.__SWARM.world.time })
    const t0 = Date.now()
    for (let i = 0; Date.now() - t0 < 10000; i++) {
      await page.mouse.move(W / 2 + Math.sin(i * 0.7) * 320, H / 2 + Math.cos(i * 0.9) * 200, { steps: 20 })
      peakAlive = Math.max(peakAlive, await page.evaluate(() => window.__SWARM.world.enemies.size))
    }
  } else {
    await page.mouse.move(W / 2 + 180, H / 2 + 40)
    await new Promise((r) => setTimeout(r, 1200))
    await page.evaluate(() => { window.__SWARM.perfReset(); window.__PERF_T0 = window.__SWARM.world.time })
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(W / 2 + Math.sin(i * 0.7) * 320, H / 2 + Math.cos(i * 0.9) * 200, { steps: 40 })
      await new Promise((r) => setTimeout(r, 210))
    }
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
      simTimeStart: +window.__PERF_T0.toFixed(1),
      simTimeEnd: +S.world.time.toFixed(1),
      picks: window.__PERF_PICKS,
    }
  })
  console.log(JSON.stringify({ mode: MODE, W, H, ...(PERF_PERKS.length ? { perks: PERF_PERKS } : {}), gl: String(glInfo).slice(0, 60), ...stats, ...(final ? { peakAlive, simTime: +(await page.evaluate(() => window.__SWARM.world.time)).toFixed(1) } : {}) }))
}
await browser.close()
