// SWARMGEDDON HUD capture (P15): the run HUD with a boss alive (in FRENZY), a
// LEVEL UP x2 chip, tier x5, an overshield, all three bonus timer rings, the
// Daily tag (DAILY #1000) and a callout in the lane, at phone sizes with
// safe-area insets. Writes one PNG per size plus the HUD element boxes, and
// checks: no two HUD boxes overlap (bitmap DigitStrips included, which a Text
// dump misses), the DASH hit circle clears the weapon pill, the boss plate and
// the pause button and the stick rest points, and every Text is at least 12 px.
// Then, per size: the Daily intro line (DAILY #1000, the longest world name)
// keeps 12 px text; the 3 s alert arrows stay inside the safe edges; a real hit
// (scoring.registerHit) flashes the tier drop and a chain decay does not; and
// real taps and clicks on the pause button pause and resume the run. At the
// first size, the boss kill lines (slain, FLAWLESS, the PRIME's win line) all
// show in order, and a line queued behind a longer one still expires.
//
// Usage: node scripts/hud-shots.mjs [sizes] [--out=DIR] [--world=hive]
//   sizes  comma list of p320,l568,p375,l667,p390,l844 (default p375,l667,p390;
//          p320 and l568 are the narrowest phones)
// Server origin: env SWG_URL (default http://localhost:5176).
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const flags = {}
const pos = []
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/s.exec(a)
  if (m) flags[m[1]] = m[2]
  else pos.push(a)
}
const OUT = flags.out || path.join(os.tmpdir(), 'swarmgeddon-hud-shots')
const WORLD = flags.world || 'hive'
fs.mkdirSync(OUT, { recursive: true })
const ONLY = (pos[0] || 'p375,l667,p390').split(',')
const SIZES = [
  { name: 'p320', w: 320, h: 568, insets: null },
  { name: 'l568', w: 568, h: 320, insets: null },
  { name: 'p375', w: 375, h: 667, insets: null },
  { name: 'l667', w: 667, h: 375, insets: null },
  { name: 'p390', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { name: 'l844', w: 844, h: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
].filter((s) => ONLY.includes(s.name))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A four-digit Daily number (2.7 years after DAILY_EPOCH): the widest title and HUD tag. */
const DAILY_TAG = 'DAILY #1000'

/** In page: the run HUD in its busiest state; the rAF hook holds it there. */
function stage(world, dailyTag) {
  const S = window.__SWARM
  const w = S.world
  S.setLoadout('nova', world)
  S.startRun('endless')
  // The widest Daily tag a real run shows (DAILY #N from the run config), so
  // the daily pairs below are checked on a Standard scene too.
  S.hud.reset(w, dailyTag)
  w.player.maxHp = w.player.hp = 1e9
  S.jumpTo(236)
  for (let i = 0; i < 60 * 12 && !(w.bossAlive && w.boss && w.time - w.boss.bornAt > 1.2); i++) {
    S.step(1)
    while (w.paused && w.draft.open) S.pickCard(0)
    w.player.hp = 1e9
  }
  S.give('rocket')
  w.player.maxHp = 100
  const hold = () => {
    w.player.maxHp = 100
    w.player.hp = 62
    w.player.invuln = 0
    w.overshield = 18
    w.chain = 180
    w.tier = 5
    w.score = 1234567
    w.pendingLevelUps = 2
    // All three bonus timer rings (FREEZE, OVERDRIVE, SHIELD) show.
    w.freezeT = 2.5
    w.overdriveT = 5.5
    w.shieldT = 3.2
    w.draft.index = Math.max(1, w.draft.index)
    w.draft.lastOpenAt = w.time
    if (w.boss) w.boss.hp = w.boss.maxHp * 0.64
    w.director.frenzy = Math.max(1, w.director.frenzy)
    requestAnimationFrame(hold)
  }
  hold()
  S.feel.hurtFlash = 0
  S.callouts.show({ prio: 3, hold: 30 }, w.script.text.mid1.title, w.script.text.mid1.sub, 0xff6aa8)
}

/** In page: HUD element boxes (screen px), the DASH circle and the rest points. */
function measure() {
  const S = window.__SWARM
  const h = S.hud
  const box = (o) => {
    if (!o || !o.visible) return null
    const b = o.getBounds()
    return { x: Math.round(b.minX), y: Math.round(b.minY), w: Math.round(b.width), h: Math.round(b.height) }
  }
  // A DigitStrip's sprites carry the atlas padding; its ink is `width` wide
  // (align 0 or 1) and about 0.8 of its font size tall around its center.
  const strip = (d, px) => {
    if (!d || !d.view.visible) return null
    const wt = d.view.worldTransform
    const k = wt.a / d.view.scale.x
    const w = d.width * k
    const x = d.align === 1 ? wt.tx - w : d.align === 0.5 ? wt.tx - w / 2 : wt.tx
    const hh = 0.4 * px * k
    return { x: Math.round(x), y: Math.round(wt.ty - hh), w: Math.round(w), h: Math.round(hh * 2) }
  }
  const boxes = {
    pause: box(h.pause), lvChip: box(h.lvChip.view), hpBar: box(h.hpBack.view), hpNum: strip(h.hpNum, 13), shieldNum: strip(h.shieldNum, 13),
    xpBar: box(h.xpBack.view), timeline: box(h.timeline), time: strip(h.time, 18), score: strip(h.score, 13), daily: box(h.daily),
    chip: box(h.chip), badge: box(h.badge), boss: box(h.boss), pill: box(h.pill),
    callout: box(S.callouts.box),
    arrow0: box(S.arrows.slots[0]), arrow1: box(S.arrows.slots[1]), arrow2: box(S.arrows.slots[2]),
    ring0: box(h.bonusRings[0].view), ring1: box(h.bonusRings[1].view), ring2: box(h.bonusRings[2].view),
  }
  const t = S.input.touch
  const hint = S.touchHint
  const texts = []
  const walk = (o, a) => {
    if (!o.visible) return
    const al = a * o.alpha
    if (o.style && typeof o.text === 'string' && o.text.trim() && al > 0.02) {
      const wt = o.worldTransform
      const fs = typeof o.style.fontSize === 'number' ? o.style.fontSize : parseFloat(o.style.fontSize)
      texts.push({ t: o.text, px: +(fs * Math.hypot(wt.a, wt.b)).toFixed(1) })
    }
    for (const c of o.children) walk(c, al)
  }
  walk(S.app.stage, 1)
  return {
    W: S.app.screen.width, H: S.app.screen.height, boxes,
    dash: { x: t.dashX, y: t.dashY, r: 44 },
    rest: [{ x: hint.left.view.x, y: hint.left.view.y }, { x: hint.right.view.x, y: hint.right.view.y }],
    laneY: h.laneY, texts,
    emerge: { started: S.emerge.started, dropped: S.emerge.dropped },
  }
}

/** The longest world name, so the Daily intro sub is at its widest. */
const DAILY_SUB = 'VIOLET DEPTHS \u00b7 SAME RUN FOR EVERYONE'

/** In page: the Daily intro line in the lane, past its enter animation.
 *  Returns the lane state when it measured (for a failure report). */
async function stageDaily(title, sub) {
  const S = window.__SWARM
  const c = S.callouts
  c.clear()
  S.feel.intro(title, sub, 0xffc24a, true)
  const t0 = performance.now()
  while (performance.now() - t0 < 1500 && !(c.box.visible && c.title.text === title && c.age > 0.3)) await new Promise((r) => setTimeout(r, 30))
  return { title: c.title.text, visible: c.box.visible, view: c.view.visible, prio: c.prio, age: +c.age.toFixed(2), life: +c.life.toFixed(2), paused: S.world.paused, screen: S.screen }
}

/** In page: the alert arrow toward the west, then the east (screen x of its center). */
async function arrowProbe() {
  const S = window.__SWARM
  const out = {}
  for (const [side, dx] of [['west', -1], ['east', 1]]) {
    S.arrows.alert(dx, 0, 0xff5a6e)
    await new Promise((r) => setTimeout(r, 120))
    const b = S.arrows.slots[0].getBounds()
    out[side] = { cx: Math.round(b.minX + b.width / 2), x0: Math.round(b.minX), x1: Math.round(b.maxX), visible: S.arrows.slots[0].visible }
  }
  return out
}

/** In page: a SHIELD bonus far to the left and a Hive Core far to the right of
 *  the ship each get an edge arrow in their tint (section 6.5 priority list). */
async function pickupArrowProbe() {
  const S = window.__SWARM
  const w = S.world
  const pk = await import('/src/systems/pickups.ts')
  const pl = w.player
  // Along the screen's short axis, so the cage clamp still leaves them off screen.
  const vert = S.app.screen.width > S.app.screen.height
  pk.dropBonus(w, pl.x - (vert ? 0 : 900), pl.y - (vert ? 900 : 0), 3)
  pk.dropHiveCore(w, pl.x + (vert ? 0 : 900), pl.y + (vert ? 900 : 0), 0)
  await new Promise((r) => setTimeout(r, 200))
  const out = []
  for (let i = 1; i < S.arrows.slots.length; i++) {
    const s = S.arrows.slots[i]
    if (!s.visible) continue
    const b = s.getBounds()
    out.push({ tint: S.arrows.icons[i].tint, cx: Math.round(b.minX + b.width / 2), cy: Math.round(b.minY + b.height / 2) })
  }
  const cam = S.camera
  const at = (k) => w.pickups.active.filter((p) => p.alive && p.kind === k).map((p) => ({ sx: Math.round(cam.worldToScreenX(p.x)), sy: Math.round(cam.worldToScreenY(p.y)) }))
  return { arrows: out, bonus: at('bonus'), core: at('core'), vert }
}

/** In page: the tier-drop flash from the real scoring calls. A chain decay drop
 *  (MultDown alone) must not flash; a hit (MultDown then ChainHit) must. The sim
 *  holds meanwhile: the stage forces the tier every frame, so a real hit on the
 *  ship would drop from a tier the feel director never saw. */
async function tierProbe() {
  const S = window.__SWARM
  const w = S.world
  const sc = await import('/src/game/scoring.ts')
  const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })
  const calls = []
  const orig = S.hud.tierDrop
  S.hud.tierDrop = function (a, b) { calls.push([a, b]); return orig.call(this, a, b) }
  w.paused = true
  try {
    await frames(2)
    w.chain = 0
    w.tier = 1
    sc.addChain(w, 160)
    w.chainT = 0
    sc.scoreStep(w, 2.0)
    await frames(3)
    const decay = calls.splice(0)
    w.chain = 0
    w.tier = 1
    sc.addChain(w, 160)
    sc.registerHit(w)
    await frames(3)
    return { decay, hit: calls.splice(0), dropVisible: S.hud.drop.visible }
  } finally {
    S.hud.tierDrop = orig
    w.paused = false
  }
}

