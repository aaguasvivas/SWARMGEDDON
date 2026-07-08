import { Sprite, Texture } from 'pixi.js'

/**
 * Screen-edge vignette — a single stretched radial-ramp quad above the game
 * world but below the HUD. Darkens the corners to focus the eye and add mood at
 * constant cost. The ramp is baked once as pure WHITE (transparent center ->
 * opaque edge); each world tints it (`view.tint`) and sets its depth
 * (`view.alpha`), so the same texture serves every world with no re-bake.
 */
export class Vignette {
  readonly view: Sprite

  constructor() {
    this.view = new Sprite(buildTexture())
    this.view.eventMode = 'none'
    this.view.tint = 0x03070d // near-black default until a world theme sets it
    this.view.alpha = 0.6
  }

  resize(w: number, h: number): void {
    this.view.width = w
    this.view.height = h
  }

  /** Per-world edge color + strength (0..1 = how dark the corners get). */
  setTheme(color: number, strength: number): void {
    this.view.tint = color
    this.view.alpha = strength
  }
}

function buildTexture(): Texture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.75)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.7, 'rgba(255,255,255,0.17)')
  g.addColorStop(1, 'rgba(255,255,255,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return Texture.from(canvas)
}
