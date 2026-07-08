import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js'
import { COLORS, ICHOR_INTENSITY, ICHOR_MAX_SCALE, ICHOR_MIN_SCALE } from '../config.ts'
import { Rng } from '../core/rng.ts'

interface StampReq {
  x: number
  y: number
  scale: number
  rot: number
  tint: number
  alpha: number
}

/**
 * SIGNATURE FEATURE — persistent ichor-staining terrain.
 *
 * One RenderTexture the size of the arena sits beneath all entities. Every kill
 * stamps a gore splat into it. Because thousands of stamps bake into a single
 * texture, the on-screen cost is exactly one textured quad no matter how
 * drenched the floor gets — the arena visibly drowns in acid-green ichor at
 * constant draw cost.
 *
 * Per frame we batch ALL of the frame's stamps into one container and render it
 * into the texture in a single pass (one render-target bind/frame), so even a
 * swarm wipe doesn't cause a per-kill render storm.
 */
export class IchorLayer {
  readonly view = new Sprite()

  private rt: RenderTexture | null = null
  private readonly splats: Texture[] = []
  private readonly stampSprites: Sprite[] = []
  private readonly batch = new Container()
  private readonly clearLayer = new Container()
  // Pooled stamp requests: reused across frames (grows to peak, never GC'd per
  // kill), so heavy combat adds zero steady-state allocation.
  private readonly stamps: StampReq[] = []
  private stampCount = 0
  /** Settings-driven intensity multiplier on stamp alpha. */
  intensityMul = 1
  private originX = 0
  private originY = 0

  constructor(
    private readonly renderer: Renderer,
    rng: Rng,
  ) {
    this.buildSplatTextures(rng)
  }

  /** A few organic white blobs (metaball clusters) baked once; tinted at stamp time. */
  private buildSplatTextures(rng: Rng): void {
    for (let v = 0; v < 4; v++) {
      const g = new Graphics()
      const blobs = 7 + Math.floor(rng.float() * 5)
      for (let i = 0; i < blobs; i++) {
        const a = rng.angle()
        const r = rng.range(0, 13)
        g.circle(Math.cos(a) * r, Math.sin(a) * r, rng.range(6, 15)).fill({ color: 0xffffff, alpha: 0.45 })
      }
      g.circle(0, 0, rng.range(8, 12)).fill({ color: 0xffffff, alpha: 0.85 })
      this.splats.push(this.renderer.generateTexture({ target: g, resolution: 1 }))
      g.destroy()
    }
  }

  /**
   * (Re)create the render texture for the current arena size and place the
   * display sprite at the arena origin. Resize is rare (orientation/window),
   * and stains reset on resize — acceptable, and keeps it leak-free.
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

  /** Ichor stamp tint pair — set per arena theme at run start (presentation
   *  only; the rng draws here are unchanged regardless of color). */
  stampTintA: number = COLORS.ichorA
  stampTintB: number = COLORS.ichorB

  /** Queue a gore stamp at a WORLD position (converted to texture-local space). */
  queueStamp(worldX: number, worldY: number, rng: Rng): void {
    let req = this.stamps[this.stampCount]
    if (req === undefined) {
      req = { x: 0, y: 0, scale: 0, rot: 0, tint: 0, alpha: 0 }
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
    this.batch.removeChildren()
    for (let i = 0; i < this.stampCount; i++) {
      const req = this.stamps[i]!
      const spr = this.getStampSprite(i)
      spr.texture = this.splats[i % this.splats.length]!
      spr.position.set(req.x, req.y)
      spr.rotation = req.rot
      spr.scale.set(req.scale)
      spr.tint = req.tint
      spr.alpha = req.alpha
      this.batch.addChild(spr)
    }
    // clear:false -> accumulate onto whatever is already stained.
    this.renderer.render({ container: this.batch, target: this.rt, clear: false })
    this.stampCount = 0
  }

  private getStampSprite(i: number): Sprite {
    let s = this.stampSprites[i]
    if (!s) {
      s = new Sprite()
      s.anchor.set(0.5)
      this.stampSprites[i] = s
    }
    return s
  }

  /** Wipe all stains (run restart). Leak-free: reuses the same texture. */
  clear(): void {
    if (!this.rt) return
    this.renderer.render({ container: this.clearLayer, target: this.rt, clear: true })
    this.stampCount = 0
  }
}