/** In page: the lane's titles in order while the feel queue plays a boss kill. */
async function calloutProbe() {
  const S = window.__SWARM
  const w = S.world
  const { FeelKind } = await import('/src/effects/feelQueue.ts')
  const { CALLOUT } = await import('/src/ui/callouts.ts')
  const watch = async (ms) => {
    const seen = []
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      const t = S.callouts.box.visible ? S.callouts.title.text : ''
      if (t && seen[seen.length - 1] !== t) seen.push(t)
      await new Promise((r) => setTimeout(r, 40))
    }
    return seen
  }
  const x = w.player.x
  const y = w.player.y
  S.callouts.clear()
  w.bossesFlawless++
  w.feel.emit(FeelKind.BossKill, 0, x, y)
  const mid = await watch(4200)
  S.callouts.clear()
  w.bossesFlawless++
  w.feel.emit(FeelKind.Win, 0, x, y)
  w.feel.emit(FeelKind.BossKill, 0, x, y)
  const prime = await watch(6600)
  S.callouts.clear()
  S.callouts.show(CALLOUT.alertBoss, 'STALE TEST', '', 0xff6aa8)
  S.callouts.show(CALLOUT.closeCall, 'CLOSE CALL', '', 0x7dffd6)
  const stale = await watch(3800)
  return { mid, prime, stale, slain: w.script.text.slain, win: w.script.text.win }
}

