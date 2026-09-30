// Boss kit probe (NEXT-LEVEL P6b: the VOID MATRON and EMBER TYRANT kits and
// the PRIME signatures, A10.3). Drives the DEV build's __SWARM handle headless;
// takes the machine-wide Chrome lock first. Server origin: env SWG_URL
// (default http://localhost:5176).
//
// Usage: node scripts/probe-bosskits.mjs [--shots=DIR] [--only=name,...]
//   kits: every Matron and Tyrant attack forced in its stage. Checks the A10.3
//     decal, telegraph, damage and parameters of each, the lance echo in P2,
//     the rift storm aim per blink, the undertow pull, the turret cap and
//     collapse, the sweep flip and the cinderfall spiral.
//   invariants: 90 s of each fight (mid1, mid2, PRIME) in every world
//     with an invulnerable circling player and HP stepped through the phases:
//     every boss telegraph is at least 0.6 s, no boss telegraph is up while
//     the boss idles, recovers, roars or emerges (one attack's telegraph at a
//     time), and the PRIME casts its signature.
//   --shots=DIR: each new telegraph (plus the lance bolts, the undertow pull,
//     the turrets, the burning sweep, and two QUEEN markers for the shared
//     marker style) at 375x667 and 667x375, DPR 2;
//     --only limits the shots to the named setups.
// Prints one JSON line per check and exits 1 if any check fails.
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { acquireChromeLock } from './lib/chromeLock.mjs'

const ORIGIN = (process.env.SWG_URL || 'http://localhost:5176').replace(/\/+$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8)
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** In-page helpers shared by the checks and the shot setups. */
function installHelpers() {
  const S = window.__SWARM
  const w = S.world
  const pl = w.player
  const inp = S.input
  const AT = { mid1: 240, mid2: 450, final: 630 }
  const H = {
    S,
    w,
    pl,
    BS_EMERGE: 0,
    BS_IDLE: 1,
    BS_TELE: 2,
    BS_ACTIVE: 3,
    BS_RECOVER: 4,
    BS_ROAR: 5,
    still() {
      inp.update = () => {
        inp.move.x = inp.move.y = 0
        inp.aimDir.x = inp.aimDir.y = 0
        inp.firing = false
      }
    },
    pin(x, y) {
      pl.x = pl.prevX = x
      pl.y = pl.prevY = y
    },
    center() {
      const c = w.director.cage
      return c.active ? [c.x, c.y] : [w.arena.bounds.x + w.arena.bounds.w / 2, w.arena.bounds.y + w.arena.bounds.h / 2]
    },
    clearField() {
      for (const o of w.enemies.active) if (o.alive && o !== w.boss) o.alive = false
      w.enemyProjectiles.clear()
    },
    /** A fresh run of `arena` at the `stage` boss, the player pinned at the
     *  arena center, stepped until the boss idles. */
    fight(arena, stage) {
      S.setLoadout('nova', arena)
      S.startRun('endless')
      H.still()
      pl.maxHp = pl.hp = 1e9
      const b = w.arena.bounds
      const cx = b.x + b.w / 2
      const cy = b.y + b.h / 2
      S.jumpTo(AT[stage] - 1.6)
      for (let i = 0; i < 600 && !w.bossAlive; i++) {
        H.pin(cx, cy)
        S.step(1)
      }
      const f = w.bossFight
      for (let i = 0; i < 600 && f.state !== H.BS_IDLE; i++) {
        H.pin(cx, cy)
        H.clearField()
        S.step(1)
      }
      return f
    },
    /** Put the fight in `phase` (HP just above the next threshold). */
    phase(p) {
      const f = w.bossFight
      const e = w.boss
      f.phase = p
      f.rot = 0
      const th = { mid1: [0.5], mid2: [0.66, 0.33], final: [0.66, 0.33] }[f.stage]
      e.hp = p === 0 ? e.maxHp : p < th.length ? e.maxHp * (th[p] + 0.02) : e.maxHp * 0.3
    },
    /** Start the attack at rotation index `rot` on the next tick. */
    force(rot) {
      const f = w.bossFight
      f.rot = rot
      f.state = H.BS_IDLE
      f.stateT = 1 / 60
    },
    newHazards(seq0) {
      return w.hazards.active.filter((h) => h.alive && h.seq > seq0)
    },
  }
  window.__KIT = H
  return true
}

