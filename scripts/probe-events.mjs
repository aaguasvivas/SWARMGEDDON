// Swarm event and elite affix probe (NEXT-LEVEL P7). Drives the DEV build's
// __SWARM handle headless; takes the machine-wide Chrome lock first.
// Server origin: env SWG_URL (default http://localhost:5176).
//
// Usage: node scripts/probe-events.mjs [checks|shots] [--out=DIR]
//   checks (default): with the render loop stopped and an invincible ship that
//     neither moves nor fires, every A8 event of every world runs from its warn:
//     script draws per event, the alert, unit and hazard counts, stream
//     heading, distance, speed and TTL exit with no credit, the FINAL SWARM
//     body counts; then each A9 affix through the real elite beat; the name
//     tag lines; and a held event and elite firing 10 and 22 s after a boss
//     kill with their alerts their lead earlier.
//   shots: screenshots at 375x667, 667x375 and 390x844 (safe-area insets
//     47/34) of elite name tags (0, 1 and 2 affixes) and of STAMPEDE and HIVE
//     WALL crossing the view, into --out (default /tmp/swg-p7-shots).
// Prints one JSON line per check and exits 1 if any check fails.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
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
const MODE = pos[0] || 'checks'
const OUT = flags.out || '/tmp/swg-p7-shots'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function checks() {
  const S = window.__SWARM
  const w = S.world
  const pl = w.player
  const inp = S.input
  const R = await import('/src/content/runScripts.ts')
  const A = await import('/src/content/affixes.ts')
  const { ENEMIES } = await import('/src/content/enemies.ts')
  const { Rng, SALT, hash32 } = await import('/src/core/rng.ts')
  const { quadrant } = await import('/src/systems/events.ts')
  const out = {}
  S.loop.stop()
  inp.update = () => {
    inp.move.x = inp.move.y = 0
    inp.aimDir.x = inp.aimDir.y = 0
    inp.firing = false
  }
  const god = () => {
    pl.maxHp = pl.hp = 1e9
  }
  const fresh = (arena, seed = 777) => {
    S.setLoadout('nova', arena)
    S.startRun('endless')
    S.loop.stop()
    w.beginRun(seed >>> 0, 'endless') // keeps the pilot and world startRun set
    god()
  }
  const stepTo = (t) => {
    while (w.time < t - 1e-9) {
      S.step(1)
      while (w.paused && w.draft.open) S.pickCard(0)
      god()
    }
  }
  /** Script draws between two stream states (mulberry32 steps). */
  const draws = (from, to) => {
    const r = new Rng(from)
    for (let n = 0; n <= 400; n++) {
      if (r.state === to) return n
      r.float()
    }
    return -1
  }
  const lastAlert = () => w.alerts.slots[(w.alerts.seq - 1 + w.alerts.slots.length) % w.alerts.slots.length]
  const WANT_DRAWS = { stampede: 1, broodRing: 1, hiveWall: 1, riptide: 1, shoalRun: 1, blinkStorm: 2, cinderWall: 1, chargerVolley: 2, mortarBarrage: 37 }
  const FINAL_DRAWS = { hive: 1, depths: 2, wastes: 2 }
  // Units per event (the ship stands at the arena center, so nothing is clipped).
  const WANT_UNITS = { stampede: 40, broodRing: 33, hiveWall: 22, riptide: 27, shoalRun: 48, blinkStorm: 0, cinderWall: 18, chargerVolley: 10, mortarBarrage: 0 }
  const FINAL_UNITS = { hive: 113, depths: 80, wastes: 46 }

  // A shared seed would draw the same first side in every case (each case
  // starts the script stream afresh), so each directional case gets a seed
  // whose first draw lands on the next side in E, S, W, N order, and the
  // alert must name that side (the ship stands at the center: no refit).
  const WORD = ['EAST', 'SOUTH', 'WEST', 'NORTH']
  const sides = []
  let dirNo = 0
  for (const arena of ['hive', 'depths', 'wastes']) {
    const script = R.WORLD_SCRIPTS[arena]
    for (const b of script.beats) {
      if (b.kind !== 'event') continue
      const def = R.eventDef(script, b.id)
      const want = def.dir === 'none' ? -1 : dirNo++ % 4
      let seed = 1001
      while (want >= 0 && quadrant(new Rng(hash32(seed, SALT.script)).float() * Math.PI * 2) !== want) seed++
      fresh(arena, seed)
      S.jumpTo(b.at - 3.5)
      w.enemies.clear()
      const seq0 = w.alerts.seq
      const s0 = w.rngs.script.state
      stepTo(b.at - 3 + 1 / 60)
      const n = draws(s0, w.rngs.script.state)
      const alert = w.alerts.seq > seq0 ? lastAlert() : null
      const uid0 = w.enemyUidSeq
      const hz0 = w.hazardSeq
      const seen = new Map()
      const hz = new Map()
      let first = null
      let maxSpeed = 0
      let lateral = 0
      let atPos = null
      let delays = 0
      for (const p of def.parts) delays = Math.max(delays, p.delay + (p.kind === 'stream' ? p.dur : p.kind === 'mortar' ? p.count / p.perSec : 0))
      const end = b.at + delays + 1.5
      while (w.time < end - 1e-9) {
        if (atPos === null && w.time >= b.at - 1e-9) atPos = [pl.x, pl.y]
        S.step(1)
        god()
        for (const e of w.enemies.active) {
          if (!e.alive || e.uid < uid0) continue
          if (!seen.has(e.uid)) {
            seen.set(e.uid, { id: e.def.id, ev: e.eventUnit, stream: e.stream, x: e.x, y: e.y, dir: e.phaseDir, speed: e.speed, phase: e.phase, st: e.stateTimer, hp: e.maxHp })
            if (e.stream && !first) first = { x: e.x, y: e.y, dir: e.phaseDir, px: pl.x, py: pl.y }
          }
          if (e.stream) {
            maxSpeed = Math.max(maxSpeed, Math.hypot(e.vx, e.vy))
            const hx = Math.cos(e.phaseDir)
            const hy = Math.sin(e.phaseDir)
            lateral = Math.max(lateral, Math.abs(-e.vx * hy + e.vy * hx))
          }
        }
        for (const h of w.hazards.active) if (h.alive && h.seq > hz0 && !hz.has(h.seq)) hz.set(h.seq, { x: h.x, y: h.y, r: h.r, dmg: h.damage, tele: h.teleMax, onEnd: h.onEnd, unit: h.unit })
      }
      const units = [...seen.values()]
      const evUnits = units.filter((u) => u.ev)
      const final = b.id === 'finalSwarm'
      const wantDraws = final ? FINAL_DRAWS[arena] : WANT_DRAWS[b.id]
      const wantUnits = final ? FINAL_UNITS[arena] : WANT_UNITS[b.id]
      const r = { arena, event: b.id, at: b.at, draws: n, wantDraws, alert: alert ? `${alert.title} / ${alert.sub}` : null, eventUnits: evUnits.length, wantUnits }
      let pass = n === wantDraws && !!alert && alert.title === def.title && evUnits.length === wantUnits
      if (want >= 0) {
        const got = alert ? alert.sub.split(' ').pop() : null
        sides.push(got)
        r.side = { want: WORD[want], got }
        pass &&= got === WORD[want]
      }
      if (def.dir === 'from') pass &&= /^FROM THE (NORTH|SOUTH|EAST|WEST)$/.test(alert?.sub ?? '')
      else if (def.dir === 'gap') pass &&= /^GAP TO THE (NORTH|SOUTH|EAST|WEST)$/.test(alert?.sub ?? '')
      else pass &&= alert?.sub === def.sub
      if (first) {
        // The heading is locked toward the ship: the ship lies ahead of the
        // first unit, inside its stream band or wall half-length; the origin
        // is at the authored distance (widened by that lateral offset).
        const part = def.parts.find((p) => p.kind === 'stream' || p.kind === 'wall')
        const half = part.kind === 'wall' ? ((part.count - 1) / 2) * part.spacing : part.band
        const rx = first.px - first.x
        const ry = first.py - first.y
        const ahead = rx * Math.cos(first.dir) + ry * Math.sin(first.dir)
        const lat = Math.abs(-rx * Math.sin(first.dir) + ry * Math.cos(first.dir))
        r.stream = { originDist: Math.round(Math.hypot(rx, ry)), wantDist: part.dist, ahead: Math.round(ahead), lateral0: Math.round(lat), maxSpeed: +maxSpeed.toFixed(1), lateral: +lateral.toFixed(1) }
        // Seen after its first AI step, so one tick of travel is already done.
        pass &&= Math.abs(ahead + part.speed / 60 - part.dist) <= 2 && lat <= half + 2
        if (part.kind === 'stream' && part.wobble > 0) pass &&= lateral > 0.9 * part.wobble * part.wobbleFreq
        else pass &&= Math.abs(maxSpeed - part.speed) < 0.5
      }
      if (b.id === 'broodRing' || b.id === 'riptide') {
        const ring = def.parts[0]
        const hpOk = evUnits.every((u) => Math.abs(u.hp - Math.round(Math.round(ENEMIES[ring.unit].hp + b.at * ENEMIES[ring.unit].hpRamp) * ring.hpMul)) <= 1)
        r.ringHpMul = hpOk
        pass &&= hpOk
      }
      if (b.id === 'chargerVolley') {
        const ok = evUnits.every((u) => u.phase === 1 && Math.abs(u.st - (0.9 - 1 / 60)) < 1e-3)
        r.windup = ok
        pass &&= ok
      }
      if (b.id === 'blinkStorm' || (final && arena === 'depths')) {
        const markers = [...hz.values()].filter((h) => h.dmg === 0 && h.r === 34)
        // Pulses spawn psychics too in Depths: count only those on a marker.
        const psychics = units.filter((u) => u.id === 'psychic' && markers.some((h) => Math.hypot(h.x - u.x, h.y - u.y) < 1)).length
        r.blink = { markers: markers.length, psychics, spawnUnit: markers.every((h) => h.onEnd === 3 && h.unit === 'psychic') }
        pass &&= markers.length === 10 && psychics === 10 && r.blink.spawnUnit
      }
      if (b.id === 'mortarBarrage') {
        const drops = [...hz.values()].filter((h) => h.dmg === 22 && h.r === 70 && h.tele === 1)
        r.mortar = { drops: drops.length, magma: drops.filter((h) => h.onEnd === 1).length }
        pass &&= drops.length === 18 && r.mortar.magma === 6
      }
      if (final && arena === 'hive') pass &&= evUnits.length === 113
      r.pass = pass
      out[`event_${arena}_${b.id}`] = r
    }
  }

  out.event_sides_all_four = { sides, pass: new Set(sides).size === 4 }

  // The fit turns a side that would put the stream origin past the wall: S
  // drawn EAST with the ship 200 u from the east wall becomes WEST.
  {
    let seed = 1001
    while (quadrant(new Rng(hash32(seed, SALT.script)).float() * Math.PI * 2) !== 0) seed++
    fresh('hive', seed)
    S.jumpTo(146.5)
    w.enemies.clear()
    const b = w.arena.bounds
    pl.x = pl.prevX = b.x + b.w - 200
    pl.y = pl.prevY = b.y + b.h / 2
    const seq0 = w.alerts.seq
    stepTo(150 + 1 / 60)
    const alert = w.alerts.seq > seq0 ? w.alerts.slots[seq0 % w.alerts.slots.length] : null
    const first = w.enemies.active.find((e) => e.stream)
    out.fit_side_flip = {
      alert: alert ? alert.sub : null, originDx: first ? Math.round(first.x - pl.x) : null,
      pass: alert?.sub === 'FROM THE WEST' && !!first && first.x - pl.x < -700,
    }
  }

  // STREAM units leave at their TTL (or outside the arena) with no credit.
  {
    fresh('hive')
    S.jumpTo(146.5)
    w.enemies.clear()
    stepTo(152.2)
    const kills = w.kills
    const xp = w.xpDropped
    const streamIds = new Set(w.enemies.active.filter((e) => e.stream).map((e) => e.uid))
    stepTo(150 + 2 + 9 + 0.5)
    const left = w.enemies.active.filter((e) => e.alive && streamIds.has(e.uid)).length
    out.stream_ttl = { streamUnits: streamIds.size, leftAfterTtl: left, killsDelta: w.kills - kills, xpDelta: +(w.xpDropped - xp).toFixed(2), pass: streamIds.size > 0 && left === 0 && w.kills === kills && w.xpDropped === xp }
  }

  // Affixes, through the real elite beat (3:15, one affix): the mask drawn at
  // warn time is replaced before the beat fires.
  const eliteWith = (arena, mask) => {
    fresh(arena)
    S.jumpTo(192)
    stepTo(193 + 1 / 60)
    const i = w.script.beats.findIndex((b) => b.kind === 'elite' && b.at === 195)
    const off = w.script.drawOff[i]
    const drawn = w.director.beatAffix[off]
    w.director.beatAffix[off] = mask
    const uid0 = w.enemyUidSeq
    stepTo(195 + 1 / 60)
    const e = w.enemies.active.find((x) => x.uid >= uid0 && x.def.elite)
    w.director.runState = 'stalemate' // freeze the director: no more beats or spawns
    for (const o of w.enemies.active) if (o !== e) o.alive = false
    w.enemyProjectiles.clear() // globs in flight would leave acid of their own
    w.acid.clear()
    S.step(1)
    return { e, drawn, pool: w.script.affixPool.map((a) => A.AFFIX_BIT[a]) }
  }
  {
    const { e, drawn, pool } = eliteWith('hive', A.AF_HASTED)
    const base = ENEMIES.guardian.speed * (1 + 0.0012 * Math.min(195, 360))
    out.affix_drawn_from_pool = { drawn, pass: pool.includes(drawn) }
    out.affix_hasted_speed = { speed: +e.speed.toFixed(2), want: +(base * 1.5).toFixed(2), pass: Math.abs(e.speed - base * 1.5) < 0.01 }
    // The ceiling still applies to a hasted body (a burrowing leviathan at 2.2x).
    const lev = eliteWith('wastes', A.AF_SHIELDED)
    let maxTurn = 0
    let maxV = 0
    for (let k = 0; k < 240; k++) {
      pl.x = pl.prevX = lev.e.x + Math.cos(k * 0.4) * 250
      pl.y = pl.prevY = lev.e.y + Math.sin(k * 0.4) * 250
      const f0 = lev.e.facing
      S.step(1)
      god()
      let d = lev.e.facing - f0
      d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI
      maxTurn = Math.max(maxTurn, Math.abs(d))
      maxV = Math.max(maxV, Math.hypot(lev.e.vx, lev.e.vy))
    }
    out.affix_shielded = { armor: lev.e.armor, maxTurnPerTick: +maxTurn.toFixed(4), limit: +(2.4 / 60).toFixed(4), pass: lev.e.armor === 0.6 && maxTurn <= 2.4 / 60 + 1e-6 && maxTurn > 0 }
    const hw = eliteWith('wastes', A.AF_SHIELDED)
    hw.e.affix |= A.AF_HASTED
    hw.e.speed *= 1.5
    let v = 0
    for (let k = 0; k < 600; k++) {
      S.step(1)
      god()
      v = Math.max(v, Math.hypot(hw.e.vx, hw.e.vy))
    }
    out.affix_hasted_ceiling = { maxSpeed: +v.toFixed(1), pass: v <= 240 + 1e-6 }
  }
  {
    const { e } = eliteWith('depths', A.AF_HASTED)
    // Warden cooldowns x0.75: the next shot and blink timers restart at 1.5 s and 2.1 s.
    let fire = null
    let tele = null
    for (let k = 0; k < 600 && (fire === null || tele === null); k++) {
      const f0 = e.fireTimer
      const t0 = e.stateTimer
      S.step(1)
      god()
      if (fire === null && e.fireTimer > f0) fire = +e.fireTimer.toFixed(3)
      if (tele === null && e.stateTimer > t0) tele = +e.stateTimer.toFixed(3)
    }
    out.affix_hasted_cooldowns = { fireReset: fire, teleReset: tele, want: [1.5, 2.1], pass: Math.abs(fire - 1.5) < 1e-6 && Math.abs(tele - 2.1) < 1e-6 }
  }
  {
    const { e } = eliteWith('hive', A.AF_MOLTEN)
    const a0 = w.acid.size
    let pools = 0
    for (let k = 0; k < 300; k++) {
      const n0 = w.acid.size
      S.step(1)
      god()
      if (w.acid.size > n0) pools += w.acid.size - n0
    }
    out.affix_molten = { poolsIn5s: pools, startPools: a0, alive: e.alive, pass: pools === 5 }
  }
  const shootDown = (e, frames) => {
    inp.update = () => {
      const dx = e.x - pl.x
      const dy = e.y - pl.y
      const d = Math.hypot(dx, dy) || 1
      inp.aimDir.x = dx / d
      inp.aimDir.y = dy / d
      inp.firing = true
      inp.move.x = inp.move.y = 0
    }
    S.give('railgun')
    const born = []
    for (let k = 0; k < frames && e.alive; k++) {
      pl.x = pl.prevX = e.x - 200
      pl.y = pl.prevY = e.y
      e.x = e.prevX
      S.step(1)
      god()
      for (const o of w.enemies.active) if (o.alive && o.bornAt === w.time && !o.def.elite) born.push({ t: w.time, id: o.def.id, d: Math.hypot(o.x - e.x, o.y - e.y), hpFrac: e.hp / e.maxHp })
    }
    inp.update = () => {
      inp.move.x = inp.move.y = 0
      inp.aimDir.x = inp.aimDir.y = 0
      inp.firing = false
    }
    return born
  }
  {
    const { e } = eliteWith('hive', A.AF_BROOD)
    const born = shootDown(e, 1200)
    const half = born.filter((b) => b.hpFrac > 0)
    const death = born.filter((b) => b.hpFrac <= 0)
    out.affix_brood = {
      killed: !e.alive, atHalf: half.length, onDeath: death.length, fodder: [...new Set(born.map((b) => b.id))], maxDist: Math.max(0, ...born.map((b) => +b.d.toFixed(1))),
      pass: !e.alive && half.length === 4 && death.length === 4 && born.every((b) => b.id === 'swarmer'),
    }
  }
  {
    const { e } = eliteWith('depths', A.AF_VOLATILE)
    const hz0 = w.hazardSeq
    shootDown(e, 1200)
    const h = w.hazards.active.find((x) => x.alive && x.seq > hz0)
    out.affix_volatile = { killed: !e.alive, hazard: h ? { r: h.r, tele: h.teleMax, dmg: h.damage, dist: +Math.hypot(h.x - e.x, h.y - e.y).toFixed(1) } : null, pass: !e.alive && !!h && h.r === 110 && h.teleMax === 0.8 && h.damage === 22 }
  }

  // Name tags (section 4.7): affixes and name on one line up to 18 characters.
  {
    const g = ENEMIES.guardian.idx
    const lev = ENEMIES.duneLeviathan.idx
    const cases = [
      [g, 0, 'GUARDIAN', ''],
      [g, A.AF_HASTED, 'HASTED GUARDIAN', ''],
      [lev, A.AF_VOLATILE, 'VOLATILE LEVIATHAN', ''],
      [lev, A.AF_SHIELDED, 'SHIELDED LEVIATHAN', ''],
      [g, A.AF_HASTED | A.AF_VOLATILE, 'GUARDIAN', 'HASTED · VOLATILE'],
      [ENEMIES.abyssalWarden.idx, A.AF_MOLTEN | A.AF_BROOD, 'WARDEN', 'MOLTEN · BROOD'],
    ]
    const got = cases.map(([i, m]) => [A.tagTitle(i, m), A.tagSub(i, m)])
    out.name_tags = { got, pass: cases.every((c, k) => got[k][0] === c[2] && got[k][1] === c[3]) }
  }

  // A held event and elite: the 5:10 elite and the 5:30 event come due inside
  // the mid1 cage and fire 10 and 22 s after the kill, alerts their lead earlier.
  {
    fresh('hive')
    S.jumpTo(236)
    stepTo(300)
    const boss = w.boss
    const alerts = []
    let seq = w.alerts.seq
    const note = () => {
      while (seq < w.alerts.seq) {
        const a = w.alerts.slots[seq % w.alerts.slots.length]
        alerts.push({ t: +a.t.toFixed(2), kind: a.kind, title: a.title, sub: a.sub })
        seq++
      }
    }
    stepTo(340)
    note()
    const heldAt340 = Array.from(w.director.deferred).filter((x) => x >= 0).length
    boss.hp = 1
    inp.update = () => {
      const dx = boss.x - pl.x
      const dy = boss.y - pl.y
      const d = Math.hypot(dx, dy) || 1
      inp.aimDir.x = dx / d
      inp.aimDir.y = dy / d
      inp.firing = true
    }
    let killAt = null
    for (let k = 0; k < 600 && killAt === null; k++) {
      S.step(1)
      god()
      if (!w.bossAlive) killAt = w.time
    }
    inp.update = () => {
      inp.aimDir.x = inp.aimDir.y = 0
      inp.firing = false
    }
    stepTo(killAt + 23)
    note()
    const iElite = w.script.beats.findIndex((b) => b.kind === 'elite' && b.at === 310)
    const iEvent = w.script.beats.findIndex((b) => b.kind === 'event' && b.at === 330)
    const fe = w.director.firedAt[iElite]
    const fv = w.director.firedAt[iEvent]
    const eliteAlert = alerts.find((a) => a.kind === 4 && a.t > killAt)
    const eventAlert = alerts.find((a) => a.kind === 3 && a.t > killAt)
    const tick = 1 / 60 + 1e-3
    out.deferral = {
      killAt: +killAt.toFixed(2), heldAt340, eliteFired: +fe.toFixed(2), eventFired: +fv.toFixed(2), eliteAlert, eventAlert,
      pass: heldAt340 === 2 && Math.abs(fe - (killAt + 10)) <= tick && Math.abs(fv - (killAt + 22)) <= tick &&
        !!eliteAlert && Math.abs(eliteAlert.t - (killAt + 8)) <= tick && !!eventAlert && Math.abs(eventAlert.t - (killAt + 19)) <= tick,
    }
  }
  return out
}

