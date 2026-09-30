// In-page playtest harness. Injected into the DEV build (the dev server at
// SWG_URL, default http://localhost:5176) and driven through window.__SWARM.
// Stops the rAF loop so ONLY our step(1) calls advance the sim, replaces
// input.update with a bot, and records events. Drafts open through the game's
// own single path (stepSim hand-off, cards cached on world.draftCards) and are
// answered through S.pickPerk, exactly like a tap. Never calls endRun (so
// nothing is submitted to the leaderboard).
(() => {
  const DT = 1 / 60
  const ALERT_KIND = ['', 'boss', 'final', 'event', 'elite', 'lull', 'debut']
  const xpForLevel = (l) => Math.floor(5 + l * 4 + l * l * 0.55)

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
      xpExpired: 0,
      xpExpiredChunk: 0,
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

  const PRIORITY = ['twin_shot', 'heavy_rounds', 'adrenaline', 'piercing', 'vitality', 'bulwark', 'regrowth', 'vampiric', 'second_wind', 'explosive_rounds', 'deadeye', 'fleet_footed', 'executioner', 'magnetic', 'dodge', 'hollow_point', 'giant_slayer', 'cryo_rounds', 'scavenger', 'velocity', 'long_barrel', 'steady_aim', 'ricochet', 'thorns', 'overpressure', 'berserker', 'glass_cannon']
  function handleDraft(S, w, st) {
    while (w.paused && w.pendingLevelUps > 0 && w.draftCards.length > 0) {
      const d = w.draftCards.slice()
      let pick = d[0]
      if (st.cfg.perkPolicy === 'priority') {
        let bi = 1e9
        for (const p of d) {
          const i = PRIORITY.indexOf(p.id)
          const r = i < 0 ? 500 : i
          if (r < bi) {
            bi = r
            pick = p
          }
        }
      }
      S.pickPerk(pick.id)
      st.perks.push(pick.id)
      st.levelUpsChunk++
      st.events.push({ t: +w.time.toFixed(2), type: 'levelup', level: w.level - w.pendingLevelUps, perk: pick.id, offered: d.map((p) => p.id) })
    }
  }

  window.__PT_run = (untilTime, maxCalls) => {
    const S = window.__SWARM
    const w = S.world
    const st = window.__PT
    const inv = st.cfg.invincible
    let calls = 0
    while (w.time < untilTime - 1e-9 && !st.dead && calls < maxCalls) {
      // Gems that will expire if this step runs the sim.
      let expiring = 0
      const pk = w.pickups.active
      for (let i = 0; i < pk.length; i++) {
        const p = pk[i]
        if (p.alive && p.kind === 'xp' && p.life <= DT + 1e-9) expiring += p.xp
      }
      const t0 = w.time
      const hp0 = w.player.hp
      const dropTimer0 = w.weaponDropTimer
      S.step(1)
      calls++
      const ran = w.time > t0
      const hp1 = w.player.hp
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
          hpLast20s: st.hpHist.slice(-20),
        }
        st.events.push({ t: +w.time.toFixed(2), type: 'death' })
        break
      }

      if (inv) {
        w.player.maxHp = 1e9
        w.player.hp = 1e9
      }

      if (w.paused && w.pendingLevelUps > 0) {
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
      st.xpExpired += expiring
      st.xpExpiredChunk += expiring
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
      xpExpired: st.xpExpiredChunk,
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
    st.xpExpiredChunk = 0
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
      xpExpired: st.xpExpired,
      xpTotal: +xpTotal(w).toFixed(1),
      dmgTaken: Math.round(st.dmg),
      healed: Math.round(st.heal),
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