async function kitChecks() {
  const H = window.__KIT
  const { S, w, pl } = H
  const { ENEMIES } = await import('/src/content/enemies.ts')
  const B = await import('/src/content/bosses.ts')
  S.loop.stop()
  const DEG = Math.PI / 180
  const near = (a, b, tol) => Math.abs(a - b) <= tol
  const tick = 1 / 60
  const out = {}
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

  // ---------- VOID MATRON ----------
  {
    // A riftBlink: a circle on the player, 26 on a player who stays, 0 on one who
    // leaves, and the boss lands in the circle.
    const f = H.fight('depths', 'mid2')
    const [cx, cy] = H.center()
    H.clearField()
    let seq = w.hazardSeq
    H.force(0)
    H.pin(cx, cy)
    S.step(1)
    const hz = H.newHazards(seq)
    const h = hz[0]
    const shape = h && { n: hz.length, shape: h.shape, r: h.r, dx: h.x - cx, dy: h.y - cy, dmg: h.damage, tele: h.teleMax, live: h.liveMax, onEnd: h.onEnd, boss: h.boss, attack: f.attack }
    let lost = 0
    pl.biteCd = 10
    for (let t = 0; t < 120 && h.alive; t++) {
      const hp = pl.hp
      H.pin(cx, cy)
      pl.biteCd = 10
      S.step(1)
      lost += hp - pl.hp
    }
    const landed = w.boss ? Math.hypot(w.boss.x - cx, w.boss.y - cy) : -1
    for (let t = 0; t < 300 && f.state !== H.BS_IDLE; t++) S.step(1)
    seq = w.hazardSeq
    H.force(0)
    S.step(1)
    const h2 = H.newHazards(seq)[0]
    let lostOut = 0
    for (let t = 0; t < 120 && h2.alive; t++) {
      const hp = pl.hp
      H.pin(h2.x + B.RIFT_BLINK.r + pl.radius + 4, h2.y)
      pl.biteCd = 10
      S.step(1)
      lostOut += hp - pl.hp
    }
    out.riftBlink = {
      shape,
      lostInside: lost,
      lostOutside: lostOut,
      bossToCircle: +landed.toFixed(2),
      pass:
        shape.n === 1 && shape.shape === 0 && shape.r === 140 && near(shape.dx, 0, 1e-6) && near(shape.dy, 0, 1e-6) &&
        shape.dmg === 26 && near(shape.tele, 0.9, 1e-9) && near(shape.live, 0.15, 1e-9) && shape.onEnd === 2 && shape.boss &&
        lost === 26 && lostOut === 0 && landed < 1,
    }

    // B psiLance: three lanes at -24, 0 and +24 degrees on the player, bolts down
    // them; in P2 a second volley 0.15 s later.
    const volley = (phase, rotB) => {
      H.fight('depths', 'mid2')
      H.phase(phase)
      H.clearField()
      const e = w.boss
      const s0 = w.hazardSeq
      H.force(rotB)
      S.step(1)
      const lanes = H.newHazards(s0)
      const aim = Math.atan2(pl.y - e.y, pl.x - e.x)
      const rel = lanes.map((l) => +(angDiff(l.ang, aim) / DEG).toFixed(3)).sort((a, b) => a - b)
      const f = w.bossFight
      let t = 0
      while (f.state === H.BS_TELE && t++ < 120) S.step(1)
      const own = () => w.enemyProjectiles.active.filter((p) => p.alive && p.ownerIdx === e.def.idx)
      const atCast = own()
      const b0 = atCast[0]
      const bolt = b0 && { speed: +Math.hypot(b0.vx, b0.vy).toFixed(2), dmg: b0.damage, r: b0.radius, reach: +(b0.life * Math.hypot(b0.vx, b0.vy) + Math.hypot(b0.x - e.x, b0.y - e.y)).toFixed(2) }
      S.step(9)
      return {
        lanes: lanes.length,
        rel,
        lane: lanes[0] && { len: lanes[0].len, halfW: lanes[0].r, dmg: lanes[0].damage, tele: lanes[0].teleMax, shape: lanes[0].shape },
        teleTicks: t,
        boltsAtCast: atCast.length,
        boltsAfter: own().length,
        bolt,
      }
    }
    const p1 = volley(0, 1)
    const p2 = volley(1, 2) // mid2 P2 rotation: A, C, B
    out.psiLance = {
      p1,
      p2,
      pass:
        p1.lanes === 3 && p1.rel.join() === '-24,0,24' && p1.lane.len === 700 && p1.lane.halfW === 22 && p1.lane.dmg === 0 && p1.lane.shape === 1 &&
        near(p1.lane.tele, 0.8, 1e-9) && p1.teleTicks === 48 && p1.boltsAtCast === 3 && p1.boltsAfter === 3 &&
        p1.bolt.speed === 760 && p1.bolt.dmg === 16 && p1.bolt.r === 9 && near(p1.bolt.reach, 700, 0.01) &&
        p2.boltsAtCast === 3 && p2.boltsAfter === 6,
    }

    // C undertow: a marker on her through the pull, 6 wraiths at r 90 in the
    // fight's brood, and a pull of MAX_WELL_PULL (140 u/s) toward her.
    {
      const f = H.fight('depths', 'mid2')
      H.clearField()
      const e = w.boss
      const s0 = w.hazardSeq
      H.force(2)
      S.step(1)
      const m = H.newHazards(s0)[0]
      const marker = m && { n: H.newHazards(s0).length, r: m.r, onBoss: Math.hypot(m.x - e.x, m.y - e.y), dmg: m.damage, tele: m.teleMax, live: m.liveMax }
      while (f.state === H.BS_TELE) S.step(1)
      // Measured one tick after the cast: each wraith has flown one step (under 4 u).
      const wraiths = w.enemies.active.filter((o) => o.alive && o.def.id === 'wraith' && o.brood === w.bossFights)
      const ringR = wraiths.map((o) => +Math.hypot(o.x - e.x, o.y - e.y).toFixed(1))
      for (const o of wraiths) o.alive = false
      const d0 = Math.hypot(e.x - pl.x, e.y - pl.y)
      S.step(30)
      const d1 = Math.hypot(e.x - pl.x, e.y - pl.y)
      const pullSpeed = ((d0 - d1) * 60) / 30
      let activeTicks = 30
      while (f.state === H.BS_ACTIVE && activeTicks < 400) {
        S.step(1)
        activeTicks++
      }
      out.undertow = {
        marker,
        wraiths: wraiths.length,
        ringR,
        pullSpeed: +pullSpeed.toFixed(2),
        activeTicks,
        markerGone: !m.alive,
        pass:
          marker.n === 1 && marker.r === 104 && marker.onBoss < 1e-6 && marker.dmg === 0 && near(marker.tele, 0.7, 1e-9) && near(marker.live, 3, 1e-9) &&
          wraiths.length === 6 && ringR.every((r) => near(r, 90, 4)) && near(pullSpeed, 140, 0.5) && activeTicks === 180 && !m.alive,
      }
    }

    // SIG riftStorm (PRIME P3, opener at rot 0): 3 blinks in a row, each on the
    // player's spot at its own telegraph start; she ends at the last one.
    {
      const f = H.fight('depths', 'final')
      H.phase(2)
      H.clearField()
      const [cx, cy] = H.center()
      const spots = [
        [cx, cy],
        [cx + 150, cy],
        [cx, cy + 150],
      ]
      const s0 = w.hazardSeq
      H.force(0)
      let k = 0
      const circles = []
      const seen = new Set()
      for (let t = 0; t < 600 && (t === 0 || (f.attack === B.ATK_RIFT_STORM && f.state !== H.BS_RECOVER)); t++) {
        H.pin(spots[Math.min(k, 2)][0], spots[Math.min(k, 2)][1])
        pl.biteCd = 10
        S.step(1)
        for (const h of H.newHazards(s0)) {
          if (seen.has(h.seq)) continue
          seen.add(h.seq)
          circles.push({ t, dx: +(h.x - spots[Math.min(k, 2)][0]).toFixed(2), dy: +(h.y - spots[Math.min(k, 2)][1]).toFixed(2), r: h.r, dmg: h.damage, tele: +h.teleMax.toFixed(4), live: h.liveMax })
        }
        const live = w.hazards.active.find((h) => h.alive && h.seq > s0)
        if (!live && circles.length === k + 1) k++
      }
      const e = w.boss
      const last = spots[2]
      out.riftStorm = {
        circles,
        attack: f.attack,
        bossToLast: +Math.hypot(e.x - last[0], e.y - last[1]).toFixed(2),
        pass:
          circles.length === 3 && circles.every((c) => c.dx === 0 && c.dy === 0 && c.r === 120 && c.dmg === 22 && c.tele === 0.6 && near(c.live, 0.15, 1e-9)) &&
          Math.hypot(e.x - last[0], e.y - last[1]) < 1,
      }
    }
  }

  // ---------- EMBER TYRANT ----------
  {
    // A magmaMortar: 5 circles r 70 (one on the player, 4 at 120 u); the center
    // leaves a magma pool.
    {
      const f = H.fight('wastes', 'mid2')
      H.clearField()
      w.acid.clear()
      const [cx, cy] = H.center()
      const s0 = w.hazardSeq
      H.force(0)
      H.pin(cx, cy)
      S.step(1)
      const hz = H.newHazards(s0)
      const dist = hz.map((h) => +Math.hypot(h.x - cx, h.y - cy).toFixed(3)).sort((a, b) => a - b)
      const ends = hz.map((h) => h.onEnd).sort()
      while (f.state === H.BS_TELE || f.state === H.BS_ACTIVE) {
        H.pin(cx + 400, cy)
        S.step(1)
      }
      const pool = w.acid.active.filter((a) => a.alive && Math.hypot(a.x - cx, a.y - cy) < 1).length
      out.magmaMortar = {
        n: hz.length,
        dist,
        ends,
        r: hz.map((h) => h.r),
        dmg: hz.map((h) => h.damage),
        tele: hz[0].teleMax,
        live: hz[0].liveMax,
        pool,
        pass:
          hz.length === 5 && dist[0] === 0 && dist.slice(1).every((d) => near(d, 120, 0.01)) && ends.join() === '0,0,0,0,1' &&
          hz.every((h) => h.r === 70 && h.damage === 22 && h.boss) && near(hz[0].teleMax, 1, 1e-9) && near(hz[0].liveMax, 0.15, 1e-9) && pool === 1,
      }
    }

    // B flakTurrets: 3 markers on r 170 that raise turrets in the fight's brood;
    // 6 alive at most (then slot A casts); the turrets fire inside the cage and
    // collapse, with no credit, when the boss dies.
    {
      const f = H.fight('wastes', 'mid2')
      H.clearField()
      const e = w.boss
      const [cx, cy] = H.center()
      e.x = e.prevX = cx
      e.y = e.prevY = cy - 250
      const s0 = w.hazardSeq
      H.force(1)
      H.pin(cx, cy)
      S.step(1)
      const marks = H.newHazards(s0)
      const markInfo = marks.map((h) => ({ r: h.r, dmg: h.damage, onEnd: h.onEnd, unit: h.unit, tele: h.teleMax, fromBoss: +Math.hypot(h.x - e.x, h.y - e.y).toFixed(2) }))
      const spots = marks.map((h) => [h.x, h.y])
      while (f.state !== H.BS_IDLE) {
        H.pin(cx, cy)
        S.step(1)
      }
      const turrets = () => w.enemies.active.filter((o) => o.alive && o.def.id === 'flakTurret' && o.brood === w.bossFights)
      const first = turrets()
      const onMarks = first.every((o) => spots.some(([x, y]) => Math.hypot(o.x - x, o.y - y) < 1e-6))
      H.force(1)
      S.step(1)
      while (f.state !== H.BS_IDLE) {
        H.pin(cx, cy)
        S.step(1)
      }
      const second = turrets().length
      H.force(1)
      S.step(1)
      const third = f.attack
      while (f.state !== H.BS_IDLE) {
        H.pin(cx, cy)
        S.step(1)
      }
      const capped = turrets().length
      const tIdx = ENEMIES.flakTurret.idx
      let shots = 0
      for (let t = 0; t < 120; t++) {
        H.pin(cx, cy)
        S.step(1)
        shots = Math.max(shots, w.enemyProjectiles.active.filter((p) => p.alive && p.ownerIdx === tIdx).length)
      }
      const turretKills0 = w.killsByDef[tIdx]
      const kills0 = w.kills
      S.input.update = () => {
        const b = w.boss
        S.input.move.x = S.input.move.y = 0
        S.input.firing = !!b
        if (b) {
          const d = Math.hypot(b.x - pl.x, b.y - pl.y) || 1
          S.input.aimDir.x = (b.x - pl.x) / d
          S.input.aimDir.y = (b.y - pl.y) / d
        }
      }
      // Stand inside the turret ring, beside her, so no turret blocks the shot.
      for (let t = 0; t < 600 && w.bossAlive; t++) {
        if (w.boss && !w.boss.submerged) w.boss.hp = Math.min(w.boss.hp, 1)
        if (w.boss) H.pin(w.boss.x + w.boss.radius + 40, w.boss.y)
        pl.biteCd = 10
        S.step(1)
      }
      H.still()
      const after = w.enemies.active.filter((o) => o.alive && o.def.id === 'flakTurret').length
      out.flakTurrets = {
        marks: markInfo,
        first: first.length,
        onMarks,
        second,
        thirdAttack: third,
        capped,
        turretShots: shots,
        bossDead: !w.bossAlive,
        turretsAfterKill: after,
        killsGained: w.kills - kills0,
        turretKills: w.killsByDef[tIdx] - turretKills0,
        pass:
          marks.length === 3 && markInfo.every((m) => m.r === 34 && m.dmg === 0 && m.onEnd === 3 && m.unit === 'flakTurret' && near(m.tele, 0.8, 1e-9) && near(m.fromBoss, 170, 0.01)) &&
          first.length === 3 && onMarks && second === 6 && third === B.ATK_MAGMA_MORTAR && capped === 6 && shots > 0 && !w.bossAlive && after === 0 && w.killsByDef[tIdx] === turretKills0,
      }
    }

    // C scorchSweep: a 120 degree sector of reach 460 from the player angle -60,
    // the direction flips each cast; the flame line hits a player in its path once.
    {
      const f = H.fight('wastes', 'mid2')
      H.clearField()
      const e = w.boss
      const [cx, cy] = H.center()
      const cast = () => {
        const s0 = w.hazardSeq
        H.force(2)
        H.pin(cx, cy)
        S.step(1)
        const h = H.newHazards(s0)[0]
        const aim = Math.atan2(cy - e.y, cx - e.x)
        const info = { shape: h.shape, halfW: h.r, reach: h.len, arcDeg: +(h.arc / DEG).toFixed(3), startRelDeg: +(angDiff(h.ang, aim) / DEG).toFixed(3), dmg: h.damage, tele: h.teleMax, live: h.liveMax }
        let lost = 0
        const px = e.x + Math.cos(aim) * 200
        const py = e.y + Math.sin(aim) * 200
        while (f.state !== H.BS_IDLE) {
          const hp = pl.hp
          H.pin(px, py)
          pl.biteCd = 10
          S.step(1)
          lost += hp - pl.hp
        }
        return { ...info, lost }
      }
      const c1 = cast()
      const c2 = cast()
      out.scorchSweep = {
        c1,
        c2,
        pass:
          [c1, c2].every((c) => c.shape === 2 && c.halfW === 30 && c.reach === 460 && c.dmg === 28 && near(c.tele, 0.9, 1e-9) && near(c.live, 1.4, 1e-9) && c.lost === 28) &&
          c1.arcDeg === 120 && c1.startRelDeg === -60 && c2.arcDeg === -120 && c2.startRelDeg === 60,
      }
    }

    // SIG cinderfall (PRIME P3 opener): 12 circles r 80 on the spiral
    // 90 + 27k at 50k degrees from the player's spot, 0.25 s apart; the boss
    // holds until the last one lands.
    {
      const f = H.fight('wastes', 'final')
      H.phase(2)
      H.clearField()
      const [cx, cy] = H.center()
      const s0 = w.hazardSeq
      H.force(0)
      const got = []
      const seen = new Set()
      let t = 0
      let lastDetonate = -1
      for (; t < 600 && f.state === H.BS_TELE || t === 0; t++) {
        H.pin(cx, cy)
        S.step(1)
        for (const h of H.newHazards(s0)) {
          if (seen.has(h.seq)) continue
          seen.add(h.seq)
          got.push({ t, r: +Math.hypot(h.x - cx, h.y - cy).toFixed(2), ang: Math.atan2(h.y - cy, h.x - cx), rad: h.r, dmg: h.damage, tele: +h.teleMax.toFixed(4), live: h.liveMax, h })
        }
        for (const g of got) if (g.h.tele === 0 && g.det === undefined) g.det = t
      }
      for (const g of got) lastDetonate = Math.max(lastDetonate, g.det ?? -1)
      const steps = got.slice(1).map((g, i) => +(angDiff(g.ang, got[i].ang) / DEG).toFixed(2))
      out.cinderfall = {
        n: got.length,
        ticks: got.map((g) => g.t),
        radii: got.map((g) => g.r),
        angleSteps: steps,
        tele: got[0]?.tele,
        stateAfter: f.state,
        tickLeftTele: t,
        lastDetonate,
        pass:
          got.length === 12 && got.every((g, k) => g.t === got[0].t + 15 * k && near(g.r, 90 + 27 * k, 0.01) && g.rad === 80 && g.dmg === 20 && g.tele === 0.75 && near(g.live, 0.15, 1e-9)) &&
          steps.every((s) => near(s, 50, 0.01)) && f.state === H.BS_ACTIVE && t - lastDetonate <= 2,
      }
      for (const g of got) delete g.h
    }
  }
  return out
}

