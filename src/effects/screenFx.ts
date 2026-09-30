import { Container, Sprite, Texture } from 'pixi.js'
import { Vignette } from '../render/vignette.ts'

const HURT_RED = 0xff2d4a
/** Edge sprite size as a fraction of the short screen side. */
const EDGE_W = 0.9
const EDGE_H = 0.32
/** How much of the red vignette a full hurt flash, and low HP, show. */
const HURT_GAIN = 1.1
const LOW_HP_BASE = 0.3
const LOW_HP_BEAT = 0.4

/**
 * Screen-space hurt feedback (section 6.5): a red edge vignette driven by the
 * hurt flash and the low-HP heartbeat, and a red glow on the screen edge that
 * faces the source of the last discrete hit. Replaces the full-screen red rect.
 */
export class ScreenFx {
  readonly view = new Container()
  private readonly red = new Vignette()
  private readonly edge = new Sprite(edgeTexture())
  private w = 1
  private h = 1

  constructor() {
    this.red.setTheme(HURT_RED, 0)
    this.edge.anchor.set(0.5, 1)
    this.edge.tint = HURT_RED
    this.edge.alpha = 0
    this.view.addChild(this.red.view, this.edge)
    this.view.eventMode = 'none'
  }

  layout(w: number, h: number): void {
    this.w = w
    this.h = h
    this.red.resize(w, h)
    const short = Math.min(w, h)
    this.edge.width = short * EDGE_W
    this.edge.height = short * EDGE_H
  }

  /** `flash` = hurt flash (0..1); `lowHp` with its heartbeat `pulse` (0..1);
   *  the edge glow at `edge` strength toward unit (dx, dy) from the ship at (sx, sy). */
  update(flash: number, lowHp: boolean, pulse: number, edge: number, dx: number, dy: number, sx: number, sy: number): void {
    const low = lowHp ? LOW_HP_BASE + LOW_HP_BEAT * pulse : 0
    this.red.view.alpha = Math.min(1, flash * HURT_GAIN + low)
    this.edge.visible = edge > 0.01
    if (!this.edge.visible) return
    let k = 1e6
    if (dx > 1e-6) k = Math.min(k, (this.w - sx) / dx)
    else if (dx < -1e-6) k = Math.min(k, -sx / dx)
    if (dy > 1e-6) k = Math.min(k, (this.h - sy) / dy)
    else if (dy < -1e-6) k = Math.min(k, -sy / dy)
    this.edge.position.set(sx + dx * k, sy + dy * k)
    this.edge.rotation = Math.atan2(dy, dx) - Math.PI / 2
    this.edge.alpha = edge
  }
}

/** A half-ellipse glow, opaque at its bottom edge and fading upward. */
function edgeTexture(): Texture {
  const w = 256
  const h = 96
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.translate(w / 2, h)
  ctx.scale(w / 2 / h, 1)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(-h, -h, h * 2, h)
  return Texture.from(c)
}
