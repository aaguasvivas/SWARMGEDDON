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
//      The toast covers no menu item at 375x667, 667x375, 390x844 and 844x390
//      (with phone insets), and hides when a run starts.
//   4. A paint flies: hull, base weapon bullets, RunResult.paint.
//   5. The recap banner names and counts only feats whose reward is new.
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
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 }
const TOAST_SIZES = [
  { w: 375, h: 667, insets: NO_INSETS },
  { w: 667, h: 375, insets: NO_INSETS },
  { w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { w: 844, h: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
]

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
        // A new seed per run on the pools startRun resolved.
        S.beginSeed(seed, { perkPool: w.perkPool, weaponPool: w.weaponPool })
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
      const text = S.toast.view.visible ? S.toast.view.children[1].text : null
      // Keep the toast up for the placement checks below (it lasts 6 s from boot).
      if (text) S.toast.show(text, 30)
      return {
        toast: text,
        done: Object.keys(S.loadJSON('feats', { done: {} }).done).sort(),
        owned: S.loadJSON('unlocks', []),
        stats: S.loadJSON('stats', null),
      }
    })
    // The toast never covers a menu element, and stays inside the safe area.
    const cdp = await page.createCDPSession()
    out.toastPlacement = []
    for (const sz of TOAST_SIZES) {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: sz.insets })
      await page.setViewport({ width: sz.w, height: sz.h, deviceScaleFactor: 1 })
      await sleep(400)
      const r = await page.evaluate(() => {
        const S = window.__SWARM
        const box = (o) => {
          const b = o.getBounds()
          return { x: b.x, y: b.y, w: b.width, h: b.height }
        }
        let title = null
        const find = (o) => {
          for (const c of o.children ?? []) {
            if (title) return
            if (c.text === 'SWARMGEDDON') title = c
            else find(c)
          }
        }
        find(S.app.stage)
        const W = S.app.screen.width
        const H = S.app.screen.height
        const items = []
        for (const c of title.parent.children) {
          if (!c.visible || c.alpha === 0) continue
          const b = box(c)
          if (b.w < 1 || b.h < 1 || (b.w >= W && b.h >= H)) continue // skip empty text and the full-screen backdrop
          items.push({ label: c.text ?? c.children?.find((k) => k.text)?.text ?? c.constructor.name, ...b })
        }
        return { W, H, visible: S.toast.view.visible, plate: box(S.toast.view.children[0]), items }
      })
      const p = r.plate
      const hits = r.items.filter((b) => p.x < b.x + b.w - 0.5 && b.x < p.x + p.w - 0.5 && p.y < b.y + b.h - 0.5 && b.y < p.y + p.h - 0.5)
      assert.equal(r.visible, true, `${sz.w}x${sz.h}: toast shown`)
      assert.equal(r.W, sz.w)
      assert.deepEqual(hits.map((b) => b.label), [], `${sz.w}x${sz.h}: the toast covers menu items`)
      assert.ok(p.x >= sz.insets.left + 16 - 0.5 && p.x + p.w <= sz.w - sz.insets.right - 16 + 0.5, `${sz.w}x${sz.h}: toast inside the side gutters`)
      assert.ok(p.y >= sz.insets.top + 8 - 0.5 && p.y + p.h <= sz.h - sz.insets.bottom, `${sz.w}x${sz.h}: toast inside the safe area`)
      out.toastPlacement.push({ size: `${sz.w}x${sz.h}`, plate: p, items: r.items.length })
    }
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: TOAST_SIZES[0].insets })
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 1 })
    await sleep(200)
    out.accept.run = await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      S.loop.stop()
      S.startRun('endless')
      const run = { pilot: w.character.id, world: w.arenaTheme.id, perks: w.perkPool.length, weapons: w.weaponPool.length, toast: S.toast.view.visible }
      S.endRun('quit', 'menu')
      return run
    })
    assert.deepEqual(out.accept.done, ['deep_dive', 'overcharged', 'swatter'])
    assert.equal(out.accept.run.pilot, 'ember')
    assert.equal(out.accept.run.world, 'depths')
    assert.equal(out.accept.run.perks, 31)
    assert.equal(out.accept.run.weapons, 11)
    assert.equal(out.accept.toast, 'Welcome to v2. Your records earned 3 feats. See RECORDS.')
    assert.equal(out.accept.run.toast, false, 'the toast hides when a run starts')
    assert.equal(out.accept.stats.importedV1, true)
    console.log('PASS 3 acceptance save', JSON.stringify({ ...out.accept, owned: out.accept.owned.length }))
    console.log('PASS 3 toast placement', JSON.stringify(out.toastPlacement.map((t) => ({ size: t.size, plate: [t.plate.x, t.plate.y, t.plate.w, t.plate.h].map(Math.round), menuItems: t.items }))))
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

  // 5. The recap banner names and counts only the new items. The save already
  //    owns the rewards of FIRST CONTACT and SWATTER; a 12 s run with 1,200
  //    kills, Lv 9 and peak x5 finishes 7 feats, 5 of them with new rewards.
  {
    const { ctx, page } = await open()
    out.banner = await page.evaluate(() => {
      const S = window.__SWARM
      const w = S.world
      S.setPaint('static')
      S.setPaint('hazard')
      S.setPaint('factory')
      S.loop.stop()
      S.startRun('endless')
      for (let t = 0; t < 12 * 60; t++) {
        w.player.maxHp = w.player.hp = 1e9
        S.step(1)
        for (let g = 0; g < 8 && w.paused && w.draft.open; g++) S.pickCard(0)
      }
      w.kills = 1200
      w.level = 9
      w.peakTier = 5
      const before = new Set(S.loadJSON('unlocks', []))
      S.endRun('quit')
      const feats = S.loadJSON('feats', { done: {} })
      let banner = null
      const find = (o) => {
        for (const c of o.children ?? []) {
          if (banner) return
          if (c.visible && typeof c.text === 'string' && /^★ (UNLOCKED|FEATS? DONE):/.test(c.text)) banner = c.text
          else find(c)
        }
      }
      find(S.app.stage)
      const owned = S.loadJSON('unlocks', [])
      return { done: Object.keys(feats.done), fresh: owned.filter((id) => !before.has(id)), banner, screen: S.screen }
    })
    assert.equal(out.banner.screen, 'gameover')
    assert.equal(out.banner.done.length, 7, 'feats done')
    assert.equal(out.banner.fresh.length, 5, 'new rewards')
    assert.ok(/^★ UNLOCKED: .+ \+ .+ (\+3 MORE ★|★\n\+3 MORE)$/.test(out.banner.banner), `banner counts only new items: ${out.banner.banner}`)
    console.log('PASS 5 recap banner', JSON.stringify(out.banner))
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