async function invariantChecks() {
  const H = window.__KIT
  const { S, w, pl } = H
  const B = await import('/src/content/bosses.ts')
  S.loop.stop()
  const out = {}
  for (const arena of ['hive', 'depths', 'wastes']) {
    for (const stage of ['mid1', 'mid2', 'final']) {
      const f = H.fight(arena, stage)
      const [cx, cy] = H.center()
      let seq = w.hazardSeq
      let minTele = Infinity
      let strayTele = 0
      const kinds = new Set()
      let prevState = f.state
      const e = w.boss
      const th = { mid1: [0.5], mid2: [0.66, 0.33], final: [0.66, 0.33] }[stage]
      for (let t = 0; t < 90 * 60 && w.bossAlive; t++) {
        const a = t / 60
        H.pin(cx + Math.cos(a * 0.8) * 160, cy + Math.sin(a * 0.8) * 160)
        pl.hp = pl.maxHp
        if (t === 30 * 60) e.hp = Math.min(e.hp, e.maxHp * (th[0] - 0.01))
        if (t === 60 * 60 && th[1]) e.hp = Math.min(e.hp, e.maxHp * (th[1] - 0.01))
        S.step(1)
        for (const h of w.hazards.active) {
          if (!h.alive || !h.boss || h.seq <= seq) continue
          minTele = Math.min(minTele, h.teleMax)
        }
        seq = w.hazardSeq
        if (f.state === H.BS_TELE && prevState !== H.BS_TELE) kinds.add(f.attack)
        if (f.state !== H.BS_TELE && f.state !== H.BS_ACTIVE) {
          if (w.hazards.active.some((h) => h.alive && h.boss && h.tele > 0)) strayTele++
        }
        prevState = f.state
      }
      const sig = { hive: B.ATK_MOTHERS_CALL, depths: B.ATK_RIFT_STORM, wastes: B.ATK_CINDERFALL }[arena]
      out[`${arena}_${stage}`] = {
        phase: f.phase,
        kinds: [...kinds].sort((x, y) => x - y),
        minTele: +minTele.toFixed(4),
        strayTele,
        pass: minTele >= 0.6 - 1e-9 && strayTele === 0 && kinds.size >= 3 && (stage !== 'final' || kinds.has(sig)),
      }
    }
  }
  return out
}

