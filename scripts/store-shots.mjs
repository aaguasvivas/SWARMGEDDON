// SWARMGEDDON store-screenshot stager: all six App Store shots in ONE browser
// session. Setup mirrors scripts/measure.mjs: npm i --no-save puppeteer-core,
// dev server on 5176 (npm run dev -- --port 5176 --strictPort), real Chrome.
// Each frame is a real render of the real game; staging only normalizes the
// probe artifacts (invincibility HP readout) and sets a plausible kill count.
import puppeteer from 'puppeteer-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [W, H] = [2796, 1290]
const OUT = new URL('../store-assets/screenshots', import.meta.url).pathname

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [`--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'],
  defaultViewport: { width: W, height: H },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message))
await page.goto('http://localhost:5176/?seed=777', { waitUntil: 'networkidle0', timeout: 30000 })
await page.waitForFunction('!!window.__SWARM', { timeout: 15000 })

/** Stage a combat scene: organic sim to `simS`, fan the pack, normalize HUD. */
async function combatShot(charId, arenaId, simS, kills, hpFrac, file) {
  await page.evaluate((c, a, simSeconds, k, hf) => {
    const S = window.__SWARM
    S.setLoadout(c, a)
    S.startRun('endless')
    const w = S.world
    w.player.maxHp = 1e9
    w.player.hp = 1e9
    for (let s = 0; s < simSeconds; s += 5) {
      S.step(5 * 60)
      const act = w.enemies.active
      if (act.length > 520) {
        let toCull = act.length - 450
        for (const e of act) {
          if (toCull <= 0) break
          if (!e.def.elite && !e.def.boss) { e.alive = false; toCull-- }
        }
        S.step(1)
      }
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
    // De-stage the probe artifacts: real pilot HP + a plausible kill count.
    const realMax = w.character.maxHp
    w.player.maxHp = realMax
    w.player.hp = Math.max(1, Math.round(realMax * hf))
    w.kills = k
    w.paused = true
    w.hurtFlash = 0
  }, charId, arenaId, simS, kills, hpFrac)
  await new Promise((r) => setTimeout(r, 700)) // HP bar lerp settles + title fades
  await page.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 82 })
  console.log(file, 'done')
}

await combatShot('nova', 'hive', 60, 184, 0.86, '1-hive.jpg')
await combatShot('vesper', 'depths', 60, 213, 0.72, '2-depths.jpg')
await combatShot('ember', 'wastes', 60, 241, 0.64, '3-wastes.jpg')
await combatShot('nova', 'hive', 185, 517, 0.58, '4-boss.jpg')

// --- Perk draft over live combat (the live loop opens the modal on pause) ---
await page.evaluate(() => {
  const S = window.__SWARM
  S.setLoadout('nova', 'hive')
  S.startRun('endless')
  const w = S.world
  w.player.maxHp = 1e9
  w.player.hp = 1e9
  S.flood(90)
  S.step(150)
  w.player.maxHp = w.character.maxHp
  w.player.hp = Math.round(w.character.maxHp * 0.9)
  w.kills = 96
  w.addXp(50) // level-up -> next live sim step pauses -> render opens the draft
})
await new Promise((r) => setTimeout(r, 1100)) // modal open + level flash decays
await page.screenshot({ path: `${OUT}/5-perks.jpg`, type: 'jpeg', quality: 82 })
console.log('5-perks.jpg done')

// --- Menu with a per-world record on the selected world ---
await page.evaluate(() => {
  const S = window.__SWARM
  localStorage.setItem('swarmgeddon:best:world:depths', JSON.stringify({ time: 347, kills: 1209 }))
  // addXp queued MULTIPLE level-ups; picking one just opens the next draft and
  // the modal swallows Escape. Clear the queue + unpause (the render loop then
  // closes the modal), and only after that Escape routes playing -> menu.
  S.world.pendingLevelUps = 0
  S.world.paused = false
})
await new Promise((r) => setTimeout(r, 300))
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
})
await new Promise((r) => setTimeout(r, 400))
await page.evaluate(() => window.__SWARM.setLoadout('nova', 'depths'))
await new Promise((r) => setTimeout(r, 700))
await page.screenshot({ path: `${OUT}/6-menu.jpg`, type: 'jpeg', quality: 82 })
console.log('6-menu.jpg done')

await browser.close()
console.log('ALL SHOTS DONE')