function check(m) {
  const fails = []
  const b = m.boxes
  const overlap = (p, q) => p && q && Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 0 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 0
  const pairs = [
    ['time', 'hpBar'], ['time', 'xpBar'], ['time', 'score'], ['score', 'xpBar'], ['score', 'timeline'], ['daily', 'timeline'], ['daily', 'score'],
    ['lvChip', 'hpBar'], ['lvChip', 'pause'], ['hpBar', 'pause'], ['chip', 'badge'], ['chip', 'boss'], ['badge', 'boss'],
    ['callout', 'boss'], ['callout', 'badge'], ['callout', 'chip'], ['callout', 'pill'], ['hpNum', 'time'], ['hpNum', 'shieldNum'],
    ['arrow0', 'callout'], ['arrow1', 'callout'], ['arrow2', 'callout'],
  ]
  for (const r of ['ring0', 'ring1', 'ring2']) {
    if (!b[r]) fails.push(`bonus ring ${r} not showing`)
    for (const q of ['chip', 'badge', 'boss', 'callout', 'pill', 'lvChip', 'hpBar', 'xpBar', 'timeline', 'time', 'score', 'daily', 'arrow0', 'arrow1', 'arrow2']) pairs.push([r, q])
  }
  for (const [p, q] of pairs) if (overlap(b[p], b[q])) fails.push(`overlap ${p} / ${q}`)
  for (const [k, v] of Object.entries(b)) if (v && (v.x < 0 || v.y < 0 || v.x + v.w > m.W || v.y + v.h > m.H)) fails.push(`offscreen ${k}`)
  const circleHits = (c, r) => {
    if (!r) return false
    const nx = Math.max(r.x, Math.min(c.x, r.x + r.w))
    const ny = Math.max(r.y, Math.min(c.y, r.y + r.h))
    return (nx - c.x) ** 2 + (ny - c.y) ** 2 < c.r * c.r
  }
  if (circleHits(m.dash, b.pill)) fails.push('DASH hit circle overlaps the weapon pill')
  if (circleHits(m.dash, b.boss)) fails.push('DASH hit circle overlaps the boss plate')
  if (circleHits(m.dash, b.pause)) fails.push('DASH hit circle overlaps the pause button')
  for (const p of m.rest) if ((p.x - m.dash.x) ** 2 + (p.y - m.dash.y) ** 2 < m.dash.r ** 2) fails.push('DASH hit circle covers a stick rest point')
  for (const t of m.texts) if (t.px < 12) fails.push(`text under 12 px: ${t.t} (${t.px})`)
  return fails
}

