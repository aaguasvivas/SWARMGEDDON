import { Container, Graphics } from 'pixi.js'
import { COLORS, DEFAULT_SEED, FIXED_DT, MAX_FRAME_TIME } from './config.ts'
import { GameLoop } from './core/time.ts'
import { Rng, seedFromString } from './core/rng.ts'
import { initSafeArea, getInsets } from './platform/safeArea.ts'
import { createRenderer } from './render/app.ts'
import { Arena, type DecorSpeck } from './game/arena.ts'
import { Player } from './game/player.ts'
import { InputManager } from './input/input.ts'
import { DebugOverlay } from './ui/debugOverlay.ts'

/**
 * Phase 0 bootstrap. Wires the fixed-timestep loop, seeded RNG, resize/DPR/
 * safe-area handling, a player driven by keyboard+mouse / touch / gamepad, and
 * the debug overlay. Everything below is the skeleton later phases hang content
 * and systems onto — no gameplay yet beyond moving and aiming.
 */
async function boot(): Promise<void> {
  initSafeArea()

  const mount = document.getElementById('app')
  if (!mount) throw new Error('#app mount not found')

  const { app, layers } = await createRenderer(mount)
  const seed = resolveSeed()
  const rng = new Rng(seed)

  // Build the world.
  const arena = new Arena()
  arena.setDecor(makeDecor(rng, 56))
  layers.floor.addChild(arena.view)

  const player = new Player()
  layers.entities.addChild(player.view)

  const input = new InputManager(app.canvas)
  layers.ui.addChild(input.touch.view)

  const crosshair = buildCrosshair()
  layers.ui.addChild(crosshair)

  const debug = new DebugOverlay()
  layers.ui.addChild(debug.view)

  // (Re)compute everything resolution-dependent. Called once now and on resize.
  let didSpawn = false
  function layout(): void {
    const w = app.screen.width
    const h = app.screen.height
    const insets = getInsets()
    arena.layout(w, h, insets)
    debug.layout(insets)
    if (!didSpawn) {
      player.spawn(arena.bounds.x + arena.bounds.w / 2, arena.bounds.y + arena.bounds.h / 2)
      didSpawn = true
    }
  }
  layout()
  window.addEventListener('resize', layout)
  window.addEventListener('orientationchange', layout)

  // Backtick toggles the debug overlay.
  window.addEventListener('keydown', (e) => {
    if (e.key === '`') debug.toggle()
  })

  // The loop: sim in update (fixed dt), interpolated draw in render.
  const loop = new GameLoop(
    FIXED_DT,
    MAX_FRAME_TIME,
    (dt) => {
      input.update(player.x, player.y)
      player.update(dt, input.move, input.aimDir, arena.bounds)
    },
    (alpha) => {
      player.render(alpha)

      // Desktop crosshair tracks the mouse; hidden for touch/gamepad.
      const showCrosshair = input.lastType === 'kbm' && input.hasPointer
      crosshair.visible = showCrosshair
      if (showCrosshair) crosshair.position.set(input.pointerX, input.pointerY)

      debug.update({
        fps: loop.fps,
        frameMs: loop.frameMs,
        steps: loop.steps,
        entities: 1, // just the player in phase 0
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
}

/**
 * Resolve the run seed. Default is today's date -> a deterministic "daily"
 * seed, so determinism is exercised from Phase 0. Override with:
 *   ?seed=12345   fixed numeric seed
 *   ?seed=foo     hashed string seed
 *   ?seed=random  fresh non-deterministic seed each load
 */
function resolveSeed(): number {
  const param = new URLSearchParams(location.search).get('seed')
  if (param === 'random') {
    return (performance.now() * 1000) >>> 0 || DEFAULT_SEED
  }
  if (param) {
    const n = Number(param)
    return Number.isFinite(n) ? n >>> 0 : seedFromString(param)
  }
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return seedFromString('swarmgeddon:' + today)
}

/** Deterministic floor specks in normalized arena space. */
function makeDecor(rng: Rng, count: number): DecorSpeck[] {
  const out: DecorSpeck[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      nx: rng.float(),
      ny: rng.float(),
      r: rng.range(1, 3.5),
      alpha: rng.range(0.03, 0.1),
    })
  }
  return out
}

/** A simple ring + tick crosshair for desktop aim feedback. */
function buildCrosshair(): Container {
  const c = new Container()
  const g = new Graphics()
  g.circle(0, 0, 10).stroke({ width: 1.5, color: COLORS.crosshair, alpha: 0.8 })
  g.moveTo(-14, 0).lineTo(-5, 0).stroke({ width: 1.5, color: COLORS.crosshair, alpha: 0.8 })
  g.moveTo(5, 0).lineTo(14, 0).stroke({ width: 1.5, color: COLORS.crosshair, alpha: 0.8 })
  g.moveTo(0, -14).lineTo(0, -5).stroke({ width: 1.5, color: COLORS.crosshair, alpha: 0.8 })
  g.moveTo(0, 5).lineTo(0, 14).stroke({ width: 1.5, color: COLORS.crosshair, alpha: 0.8 })
  g.circle(0, 0, 1.5).fill(COLORS.crosshair)
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
