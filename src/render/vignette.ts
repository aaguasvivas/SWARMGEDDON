import { Sprite, Texture } from 'pixi.js'

/**
 * Screen-edge vignette — a single stretched radial-gradient quad above the game
 * world but below the HUD. Darkens the corners to focus the eye and add mood at
 * constant cost. Drawn once to a canvas texture, then scaled to the viewport.
 */
export class Vignette {
  readonly view: Sprite

  constructor() {
    this.view = new Sprite(buildTexture())
    this.view.eventMode = 'none'
  }

  resize(w: number, h: number): void {
    this.view.width = w
    this.view.height = h
  }
}

function buildTexture(): Texture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.75)
  g.addColorStop(0, 'rgba(5,7,13,0)')
  g.addColorStop(0.7, 'rgba(4,5,10,0.1)')
  g.addColorStop(1, 'rgba(2,3,7,0.6)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return Texture.from(canvas)
}
