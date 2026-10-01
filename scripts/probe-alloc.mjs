// Allocation probe (NEXT-LEVEL section 3.2, zero per-frame allocation). Drives the
// DEV build's __SWARM handle in one headless Chrome (machine-wide Chrome lock).
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Usage: node scripts/probe-alloc.mjs [scenario|all] [arena|all] [options]
//   scenarios (default all = flood, boss, event):
//     flood   live combat at 5:00, the field topped up to 500 every frame
//     boss    the mid1 fight (cage up, boss kept above 35% HP), field at 500
//     event   EVENT 1 (2:30), field at 500, event units given 1e6 HP (a stream
//             unit still leaves at its TTL): the warm-up plays up to the
//             beat, and the window opens when the event goes live (a part
//             emitting or an event unit alive) and closes when it ends, after at
//             most --seconds. It fails if the event was not live at the
//             window's start or lasted under 4 s.
//     final   the FINAL SWARM beat (10:00), field at 500
//   Every scenario: NOVA, invincible, auto-fire, Hailstorm, the --perks build
//   (default piercing, cryo, explosive, arc, incendiary, ricochet, SHATTER,
//   FIRESTORM), no level-ups (a draft is an event-rate allocation, section 3.2).
//   The top-up is 70% swarmers and 30% the world's minute-8 roster on the ring.
//   Each (scenario, arena) warms --warm s, then the CDP sampling heap profiler records
//   every allocation (minor and major GC'd objects included) for --seconds.
//   Output: one JSON line per run with total MB/s (harness frames excluded),
//   gameMBs (sim + presentation + builtins they call; Pixi excluded), the
//   shares, and the top functions with their callers (a builtin frame is
//   named with its caller).
//   Pass: total <= --budget MB/s (0.5; with --scope=game the budget applies
//   to gameMBs) and no sim function (src/systems, game, content, core) above
//   --fnBudget MB/s (0.1). Exit 1 on any failure.
//   The profiler folds inlined callees into the caller, and code that has not
//   reached the optimizing tier (or just deoptimized) boxes most numbers, so a
//   short --warm reports warm-up, not the steady state.
// Options:
//   --seconds=N        sampled window (default 10)
//   --warm=N           seconds of live play before the window (default 15)
//   --noinline         Chrome --js-flags=--no-turbo-inlining --no-maglev-inlining,
//                      so allocations show at the real site instead of folding
//                      into the caller (the numbers are then NOT the budget ones:
//                      every call boundary boxes its double arguments)
//   --jsflags=...      extra V8 flags (with --dumpio the output reaches stdout;
//                      add --trace-generalization to get PA_MARK window lines)
//   --top=N            functions listed per run (default 12)
//   --perks=a,b,...    build taken at run start ('' for none)
//   --threat=N         Standard runs at THREAT N (0, default; unlocked first)
//   --scope=game       apply --budget to gameMBs instead of the total
//   --interval=B       sampling interval in bytes (default 8192)
//   --growth=S         instead of profiling: flood Hive, warm 20 s (--warm sets
//                      it), force GC, read the heap, run S seconds, force GC,
//                      read it again; keptTop lists what the window allocated and
//                      still holds. V8 installs optimized code for minutes into a
//                      run (code space is in the heap), and the sampler books it
//                      to the frame on the stack when the code lands, the
//                      requestAnimationFrame callback: a longer --warm separates
//                      that tier-up from steady-state growth.
//   --gc               instead of profiling: a 10 s trace of the perf-final
//                      scene (FINAL SWARM, no top-up) and every GC pause in it
//                      (A16: none over 2 ms). Timing-sensitive: run it alone.
//   --shapes[=S]       instead of profiling: the sim-only run arc (S seconds,
//                      default 780: the det-long bot, invincible, a dash every
//                      3 s, card 1 on every draft, OVERTIME after a win) with
//                      V8's --trace-generalization, per arena. Lists every field
//                      of game code whose representation changed after --settle
//                      seconds (default 10). Such a change (an integer field's
//                      first fraction) swaps the hidden class of every object of
//                      that shape and deoptimizes each system that reads it, so
//                      the sim runs unoptimized and allocates for many frames in
//                      mid-run. Exit 1 if any, or if the trace never arrived.
//                      Field-type changes are listed too. The renderer block-
//                      buffers V8's stdout, so the run ends with ~3 MB of
//                      throwaway trace lines that push the last markers out.
import puppeteer from 'puppeteer-core'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const flags = {}
const pos = []
for (const a of process.argv.slice(2)) {
  const m = /^--([a-zA-Z]+)(?:=(.*))?$/s.exec(a)
  if (m) flags[m[1]] = m[2] ?? true
  else pos.push(a)
}
const SCEN = !pos[0] || pos[0] === 'all' ? ['flood', 'boss', 'event'] : [pos[0]]
const ARENAS = !pos[1] || pos[1] === 'all' ? ['hive', 'depths', 'wastes'] : [pos[1]]
const SECONDS = parseFloat(flags.seconds ?? '10')
const TOP = parseInt(flags.top ?? '12')
const WARM = parseFloat(flags.warm ?? '15')
const BUDGET = parseFloat(flags.budget ?? '0.5')
const FN_BUDGET = parseFloat(flags.fnBudget ?? '0.1')
const THREAT = parseInt(flags.threat ?? '0')
const PERKS = flags.perks === undefined
  ? ['piercing', 'cryo_rounds', 'explosive_rounds', 'arc_rounds', 'incendiary', 'ricochet', 'f_shatter', 'f_firestorm']
  : String(flags.perks).split(',').filter(Boolean)
