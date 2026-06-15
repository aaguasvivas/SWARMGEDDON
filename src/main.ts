import { Container, Graphics } from 'pixi.js'
import { COLORS, DEFAULT_SEED, FIXED_DT, MAX_FRAME_TIME } from './config.ts'
import { GameLoop } from './core/time.ts'
import { Rng, seedFromString } from './core/rng.ts'
import { initSafeArea, getInsets } from './platform/safeArea.ts'
import { createRenderer } from './render/app.ts'
import { TextureRegistry } from './render/textures.ts'
import { IchorLayer } from './render/ichorLayer.ts'
import { renderEntities } from './render/entityRenderer.ts'
import { Arena, type DecorSpeck } from './game/arena.ts'
import { Player } from './game/player.ts'
import { World } from './game/world.ts'
import { InputManager } from './input/input.ts'
import { DebugOverlay } from './ui/debugOverlay.ts'
import { Hud } from './ui/hud.ts'
import { LevelUpModal } from './ui/levelupModal.ts'
import { spawnSystem, spawnEnemy, debugFloodSwarmers } from './systems/spawn.ts'
import { aiSystem, buildEnemyHash } from './systems/ai.ts'
import { weaponSystem } from './systems/weapons.ts'
import { projectileSystem, enemyProjectileSystem } from './systems/projectiles.ts'
import { pickupSystem } from './systems/pickups.ts'
import { collisionSystem } from './systems/collision.ts'
import { acidSystem } from './systems/acid.ts'
import { particleSystem } from './systems/particles.ts'

/**
 * Phase 2 bootstrap. Wires the data-driven content systems (wave director,
 * enemy roster, weapon pickups, XP + perk-draft level-up) onto the Phase 1
 * combat core, under the fixed-timestep loop.
 */
async function boot(): Promise<void> {
  initSafeArea()
  const mount = document.getElementById('app')
  if (!mount) throw new Error('#app mount not found')

  const { app, layers } = await createRenderer(mount)

  const texReg = new TextureRegistry(app.renderer)
  texReg.bakePlaceholders()

  const seed = resolveSeed()
  const sim = new Rng(seed)
  const cosmetic = new Rng(seed ^ 0x9e3779b9)

  const arena = new Arena()
  arena.setDecor(makeDecor(cosmetic, 56))
  layers.floor.addChild(arena.view)

  const ichor = new IchorLayer(app.renderer, cosmetic)
  layers.ichor.addChild(ichor.view)

  const player = new Player()
  const world = new World(sim, arena, player, ichor, layers, texReg)
  layers.world.addChild(player.view) // player draws above the swarm

  const input = new InputManager(app.canvas)
  const crosshair = buildCrosshair()
  const hurtOverlay = new Graphics()
  const hud = new Hud()
  const debug = new DebugOverlay()
  const modal = new LevelUpModal()
  layers.ui.addChild(hud.view, input.touch.view, hurtOverlay, crosshair, debug.view, modal.view)

  modal.onPick = (perkId) => {
    world.choosePerk(perkId)
    world.pendingLevelUps--
    if (world.pendingLevelUps > 0) {
      modal.open(world.draftPerks())
    } else {
      modal.close()
      world.paused = false
    }
  }

  let started = false
  function layout(): void {
    const w = app.screen.width
    const h = app.screen.height
    const insets = getInsets()
    arena.layout(w, h, insets)
    ichor.resize(arena.bounds.w, arena.bounds.h, arena.bounds.x, arena.bounds.y)
    hud.layout(w, h, insets)
    debug.layout(insets)
    modal.setScreen(w, h)
    hurtOverlay.clear()
    hurtOverlay.rect(0, 0, w, h).fill(COLORS.hurtFlash)
    if (!started) {
      world.start()
      started = true
    }
  }
  layout()
  window.addEventListener('resize', layout)
  window.addEventListener('orientationchange', layout)

  window.addEventListener('keydown', (e) => {
    if (modal.isOpen()) {
      if (e.key === '1') modal.pickByIndex(0)
      else if (e.key === '2') modal.pickByIndex(1)
      else if (e.key === '3') modal.pickByIndex(2)
      return
    }
    if (e.key === '`') debug.toggle()
    else if (e.key === 'r' || e.key === 'R') {
      world.restart()
      modal.close()
    }
  })

  // One fixed simulation step. Extracted so dev tooling can advance the sim
  // deterministically without waiting on requestAnimationFrame.
  function stepSim(dt: number): void {
    if (world.paused) return
    if (world.pendingLevelUps > 0) {
      world.paused = true // freeze immediately; the modal opens in render
      return
    }

    const j = world.juice
    if (j.hitstop > 0) {
      j.hitstop -= dt
      if (j.hitstop <= 0 && world.pendingRestart) {
        world.restart()
        world.pendingRestart = false
      }
      return
    }

    world.time += dt
    input.update(player.x, player.y)
    spawnSystem(world, dt)
    buildEnemyHash(world)
    aiSystem(world, dt)
    weaponSystem(world, dt, input)
    projectileSystem(world, dt)
    enemyProjectileSystem(world, dt)
    pickupSystem(world, dt)
    collisionSystem(world, dt)
    acidSystem(world, dt)
    particleSystem(world, dt)
    player.update(dt, input.move, input.aimDir, arena.bounds, world.mods.moveSpeedMul)
    if (player.hp > 0 && world.mods.regenPerSec > 0) {
      player.hp = Math.min(player.maxHp, player.hp + world.mods.regenPerSec * dt)
    }

    world.enemies.sweep()
    world.projectiles.sweep()
    world.enemyProjectiles.sweep()
    world.particles.sweep()
    world.floaters.sweep()
    world.pickups.sweep()
    world.acid.sweep()
  }

  const loop = new GameLoop(
    FIXED_DT,
    MAX_FRAME_TIME,
    stepSim,
    // --- render (interpolated) ---
    (alpha) => {
      renderEntities(world, alpha)
      player.render(alpha)

      const showCrosshair = input.lastType === 'kbm' && input.hasPointer
      crosshair.visible = showCrosshair
      if (showCrosshair) crosshair.position.set(input.pointerX, input.pointerY)

      ichor.flush()
      hud.update(world)

      // Level-up modal lifecycle.
      if (world.paused && world.pendingLevelUps > 0 && !modal.isOpen()) {
        const draft = world.draftPerks()
        if (draft.length === 0) {
          // Nothing left to offer — consume the level-up and resume.
          world.pendingLevelUps = 0
          world.paused = false
        } else {
          modal.open(draft)
        }
      }
      if (!world.paused && modal.isOpen()) modal.close()

      const fd = loop.frameMs / 1000
      world.hurtFlash = Math.max(0, world.hurtFlash - fd * 2.2)
      hurtOverlay.alpha = world.hurtFlash * 0.45

      world.juice.updateShake(fd)
      layers.world.position.set(world.juice.offsetX, world.juice.offsetY)

      debug.update({
        fps: loop.fps,
        frameMs: loop.frameMs,
        steps: loop.steps,
        enemies: world.enemies.size,
        projectiles: world.projectiles.size + world.enemyProjectiles.size,
        particles: world.particles.size + world.floaters.size + world.pickups.size + world.acid.size,
        inputType: input.lastType,
        firing: input.firing,
        width: Math.round(app.screen.width),
        height: Math.round(app.screen.height),
        dpr: app.renderer.resolution,
        seed,
      })

      app.render()
    },
  )
  loop.start()

  // Dev-only test handle (stripped from production builds via DCE).
  if (import.meta.env.DEV) {
    ;(window as unknown as { __SWARM: unknown }).__SWARM = {
      world,
      flood: (n: number) => debugFloodSwarmers(world, n),
      addXp: (n: number) => world.addXp(n),
      give: (id: string) => world.equipWeapon(id),
      setTime: (t: number) => (world.time = t),
      spawn: (id: string, n = 1) => {
        const b = world.arena.bounds
        for (let i = 0; i < n; i++) {
          spawnEnemy(world, id, b.x + world.rng.float() * b.w, b.y + world.rng.float() * b.h)
        }
      },
      // Advance the sim N fixed steps synchronously (bypasses rAF) for testing.
      step: (n = 60) => {
        for (let i = 0; i < n; i++) stepSim(FIXED_DT)
      },
    }
  }
}