/** Shot setups: each returns once the sim holds the wanted moment, paused. */
function shotSetup(name) {
  const H = window.__KIT
  const { S, w, pl } = H
  const f = w.bossFight
  const plan = {
    'depths-riftBlink': ['depths', 'mid2', 0, 0, 27],
    'depths-psiLance': ['depths', 'mid2', 0, 1, 24],
    'depths-psiLance-bolts': ['depths', 'mid2', 1, 2, 60],
    'depths-undertow': ['depths', 'mid2', 0, 2, 21],
    'depths-undertow-pull': ['depths', 'mid2', 0, 2, 100],
    'depths-riftStorm': ['depths', 'final', 2, 0, 70],
    'wastes-magmaMortar': ['wastes', 'mid2', 0, 0, 30],
    'wastes-flakTurrets': ['wastes', 'mid2', 0, 1, 24],
    'wastes-turrets': ['wastes', 'mid2', 0, 1, 110],
    'wastes-scorchSweep': ['wastes', 'mid2', 0, 2, 27],
    'wastes-scorchSweep-live': ['wastes', 'mid2', 0, 2, 96],
    'wastes-cinderfall': ['wastes', 'final', 2, 0, 80],
    'hive-lunge': ['hive', 'mid2', 0, 1, 27],
    'hive-mothersCall': ['hive', 'final', 2, 0, 36],
  }[name]
  const [arena, stage, phase, rot, ticks] = plan
  H.fight(arena, stage)
  H.phase(phase)
  H.clearField()
  const [cx, cy] = H.center()
  const e = w.boss
  // The boss 283 u up and right of the player: both fit the portrait and landscape views.
  e.x = e.prevX = cx + 200
  e.y = e.prevY = cy - 200
  H.force(rot)
  const ox = name === 'depths-riftStorm' ? 120 : 0
  for (let t = 0; t < ticks; t++) {
    H.pin(cx + (t > 40 ? ox : 0), cy)
    pl.hp = pl.maxHp
    S.step(1)
    // Keep the fight's own units and shots; clear the swarm.
    for (const o of w.enemies.active) if (o.alive && o !== e && o.brood !== w.bossFights) o.alive = false
  }
  w.paused = true
  S.feel.hurtFlash = 0
  return { name, state: f.state, attack: f.attack, t: +w.time.toFixed(2) }
}

