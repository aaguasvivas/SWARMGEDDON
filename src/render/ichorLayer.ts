import { Container, Graphics, RenderTexture, Sprite, type Texture, type Renderer } from 'pixi.js'
import { COLORS, ICHOR_INTENSITY, ICHOR_MAX_SCALE, ICHOR_MIN_SCALE } from '../config.ts'
import { Rng } from '../core/rng.ts'
import { QuadLayer, packColor } from './quads.ts'
import { packTextures } from './textures.ts'

/** Width of the splat atlas, in pixels (splats bake at resolution 1). */
const SPLAT_ATLAS_W = 256

/** Fractional values first, so every request has double fields from birth. */
function newStamp(): StampReq {
  return { x: 0.5, y: 0.5, scale: 0.5, rot: 0.5, tint: 0, alpha: 0.5 }
}

interface StampReq {
  x: number
  y: number
  scale: number
  rot: number
  tint: number
  alpha: number
}

/**
 * SIGNATURE FEATURE: persistent ichor-staining terrain.
 *
 * One RenderTexture the size of the arena sits beneath all entities. Every kill
 * stamps a gore splat into it. Because thousands of stamps bake into a single
 * texture, the on-screen cost is exactly one textured quad no matter how
 * drenched the floor gets: the arena visibly drowns in acid-green ichor at
 * constant draw cost.
 *
 * Per frame we batch ALL of the frame's stamps into one container and render it
 * into the texture in a single pass (one render-target bind/frame), so even a
 * swarm wipe doesn't cause a per-kill render storm.
 */
export class IchorLayer {
  readonly view = new Sprite()

  private rt: RenderTexture | null = null
  /** The splat frames, all on one texture, so a frame's stamps are one quad layer. */
  private splats: Texture[] = []
  private readonly batch = new QuadLayer()
  private readonly clearLayer = new Container()
  // Pooled stamp requests: reused across frames (grows to peak, never GC'd per
  // kill), so heavy combat adds zero steady-state allocation.
  private readonly stamps: StampReq[] = []
  private stampCount = 0
  /** Stamp requests and quads made up front: a frame of mass kills stamps
   *  dozens, and growing past this is heap growth (section 3.2). */
  private static readonly PREWARM = 64
  /** Settings-driven intensity multiplier on stamp alpha. */
  intensityMul = 1
  private originX = 0
  private originY = 0

  constructor(
    private readonly renderer: Renderer,
    rng: Rng,
  ) {
    this.buildSplatTextures(rng)
    for (let i = 0; i < IchorLayer.PREWARM; i++) this.stamps.push(newStamp())
    this.batch.reserve(IchorLayer.PREWARM, this.splats[0]!)
  }

  /** A few organic white blobs (metaball clusters) baked once; tinted at stamp time. */
  private buildSplatTextures(rng: Rng): void {
    const baked: Texture[] = []
    for (let v = 0; v < 4; v++) {
      const g = new Graphics()
      const blobs = 7 + Math.floor(rng.float() * 5)
      for (let i = 0; i < blobs; i++) {
        const a = rng.angle()
        const r = rng.range(0, 13)
        g.circle(Math.cos(a) * r, Math.sin(a) * r, rng.range(6, 15)).fill({ color: 0xffffff, alpha: 0.45 })
      }
      g.circle(0, 0, rng.range(8, 12)).fill({ color: 0xffffff, alpha: 0.85 })
      baked.push(this.renderer.generateTexture({ target: g, resolution: 1 }))
      g.destroy()
    }
    this.splats = packTextures(this.renderer, baked, 1, SPLAT_ATLAS_W)
    for (const t of baked) t.destroy(true)
  }

  /**
   * (Re)create the render texture for the current arena size and place the
   * display sprite at the arena origin. Resize is rare (orientation/window),
   * and stains reset on resize. Acceptable, and keeps it leak-free.
   */
  resize(w: number, h: number, x: number, y: number): void {
    const old = this.rt
    this.rt = RenderTexture.create({
      width: Math.max(1, Math.ceil(w)),
      height: Math.max(1, Math.ceil(h)),
      // The arena is large; the gore is soft, so a sub-1 backing resolution is
      // visually free and keeps this big texture's memory down (~2MB vs ~21MB).
      resolution: 0.6,
    })
    this.view.texture = this.rt
    this.view.position.set(x, y)
    this.originX = x
    this.originY = y
    this.renderer.render({ container: this.clearLayer, target: this.rt, clear: true })
    if (old) old.destroy(true)
  }

  /** Ichor stamp tint pair, set per arena theme at run start (presentation
   *  only; the rng draws here are unchanged regardless of color). */
  stampTintA: number = COLORS.ichorA
  stampTintB: number = COLORS.ichorB

  /** Queue a gore stamp at a WORLD position (converted to texture-local space). */
  queueStamp(worldX: number, worldY: number, rng: Rng): void {
    let req = this.stamps[this.stampCount]
    if (req === undefined) {
      req = newStamp()
      this.stamps[this.stampCount] = req
    }
    req.x = worldX - this.originX
    req.y = worldY - this.originY
    req.scale = rng.range(ICHOR_MIN_SCALE, ICHOR_MAX_SCALE)
    req.rot = rng.angle()
    req.tint = rng.bool(0.85) ? this.stampTintA : this.stampTintB
    req.alpha = ICHOR_INTENSITY * this.intensityMul * rng.range(0.6, 1)
    this.stampCount++
  }

  /** Bake the frame's queued stamps into the texture in one render pass. */
  flush(): void {
    if (!this.rt || this.stampCount === 0) return
    const b = this.batch
    b.begin()
    for (let i = 0; i < this.stampCount; i++) {
      const req = this.stamps[i]!
      const tex = this.splats[i % this.splats.length]!
      const q = b.next(tex)
      q.texture = tex
      q.x = req.x
      q.y = req.y
      q.rotation = req.rot
      q.scaleX = q.scaleY = req.scale
      q.color = packColor(req.tint, req.alpha)
    }
    b.end()
    // clear:false -> accumulate onto whatever is already stained.
    this.renderer.render({ container: b.view, target: this.rt, clear: false })
    this.stampCount = 0
  }

  /** Wipe all stains (run restart). Leak-free: reuses the same texture. */
  clear(): void {
    if (!this.rt) return
    this.renderer.render({ container: this.clearLayer, target: this.rt, clear: true })
    this.stampCount = 0
  }
}
