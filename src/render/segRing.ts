import { CanvasSource, Container, Sprite, Texture } from 'pixi.js'
import { setTint } from './textures.ts'

const RES = 3
const PAD = 2
const cache = new Map<string, { tex: Texture; ax: number; ay: number }>()

/** One white annular segment centered on +x, cropped to its bounds; the anchor
 *  sits on the ring center, so rotating the sprite places it on the ring. */
function segTexture(n: number, r: number, thick: number, gapDeg: number): { tex: Texture; ax: number; ay: number } {
  const key = `${n}:${r}:${thick}:${gapDeg}`
  const hit = cache.get(key)
  if (hit) return hit
  const half = Math.PI / n - (gapDeg * Math.PI) / 360
  const x0 = (r - thick) * Math.cos(half)
  const yH = r * Math.sin(half)
  const w = r - x0 + PAD * 2
  const h = yH * 2 + PAD * 2
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * RES)
  c.height = Math.ceil(h * RES)
  const ctx = c.getContext('2d')!
  ctx.scale(RES, RES)
  ctx.translate(PAD - x0, PAD + yH)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0, 0, r, -half, half)
  ctx.arc(0, 0, r - thick, half, -half, true)
  ctx.closePath()
  ctx.fill()
  const tex = new Texture({ source: new CanvasSource({ resource: c, resolution: RES }) })
  const out = { tex, ax: (PAD - x0) / w, ay: (PAD + yH) / h }
  cache.set(key, out)
  return out
}

/**
 * A ring of `n` equal segments drawn as sprites (no Graphics rebuild): callers
 * light, dim or tint single segments. Segment 0 starts at 12 o'clock and the
 * ring runs clockwise.
 */
export class SegRing {
  readonly view = new Container()
  readonly segs: Sprite[] = []

  constructor(readonly n: number, r: number, thick: number, gapDeg: number) {
    const t = segTexture(n, r, thick, gapDeg)
    const step = (Math.PI * 2) / n
    for (let i = 0; i < n; i++) {
      const s = new Sprite(t.tex)
      s.anchor.set(t.ax, t.ay)
      s.rotation = -Math.PI / 2 + step * (i + 0.5)
      this.segs.push(s)
      this.view.addChild(s)
    }
  }

  /** Light the first `lit` segments (fractional counts round down) at `on`,
   *  the rest at `off` alpha, all in `tint`. */
  fill(lit: number, tint: number, on: number, off: number): void {
    const k = Math.floor(lit)
    for (let i = 0; i < this.n; i++) {
      const s = this.segs[i]!
      setTint(s, tint)
      s.alpha = i < k ? on : off
    }
  }
}
