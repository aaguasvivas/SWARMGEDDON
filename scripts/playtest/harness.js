// In-page playtest harness. Injected into the DEV build (the dev server at
// SWG_URL, default http://localhost:5176) and driven through window.__SWARM.
// Stops the rAF loop so ONLY our step(1) calls advance the sim, replaces
// input.update with a bot, and records events. Drafts open through the game's
// own single path (stepSim hand-off, cards cached on world.draft.cards) and
// are answered through S.pickCard / reroll / banish / skip, exactly like a tap
// (so the pick also applies world.resumeFromDraft() grace). Draft policies
// (cfg.perkPolicy): first (card 1), priority (fusions, then fusion parents,
// then PRIORITY), random (seeded: rerolls, banishes, skips, random cards),
// evolve (the held weapon's pair perk first, then priority). Never calls
// endRun (so nothing is submitted to the leaderboard). With cfg.dash the bot
// also dashes out of danger.
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

    // Aim + fire at the nearest targetable enemy.
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
    const ml = Math.hypot(mx, my)
    if (ml > 1) {
      mx /= ml
      my /= ml
    }
    inp.move.x = mx
    inp.move.y = my
    if (st.cfg.dash && w.dashCharges > 0 && pl.dashTicks === 0 && inDanger(w, pl)) inp.pressDash()
  }

  // Dash policy: dash (along the bot's move, else its facing) when a hit is
  // about to land: a shot arriving within 0.2 s, a charging charger on a line
  // through us, an elite or boss body at contact, or 3+ bodies touching.
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
    w.beginRun(cfg.seed >>> 0, 'endless') // keeps the pilot/theme startRun set
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
    }
    window.__PT = st
    S.input.update = function () {
      bot(w, S.input, st)
    }
    if (cfg.invincible) {
      w.player.maxHp = 1e9
      w.player.hp = 1e9
    }
    return { seed: w.seed, arena: w.arenaTheme.id, char: w.character.id, hp: w.player.hp }
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

  window.__PT_run = (untilTime, maxCalls) => {
    const S = window.__SWARM
    const w = S.world
    const st = window.__PT
    const inv = st.cfg.invincible
    let calls = 0
    while (w.time < untilTime - 1e-9 && !st.dead && calls < maxCalls) {
      const pk = w.pickups.active
      const t0 = w.time
      const hp0 = w.player.hp
      const dropTimer0 = w.weaponDropTimer
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
        const kind = f & FF_ACID ? 'acid' : f & FF_CONTACT ? 'bite' : f & FF_RAM ? 'ram' : f & FF_DISCRETE ? 'shot' : 'other'
        st.hurts.push([w.time, kind, q.a[i]])
      }
      q.clear()
      while (st.hurts.length && st.hurts[0][0] < w.time - 3) st.hurts.shift()
      if (hp1 < hp0) {
        st.dmg += hp0 - hp1
        st.dmgChunk += hp0 - hp1
      } else if (hp1 > hp0) {
        st.heal += hp1 - hp0
        st.healChunk += hp1 - hp0
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
          dmgLast3sByKind: st.hurts.reduce((o, [, k, a]) => ((o[k] = +((o[k] || 0) + a).toFixed(1)), o), {}),
          hurtsLast2s: st.hurts.filter((h) => h[0] >= w.time - 2).map(([t, k, a]) => [+t.toFixed(3), k, +a.toFixed(1)]),
          lastHitBy: w.lastHitBy,
          hpLast20s: st.hpHist.slice(-20),
        }
        st.events.push({ t: +w.time.toFixed(2), type: 'death' })
        break
      }

      if (inv) {
        w.player.maxHp = 1e9
        w.player.hp = 1e9
      } else if (w.player.hp >= w.player.maxHp * 0.5) {
        st.lastHalfHpT = w.time
      }

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
      const lull = w.time < w.director.lullUntil
      const row = w.script.minutes[Math.min(11, Math.floor(w.time / 60))]
      if (lull) st.lullStepsChunk++
      if (w.bossAlive) st.bossStepsChunk++
      else if (!lull && n >= 0.95 * row.maxAlive) st.satStepsChunk++
      if (n - row.maxAlive > st.overRowChunk) st.overRowChunk = n - row.maxAlive
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
        if (e.alive && !(e.def.behavior === 'charger' && e.phase === 2)) {
          const v = Math.hypot(e.vx, e.vy)
          if (!(v <= (st.maxSpeedByType[e.def.id] || 0))) st.maxSpeedByType[e.def.id] = +v.toFixed(1)
        }
        if (e.bornAt !== w.time) continue
        st.spawnsChunk++
        const id = e.def.id
        if (st.firstSeen[id] === undefined) st.firstSeen[id] = +w.time.toFixed(2)
        if (e.def.elite) st.events.push({ t: +w.time.toFixed(2), type: 'elite', id, hp: Math.round(e.maxHp) })
        if (e.def.boss) st.events.push({ t: +w.time.toFixed(2), type: 'bossSpawn', id, title: w.director.bossTitle, hp: Math.round(e.maxHp), dist: Math.round(Math.hypot(e.x - w.player.x, e.y - w.player.y)) })
      }
      if (st.lastBossAlive && !w.bossAlive) st.events.push({ t: +w.time.toFixed(2), type: 'bossKill' })
      st.lastBossAlive = w.bossAlive
      let timerPodSeen = false
      for (let i = 0; i < pk.length; i++) {
        const p = pk[i]
        if (p.alive && p.kind === 'weapon' && p.life > 24 - 1.5 * DT && !(p.__ptRun === st.runId && w.time - p.__ptT < 0.1)) {
          p.__ptT = w.time
          p.__ptRun = st.runId
          const src = p.life >= 24 - 1e-9 ? 'kill' : 'timer'
          if (src === 'timer') timerPodSeen = true
          st.podsSeen++
          st.podsSeenChunk++
          st.events.push({ t: +w.time.toFixed(2), type: 'pod', id: p.weaponId, src, dist: Math.round(Math.hypot(p.x - w.player.x, p.y - w.player.y)) })
        }
      }
      if (w.weaponDropTimer > dropTimer0 + 1 && !timerPodSeen) {
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
    return { t: w.time, dead: st.dead, calls }
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
      aliveMean: st.simStepsChunk ? +(st.aliveSumChunk / st.simStepsChunk).toFixed(1) : 0,
      spawns: st.spawnsChunk,
      lullSteps: st.lullStepsChunk,
      bossSteps: st.bossStepsChunk,
      satSteps: st.satStepsChunk,
      overRowMax: st.overRowChunk === -Infinity ? null : st.overRowChunk,
      rowMaxAlive: w.script.minutes[Math.min(11, Math.floor(w.time / 60))].maxAlive,
      alerts: st.alertsChunk,
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
      events: st.events,
      chunks: st.chunks,
      hpHist: st.hpHist,
    }
  }
})()