await acquireChromeLock('hud-shots')
const launch = () => puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
let browser
try {
  browser = await launch()
} catch (e) {
  console.error('launch failed, retrying in 10s:', e.message)
  await sleep(10000)
  browser = await launch()
}
const report = {}
try {
  for (const size of SIZES) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    if (size.insets) {
      const cdp = await page.createCDPSession()
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets })
    }
    await page.goto(ORIGIN + '/?touch=1', { waitUntil: 'networkidle0', timeout: 45000 })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    await sleep(600)
    // A touch in the run area makes the touch UI (sticks and DASH) the live input.
    await page.evaluate(stage, WORLD, DAILY_TAG)
    await page.touchscreen.tap(size.w * 0.3, size.h * 0.7)
    await sleep(700)
    const file = path.join(OUT, `${size.name}-${WORLD}-hud.png`)
    await page.screenshot({ path: file })
    const m = await page.evaluate(measure)
    const fails = check(m)
    if (!m.boxes.daily) fails.push('the Daily tag is not showing')
    const L = size.insets ? size.insets.left : 0
    const R = size.insets ? size.insets.right : 0

    const dailyLane = await page.evaluate(stageDaily, DAILY_TAG, DAILY_SUB)
    const dailyFile = path.join(OUT, `${size.name}-${WORLD}-daily.png`)
    await page.screenshot({ path: dailyFile })
    const md = await page.evaluate(measure)
    for (const f of check(md)) fails.push('daily intro: ' + f)
    const lane = md.boxes.callout
    if (!lane) fails.push('daily intro: no callout showing ' + JSON.stringify(dailyLane))
    else if (lane.x < L || lane.x + lane.w > md.W - R) fails.push('daily intro: callout outside the safe width')
    const dailyTexts = md.texts.filter((t) => t.t.includes('DAILY') || t.t.includes('SAME RUN'))

    const arrows = await page.evaluate(arrowProbe)
    if (!arrows.west.visible || arrows.west.cx < L + 26 - 1) fails.push(`west alert arrow at x ${arrows.west.cx}, inside the left inset ${L} + 26`)
    if (!arrows.east.visible || arrows.east.cx > md.W - R - 26 + 1) fails.push(`east alert arrow at x ${arrows.east.cx}, past the right inset ${R} + 26`)

    const pa = await page.evaluate(pickupArrowProbe)
    const off = (list) => list.length > 0 && list.every((q) => q.sx < L || q.sx > md.W - R || q.sy < 0 || q.sy > md.H)
    if (!off(pa.bonus) || !off(pa.core)) fails.push('pickup arrows: the probe pickups are not off screen ' + JSON.stringify(pa))
    else {
      // The bonus lies left of (portrait) or above (landscape) the ship, the core on the other side.
      const bonusArrow = pa.arrows.find((a) => a.tint === 0x4dffa0)
      const coreArrow = pa.arrows.find((a) => a.tint === 0xffc24a)
      const at = (a) => (pa.vert ? a.cy : a.cx)
      if (!bonusArrow || !coreArrow || at(bonusArrow) >= at(coreArrow)) fails.push('bonus and Hive Core arrows missing or on the wrong sides: ' + JSON.stringify(pa.arrows))
    }

    const tier = await page.evaluate(tierProbe)
    if (tier.decay.length) fails.push('a chain decay flashed the tier drop: ' + JSON.stringify(tier.decay))
    if (JSON.stringify(tier.hit) !== '[[5,4]]' || !tier.dropVisible) fails.push('a hit did not flash x5 > x4: ' + JSON.stringify(tier))

    let callouts = null
    if (size === SIZES[0]) {
      callouts = await page.evaluate(calloutProbe)
      const want = (seen, list) => list.every((t, i) => seen[i] === t)
      if (!want(callouts.mid, [callouts.slain, 'FLAWLESS'])) fails.push('mid boss kill lines: ' + JSON.stringify(callouts.mid))
      if (!want(callouts.prime, [callouts.slain, 'FLAWLESS', callouts.win])) fails.push('PRIME kill lines: ' + JSON.stringify(callouts.prime))
      if (callouts.stale.includes('CLOSE CALL')) fails.push('a stale line showed: ' + JSON.stringify(callouts.stale))
    }

    // Real input last: a mouse click brings up the crosshair, which sits on the button.
    const pauseC = await page.evaluate(() => {
      const b = window.__SWARM.hud.pause.getBounds()
      return { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }
    })
    const state = () => page.evaluate(() => ({ paused: window.__SWARM.world.paused, t: window.__SWARM.world.time }))
    const pause = []
    const tapThen = async (label, act) => {
      await act()
      await sleep(250)
      const a = await state()
      await sleep(250)
      const b = await state()
      pause.push({ label, paused: a.paused, advancing: b.t > a.t })
    }
    await tapThen('touch tap on pause', () => page.touchscreen.tap(pauseC.x, pauseC.y))
    await tapThen('touch tap on pause again', () => page.touchscreen.tap(pauseC.x, pauseC.y))
    await tapThen('mouse click on pause', () => page.mouse.click(pauseC.x, pauseC.y))
    await tapThen('mouse click on pause under the crosshair', () => page.mouse.click(pauseC.x, pauseC.y))
    await tapThen('mouse click on pause, third', () => page.mouse.click(pauseC.x, pauseC.y))
    await tapThen('mouse click elsewhere', () => page.mouse.click(size.w / 2, size.h * 0.55))
    const wantPaused = [true, false, true, false, true, false]
    pause.forEach((p, i) => {
      if (p.paused !== wantPaused[i] || p.advancing === wantPaused[i]) fails.push(`${p.label}: paused ${p.paused}, time advancing ${p.advancing}`)
    })

    report[size.name] = { file, dailyFile, fails, errors, ...m, dailyTexts, arrows, pickupArrows: pa, tier, callouts, pause }
    console.log(JSON.stringify({ size: size.name, file, dailyFile, fails, errors, boxes: m.boxes, dash: m.dash, rest: m.rest, laneY: m.laneY, dailyTexts, arrows, pickupArrows: pa, tier, callouts, pause }))
    await ctx.close()
  }
} finally {
  await browser.close()
}
fs.writeFileSync(path.join(OUT, 'hud-report.json'), JSON.stringify(report, null, 1))
process.exit(0)
