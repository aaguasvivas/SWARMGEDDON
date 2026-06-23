import { Application, Container } from 'pixi.js'
import { COLORS } from '../config.ts'

/**
 * The render layer stack. Order = draw order (bottom first). Splitting into
 * named containers keeps z-ordering declarative and gives later phases obvious
 * homes: the ichor render-texture goes just above `floor`, entities batch in
 * `entities`, particles/floating-text in `fx`, HUD + touch sticks in `ui`.
 */
export interface Layers {
  /** Camera + shake transform (pure translation). Pan this to follow the player.
   *  Lives *inside* the bloomed `scene`, so the camera never drags the bloom's
   *  screen-space filterArea off-screen. */
  world: Container
  /** Carries the bloom filter. A direct, IDENTITY-transform child of the stage —
   *  i.e. true screen space — so its filterArea (0,0,w,h) always maps to the
   *  visible window. The camera/shake translate is applied to its `world` child,
   *  *under* the filter, so the bloom processes exactly the on-screen image.
   *  (Putting the filter inside the camera-translated container instead clips the
   *  world to a black rectangle that slides with the camera.) */
  scene: Container
  /** Reality-warp host (scale/rotation around the player) — nested under the
   *  camera, so the filter never sits on a pivoted/translated container. */
  warpHost: Container
  floor: Container // arena background + grid + border
  ichor: Container // persistent ichor render-texture (beneath entities)
  entities: Container // player, enemies, projectiles, pickups
  fx: Container // particles, gibs, floating numbers, screen-space effects
  ui: Container // HUD, debug overlay, virtual sticks, crosshair (does NOT pan)
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
    scene: new Container(),
    warpHost: new Container(),
    floor: new Container(),
    ichor: new Container(),
    entities: new Container(),
    fx: new Container(),
    ui: new Container(),
  }
  // scene (bloom, screen-space) -> world (camera/shake) -> warpHost (warp) -> content.
  // The bloom sits ABOVE the camera/shake translate (on `scene`, an identity child
  // of the stage), so its screen-space filterArea is never dragged off-screen by
  // the camera — the world stays fully visible everywhere in the arena.
  layers.warpHost.addChild(layers.floor, layers.ichor, layers.entities, layers.fx)
  layers.world.addChild(layers.warpHost)
  layers.scene.addChild(layers.world)
  app.stage.addChild(layers.scene, layers.ui)

  // Enable Pixi's event system so interactive UI (the level-up cards) gets
  // pointer events. Gameplay input is handled separately via DOM listeners.
  app.stage.eventMode = 'static'

  return { app, layers }
}