async function launch() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000, args: ['--hide-scrollbars', '--mute-audio', '--enable-gpu', '--use-angle=metal'] })
    } catch (e) {
      console.error(`launch failed (${e.message}); retrying in 10 s`)
      await sleep(10000)
    }
  }
  throw new Error('could not launch Chrome')
}

async function open(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: false, hasTouch: false })
  await page.goto(`${ORIGIN}/?seed=777`, { waitUntil: 'networkidle0', timeout: 45000 })
  await page.waitForFunction('!!window.__SWARM', { timeout: 20000 })
  await page.evaluate(installHelpers)
}

await acquireChromeLock('probe-bosskits')
const browser = await launch()
let failed = 0
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await open(page, 390, 844)
  const out = { ...(await page.evaluate(kitChecks)), ...(await page.evaluate(invariantChecks)) }
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    const names = [
      'depths-riftBlink', 'depths-psiLance', 'depths-psiLance-bolts', 'depths-undertow', 'depths-undertow-pull', 'depths-riftStorm',
      'wastes-magmaMortar', 'wastes-flakTurrets', 'wastes-turrets', 'wastes-scorchSweep', 'wastes-scorchSweep-live', 'wastes-cinderfall',
      'hive-lunge', 'hive-mothersCall',
    ].filter((n) => !ONLY || ONLY.split(',').includes(n))
    const shots = []
    for (const [vw, vh] of [
      [375, 667],
      [667, 375],
    ]) {
      await open(page, vw, vh)
      for (const n of names) {
        const info = await page.evaluate(shotSetup, n)
        // Past the run-start world intro and the boss alert callouts (real clock).
        await sleep(3500)
        const file = join(SHOTS, `${vw}x${vh}-${n}.png`)
        await page.screenshot({ path: file })
        shots.push({ file, ...info })
      }
    }
    out.shots = { list: shots, pass: true }
  }
  out.errors = { list: errors, pass: errors.length === 0 }
  for (const [k, v] of Object.entries(out)) {
    if (!v.pass) failed++
    console.log(JSON.stringify({ check: k, ...v }))
  }
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