const W = 390
const H = 844
const MIN_EVENT_SEC = 4
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const jsFlags = []
if (flags.noinline) jsFlags.push('--no-turbo-inlining', '--no-maglev-inlining')
if (typeof flags.jsflags === 'string') jsFlags.push(...flags.jsflags.split(/\s+/).filter(Boolean))
if (flags.shapes) jsFlags.push('--trace-generalization')

// In-page driver. keepLive runs every frame after the game's own tick.
const DRIVER = `(async () => {
  const S = window.__SWARM
  const w = S.world
  const spawn = await import('/src/systems/spawn.ts')
  const { RING_STD } = await import('/src/config.ts')
  const st = { scenario: '', topUp: true, target: 500, keepBoss: false, keepEvent: false }
  let mix = null
  let mixTotal = 0
  const topUp = (n) => {
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.7) { S.flood(1); continue }
      let roll = Math.random() * mixTotal
      let id = mix[0][0]
      for (const [k, wt] of mix) { roll -= wt; if (roll <= 0) { id = k; break } }
      spawn.ringSpawnPoint(w, RING_STD)
      spawn.spawnEnemy(w, id, spawn.ringOut.x, spawn.ringOut.y)
    }
  }
  let frame = 0
  const keepLive = () => {
    if (st.scenario) {
      // A mouse cursor circling the ship: auto-fire aims at it (the kbm path).
      frame++
      S.input.hasPointer = true
      S.input.pointerX = S.app.screen.width / 2 + Math.cos(frame * 0.03) * 160
      S.input.pointerY = S.app.screen.height / 2 + Math.sin(frame * 0.03) * 160
      w.player.maxHp = 1e9
      w.player.hp = 1e9
      w.xpToNext = 1e12
      if (w.paused && w.draft.open) S.pickCard(0)
      if (st.keepBoss && w.boss && w.boss.alive && w.boss.hp < w.boss.maxHp * 0.35) w.boss.hp = w.boss.maxHp * 0.35
      if (st.keepEvent) {
        const a = w.enemies.active
        for (let i = 0; i < a.length; i++) {
          const e = a[i]
          if (e.alive && e.eventUnit && e.maxHp < 1e6) e.maxHp = e.hp = 1e6
        }
      }
      if (st.topUp && w.enemies.size < st.target) topUp(st.target - w.enemies.size)
    }
    requestAnimationFrame(keepLive)
  }
  requestAnimationFrame(keepLive)
  const eventUnits = () => {
    const a = w.enemies.active
    let n = 0
    for (let i = 0; i < a.length; i++) if (a[i].alive && a[i].eventUnit) n++
    return n
  }
  const emitting = () => {
    const runs = w.director.events
    for (let i = 0; i < runs.length; i++) if (runs[i].active) return true
    return false
  }
  const eventLive = () => emitting() || eventUnits() > 0
  window.__PA = {
    eventLive,
    setup(scenario, arena, perks, warm, threat) {
      st.scenario = ''
      S.setLoadout('nova', arena)
      S.setThreat(arena, threat)
      S.startRun('endless')
      for (const id of perks) w.choosePerk(id)
      w.player.maxHp = 1e9
      w.player.hp = 1e9
      w.xpToNext = 1e12
      S.input.autoFire = true
      S.give('hailstorm')
      mix = w.script.minutes[8].mix
      mixTotal = mix.reduce((s, m) => s + m[1], 0)
      st.topUp = scenario !== 'gc'
      st.keepBoss = scenario === 'boss'
      st.keepEvent = scenario === 'event'
      if (scenario === 'flood') S.jumpTo(300)
      else if (scenario === 'boss') {
        S.jumpTo(238.4)
        for (let i = 0; i < 240 && !w.bossAlive; i++) S.step(1)
      } else if (scenario === 'event') {
        // The warm-up is live play before the beat, so the whole event is left
        // for the window.
        const beat = w.script.beats.find((b) => b.kind === 'event')
        S.jumpTo(Math.max(0, beat.at - warm - 1))
      } else if (scenario === 'final' || scenario === 'gc') S.jumpTo(600)
      st.scenario = scenario
      return { time: +w.time.toFixed(2), threat: w.threat, boss: w.bossAlive, event: eventLive() }
    },
    status() {
      return {
        time: +w.time.toFixed(2), enemies: w.enemies.size, projectiles: w.projectiles.size, enemyShots: w.enemyProjectiles.size,
        particles: w.particles.size, pickups: w.pickups.size, hazards: w.hazards.size, boss: w.bossAlive, event: eventLive(),
        emitting: emitting(), eventUnits: eventUnits(),
        cage: w.director.cage.active, kills: w.kills, paused: w.paused, screen: S.screen,
      }
    },
    stop() { st.scenario = '' },
  }
})()`

