// P12b in-game probe (docs/NEXT-LEVEL.md 7.4, 10.3): boots the DEV build and
// checks feats, pools, paints and the v2 migration through window.__SWARM.
//   1. A fresh save boots with no toast, Standard gets the 21-perk / 6-weapon
//      start pools and the Daily the canonical 31 / 11, and the first 10 s run
//      finishes FIRST CONTACT through the real endRun.
//   2. Standard never drafts a locked perk and never drops a locked weapon:
//      bot runs on a fresh save (every pilot, every world) record every card of
//      every roll (picks, rerolls, banishes) and every weapon pod.
//   3. The acceptance save (unlocks ember + depths, best:world:hive 200 s / 900
//      kills) boots with EMBER and DEPTHS, feats #4 #6 #10 done, every perk and
//      weapon owned, and the welcome toast.
//   4. A paint flies: hull, base weapon bullets, RunResult.paint.
// Usage: SWG_URL=http://localhost:5212 node scripts/probe-meta.mjs [simSecondsPerRun=240]
import puppeteer from 'puppeteer-core'
import assert from 'node:assert/strict'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SECONDS = parseInt(process.argv[2] || '240')
const LOCKED_PERKS = ['giant_slayer', 'berserker', 'overpressure', 'second_wind', 'glass_cannon', 'incendiary', 'adrenal_wake', 'slipstream', 'quartermaster', 'hollow_point']
const START_WEAPONS = ['smg', 'shotgun', 'minigun', 'plasma', 'flamethrower', 'rocket']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await acquireChromeLock('probe-meta')
let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
} catch (e) {
  console.error('launch failed, retrying in 10 s:', e.message)
  await sleep(10000)
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
}
const errors = []