/** Screenshot scenes; `kind` picks one. Leaves the sim paused and the render loop live. */
function scene(kind) {
  const S = window.__SWARM
  const w = S.world
  const pl = w.player
  S.setLoadout('nova', 'hive')
  S.startRun('endless')
  pl.maxHp = pl.hp = 1e9
  const inp = S.input
  const realUpdate = inp.update
  inp.update = () => {
    inp.move.x = inp.move.y = 0
    inp.aimDir.x = inp.aimDir.y = 0
    inp.firing = false
  }
  const stepTo = (t) => {
    while (w.time < t - 1e-9) {
      S.step(1)
      while (w.paused && w.draft.open) S.pickCard(0)
      pl.maxHp = pl.hp = 1e9
    }
  }
  if (kind === 'tags') {
    S.jumpTo(192)
    stepTo(195.2)
    const elites = w.enemies.active.filter((e) => e.alive && e.def.elite)
    S.spawn('guardian', 2)
    const all = w.enemies.active.filter((e) => e.alive && e.def.elite)
    // Three tags: the beat's elite (1 affix), a teaching-style one (none), one with 2 affixes.
    const masks = [elites[0]?.affix || 2, 0, 2 | 8]
    all.slice(0, 3).forEach((e, i) => {
      e.affix = masks[i]
      e.x = e.prevX = pl.x + [-120, 130, 20][i]
      e.y = e.prevY = pl.y + [-150, -40, 150][i]
      e.bornAt = w.time - 2
    })
    for (const e of w.enemies.active) if (!e.def.elite && Math.hypot(e.x - pl.x, e.y - pl.y) < 90) e.alive = false
  } else if (kind === 'stampede') {
    S.jumpTo(146.5)
    stepTo(150 + 2.7)
  } else {
    S.jumpTo(521.5)
    for (const e of w.enemies.active) e.alive = false
    stepTo(525 + 6)
  }
  w.paused = true
  S.feel.hurtFlash = 0
  inp.update = realUpdate
  const f = (e) => e.alive && Math.abs(e.x - pl.x) < 400 && Math.abs(e.y - pl.y) < 600
  return { t: +w.time.toFixed(2), streamInView: w.enemies.active.filter((e) => f(e) && e.stream).length, elites: w.enemies.active.filter((e) => f(e) && e.def.elite).map((e) => e.affix) }
}