// Code this probe evaluates in the page (the driver, the polls) has a script
// but no url; builtins have neither.
function category(url) {
  if (!url) return 'harness'
  if (url.startsWith('pptr:')) return 'harness'
  if (/\/src\/(systems|game|content|core)\//.test(url)) return 'sim'
  if (/\/src\//.test(url)) return 'presentation'
  if (/node_modules|\/deps\/|\/@fs\//.test(url)) return 'lib'
  return 'harness'
}

function fileOf(url) {
  const m = /\/(src\/[^?]+|deps\/[^?]+)/.exec(url)
  return m ? m[1] : url || ''
}

/** Aggregates the sampling profile per function; a native frame (builtin,
 *  (V8 API), (GC)) is keyed with the JS function that called it. */
function aggregate(head, seconds) {
  const byFn = new Map()
  let total = 0
  const cat = { sim: 0, presentation: 0, lib: 0, native: 0, harness: 0 }
  const walk = (node, parentJs) => {
    const cf = node.callFrame
    const isJs = !!cf.url || (!!cf.scriptId && cf.scriptId !== '0')
    const name = cf.functionName || '(anonymous)'
    let key
    let c
    if (isJs) {
      key = `${name} ${fileOf(cf.url)}:${cf.lineNumber + 1}`
      c = category(cf.url)
    } else {
      key = parentJs ? `${name} <- ${parentJs.key}` : name
      c = parentJs ? parentJs.cat : 'native'
    }
    if (node.selfSize > 0) {
      total += node.selfSize
      cat[c] += node.selfSize
      const e = byFn.get(key) ?? { key, cat: c, bytes: 0, callers: new Map() }
      e.bytes += node.selfSize
      const via = isJs && parentJs ? parentJs.key : ''
      e.callers.set(via, (e.callers.get(via) ?? 0) + node.selfSize)
      byFn.set(key, e)
    }
    const nextParent = isJs ? { key, cat: c } : parentJs
    for (const ch of node.children) walk(ch, nextParent)
  }
  walk(head, null)
  const mbs = (b) => +(b / 1e6 / seconds).toFixed(3)
  const top = [...byFn.values()].sort((a, b) => b.bytes - a.bytes)
  return {
    // The harness's own frames (the top-up driver) are not the game's allocation.
    totalMBs: mbs(total - cat.harness),
    gameMBs: mbs(cat.sim + cat.presentation + cat.native),
    byCategory: Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, mbs(v)])),
    top: top.slice(0, TOP).map((e) => ({
      fn: e.key, cat: e.cat, MBs: mbs(e.bytes),
      // The frames that called it, heaviest first (a small function that is
      // not inlined allocates for its caller: a boxed argument or result).
      via: [...e.callers].sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([k]) => k).map(([k, b]) => `${k.split(' ')[0]} ${mbs(b)}`),
    })),
    simOver: top.filter((e) => e.cat === 'sim' && mbs(e.bytes) > FN_BUDGET).map((e) => ({ fn: e.key, MBs: mbs(e.bytes) })),
  }
}