/** A fresh profile holding `save` (unprefixed keys), booted at 375x667. */
async function open(save = {}) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument((save) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.clear()
    for (const [k, v] of Object.entries(save)) localStorage.setItem('swarmgeddon:' + k, JSON.stringify(v))
  }, save)
  await page.goto(ORIGIN + '/?seed=777', { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  return { ctx, page }
}

const out = {}
try {
  // 1. Fresh save.
  {
    const { ctx, page } = await open()
    out.fresh = await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      const r = { metaV: S.loadJSON('meta:v', 0), toast: S.toast.view.visible }
      S.loop.stop()
      S.startRun('endless')
      r.standard = { perks: w.perkPool.length, weapons: [...w.weaponPool], paint: S.runPaint, bullet: w.baseBulletTint }
      S.startRun('daily')
      r.daily = { perks: w.perkPool.length, weapons: w.weaponPool.length }
      S.startRun('endless')
      w.player.maxHp = w.player.hp = 1e9
      S.step(10 * 60 + 1)
      while (w.paused && w.draft.open) { S.pickCard(0); S.step(1) }
      S.endRun('quit')
      const feats = S.loadJSON('feats', { done: {} })
      r.firstRun = { time: S.lastResult.time, runs: S.loadJSON('stats', {}).runs, done: Object.keys(feats.done), owned: S.loadJSON('unlocks', []), screen: S.screen }
      return r
    })
    assert.equal(out.fresh.metaV, 2)
    assert.equal(out.fresh.toast, false)
    assert.equal(out.fresh.standard.perks, 21)
    assert.deepEqual(out.fresh.standard.weapons, START_WEAPONS)
    assert.equal(out.fresh.daily.perks, 31)
    assert.equal(out.fresh.daily.weapons, 11)
    assert.ok(out.fresh.firstRun.done.includes('first_contact'), 'FIRST CONTACT on the first 10 s run')
    assert.ok(out.fresh.firstRun.owned.includes('paint:static'))
    console.log('PASS 1 fresh save', JSON.stringify(out.fresh))
    await ctx.close()
  }

  // 2. Standard drafts and drops only owned content.
  {
    const { ctx, page } = await open()
    out.pools = []
    for (const [pilot, world, seed] of [['nova', 'hive', 11], ['ember', 'depths', 22], ['vesper', 'wastes', 33], ['nova', 'depths', 44], ['ember', 'hive', 55]]) {
      const r = await page.evaluate((pilot, world, seed, secs) => {
        const S = window.__SWARM
        const w = S.world
        S.loop.stop()
        S.saveJSON('unlocks', [pilot, world])
        S.setLoadout(pilot, world)
        S.startRun('endless')
        // A new seed per run: beginRun resets the pools to the canonical ones,
        // so the ones startRun resolved go back on, as startRun does.
        const perkPool = w.perkPool
        const weaponPool = w.weaponPool
        w.beginRun(seed, 'endless', w.character, w.arenaTheme)
        w.perkPool = perkPool
        w.weaponPool = weaponPool
        const inp = S.input
        const real = inp.update
        let rnd = seed
        const rand = () => ((rnd = (Math.imul(rnd, 1664525) + 1013904223) >>> 0) / 2 ** 32)
        inp.update = () => {
          const pl = w.player
          let best = null
          let bd = Infinity
          for (const e of w.enemies.active) {
            const d = (e.x - pl.x) ** 2 + (e.y - pl.y) ** 2
            if (d < bd) { bd = d; best = e }
          }
          inp.firing = !!best
          if (best) { const d = Math.sqrt(bd) || 1; inp.aimDir.x = (best.x - pl.x) / d; inp.aimDir.y = (best.y - pl.y) / d }
          let pod = null
          for (const p of w.pickups.active) if (p.alive && (p.kind === 'weapon' || !pod)) pod = p
          if (pod) { const d = Math.hypot(pod.x - pl.x, pod.y - pl.y) || 1; inp.move.x = (pod.x - pl.x) / d; inp.move.y = (pod.y - pl.y) / d }
          else { inp.move.x = Math.cos(w.time); inp.move.y = Math.sin(w.time * 0.8) }
        }
        const cards = new Set()
        const pods = new Set()
        let rolls = 0
        const seen = () => { rolls++; for (let i = 0; i < w.draft.count; i++) cards.add(w.draft.cards[i].id) }
        try {
          for (let t = 0; t < secs * 60; t++) {
            w.player.maxHp = w.player.hp = 1e9
            S.step(1)
            for (const p of w.pickups.active) if (p.alive && p.kind === 'weapon') pods.add(p.weaponId)
            let guard = 0
            while (w.paused && w.draft.open && guard++ < 20) {
              seen()
              const x = rand()
              if (x < 0.2 && w.draft.rerolls > 0) S.reroll()
              else if (x < 0.3 && w.draft.banishes > 0) S.banish(Math.floor(rand() * w.draft.count))
              else S.pickCard(Math.floor(rand() * w.draft.count))
              if (w.paused && w.draft.open) seen()
            }
          }
        } finally {
          inp.update = real
        }
        return { pilot, world, seed, poolPerks: w.perkPool.length, poolWeapons: [...w.weaponPool], rolls, cards: [...cards], pods: [...pods], level: w.level, kills: w.kills }
      }, pilot, world, seed, SECONDS)
      out.pools.push(r)
      const bad = r.cards.filter((id) => LOCKED_PERKS.includes(id))
      assert.deepEqual(bad, [], `${pilot}/${world}: locked perks drafted`)
      const badPods = r.pods.filter((id) => !START_WEAPONS.includes(id))
      assert.deepEqual(badPods, [], `${pilot}/${world}: locked weapons dropped`)
      assert.equal(r.poolPerks, 21)
      console.log(`PASS 2 ${pilot}/${world}: ${r.rolls} rolls, ${r.cards.length} distinct cards, pods ${r.pods.join(' ')}, Lv ${r.level}`)
    }
    const allCards = new Set(out.pools.flatMap((r) => r.cards))
    console.log(`     distinct cards over all runs: ${allCards.size}; locked perks seen: none`)
    await ctx.close()
  }

  // 3. The acceptance save through the real boot.
  {
    const { ctx, page } = await open({ unlocks: ['ember', 'depths'], 'best:world:hive': { time: 200, kills: 900 }, 'sel:char': 'ember', 'sel:arena': 'depths' })
    await sleep(600)
    out.accept = await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      const r = {
        toast: S.toast.view.visible ? S.toast.view.children[1].text : null,
        done: Object.keys(S.loadJSON('feats', { done: {} }).done).sort(),
        owned: S.loadJSON('unlocks', []),
        stats: S.loadJSON('stats', null),
      }
      S.loop.stop()
      S.startRun('endless')
      r.run = { pilot: w.character.id, world: w.arenaTheme.id, perks: w.perkPool.length, weapons: w.weaponPool.length }
      S.endRun('quit', 'menu')
      return r
    })
    assert.deepEqual(out.accept.done, ['deep_dive', 'overcharged', 'swatter'])
    assert.equal(out.accept.run.pilot, 'ember')
    assert.equal(out.accept.run.world, 'depths')
    assert.equal(out.accept.run.perks, 31)
    assert.equal(out.accept.run.weapons, 11)
    assert.equal(out.accept.toast, 'Welcome to v2. Your records earned 3 feats. See RECORDS.')
    assert.equal(out.accept.stats.importedV1, true)
    console.log('PASS 3 acceptance save', JSON.stringify({ ...out.accept, owned: out.accept.owned.length }))
    await ctx.close()
  }

  // 4. A paint flies.
  {
    const { ctx, page } = await open()
    out.paint = await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      S.loop.stop()
      S.setPaint('magma')
      S.startRun('endless')
      w.player.maxHp = w.player.hp = 1e9
      const inp = S.input
      const real = inp.update
      inp.update = () => {
        inp.firing = true
        inp.aimDir.x = 1
        inp.aimDir.y = 0
        inp.move.x = inp.move.y = 0
      }
      S.step(30)
      let tint = null
      for (const p of w.projectiles.active) if (p.alive) tint = p.sprite.tint
      S.give('smg')
      S.step(3)
      inp.update = real
      const shots = w.projectiles.active.filter((p) => p.alive)
      const pickupTint = shots.length ? shots[shots.length - 1].sprite.tint : null
      S.endRun('quit')
      return { runPaint: S.runPaint, bullet: w.baseBulletTint, shotTint: tint, smgTint: pickupTint, resultPaint: S.lastResult.paint }
    })
    assert.equal(out.paint.runPaint, 'magma')
    assert.equal(out.paint.bullet, 0xff8a4a)
    assert.equal(out.paint.resultPaint, 'magma')
    assert.equal(out.paint.shotTint, 0xff8a4a)
    assert.notEqual(out.paint.smgTint, 0xff8a4a)
    console.log('PASS 4 paint', JSON.stringify(out.paint))
    await ctx.close()
  }
} finally {
  await browser.close()
}
if (errors.length) {
  console.error('PAGE ERRORS:', errors)
  process.exit(1)
}
console.log('probe-meta: all checks passed, no page errors')