/** Resolve the run seed (see README). Default: today's date -> a daily seed. */
function resolveSeed(): number {
  const param = new URLSearchParams(location.search).get('seed')
  if (param === 'random') {
    return (performance.now() * 1000) >>> 0 || DEFAULT_SEED
  }
  if (param) {
    const n = Number(param)
    return Number.isFinite(n) ? n >>> 0 : seedFromString(param)
  }
  const today = new Date().toISOString().slice(0, 10)
  return seedFromString('swarmgeddon:' + today)
}

/** Deterministic floor specks in normalized arena space. */
function makeDecor(rng: Rng, count: number): DecorSpeck[] {
  const out: DecorSpeck[] = []
  for (let i = 0; i < count; i++) {
    out.push({ nx: rng.float(), ny: rng.float(), r: rng.range(1, 3.5), alpha: rng.range(0.03, 0.1) })
  }
  return out
}

/** Ring + tick crosshair for desktop aim feedback. */
function buildCrosshair(): Container {
  const c = new Container()
  const g = new Graphics()
  const col = COLORS.crosshair
  g.circle(0, 0, 10).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(-14, 0).lineTo(-5, 0).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(5, 0).lineTo(14, 0).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(0, -14).lineTo(0, -5).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.moveTo(0, 5).lineTo(0, 14).stroke({ width: 1.5, color: col, alpha: 0.8 })
  g.circle(0, 0, 1.5).fill(col)
  c.addChild(g)
  c.visible = false
  return c
}

boot().catch((err) => {
  console.error('SWARMGEDDON failed to boot:', err)
  document.body.innerHTML =
    '<pre style="color:#ff6b6b;font:14px monospace;padding:20px;white-space:pre-wrap;">' +
    'SWARMGEDDON failed to boot:\n\n' +
    String(err && (err as Error).stack ? (err as Error).stack : err) +
    '</pre>'
})