await acquireChromeLock('probe-alloc')
const launchArgs = [`--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal']
if (jsFlags.length) launchArgs.push(`--js-flags=${jsFlags.join(' ')}`)
// A window marker V8 itself prints (with --trace-generalization), so it keeps
// its place among V8's other trace lines on stdout.
const MARK = (what) => `(() => { const o = { PA_MARK_${what}: 1 }; o.PA_MARK_${what} = 1.5; return 0 })()`
let browser
for (let attempt = 0; ; attempt++) {
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME, headless: true, protocolTimeout: 900000, dumpio: !!flags.dumpio,
      args: launchArgs, defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
    })
    break
  } catch (e) {
    if (attempt >= 2) throw e
    console.error('[probe-alloc] launch failed, retrying in 10 s:', e.message)
    await sleep(10000)
  }
}
// V8 prints its traces on the browser's stdout, in order with the markers.
const v8out = []
const v8closed = new Promise((r) => {
  const out = browser.process()?.stdout
  if (!out) return r()
  out.on('data', (d) => v8out.push(d))
  out.on('close', r)
})

/** The sim-only run arc per arena, with a PA_T marker every 10 s of sim time. */
async function runShapes(page) {
  const secs = typeof flags.shapes === 'string' ? parseFloat(flags.shapes) : 780
  for (const arena of ARENAS) {
    await page.evaluate(MARK(`A_${arena}`))
    await page.evaluate((a) => {
      const S = window.__SWARM
      const w = S.world
      const inp = S.input
      window.__PA.stop()
      S.loop.stop()
      S.setLoadout('nova', a)
      S.startRun('endless')
      inp.update = () => {
        const pl = w.player
        let best = null
        let bd = Infinity
        for (const e of w.enemies.active) {
          if (!e.alive || e.submerged) continue
          const d2 = (e.x - pl.x) ** 2 + (e.y - pl.y) ** 2
          if (d2 < bd) { bd = d2; best = e }
        }
        inp.firing = true
        if (best) {
          const d = Math.sqrt(bd) || 1
          inp.aimDir.x = (best.x - pl.x) / d
          inp.aimDir.y = (best.y - pl.y) / d
        }
        inp.move.x = Math.cos(0.7 * w.time)
        inp.move.y = Math.sin(0.9 * w.time)
        if (Math.round(w.time * 60) % 180 === 0) inp.pressDash()
      }
    }, arena)
    const steps = Math.round(secs * 60)
    for (let done = 0; done < steps; done += 600) {
      const t = await page.evaluate((n) => {
        const S = window.__SWARM
        const w = S.world
        for (let i = 0; i < n; i++) {
          w.player.maxHp = 1e9
          w.player.hp = 1e9
          S.step(1)
          while (w.paused && w.draft.open) S.pickCard(0)
          if (w.paused && w.pendingWin) {
            w.startOvertime()
            w.paused = false
            w.resumeFromDraft()
          }
        }
        return Math.round(w.time)
      }, Math.min(600, steps - done))
      await page.evaluate(MARK(`T_${arena}_${t}`))
    }
  }
  await flushTrace(page)
}

/** The renderer block-buffers V8's stdout (over a megabyte) and the buffer is
 *  lost when the browser closes: about 3 MB of throwaway trace lines push
 *  every marker out first (needs --trace-generalization). */
async function flushTrace(page) {
  let pad = ''
  for (let i = 0; i < 30000; i++) pad += `{ const o = { PA_PAD_${i}: 1 }; o.PA_PAD_${i} = 1.5 }\n`
  await page.evaluate(`(() => {\n${pad}})()`)
  await sleep(500)
}

/** Game-code representation changes after `settle` seconds, from V8's trace. */
function parseShapes() {
  const settle = parseFloat(flags.settle ?? '10')
  const text = Buffer.concat(v8out).toString('utf8')
  const late = []
  const typeOnly = []
  let arena = ''
  let t = -1
  let markers = 0
  let traced = 0
  for (const line of text.split('\n')) {
    if (line.includes('[generalizing]')) traced++
    if (/\[generalizing\]PA_MARK_A_/.test(line)) {
      t = -1
      continue
    }
    const mk = /\[generalizing\]PA_MARK_T_([a-z]+)_(\d+):/.exec(line)
    if (mk) {
      arena = mk[1]
      t = parseInt(mk[2])
      markers++
      continue
    }
    if (t < settle) continue
    const g = /\[generalizing\]([\w$]+):(\w)\{([^}]*)\}->(\w)\{([^}]*)\} \(([^)]*)\).*?(src\/[^?:\s]+)/.exec(line)
    if (!g) continue
    const [, field, fromRep, fromType, toRep, toType, why, file] = g
    const at = { arena, afterT: t, field, change: `${fromRep}{${fromType}}->${toRep}{${toType}}`, why, file }
    if (fromRep !== toRep && fromRep !== 'v') late.push(at)
    else if (fromType.split(';')[0] !== toType.split(';')[0]) typeOnly.push(at)
  }
  return { settle, late, typeOnly, markers, traced }
}

let failed = false
try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()) })
  await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 15000 })
  await page.evaluate(DRIVER)
  await page.waitForFunction('!!window.__PA', { timeout: 15000 })
  const cdp = await page.createCDPSession()
  await cdp.send('HeapProfiler.enable')

  if (flags.growth) {
    const secs = parseFloat(flags.growth)
    const heap = async () => {
      for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage')
      return (await cdp.send('Runtime.getHeapUsage')).usedSize
    }
    const setup = await page.evaluate((p, t) => window.__PA.setup('flood', 'hive', p, 0, t), PERKS, THREAT)
    await sleep((flags.warm === undefined ? 20 : WARM) * 1000)
    const before = await heap()
    const s0 = await page.evaluate(() => window.__PA.status())
    // Sampled without the GC'd objects: what the profile holds at the end is
    // what the window allocated and still keeps, per allocating function.
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096 })
    await sleep(secs * 1000)
    const after = await heap()
    const { profile } = await cdp.send('HeapProfiler.stopSampling')
    const s1 = await page.evaluate(() => window.__PA.status())
    const growthMB = +((after - before) / 1e6).toFixed(3)
    const kept = aggregate(profile.head, 1)
    console.log(JSON.stringify({
      mode: 'growth', seconds: secs, setup, beforeMB: +(before / 1e6).toFixed(3), afterMB: +(after / 1e6).toFixed(3), growthMB,
      keptMB: kept.totalMBs, keptByCategory: kept.byCategory, keptTop: kept.top, start: s0, end: s1,
    }))
  } else if (flags.shapes) {
    // runShapes after the other modes; nothing to profile here.
  } else if (flags.gc) {
    const setup = await page.evaluate((p, t) => window.__PA.setup('gc', 'hive', p, 0, t), PERKS, THREAT)
    await sleep(1000)
    await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'disabled-by-default-v8.gc'] })
    const s0 = await page.evaluate(() => window.__PA.status())
    await sleep(10000)
    const s1 = await page.evaluate(() => window.__PA.status())
    const buf = await page.tracing.stop()
    const trace = JSON.parse(Buffer.from(buf).toString('utf8'))
    const events = trace.traceEvents ?? trace
    // Headless Chrome runs several renderers: the page's main thread is the
    // CrRendererMain with the most GC pauses.
    const gcs = new Map()
    for (const e of events) if (e.name === 'MinorGC' || e.name === 'MajorGC') gcs.set(`${e.pid}:${e.tid}`, (gcs.get(`${e.pid}:${e.tid}`) ?? 0) + 1)
    const mains = events.filter((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain')
    const main = mains.sort((a, b) => (gcs.get(`${b.pid}:${b.tid}`) ?? 0) - (gcs.get(`${a.pid}:${a.tid}`) ?? 0))[0]
    const byName = {}
    for (const e of events) {
      if (e.ph !== 'X' || !e.dur) continue
      if (main && (e.pid !== main.pid || e.tid !== main.tid)) continue
      if (!/GC|Scavenge|MarkCompact|Mark|Sweep/i.test(e.name) || /^(Layout|Paint|UpdateLayer)/.test(e.name)) continue
      const b = (byName[e.name] ??= { count: 0, maxMs: 0, totalMs: 0 })
      b.count++
      b.maxMs = Math.max(b.maxMs, e.dur / 1000)
      b.totalMs += e.dur / 1000
    }
    for (const b of Object.values(byName)) { b.maxMs = +b.maxMs.toFixed(3); b.totalMs = +b.totalMs.toFixed(2) }
    const pauses = ['MinorGC', 'MajorGC'].filter((n) => byName[n])
    const maxPause = Math.max(0, ...pauses.map((n) => byName[n].maxMs))
    // No GC at all in 10 s of combat means the trace missed the page.
    const pass = pauses.length > 0 && maxPause <= 2
    if (!pass) failed = true
    console.log(JSON.stringify({ mode: 'gc', setup, start: s0, end: s1, maxPauseMs: maxPause, pass, byName }))
  } else {
    for (const arena of ARENAS) {
      for (const scen of SCEN) {
        const isEvent = scen === 'event'
        const setup = await page.evaluate((s, a, p, wm, t) => window.__PA.setup(s, a, p, wm, t), scen, arena, PERKS, WARM, THREAT)
        if (isEvent) await page.waitForFunction(() => window.__PA.eventLive(), { polling: 'raf', timeout: (WARM + 90) * 1000 })
        else await sleep(WARM * 1000)
        const s0 = await page.evaluate(() => window.__PA.status())
        if (flags.dumpio) await page.evaluate(MARK('start'))
        await cdp.send('HeapProfiler.startSampling', {
          samplingInterval: parseInt(flags.interval ?? '8192'), includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true,
        })
        const t0 = performance.now()
        if (isEvent) {
          // A timeout means the event outlived the window.
          await page.waitForFunction(() => !window.__PA.eventLive(), { polling: 100, timeout: SECONDS * 1000 }).catch((e) => {
            if (e.name !== 'TimeoutError') throw e
          })
        } else await sleep(SECONDS * 1000)
        const { profile } = await cdp.send('HeapProfiler.stopSampling')
        const secs = (performance.now() - t0) / 1000
        if (flags.dumpio) await page.evaluate(MARK('stop'))
        const s1 = await page.evaluate(() => window.__PA.status())
        const agg = aggregate(profile.head, secs)
        const eventOk = !isEvent || (s0.event && secs >= MIN_EVENT_SEC)
        const pass = eventOk && (flags.scope === 'game' ? agg.gameMBs : agg.totalMBs) <= BUDGET && agg.simOver.length === 0
        if (!pass) failed = true
        console.log(JSON.stringify({
          mode: 'alloc', scenario: scen, arena, noinline: !!flags.noinline, seconds: +secs.toFixed(2), setup, start: s0, end: s1,
          ...(isEvent ? { eventOk } : {}),
          totalMBs: agg.totalMBs, gameMBs: agg.gameMBs, byCategory: agg.byCategory, pass, simOver: agg.simOver, top: agg.top,
        }))
      }
    }
    await page.evaluate(() => window.__PA.stop())
    if (flags.dumpio) await flushTrace(page)
  }
  if (flags.shapes) await runShapes(page)
  if (pageErrors.length) {
    failed = true
    console.log(JSON.stringify({ mode: 'probe-alloc', pageErrors: pageErrors.slice(0, 10) }))
  }
} finally {
  await browser.close()
}
if (flags.shapes) {
  await v8closed
  const r = parseShapes()
  // No markers or no trace lines means the trace never arrived: that is a
  // broken run, not a clean one.
  const ran = r.markers > 0 && r.traced > 0
  if (r.late.length > 0 || !ran) failed = true
  console.log(JSON.stringify({
    mode: 'shapes', arenas: ARENAS, settleSec: r.settle, pass: ran && r.late.length === 0, markers: r.markers, traceLines: r.traced,
    representationChanges: r.late, fieldTypeChanges: r.typeOnly,
  }))
}
process.exit(failed ? 1 : 0)
