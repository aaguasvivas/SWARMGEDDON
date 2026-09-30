// P18 audio bus and haptics probe (real system Chrome via puppeteer-core, DEV build).
//
// Start the dev server first; the origin comes from env SWG_URL (default http://localhost:5176).
// Usage: node scripts/audio-probe.mjs
//
// Scenarios, all through the real FeelDirector drain and the real AudioEngine:
//   panLevel The AudioEngine graph built on an OfflineAudioContext: a quiet 440 Hz sine
//            into each chaff pan bus vs straight into the chaff bus (the v1 route, no pan
//            stage), with and without StereoPannerNode. Reports the per-channel RMS
//            ratio to the direct route; the center bus must be 1 in both builds.
//   duckMerge death, then levelup 100 ms later: the music duck must follow the death
//            duck (0.35, 900 ms release) and not jump to the shallower levelup release.
//            Control: levelup alone is back to 1 by 0.5 s.
//   wipe     200 swarmers packed on the player die in one tick to thorns while the
//            boss arrives in the same tick. Reports the peak voice count, whether the
//            boss cue started, and the chaff and music duck levels right after it.
//   capFull  40 explosions (tier 1) and a BossSpawn in one frame: the cap fills with
//            tier 1 voices and the boss cue must take a slot anyway.
//   chaff    300 shots, 300 hits, 240 chaff kills and 240 gems over 60 frames, sim
//            frozen: no vibrate call may happen (no haptic per shot, hit or chaff kill).
// Pass: center pan ratio 1 +-0.01 with and without StereoPannerNode; duckMerge at
// 0.56 s <= 0.85 and not back to 1 before 0.85 s, control back to 1 by 0.5 s;
// peak <= 24 in every scenario, the boss cue starts in wipe and capFull, the
// chaff bus stays below 0.1 from 10 to 110 ms after the boss cue, chaff haptics = 0,
// no page errors.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

