import { Application, Container } from 'pixi.js'
import { COLORS } from '../config.ts'

/**
 * The render layer stack. Order = draw order (bottom first). Splitting into
 * named containers keeps z-ordering declarative and gives later phases obvious
 * homes: the ichor render-texture goes just above `floor`, entities batch in
 * `entities`, particles/floating-text in `fx`, HUD + touch sticks in `ui`.
 */
export interface Layers {
  /** Everything that should screen-shake. Offset this container for shake. */
  world: Container
  floor: Container // arena background + grid + border
  ichor: Container // persistent ichor render-texture (beneath entities)
  entities: Container // player, enemies, projectiles, pickups
  fx: Container // particles, gibs, floating numbers, screen-space effects
  ui: Container // HUD, debug overlay, virtual sticks, crosshair (does NOT shake)
}

export interface GameRenderer {
  app: Application
  layers: Layers
}

/**
 * Boot the PixiJS WebGL application and build the layer stack. We force the
 * WebGL renderer (per spec), drive our own fixed-timestep loop (so the built-in
 * ticker is stopped), and use autoDensity + DPR resolution so the canvas is
 * crisp on retina while layout math stays in CSS pixels (`app.screen`).
 */
export async function createRenderer(mount: HTMLElement): Promise<GameRenderer> {
  const app = new Application()
  await app.init({
    background: COLORS.void,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2), // cap DPR at 2 for fill-rate
    powerPreference: 'high-performance',
    preference: 'webgl',
  })

  mount.appendChild(app.canvas)

  // We advance and render from our own GameLoop; silence Pixi's internal ticker
  // so it never double-renders or steps anything on its own schedule.
  app.ticker.stop()

  const layers: Layers = {
    world: new Container(),
    floor: new Container(),
    ichor: new Container(),
    entities: new Container(),
    fx: new Container(),
    ui: new Container(),
  }
  // `world` holds the shakeable game scene; `ui` stays rock-steady on top.
  layers.world.addChild(layers.floor, layers.ichor, layers.entities, layers.fx)
  app.stage.addChild(layers.world, layers.ui)

  // Enable Pixi's event system so interactive UI (the level-up cards) gets
  // pointer events. Gameplay input is handled separately via DOM listeners.
  app.stage.eventMode = 'static'

  return { app, layers }
}
