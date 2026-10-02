// In-page playtest harness. Injected into the DEV build (the dev server at
// SWG_URL, default http://localhost:5176) and driven through window.__SWARM.
// Stops the rAF loop so ONLY our step(1) calls advance the sim, replaces
// input.update with a bot, and records events. Drafts open through the game's
// own single path (stepSim hand-off, cards cached on world.draft.cards) and
// are answered through S.pickCard / reroll / banish / skip, exactly like a tap
// (so the pick also applies world.resumeFromDraft() grace). Draft policies
// (cfg.perkPolicy): first (card 1), priority (fusions, then fusion parents,
// then PRIORITY), random (seeded: rerolls, banishes, skips, random cards),
// evolve (the held weapon's pair perk first, then priority). A Hive Core
// reveal is answered through S.takeCore: the evolution when one is offered
// (the random policy flips a seeded coin). Never calls
// endRun itself; a stalemate ends the run through the game's own path.
// cfg.threat starts the run at that THREAT level; with cfg.ot a win goes on
// into OVERTIME through the win panel's own path (__SWARM.overtime). With
// cfg.dash the bot also dashes out of danger; with cfg.focus it shoots the
// boss during a fight. The smart and roam bots sidestep swarm-event streams
// (STAMPEDE, walls, SHOAL RUN) and plan an escape from every telegraphed
// hazard (boss circles, lanes and sweeps, MORTAR BARRAGE, VOLATILE blasts):
// see hazardEscape.
(() => {
  const DT = 1 / 60
  const FEEL_PLAYER_HURT = 5
  const FF_DISCRETE = 16
  const FF_CONTACT = 32
  const FF_ACID = 64
  const FF_RAM = 128
  const ALERT_KIND = ['', 'boss', 'final', 'event', 'elite', 'lull', 'debut']
  const xpForLevel = (l) => (l === 1 ? 6 : Math.floor(5 + 6 * l + 1.2 * l * l))
  const TAG_FUSION_FIRST = 4
  const TAG_COMPLETES_FUSION = 8
  const TAG_EVOLVES_HELD = 32
  const BOSS_FOCUS = 700
  const POD_LIFE = 20
  const BROOD_GUARD = 140
  /** Stream dodge: react to a stream unit whose path passes within STREAM_LANE
   *  of the ship and that arrives within STREAM_HORIZON seconds (never less
   *  than STREAM_REACT u away, so a slow wall is dodged in time). */
  const STREAM_LANE = 260
  const STREAM_HORIZON = 2.2
  const STREAM_REACT = 300
  const STREAM_PUSH = 3.2
  const EVENT_WINDOW = 15
  /** bossAI's ROYAL LUNGE attack id and ACTIVE state (src/content/bosses.ts, src/systems/bossAI.ts). */
  const ATK_ROYAL_LUNGE = 1
  const BS_ACTIVE = 3
  const BS_RECOVER = 4

  function xpTotal(w) {
    let s = w.xp
    for (let l = 1; l < w.level; l++) s += xpForLevel(l)
    return s
  }

  function bot(w, inp, st) {
    const mode = st.cfg.mode
    const pl = w.player
    const b = w.arena.bounds

    const act = w.enemies.active
    let best = null
    let bd = Infinity
    let cx = 0
    let cy = 0
    let cn = 0
    let fx = 0
    let fy = 0
    for (let i = 0; i < act.length; i++) {
      const e = act[i]
      if (!e.alive) continue
      const dx = e.x - pl.x
      const dy = e.y - pl.y
      const d2 = dx * dx + dy * dy
      if (!e.submerged && d2 < bd) {
        bd = d2
        best = e
      }
      if (mode === 'crude') {
        if (d2 < 400 * 400) {
          cx += e.x
          cy += e.y
          cn++
        }
      } else if (mode === 'smart' || mode === 'roam') {
        if (d2 < 380 * 380) {
          const d = Math.sqrt(d2) || 1
          const wgt = ((e.def.boss ? 3 : e.def.elite ? 2 : 1) * 3600) / (d2 + 900)
          fx -= (dx / d) * wgt
          fy -= (dy / d) * wgt
          // charger windup: sidestep perpendicular to its locked line
          if (e.def.behavior === 'charger' && e.phase === 1 && d < 420) {
            const px = -Math.sin(e.phaseDir)
            const py = Math.cos(e.phaseDir)
            const side = px * -dx + py * -dy >= 0 ? 1 : -1
            fx += px * side * 1.5
            fy += py * side * 1.5
          }
        }
      }
    }

    // Aim + fire at the nearest targetable enemy. With cfg.focus, in a boss
    // fight the bot shoots the boss (the swarm pressed on the cage fence is
    // nearer but harmless) unless the fight's brood is within BROOD_GUARD.
    const boss = w.boss
    if (st.cfg.focus && w.bossAlive && boss && !boss.submerged && Math.hypot(boss.x - pl.x, boss.y - pl.y) < BOSS_FOCUS) {
      let guard = false
      for (let i = 0; i < act.length && !guard; i++) {
        const e = act[i]
        guard = e.alive && e !== boss && e.brood === w.bossFights && Math.hypot(e.x - pl.x, e.y - pl.y) < BROOD_GUARD
      }
      if (!guard) best = boss
    }
    if (best) {
      const dx = best.x - pl.x
      const dy = best.y - pl.y
      const d = Math.hypot(dx, dy) || 1
      inp.aimDir.x = dx / d
      inp.aimDir.y = dy / d
      inp.firing = true
    } else {
      inp.aimDir.x = 0
      inp.aimDir.y = 0
      inp.firing = false
    }

    let mx = 0
    let my = 0
    // A pod is taken by standing on it (hold-to-take), so the bot stops on one it wants.
    let holdPod = false
    if (mode === 'turret') {
      // stationary
    } else if (mode === 'crude') {
      if (cn > 0) {
        const ax = pl.x - cx / cn
        const ay = pl.y - cy / cn
        const l = Math.hypot(ax, ay)
        if (l > 1) {
          mx = ax / l
          my = ay / l
        } else if (best) {
          const bx = pl.x - best.x
          const by = pl.y - best.y
          const bl = Math.hypot(bx, by) || 1
          mx = bx / bl
          my = by / bl
        }
      }
      // mild wall avoidance
      const m = 220
      if (pl.x - b.x < m) mx += 1.5 * (1 - (pl.x - b.x) / m)
      if (b.x + b.w - pl.x < m) mx -= 1.5 * (1 - (b.x + b.w - pl.x) / m)
      if (pl.y - b.y < m) my += 1.5 * (1 - (pl.y - b.y) / m)
      if (b.y + b.h - pl.y < m) my -= 1.5 * (1 - (b.y + b.h - pl.y) / m)
    } else {
      // smart / roam: weighted repulsion + orbit + projectile/acid dodge + walls + seek
      const eps = w.enemyProjectiles.active
      for (let i = 0; i < eps.length; i++) {
        const p = eps[i]
        if (!p.alive) continue
        const dx = pl.x - p.x
        const dy = pl.y - p.y
        const d2 = dx * dx + dy * dy
        if (d2 > 260 * 260) continue
        const sp = Math.hypot(p.vx, p.vy) || 1
        const toward = (p.vx * dx + p.vy * dy) / sp
        if (toward <= 0) continue
        // perpendicular component of our offset from its path
        const perpX = dx - (p.vx / sp) * toward
        const perpY = dy - (p.vy / sp) * toward
        const pl2 = Math.hypot(perpX, perpY)
        if (pl2 > 60) continue
        const nx = pl2 > 0.5 ? perpX / pl2 : -p.vy / sp
        const ny = pl2 > 0.5 ? perpY / pl2 : p.vx / sp
        fx += nx * 2.2
        fy += ny * 2.2
      }
      if (!st.cfg.noStreamDodge) {
        const sd = streamDodge(w, pl, st)
        fx += sd[0]
        fy += sd[1]
      }
      const ac = w.acid.active
      for (let i = 0; i < ac.length; i++) {
        const a = ac[i]
        if (!a.alive) continue
        const dx = pl.x - a.x
        const dy = pl.y - a.y
        const d = Math.hypot(dx, dy) || 1
        if (d < a.radius + 55) {
          fx += (dx / d) * 1.6
          fy += (dy / d) * 1.6
        }
      }
      const threat = Math.hypot(fx, fy)
      // circle-strafe: tangential to the flee vector
      if (threat > 0.05) {
        mx = fx / threat + (-fy / threat) * 0.55
        my = fy / threat + (fx / threat) * 0.55
        const s = Math.min(1, threat)
        mx *= s
        my *= s
      }
      // seek when threat is low
      if (threat < 0.6) {
        const pk = w.pickups.active
        let tgt = null
        let td = Infinity
        const wantPod = w.weapon.ammo === -1 || w.ammo < w.weapon.ammo * 0.25
        const wantHp = pl.hp < pl.maxHp * 0.75
        for (let i = 0; i < pk.length; i++) {
          const p = pk[i]
          if (!p.alive) continue
          const dx = p.x - pl.x
          const dy = p.y - pl.y
          let d = Math.hypot(dx, dy)
          if (p.kind === 'weapon') {
            if (!wantPod || d > 1000) continue
            d *= 0.5
          } else if (p.kind === 'health') {
            if (!wantHp || d > 600) continue
            d *= 0.6
          } else {
            if (d > 450) continue
          }
          if (d < td) {
            td = d
            tgt = p
          }
        }
        const k = 1 - threat / 0.6
        if (tgt && tgt.kind === 'weapon' && Math.hypot(tgt.x - pl.x, tgt.y - pl.y) < tgt.radius + pl.radius) holdPod = true
        if (tgt) {
          const dx = tgt.x - pl.x
          const dy = tgt.y - pl.y
          const d = Math.hypot(dx, dy) || 1
          mx += (dx / d) * k
          my += (dy / d) * k
        } else {
          const dx = b.x + b.w / 2 - pl.x
          const dy = b.y + b.h / 2 - pl.y
          const d = Math.hypot(dx, dy) || 1
          if (d > 200) {
            mx += (dx / d) * 0.45 * k
            my += (dy / d) * 0.45 * k
          }
        }
      }
      const m = 260
      if (pl.x - b.x < m) mx += 2 * (1 - (pl.x - b.x) / m)
      if (b.x + b.w - pl.x < m) mx -= 2 * (1 - (b.x + b.w - pl.x) / m)
      if (pl.y - b.y < m) my += 2 * (1 - (pl.y - b.y) / m)
      if (b.y + b.h - pl.y < m) my -= 2 * (1 - (b.y + b.h - pl.y) / m)
    }
    let ml = Math.hypot(mx, my)
    if (ml > 1) {
      mx /= ml
      my /= ml
      ml = 1
    }
    // Telegraphed hazards (boss casts, MORTAR BARRAGE, VOLATILE blasts): when
    // the planned move would be inside one as it goes live, take the escape.
    if (mode === 'smart' || mode === 'roam') {
      const esc = hazardEscape(w, pl, st, mx, my, ml)
      if (esc) {
        mx = esc[0]
        my = esc[1]
        holdPod = false
      }
    }
    inp.move.x = holdPod ? 0 : mx
    inp.move.y = holdPod ? 0 : my
    if (st.cfg.dash && w.dashCharges > 0 && pl.dashTicks === 0 && inDanger(w, pl)) inp.pressDash()
  }

  // Stream dodge: every stream unit on course to cross the ship soon votes to
  // push it sideways, away from that unit's path. The votes add up to the side
  // with less of the stream (a wall's nearer end, a stampede band's nearer
  // edge); the chosen side sticks until no stream threatens, so the bot does
  // not dither in the middle of a symmetric wall.
  const sdOut = [0, 0]
  function streamDodge(w, pl, st) {
    const act = w.enemies.active
    let vx = 0
    let vy = 0
    let n = 0
    for (let i = 0; i < act.length; i++) {
      const e = act[i]
      if (!e.alive || !e.stream) continue
      const hx = Math.cos(e.phaseDir)
      const hy = Math.sin(e.phaseDir)
      const rx = pl.x - e.x
      const ry = pl.y - e.y
      const ahead = rx * hx + ry * hy
      if (ahead < -(e.radius + pl.radius) || ahead > Math.max(e.speed * STREAM_HORIZON, STREAM_REACT)) continue
      const lat = -rx * hy + ry * hx
      if (Math.abs(lat) > STREAM_LANE) continue
      const side = lat >= 0 ? 1 : -1
      vx += -hy * side
      vy += hx * side
      n++
    }
    if (n === 0) {
      st.streamSide = null
      sdOut[0] = sdOut[1] = 0
      return sdOut
    }
    st.dodgeSteps++
    const l = Math.hypot(vx, vy)
    if (!st.streamSide) st.streamSide = l > 1e-3 ? [vx / l, vy / l] : [-Math.sin(act.find((e) => e.alive && e.stream).phaseDir), Math.cos(act.find((e) => e.alive && e.stream).phaseDir)]
    sdOut[0] = st.streamSide[0] * STREAM_PUSH
    sdOut[1] = st.streamSide[1] * STREAM_PUSH
    return sdOut
  }

  // Hazard escape (smart and roam bots). A cast is dangerous from its
  // detonation (after `tele`) to the end of its live window, and it hits once.
  // Damaging circles and sweeps count, and so do lanes, which carry no damage
  // of their own: a lunge lane is the boss body's path and a lance lane its
  // bolts' path. Each candidate move (the planned one, the last escape, 16
  // headings at full speed, standing still) is played forward in a straight
  // line, clamped to the arena and the cage, and tested against each hazard's
  // shape at each sampled moment of its window: a circle by center distance,
  // a lane by distance to its segment, a sweep by distance to the flame line
  // at that moment's angle. The planned move stands when it clears every
  // hazard by HZ_MARGIN. Otherwise the cheapest candidate wins: least damage,
  // then more clearance (up to 60 u), then closest to the plan, then the last
  // escape (so the bot does not dither between two equal gaps). Summing one
  // push per circle cancels out inside a symmetric volley (the magma mortar's
  // 5 circles), and a sweep is not a circle on the boss, which is why the bot
  // plans instead of adding forces here.
  const HZ_CIRCLE = 0
  const HZ_LANE = 1
  const HZ_SWEEP = 2
  const HZ_MARGIN = 14
  const HZ_HORIZON = 2.6
  const HZ_DIRS = 16
  const HZ_SAMPLE = 2 / 60
  const HZ_LANE_DMG = 25
  /** A lane with no live window (the psi lance): its bolts' flight past the ship. */
  const HZ_LANE_FLIGHT = 0.4
  const hzList = []
  const hzOut = [0, 0]
  let hzDmg = 0
  let hzClear = 0

  function segDist(px, py, x, y, vx, vy) {
    const wx = px - x
    const wy = py - y
    const vv = vx * vx + vy * vy
    let t = vv > 0 ? (wx * vx + wy * vy) / vv : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    return Math.hypot(wx - vx * t, wy - vy * t)
  }

  /** Damage (hzDmg) and least clearance (hzClear) of moving at (vx, vy) u/s. */
  function hazardCost(w, pl, vx, vy) {
    const b = w.arena.bounds
    const c = w.director.cage
    const r = pl.radius
    vx += w.pullX
    vy += w.pullY
    hzDmg = 0
    hzClear = Infinity
    for (let i = 0; i < hzList.length; i++) {
      const h = hzList[i]
      const on = h.tele > 0 ? h.tele : 0
      const spent = h.tele > 0 ? 0 : h.liveMax - h.live
      const span = h.shape === HZ_LANE && h.liveMax === 0 ? HZ_LANE_FLIGHT : h.liveMax - spent
      const reach = h.r + r
      for (let t = on; t <= on + span + 1e-9; t += HZ_SAMPLE) {
        let x = Math.min(Math.max(pl.x + vx * t, b.x + r), b.x + b.w - r)
        let y = Math.min(Math.max(pl.y + vy * t, b.y + r), b.y + b.h - r)
        if (c.active) {
          const dx = x - c.x
          const dy = y - c.y
          const d = Math.hypot(dx, dy)
          const max = c.r - r
          if (d > max) {
            x = c.x + (dx * max) / d
            y = c.y + (dy * max) / d
          }
        }
        let d
        if (h.shape === HZ_CIRCLE) d = Math.hypot(x - h.x, y - h.y)
        else {
          const a = h.shape === HZ_SWEEP && h.liveMax > 0 ? h.ang + h.arc * Math.min(1, (spent + t - on) / h.liveMax) : h.ang
          d = segDist(x, y, h.x, h.y, Math.cos(a) * h.len, Math.sin(a) * h.len)
        }
        const clear = d - reach
        if (clear < hzClear) hzClear = clear
        if (clear < HZ_MARGIN) {
          hzDmg += h.damage > 0 ? h.damage : HZ_LANE_DMG
          break
        }
      }
    }
  }

  /** The escape heading (a unit vector, or 0 0 to stand still), or null when
   *  the planned move (mx, my) at magnitude ml clears every hazard. */
  function hazardEscape(w, pl, st, mx, my, ml) {
    const hz = w.hazards.active
    hzList.length = 0
    for (let i = 0; i < hz.length; i++) {
      const h = hz[i]
      if (!h.alive || h.hit || h.tele > HZ_HORIZON) continue
      if (h.damage > 0 || h.shape === HZ_LANE) hzList.push(h)
    }
    if (hzList.length === 0) {
      st.hzDir = null
      return null
    }
    const sp = pl.speed * w.mods.moveSpeedMul
    hazardCost(w, pl, mx * sp, my * sp)
    if (hzDmg === 0 && hzClear >= HZ_MARGIN) {
      st.hzDir = null
      return null
    }
    const px = ml > 1e-3 ? mx / ml : 0
    const py = ml > 1e-3 ? my / ml : 0
    const score = (dx, dy, bonus) => hzDmg * 1000 + 2 * Math.max(0, 60 - Math.min(hzClear, 60)) - 10 * (dx * px + dy * py) - bonus
    let best = score(px, py, 0)
    let bx = mx
    let by = my
    const prev = st.hzDir
    for (let k = -1; k <= HZ_DIRS; k++) {
      let dx
      let dy
      if (k === -1) {
        if (!prev) continue
        dx = prev[0]
        dy = prev[1]
      } else if (k === HZ_DIRS) {
        dx = 0
        dy = 0
      } else {
        const a = (k * 2 * Math.PI) / HZ_DIRS
        dx = Math.cos(a)
        dy = Math.sin(a)
      }
      hazardCost(w, pl, dx * sp, dy * sp)
      const s = score(dx, dy, k === -1 ? 15 : 0)
      if (s < best) {
        best = s
        bx = dx
        by = dy
      }
    }
    st.hzSteps++
    st.hzDir = bx !== 0 || by !== 0 ? [bx, by] : null
    hzOut[0] = bx
    hzOut[1] = by
    return hzOut
  }

  // Dash policy: dash (along the bot's move, else its facing) when a hit is
  // about to land: a shot arriving within 0.2 s, a charging charger on a line
  // through us, an elite or boss body at contact, a stream unit about to run
  // into us, or 3+ bodies touching.
  function inDanger(w, pl) {
    const eps = w.enemyProjectiles.active
    for (let i = 0; i < eps.length; i++) {
      const p = eps[i]
      if (!p.alive) continue
      const dx = pl.x - p.x
      const dy = pl.y - p.y
      const sp = Math.hypot(p.vx, p.vy) || 1
      const along = (p.vx * dx + p.vy * dy) / sp
      if (along <= 0) continue
      const perp = Math.abs((p.vx * dy - p.vy * dx) / sp)
      const rr = p.radius + pl.radius + 4
      if (perp < rr && along < sp * 0.2 + rr) return true
    }
    const act = w.enemies.active
    let touching = 0
    for (let i = 0; i < act.length; i++) {
      const e = act[i]
      if (!e.alive || e.submerged) continue
      const dx = pl.x - e.x
      const dy = pl.y - e.y
      const d = Math.hypot(dx, dy)
      const rr = e.radius + pl.radius
      if (e.def.behavior === 'charger' && (e.phase === 2 || (e.phase === 1 && e.stateTimer < 0.12)) && d < 200) {
        const perp = Math.abs(Math.cos(e.phaseDir) * dy - Math.sin(e.phaseDir) * dx)
        const ahead = Math.cos(e.phaseDir) * dx + Math.sin(e.phaseDir) * dy
        if (ahead > 0 && perp < rr + 10) return true
      }
      if ((e.def.elite || e.def.boss) && d < rr + 20) return true
      if (e.stream && d < rr + 30) {
        const ahead = Math.cos(e.phaseDir) * dx + Math.sin(e.phaseDir) * dy
        if (ahead > 0) return true
      }
      if (d < rr + 6 && ++touching >= 3) return true
    }
    return false
  }

  window.__PT_init = (cfg) => {
    const S = window.__SWARM
    S.loop.stop()
    S.setLoadout(cfg.char, cfg.arena)
    S.startRun('endless')
    const w = S.world
    S.beginSeed(cfg.seed, { threat: cfg.threat | 0 }) // keeps the pilot/theme startRun set
    S.input.autoFire = true
    const st = {
      runId: Math.random(),
      cfg,
      events: [],
      chunks: [],
      firstSeen: {},
      maxEnemies: 0,
      rand: mulberry(cfg.seed ^ 0x2545f491),
      firstDraftAt: null,
      firstFusionAt: null,
      rerollsUsed: 0,
      banishesUsed: 0,
      skips: 0,
      dmg: 0,
      dmgChunk: 0,
      heal: 0,
      healChunk: 0,
      lastWeapon: w.weapon.id,
      lastBossAlive: false,
      bossesKilled: 0,
      won: false,
      otStart: null,
      stalemate: false,
      lastRevives: 0,
      hpHist: [],
      nextHpSample: 0,
      capSteps: 0,
      capStepsChunk: 0,
      simStepsChunk: 0,
      maxEnemiesChunk: 0,
      frozenSteps: 0,
      killsPrev: 0,
      levelUpsChunk: 0,
      dead: false,
      death: null,
      lastHalfHpT: 0,
      /** A10 window: HP at the last step at 50%+ HP, then the damage by kind and
       *  the healing since that step (reset while HP stays at 50% or more). */
      halfHp: 0,
      halfDmg: {},
      halfHeal: 0,
      halfDirty: false,
      hurts: [],
      podsSeen: 0,
      podsSeenChunk: 0,
      podFails: 0,
      pickupCapSteps: 0,
      pickupCapStepsChunk: 0,
      equipsChunk: 0,
      perks: [],
      alertSeq: w.alerts.seq,
      alertsChunk: 0,
      aliveSumChunk: 0,
      spawnsChunk: 0,
      lullStepsChunk: 0,
      bossStepsChunk: 0,
      satStepsChunk: 0,
      overRowChunk: -Infinity,
      maxSpeedByType: {},
      streamSide: null,
      // A3 density: steps outside a cage and outside an event window, and those
      // at 95%+ of maxAlive. An event window lasts while a part is emitting or
      // a stream unit lives, and EVENT_WINDOW s after an event beat fires (ring
      // units are ordinary enemies after that).
      a3Base: 0,
      a3Sat: 0,
      a3BaseChunk: 0,
      a3SatChunk: 0,
      freeAliveSumChunk: 0,
      freeStepsChunk: 0,
      // A3 over-row measured against the row in force when the current cage
      // rose (P19 density: a row step inside a cage takes effect when it drops).
      cageRow: -1,
      overRowCage: -Infinity,
      overRowCageChunk: -Infinity,
      eventStepsChunk: 0,
      eventUnitsMax: 0,
      /** HP lost to stream units' contact (the bite source stood on a stream unit). */
      streamDmg: 0,
      /** HP lost to hazard hits (boss casts, MORTAR BARRAGE, VOLATILE). */
      hzDmg: 0,
      /** HP lost per hurt kind over the run (bite, shot, ram, lunge, acid, hazard, other). */
      dmgByKind: {},
      /** Steps the stream dodge steered the bot. */
      dodgeSteps: 0,
      /** Steps the hazard escape overrode the planned move, and its last heading. */
      hzSteps: 0,
      hzDir: null,
      medkitDrops: 0,
      bonusDrops: 0,
      shardDrops: 0,
      coreDrops: 0,
      coresTaken: 0,
    }
    window.__PT = st
    // Spawn detector for bonuses, shards, cores and medkits: every pickup the
    // pool hands out is flagged, and __PT_run logs and clears the flag.
    if (!w.pickups.__ptWrapped) {
      const acq = w.pickups.acquire.bind(w.pickups)
      w.pickups.acquire = () => {
        const o = acq()
        o.__ptNew = true
        return o
      }
      w.pickups.__ptWrapped = true
    }
    for (const p of w.pickups.active) p.__ptNew = false
    S.input.update = function () {
      bot(w, S.input, st)
    }
    if (cfg.invincible) {
      w.player.maxHp = 1e9
      w.player.hp = 1e9
    }
    return { seed: w.seed, arena: w.arenaTheme.id, char: w.character.id, hp: w.player.hp, threat: w.threat }
  }

  function mulberry(seed) {
    let a = seed >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const PRIORITY = ['twin_shot', 'heavy_rounds', 'adrenaline', 'piercing', 'vitality', 'bulwark', 'regrowth', 'vampiric', 'second_wind', 'explosive_rounds', 'deadeye', 'fleet_footed', 'executioner', 'magnetic', 'phase_step', 'hollow_point', 'giant_slayer', 'cryo_rounds', 'scavenger', 'arc_rounds', 'long_barrel', 'ricochet', 'thorns', 'shock_step', 'slipstream', 'adrenal_wake', 'incendiary', 'overpressure', 'quartermaster', 'berserker', 'glass_cannon']
  function rank(w, c) {
    if (c.kind === 'fusion') return -100
    if (c.tags & TAG_COMPLETES_FUSION) return -50
    if (c.kind === 'fallback') return c.id === 'field_repair' && w.player.hp < w.player.maxHp * 0.6 ? 400 : c.id === 'sharpen' ? 600 : 700
    const i = PRIORITY.indexOf(c.id)
    return i < 0 ? 500 : i
  }
  function best(cards, score) {
    let bi = 0
    for (let i = 1; i < cards.length; i++) if (score(cards[i]) < score(cards[bi])) bi = i
    return bi
  }
  /** Index of the card the policy takes, after any reroll / banish / skip it does (-1 = skipped). */
  function answer(S, w, st) {
    const d = w.draft
    const policy = st.cfg.perkPolicy
    const cards = () => d.cards.slice(0, d.count)
    if (policy === 'random') {
      const r = st.rand
      if (d.rerolls > 0 && r() < 0.15) {
        const left = d.rerolls
        S.reroll()
        if (d.rerolls < left) st.rerollsUsed++
      }
      if (d.banishes > 0 && r() < 0.1) {
        const i = Math.floor(r() * d.count)
        if (d.cards[i].kind !== 'fallback') {
          S.banish(i)
          st.banishesUsed++
        }
      }
      if (r() < 0.05) return -1
      return Math.floor(r() * d.count)
    }
    if (policy === 'priority') return best(cards(), (c) => rank(w, c))
    if (policy === 'evolve') {
      const held = w.weapon.id !== w.baseWeaponId ? w.weapon : null
      return best(cards(), (c) => (c.tags & TAG_EVOLVES_HELD ? -200 : held && held.pair === c.id ? -150 : rank(w, c)))
    }
    return 0
  }
  function handleDraft(S, w, st) {
    while (w.paused && w.draft.open) {
      const d = w.draft
      if (st.firstDraftAt === null) st.firstDraftAt = +w.time.toFixed(2)
      const offered = d.cards.slice(0, d.count).map((c) => c.id)
      const i = answer(S, w, st)
      const after = d.cards.slice(0, d.count).map((c) => c.id)
      if (i < 0) {
        S.skip()
        st.skips++
        st.events.push({ t: +w.time.toFixed(2), type: 'levelup', level: w.level - w.pendingLevelUps, perk: null, offered, after })
      } else {
        const c = d.cards[i]
        const id = c.id
        const fusion = c.kind === 'fusion'
        S.pickCard(i)
        if (fusion && st.firstFusionAt === null) st.firstFusionAt = +w.time.toFixed(2)
        st.perks.push(id)
        st.events.push({ t: +w.time.toFixed(2), type: 'levelup', level: w.level - w.pendingLevelUps, perk: id, offered, after })
      }
      st.levelUpsChunk++
    }
  }

  function handleCore(S, w, st) {
    while (w.paused && w.core.pending) {
      const c = w.core
      const offered = c.evolveTo || null
      const evolve = !!offered && (st.cfg.perkPolicy === 'random' ? st.rand() < 0.5 : true)
      st.events.push({ t: +w.time.toFixed(2), type: 'coreTaken', prime: c.prime, levels: c.levels, ids: c.ids.slice(0, c.levels), offered, evolve })
      st.coresTaken++
      S.takeCore(evolve)
    }
  }

  window.__PT_run = (untilTime, maxCalls) => {
    const S = window.__SWARM
    const w = S.world
    const st = window.__PT
    const inv = st.cfg.invincible
    const ot = !!st.cfg.ot
    let calls = 0
    while (w.time < untilTime - 1e-9 && !st.dead && !(st.won && !ot) && !st.stalemate && calls < maxCalls) {
      const pk = w.pickups.active
      const t0 = w.time
      const hp0 = w.player.hp
      const dropTimer0 = w.weaponDropTimer
      // XP before this step (A18 up to the PRIME kill: the kill step drops the boss's own gem).
      const xpDropped0 = w.xpDropped
      const xpCollected0 = w.xpCollected
      // Damaging hazards before the step: a discrete hurt at one's anchor (the
      // FeelQueue stores float32 coordinates) is that hazard's hit.
      const hzPre = []
      const hza = w.hazards.active
      for (let i = 0; i < hza.length; i++) if (hza[i].alive && hza[i].damage > 0) hzPre.push(Math.fround(hza[i].x), Math.fround(hza[i].y))
      S.step(1)
      calls++
      const ran = w.time > t0
      const hp1 = w.player.hp
      // The loop is stopped, so nothing drains the FeelQueue: read the player
      // damage from it here, then empty it.
      const q = w.feel
      for (let i = 0; i < q.n; i++) {
        if (q.kind[i] !== FEEL_PLAYER_HURT) continue
        const f = q.flags[i]
        if (f & FF_CONTACT) {
          const act = w.enemies.active
          for (let k = 0; k < act.length; k++) {
            const e = act[k]
            if (e.stream && Math.abs(e.x - q.x[i]) < 1 && Math.abs(e.y - q.y[i]) < 1) {
              st.streamDmg += q.a[i]
              break
            }
          }
        }
        let hzHit = false
        if (f & FF_DISCRETE) for (let k = 0; k < hzPre.length && !hzHit; k += 2) hzHit = hzPre[k] === q.x[i] && hzPre[k + 1] === q.y[i]
        if (hzHit) st.hzDmg += q.a[i]
        // A boss ram at the boss's spot during ROYAL LUNGE is the lunge.
        const lunge = (f & FF_RAM) !== 0 && w.bossAlive && w.boss && w.bossFight.attack === ATK_ROYAL_LUNGE && Math.fround(w.boss.x) === q.x[i] && Math.fround(w.boss.y) === q.y[i]
        const kind = hzHit ? 'hazard' : lunge ? 'lunge' : f & FF_ACID ? 'acid' : f & FF_CONTACT ? 'bite' : f & FF_RAM ? 'ram' : f & FF_DISCRETE ? 'shot' : 'other'
        st.dmgByKind[kind] = (st.dmgByKind[kind] || 0) + q.a[i]
        st.hurts.push([w.time, kind, q.a[i]])
        st.halfDmg[kind] = (st.halfDmg[kind] || 0) + q.a[i]
        st.halfDirty = true
      }
      q.clear()
      while (st.hurts.length && st.hurts[0][0] < w.time - 3) st.hurts.shift()
      if (hp1 < hp0) {
        st.dmg += hp0 - hp1
        st.dmgChunk += hp0 - hp1
      } else if (hp1 > hp0) {
        st.heal += hp1 - hp0
        st.healChunk += hp1 - hp0
        st.halfHeal += hp1 - hp0
        st.halfDirty = true
      }

      if (w.pendingGameOver) {
        st.dead = true
        const pl = w.player
        const near = {}
        const act = w.enemies.active
        let nearCount = 0
        for (let i = 0; i < act.length; i++) {
          const e = act[i]
          if (!e.alive) continue
          const d = Math.hypot(e.x - pl.x, e.y - pl.y)
          if (d < 200) {
            near[e.def.id] = (near[e.def.id] || 0) + 1
            nearCount++
          }
        }
        let projNear = 0
        const eps = w.enemyProjectiles.active
        for (let i = 0; i < eps.length; i++) if (eps[i].alive && Math.hypot(eps[i].x - pl.x, eps[i].y - pl.y) < 120) projNear++
        st.death = {
          t: +w.time.toFixed(2),
          level: w.level,
          kills: w.kills,
          enemies: w.enemies.size,
          weapon: w.weapon.id,
          x: Math.round(pl.x),
          y: Math.round(pl.y),
          nearWithin200: near,
          nearCount,
          enemyProjWithin120: projNear,
          bossAlive: w.bossAlive,
          maxHp: pl.maxHp,
          revivesUsed: w.revivesUsed,
          fromHalfHp: +(w.time - st.lastHalfHpT).toFixed(3),
          hpAtHalf: +st.halfHp.toFixed(1),
          dmgFromHalfByKind: Object.fromEntries(Object.entries(st.halfDmg).map(([k, v]) => [k, +v.toFixed(1)])),
          healFromHalf: +st.halfHeal.toFixed(1),
          dmgLast3sByKind: st.hurts.reduce((o, [, k, a]) => ((o[k] = +((o[k] || 0) + a).toFixed(1)), o), {}),
          hurtsLast2s: st.hurts.filter((h) => h[0] >= w.time - 2).map(([t, k, a]) => [+t.toFixed(3), k, +a.toFixed(1)]),
          lastHitBy: w.lastHitBy,
          hpLast20s: st.hpHist.slice(-20),
        }
        st.events.push({ t: +w.time.toFixed(2), type: 'death' })
        break
      }

      // The win panel pauses the sim; a stalemate ends the run. With cfg.ot
      // the bot answers the panel with OVERTIME once pending drafts are done.
      if (w.pendingEnd) {
        st.stalemate = true
        st.events.push({ t: +w.time.toFixed(2), type: 'stalemate', clearTime: w.director.clearTime ? +w.director.clearTime.toFixed(2) : null, xpDropped: +w.xpDropped.toFixed(1), xpCollected: +w.xpCollected.toFixed(1) })
        break
      }
      if (w.pendingWin) {
        if (!st.won) {
          st.won = true
          st.events.push({ t: +w.time.toFixed(2), type: 'win', clearTime: w.director.clearTime ? +w.director.clearTime.toFixed(2) : null })
        }
        if (!ot) break
        if (S.pauseReason === 'win') {
          S.overtime()
          st.otStart = +w.time.toFixed(2)
          st.events.push({ t: st.otStart, type: 'overtime' })
        }
      }

      if (inv) {
        w.player.maxHp = 1e9
        w.player.hp = 1e9
      } else if (w.player.hp >= w.player.maxHp * 0.5) {
        st.lastHalfHpT = w.time
        st.halfHp = w.player.hp
        if (st.halfDirty) {
          st.halfDmg = {}
          st.halfHeal = 0
          st.halfDirty = false
        }
      }

      if (w.paused && w.core.pending) handleCore(S, w, st)
      if (w.paused && w.draft.open) {
        handleDraft(S, w, st)
        if (inv) {
          w.player.maxHp = 1e9
          w.player.hp = 1e9
        }
      }

      if (!ran) {
        st.frozenSteps++
        continue
      }
      st.simStepsChunk++
      if (!inv && w.time >= st.nextHpSample) {
        st.hpHist.push([Math.round(w.time), Math.round(w.player.hp), Math.round(w.player.maxHp), w.enemies.size])
        st.nextHpSample += 1
      }

      const n = w.enemies.size
      st.aliveSumChunk += n
      // A3 density counts the run before the win (OVERTIME has its own rows).
      const scripted = w.director.runState === 'running'
      const lull = w.time < w.director.lullUntil
      const row = w.script.minutes[Math.min(11, Math.floor(w.time / 60))]
      if (lull) st.lullStepsChunk++
      // A4 free field: steps where the row's minAlive is the floor (no cage, no lull).
      if (scripted && !lull && !w.director.cage.active) {
        st.freeAliveSumChunk += n
        st.freeStepsChunk++
      }
      if (w.bossAlive) st.bossStepsChunk++
      else if (scripted && !lull && n >= 0.95 * row.maxAlive) st.satStepsChunk++
      const runs = w.director.events
      let evActive = false
      for (let r = 0; r < runs.length; r++) if (runs[r].active) evActive = true
      let evUnits = 0
      let streamAlive = false
      const all = w.enemies.active
      for (let i = 0; i < all.length; i++) {
        if (!all[i].alive) continue
        if (all[i].eventUnit) evUnits++
        if (all[i].stream) streamAlive = true
      }
      if (evUnits > st.eventUnitsMax) st.eventUnitsMax = evUnits
      let lastEvent = -Infinity
      const beats = w.script.beats
      for (let k = 0; k < beats.length; k++) if (beats[k].kind === 'event' && w.director.firedAt[k] >= 0) lastEvent = Math.max(lastEvent, w.director.firedAt[k])
      if (evActive || streamAlive || w.time - lastEvent < EVENT_WINDOW) st.eventStepsChunk++
      else if (scripted && !w.director.cage.active) {
        st.a3Base++
        st.a3BaseChunk++
        if (n >= 0.95 * row.maxAlive) {
          st.a3Sat++
          st.a3SatChunk++
        }
      }
      if (scripted && n - row.maxAlive > st.overRowChunk) st.overRowChunk = n - row.maxAlive
      if (!w.director.cage.active) st.cageRow = -1
      else if (st.cageRow < 0) st.cageRow = Math.min(11, Math.floor(w.time / 60))
      const refMax = st.cageRow >= 0 ? w.script.minutes[st.cageRow].maxAlive : row.maxAlive
      if (scripted && n - refMax > st.overRowCageChunk) st.overRowCageChunk = n - refMax
      if (scripted && n - refMax > st.overRowCage) st.overRowCage = n - refMax
      while (st.alertSeq < w.alerts.seq) {
        const a = w.alerts.slots[st.alertSeq % w.alerts.slots.length]
        if (a.seq === st.alertSeq) {
          st.events.push({ t: +a.t.toFixed(2), type: 'alert', kind: ALERT_KIND[a.kind] || a.kind, title: a.title, sub: a.sub })
          st.alertsChunk++
        }
        st.alertSeq++
      }
      if (n > st.maxEnemies) st.maxEnemies = n
      if (n > st.maxEnemiesChunk) st.maxEnemiesChunk = n
      if (n >= 700) {
        st.capSteps++
        st.capStepsChunk++
      }
      const act = w.enemies.active
      for (let i = 0; i < act.length; i++) {
        const e = act[i]
        // A11 exempts streams, a charger's dash and the boss lunge (ROYAL LUNGE
        // ACTIVE, and its RECOVER, which keeps the lunge's last velocity).
        const lunging = e === w.boss && w.bossFight.attack === ATK_ROYAL_LUNGE && (w.bossFight.state === BS_ACTIVE || w.bossFight.state === BS_RECOVER)
        if (e.alive && !e.stream && !(e.def.behavior === 'charger' && e.phase === 2) && !lunging) {
          const v = Math.hypot(e.vx, e.vy)
          if (!(v <= (st.maxSpeedByType[e.def.id] || 0))) st.maxSpeedByType[e.def.id] = +v.toFixed(1)
        }
        if (e.bornAt !== w.time) continue
        st.spawnsChunk++
        const id = e.def.id
        if (st.firstSeen[id] === undefined) st.firstSeen[id] = +w.time.toFixed(2)
        if (e.def.elite) st.events.push({ t: +w.time.toFixed(2), type: 'elite', id, hp: Math.round(e.maxHp) })
        if (e.def.boss) {
          const c = w.director.cage
          const b = w.arena.bounds
          st.events.push({
            t: +w.time.toFixed(2), type: 'bossSpawn', id, stage: w.bossFight.stage, title: w.director.bossTitle, hp: Math.round(e.maxHp),
            dist: Math.round(Math.hypot(e.x - w.player.x, e.y - w.player.y)), cage: c.active && e === w.boss, cageR: Math.round(c.r),
            inCage: Math.hypot(w.player.x - c.x, w.player.y - c.y) <= c.r,
            inArena: e.x >= b.x + e.radius && e.x <= b.x + b.w - e.radius && e.y >= b.y + e.radius && e.y <= b.y + b.h - e.radius,
          })
        }
      }
      if (w.director.bossesKilled > st.bossesKilled) {
        st.bossesKilled = w.director.bossesKilled
        st.events.push({ t: +w.time.toFixed(2), type: 'bossKill', stage: w.bossFight.stage, xpDropped: +xpDropped0.toFixed(1), xpCollected: +xpCollected0.toFixed(1) })
      }
      st.lastBossAlive = w.bossAlive
      for (let i = 0; i < pk.length; i++) {
        const p = pk[i]
        if (!p.__ptNew) continue
        p.__ptNew = false
        if (!p.alive) continue
        const t = +w.time.toFixed(2)
        if (p.kind === 'health') st.medkitDrops++
        else if (p.kind === 'bonus') {
          st.bonusDrops++
          st.events.push({ t, type: 'bonus', id: p.sub })
        } else if (p.kind === 'shard') {
          st.shardDrops++
          st.events.push({ t, type: 'shard' })
        } else if (p.kind === 'core') {
          st.coreDrops++
          st.events.push({ t, type: 'core', row: p.sub })
        }
      }
      let timerPodAlive = false
      const podLife = POD_LIFE + w.mods.podLifeBonus
      for (let i = 0; i < pk.length; i++) {
        const p = pk[i]
        if (p.alive && p.kind === 'weapon' && p.timer) timerPodAlive = true
        if (p.alive && p.kind === 'weapon' && p.life > podLife - 1.5 * DT && !(p.__ptRun === st.runId && w.time - p.__ptT < 0.1)) {
          p.__ptT = w.time
          p.__ptRun = st.runId
          st.podsSeen++
          st.podsSeenChunk++
          st.events.push({ t: +w.time.toFixed(2), type: 'pod', id: p.weaponId, src: p.timer ? 'timer' : 'kill', dist: Math.round(Math.hypot(p.x - w.player.x, p.y - w.player.y)) })
        }
      }
      // The timer fired and no timer pod is on the field: the pool had no room.
      if (w.weaponDropTimer > dropTimer0 + 1 && !timerPodAlive) {
        st.podFails++
        st.events.push({ t: +w.time.toFixed(2), type: 'podDropFailed', pickups: w.pickups.size })
      }
      if (w.pickups.size >= 400) {
        st.pickupCapSteps++
        st.pickupCapStepsChunk++
      }
      if (w.weapon.id !== st.lastWeapon) {
        st.events.push({ t: +w.time.toFixed(2), type: w.weapon.id === w.baseWeaponId ? 'revert' : 'equip', id: w.weapon.id, from: st.lastWeapon })
        if (w.weapon.id !== w.baseWeaponId) st.equipsChunk++
        st.lastWeapon = w.weapon.id
      }
      if (w.revivesUsed !== st.lastRevives) {
        st.events.push({ t: +w.time.toFixed(2), type: 'revive' })
        st.lastRevives = w.revivesUsed
      }
    }
    return { t: w.time, dead: st.dead, won: st.won && !ot, stalemate: st.stalemate, calls }
  }

  window.__PT_chunk = () => {
    const w = window.__SWARM.world
    const st = window.__PT
    let gems = 0
    let gemXp = 0
    const pk = w.pickups.active
    for (let i = 0; i < pk.length; i++) {
      if (pk[i].alive && pk[i].kind === 'xp') {
        gems++
        gemXp += pk[i].xp
      }
    }
    const types = {}
    const act = w.enemies.active
    for (let i = 0; i < act.length; i++) if (act[i].alive) types[act[i].def.id] = (types[act[i].def.id] || 0) + 1
    const c = {
      t: +w.time.toFixed(2),
      level: w.level,
      xp: +w.xp.toFixed(1),
      xpToNext: w.xpToNext,
      xpTotal: +xpTotal(w).toFixed(1),
      kills: w.kills,
      killsDelta: w.kills - st.killsPrev,
      enemies: w.enemies.size,
      maxEnemiesChunk: st.maxEnemiesChunk,
      capFrac: st.simStepsChunk ? +(st.capStepsChunk / st.simStepsChunk).toFixed(3) : 0,
      types,
      weapon: w.weapon.id,
      ammo: w.ammo,
      bossAlive: w.bossAlive,
      bossHp: w.boss ? Math.round(w.boss.hp) : null,
      bossMaxHp: w.boss ? Math.round(w.boss.maxHp) : null,
      px: Math.round(w.player.x),
      py: Math.round(w.player.y),
      hp: st.cfg.invincible ? null : Math.round(w.player.hp),
      maxHp: st.cfg.invincible ? null : Math.round(w.player.maxHp),
      levelUps: st.levelUpsChunk,
      xpDropped: +w.xpDropped.toFixed(1),
      xpCollected: +w.xpCollected.toFixed(1),
      pendingLevelUps: w.pendingLevelUps,
      dmgTaken: Math.round(st.dmgChunk),
      healed: Math.round(st.healChunk),
      gemsOnField: gems,
      gemXpOnField: gemXp,
      podsSeen: st.podsSeenChunk,
      pickupCapFrac: st.simStepsChunk ? +(st.pickupCapStepsChunk / st.simStepsChunk).toFixed(3) : 0,
      equips: st.equipsChunk,
      enemyProj: w.enemyProjectiles.size,
      frozenSteps: st.frozenSteps,
      score: w.score,
      dashes: w.dashes,
      closeCalls: w.closeCalls,
      otCycle: w.director.otCycle,
      brood: w.director.broodCount,
      aliveMean: st.simStepsChunk ? +(st.aliveSumChunk / st.simStepsChunk).toFixed(1) : 0,
      spawns: st.spawnsChunk,
      lullSteps: st.lullStepsChunk,
      bossSteps: st.bossStepsChunk,
      satSteps: st.satStepsChunk,
      overRowMax: st.overRowChunk === -Infinity ? null : st.overRowChunk,
      overRowCageMax: st.overRowCageChunk === -Infinity ? null : st.overRowCageChunk,
      a3Base: st.a3BaseChunk,
      a3Sat: st.a3SatChunk,
      freeAliveSum: st.freeAliveSumChunk,
      freeSteps: st.freeStepsChunk,
      rowMaxAlive: w.script.minutes[Math.min(11, Math.floor(w.time / 60))].maxAlive,
      alerts: st.alertsChunk,
      eventSteps: st.eventStepsChunk,
    }
    st.killsPrev = w.kills
    st.levelUpsChunk = 0
    st.dmgChunk = 0
    st.healChunk = 0
    st.capStepsChunk = 0
    st.simStepsChunk = 0
    st.maxEnemiesChunk = 0
    st.podsSeenChunk = 0
    st.pickupCapStepsChunk = 0
    st.equipsChunk = 0
    st.alertsChunk = 0
    st.aliveSumChunk = 0
    st.spawnsChunk = 0
    st.lullStepsChunk = 0
    st.bossStepsChunk = 0
    st.satStepsChunk = 0
    st.overRowChunk = -Infinity
    st.overRowCageChunk = -Infinity
    st.a3BaseChunk = 0
    st.a3SatChunk = 0
    st.freeAliveSumChunk = 0
    st.freeStepsChunk = 0
    st.eventStepsChunk = 0
    st.chunks.push(c)
    return c
  }

  window.__PT_final = () => {
    const w = window.__SWARM.world
    const st = window.__PT
    // XP dropped 30 s or more before the end that is still uncollected: gems
    // from the last seconds (a boss kill) have not had time to home in.
    let settled = null
    for (const c of st.chunks) if (c.t <= w.time - 30 + 1e-6) settled = c
    const xpCollectFrac30 = settled ? +(1 - Math.max(0, settled.xpDropped - w.xpCollected) / Math.max(1, settled.xpDropped)).toFixed(4) : null
    return {
      cfg: st.cfg,
      endTime: +w.time.toFixed(2),
      dead: st.dead,
      won: st.won,
      threat: w.threat,
      otStart: st.otStart,
      otCycle: w.director.otCycle,
      stalemate: st.stalemate,
      death: st.death,
      level: w.level,
      kills: w.kills,
      score: w.score,
      maxEnemies: st.maxEnemies,
      capSteps: st.capSteps,
      podFails: st.podFails,
      pickupCapSteps: st.pickupCapSteps,
      xpTotal: +xpTotal(w).toFixed(1),
      xpDropped: +w.xpDropped.toFixed(1),
      xpCollected: +w.xpCollected.toFixed(1),
      xpCollectFrac: +(w.xpCollected / Math.max(1, w.xpDropped)).toFixed(4),
      xpCollectFrac30,
      firstDraftAt: st.firstDraftAt,
      firstFusionAt: st.firstFusionAt,
      medkitDrops: st.medkitDrops,
      bonusDrops: st.bonusDrops,
      shardDrops: st.shardDrops,
      coreDrops: st.coreDrops,
      coresTaken: st.coresTaken,
      evolutions: [...w.evolutions],
      rerollsUsed: st.rerollsUsed,
      banishesUsed: st.banishesUsed,
      skips: st.skips,
      dmgTaken: Math.round(st.dmg),
      healed: Math.round(st.heal),
      dashes: w.dashes,
      closeCalls: w.closeCalls,
      frozenSteps: st.frozenSteps,
      firstSeen: st.firstSeen,
      perks: st.perks,
      perkStacks: Object.fromEntries(w.perkStacks),
      maxSpeedByType: st.maxSpeedByType,
      // A3: every script beat with the sim time it fired (null: not reached, -1: dropped or skipped by the rules).
      beats: w.script.beats.map((b, i) => {
        const f = w.director.firedAt[i]
        return { i, kind: b.kind, at: b.at, id: b.id ?? b.stage ?? null, firedAt: Number.isNaN(f) ? null : +f.toFixed(3) }
      }),
      eventUnitsMax: st.eventUnitsMax,
      streamDmg: +st.streamDmg.toFixed(1),
      hzDmg: +st.hzDmg.toFixed(1),
      dmgByKind: Object.fromEntries(Object.entries(st.dmgByKind).map(([k, v]) => [k, +v.toFixed(1)])),
      dodgeSteps: st.dodgeSteps,
      hzSteps: st.hzSteps,
      a3Base: st.a3Base,
      a3Sat: st.a3Sat,
      overRowCage: st.overRowCage === -Infinity ? null : st.overRowCage,
      events: st.events,
      chunks: st.chunks,
      hpHist: st.hpHist,
    }
  }
})()