await acquireChromeLock('audio-probe')
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--window-size=375,667', '--hide-scrollbars', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 375, height: 667, deviceScaleFactor: 1 },
})
let failed = false
try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text())
  })
  await page.evaluateOnNewDocument(() => {
    window.__vibes = []
    const real = navigator.vibrate?.bind(navigator)
    navigator.vibrate = (p) => {
      window.__vibes.push(p)
      return real ? real(p) : true
    }
  })
  await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 15000 })
  // A key press is the unlock gesture (Shift has no game binding).
  await page.keyboard.press('Shift')
  await page.waitForFunction('window.__SWARM.audio.ctx && window.__SWARM.audio.ctx.state === "running"', { timeout: 10000 })
  // The audio clock can sit at 0 for a few frames after resume; ducks are only
  // observable once it renders.
  await page.waitForFunction('window.__SWARM.audio.ctx.currentTime > 0.5', { timeout: 10000 })

  const frames = (n) => page.evaluate((k) => new Promise((r) => {
    let left = k
    const tick = () => (--left <= 0 ? r() : requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  }), n)

  // --- panLevel ---
  const panLevel = await page.evaluate(async () => {
    const { AudioEngine } = await import('/src/audio/audio.ts')
    const RealCtor = window.AudioContext
    const SR = 48000
    const render = async (noPanner, into) => {
      window.AudioContext = function () {
        const c = new OfflineAudioContext(2, SR / 2, SR)
        if (noPanner) c.createStereoPanner = undefined
        return c
      }
      try {
        const au = new AudioEngine()
        au.ensureContext()
        const ctx = au.ctx
        const osc = ctx.createOscillator()
        osc.frequency.value = 440
        const g = ctx.createGain()
        g.gain.value = 0.02 // quiet, so the tanh shaper stays linear
        osc.connect(g).connect(into(au))
        osc.start(0)
        const buf = await ctx.startRendering()
        const rms = (ch) => {
          const d = buf.getChannelData(ch)
          let s = 0
          for (let i = 0; i < d.length; i++) s += d[i] * d[i]
          return Math.sqrt(s / d.length)
        }
        return [rms(0), rms(1)]
      } finally {
        window.AudioContext = RealCtor
      }
    }
    const ratios = async (noPanner, buses) => {
      const [dl, dr] = await render(noPanner, (au) => au.chaffBus)
      const out = []
      for (const i of buses) {
        const [l, r] = await render(noPanner, (au) => au.chaffPan[i])
        out.push([+(l / dl).toFixed(3), +(r / dr).toFixed(3)])
      }
      return out
    }
    return { panner: await ratios(false, [0, 1, 2, 3, 4]), noPannerCenter: (await ratios(true, [2]))[0] }
  })
  console.log(JSON.stringify({ scenario: 'panLevel', busesLeftToRight: [-1, -0.5, 0, 0.5, 1], ...panLevel }))
  const near1 = (x) => Math.abs(x - 1) <= 0.01
  const [cl, cr] = panLevel.panner[2]
  if (!near1(cl) || !near1(cr) || !near1(panLevel.noPannerCenter[0]) || !near1(panLevel.noPannerCenter[1])) failed = true
  if (panLevel.panner[0][1] > 0.05 || panLevel.panner[4][0] > 0.05) failed = true

  // --- duckMerge ---
  const duckMerge = await page.evaluate(async () => {
    const au = window.__SWARM.audio
    const ctx = au.ctx
    const g = au.musicDuck.gain
    const settle = () => new Promise((r) => {
      let since = -1
      const tick = () => {
        if (g.value < 0.999) since = -1
        else if (since < 0) since = ctx.currentTime
        if (since >= 0 && ctx.currentTime - since > 0.3) r()
        else requestAnimationFrame(tick)
      }
      tick()
    })
    const run = (seq, dur) => new Promise((r) => {
      const t0 = ctx.currentTime
      let k = 0
      const samples = []
      const tick = () => {
        const dt = ctx.currentTime - t0
        while (k < seq.length && dt >= seq[k][1]) au.play(seq[k++][0])
        samples.push([+dt.toFixed(3), +g.value.toFixed(3)])
        if (dt < dur) requestAnimationFrame(tick)
        else r(samples)
      }
      tick()
    })
    const at = (s, t) => s.reduce((b, x) => (Math.abs(x[0] - t) < Math.abs(b[0] - t) ? x : b))[1]
    const backAt = (s) => (s.find((x) => x[0] > 0.05 && x[1] >= 0.99) ?? [null])[0]
    await settle()
    const merged = await run([['death', 0], ['levelup', 0.1]], 1.2)
    await settle()
    const alone = await run([['levelup', 0]], 0.7)
    return {
      merged: { at020: at(merged, 0.02), at140: at(merged, 0.14), at300: at(merged, 0.3), at560: at(merged, 0.56), at800: at(merged, 0.8), backToOneAt: backAt(merged) },
      levelupAlone: { at140: at(alone, 0.14), backToOneAt: backAt(alone) },
    }
  })
  console.log(JSON.stringify({ scenario: 'duckMerge', ...duckMerge }))
  const m = duckMerge.merged
  if (m.at560 > 0.85 || m.backToOneAt === null || m.backToOneAt < 0.85) failed = true
  if (duckMerge.levelupAlone.backToOneAt === null || duckMerge.levelupAlone.backToOneAt > 0.5) failed = true

  // --- wipe ---
  await page.evaluate(() => {
    const S = window.__SWARM
    const w = S.world
    S.setLoadout('nova', 'hive')
    S.startRun('endless')
    w.player.maxHp = 1e9
    w.player.hp = 1e9
    S.flood(200)
    const px = w.player.x
    const py = w.player.y
    w.enemies.active.forEach((e, i) => {
      const a = i * 2.399963
      const r = 4 + (i % 5) * 3
      e.x = e.prevX = px + Math.cos(a) * r
      e.y = e.prevY = py + Math.sin(a) * r
      e.bornAt = w.time - 1
    })
  })
  await frames(3)
  const wipe = await page.evaluate(() => new Promise((resolve) => {
    const S = window.__SWARM
    const w = S.world
    const au = S.audio
    au.stats.peak = 0
    au.stats.dropped = 0
    au.stats.stolen = 0
    w.mods.thorns = 1e7
    S.jumpTo(240) // the mid1 boss beat: its warn and arrival both land on the next step
    const kills0 = w.kills
    const t0 = au.ctx.currentTime
    S.step(1)
    const killed = w.kills - kills0
    const bossSpawned = w.bossAlive
    let n = 0
    let maxLive = 0
    const chaff = []
    const music = []
    const tick = () => {
      maxLive = Math.max(maxLive, au.activeVoices())
      // Bus levels 10 to 110 ms (audio clock) after the boss cue started.
      const dt = au.ctx.currentTime - au.lastAt.boss
      if (dt >= 0.01 && dt <= 0.11) {
        chaff.push(+au.chaffBus.gain.value.toFixed(3))
        music.push(+au.musicDuck.gain.value.toFixed(3))
      }
      if (++n < 90) requestAnimationFrame(tick)
      else {
        w.mods.thorns = 0
        resolve({
          killed, bossSpawned, peak: au.stats.peak, maxLive, dropped: au.stats.dropped, stolen: au.stats.stolen,
          bossCue: au.lastAt.boss >= t0, alertCue: au.lastAt.alertBoss >= t0, chaffAfterBoss: chaff, musicAfterBoss: music,
        })
      }
    }
    requestAnimationFrame(tick)
  }))
  console.log(JSON.stringify({ scenario: 'wipe', ...wipe }))
  if (wipe.killed < 200 || !wipe.bossSpawned || wipe.peak > 24 || wipe.maxLive > 24 || !wipe.bossCue) failed = true
  if (!wipe.chaffAfterBoss.length || Math.max(...wipe.chaffAfterBoss) >= 0.1) failed = true

  // --- capFull ---
  await frames(90) // let the wipe's tails end
  const capFull = await page.evaluate(() => new Promise((resolve) => {
    const S = window.__SWARM
    const w = S.world
    const au = S.audio
    au.stats.peak = 0
    au.stats.dropped = 0
    au.stats.stolen = 0
    au.lastAt.boss = -1e9
    // Freeze the sim so only the injected events reach the drain.
    w.paused = true
    const t0 = au.ctx.currentTime
    const px = w.player.x
    const py = w.player.y
    for (let i = 0; i < 40; i++) w.feel.emit(4 /* Explosion */, 8, px + (i % 9) * 30 - 120, py, 60)
    w.feel.emit(16 /* BossSpawn */, 4, px, py - 200, 0, 0, w.boss ? w.boss.def : null)
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({
      peak: au.stats.peak, live: au.activeVoices(), dropped: au.stats.dropped, stolen: au.stats.stolen, bossCue: au.lastAt.boss >= t0,
    })))
  }))
  console.log(JSON.stringify({ scenario: 'capFull', ...capFull }))
  if (capFull.peak > 24 || capFull.live > 24 || !capFull.bossCue || capFull.stolen < 1) failed = true

  // --- chaff haptics ---
  await frames(60)
  const chaffHaptics = await page.evaluate(() => new Promise((resolve) => {
    const S = window.__SWARM
    const w = S.world
    const def = w.enemies.active[0]?.def ?? w.boss?.def
    window.__vibes.length = 0
    let f = 0
    const tick = () => {
      const px = w.player.x
      const py = w.player.y
      for (let i = 0; i < 5; i++) {
        w.feel.emit(1 /* Shot */, 0, px, py, 0, 0)
        w.feel.emit(2 /* Hit */, 0, px + 80, py, 5, 40, null)
      }
      for (let i = 0; i < 4; i++) {
        w.feel.emit(3 /* Kill */, 0, px + 60, py, 0, 0, def)
        w.feel.emit(9 /* GemCollect */, 0, px, py, 1)
      }
      if (++f < 60) requestAnimationFrame(tick)
      else requestAnimationFrame(() => resolve({ frames: f, vibrateCalls: window.__vibes.length, defXp: def?.xp }))
    }
    requestAnimationFrame(tick)
  }))
  console.log(JSON.stringify({ scenario: 'chaff', ...chaffHaptics }))
  if (chaffHaptics.vibrateCalls !== 0) failed = true

  console.log(JSON.stringify({ pageErrors, pass: !failed && pageErrors.length === 0 }))
  if (pageErrors.length) failed = true
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