async function launch() {
  await acquireChromeLock('probe-events')
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 900000, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
    } catch (e) {
      console.error(`launch failed (${e.message}); retrying in 10 s`)
      await sleep(10000)
    }
  }
  throw new Error('could not launch Chrome')
}

const browser = await launch()
let failed = 0
try {
  if (MODE === 'checks') {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await page.setViewport({ width: 390, height: 844 })
    await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 45000 })
    await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
    const res = await page.evaluate(checks)
    res.errors = { list: errors, pass: errors.length === 0 }
    for (const [k, v] of Object.entries(res)) {
      if (!v.pass) failed++
      console.log(JSON.stringify({ check: k, ...v }))
    }
  } else {
    fs.mkdirSync(OUT, { recursive: true })
    const sizes = [
      { name: 'p375', w: 375, h: 667, insets: null },
      { name: 'l667', w: 667, h: 375, insets: null },
      { name: 'p390', w: 390, h: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
    ]
    for (const size of sizes) {
      const ctx = await browser.createBrowserContext()
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
      if (size.insets) {
        const cdp = await page.createCDPSession()
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: size.insets }).catch((e) => errors.push('insets: ' + e.message))
      }
      // A returning player: the touch-controls guide is already learned.
      await page.evaluateOnNewDocument(() => {
        try {
          localStorage.setItem('swarmgeddon:seenTouchControls', 'true')
        } catch {}
      })
      await page.goto(`${ORIGIN}/?seed=777&touch=1`, { waitUntil: 'networkidle0', timeout: 45000 })
      await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
      for (const kind of ['tags', 'stampede', 'wall']) {
        const info = await page.evaluate(scene, kind)
        // The staged steps run in one frame, so the world intro and the beat's
        // alert (real-clock labels) would still show: let them finish first.
        await sleep(3600)
        const file = `${OUT}/${size.name}-${kind}.png`
        await page.screenshot({ path: file })
        console.log(JSON.stringify({ shot: file, ...info }))
      }
      if (errors.length) {
        failed++
        console.log(JSON.stringify({ size: size.name, errors }))
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
