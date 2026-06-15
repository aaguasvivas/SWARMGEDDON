import { Graphics, Sprite, Texture, type Renderer } from 'pixi.js'
import { PLACEHOLDER_SPRITES } from '../content/assets.ts'

interface Baked {
  texture: Texture
  /** Anchor that pivots the sprite at the drawing's (0,0) origin, regardless of
   *  how asymmetric its bounds are — so rotate-to-face spins around the body. */
  anchorX: number
  anchorY: number
}

/**
 * Bakes the manifest's grayscale draw functions into GPU textures once, and
 * mints batched Sprites from them. Swapping to a real texture atlas later is a
 * change in this one class — entities just ask for a sprite by key.
 */
export class TextureRegistry {
  private readonly map = new Map<string, Baked>()

  constructor(private readonly renderer: Renderer) {}

  bakePlaceholders(): void {
    for (const key in PLACEHOLDER_SPRITES) {
      const draw = PLACEHOLDER_SPRITES[key]!
      const g = new Graphics()
      draw(g)
      const b = g.getLocalBounds()
      const texture = this.renderer.generateTexture({ target: g, resolution: 2, antialias: true })
      // Map graphics-origin (0,0) to a normalized anchor inside the baked frame.
      const anchorX = b.width > 0 ? -b.minX / b.width : 0.5
      const anchorY = b.height > 0 ? -b.minY / b.height : 0.5
      this.map.set(key, { texture, anchorX, anchorY })
      g.destroy()
    }
  }

  /** Raw texture for `key` (e.g. for swapping a pooled particle's frame). */
  getTexture(key: string): Texture {
    const baked = this.map.get(key)
    if (!baked) throw new Error('missing texture: ' + key)
    return baked.texture
  }

  /** Create a batched, origin-anchored, initially-hidden Sprite for `key`. */
  makeSprite(key: string): Sprite {
    const baked = this.map.get(key)
    if (!baked) throw new Error('missing texture: ' + key)
    const s = new Sprite(baked.texture)
    s.anchor.set(baked.anchorX, baked.anchorY)
    s.visible = false
    return s
  }
}
