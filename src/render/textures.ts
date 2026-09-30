import { ColorMatrixFilter, Graphics, Sprite, Texture, type Renderer } from 'pixi.js'
import { PLACEHOLDER_SPRITES } from '../content/assets.ts'
import { ENEMIES } from '../content/enemies.ts'

/** Bake resolution: the camera zooms up to 3x, so textures carry 3x detail. */
const BAKE_RES = 3
/** Suffix of a sprite's hit-flash silhouette key (`swarmer@white`). */
export const WHITE = '@white'

/** Hazard decal sizes as baked (section 4.7); hazardRenderer scales from these. */
export const HZ_TEX = { discR: 96, laneLen: 160, laneHalf: 40, sectorR: 160, cageR: 512 } as const
/** The cage ring is large on screen and soft by design, so it bakes at 1x. */
const CAGE_BAKE_RES = 1

/** Tint `s` with `c` (0xRRGGBB). Pixi builds a Color, and allocates, on every
 *  tint write, even an unchanged one, so per-frame code writes only changes. */
export function setTint(s: Sprite, c: number): void {
  if (s.tint !== c) s.tint = c
}

interface Baked {
  texture: Texture
  /** Anchor that pivots the sprite at the drawing's (0,0) origin, regardless of
   *  how asymmetric its bounds are, so rotate-to-face spins around the body. */
  anchorX: number
  anchorY: number
}

/**
 * Bakes the manifest's grayscale draw functions into GPU textures once, and
 * mints batched Sprites from them. Swapping to a real texture atlas later is a
 * change in this one class: entities just ask for a sprite by key.
 */
export class TextureRegistry {
  private readonly map = new Map<string, Baked>()

  constructor(private readonly renderer: Renderer) {}

  /** Bakes every manifest sprite, plus a white silhouette of each enemy
   *  sprite for the hit flash (same frame, so the same anchor fits both). */
  bakePlaceholders(): void {
    const enemyKeys = new Set<string>()
    for (const id in ENEMIES) enemyKeys.add(ENEMIES[id]!.sprite)
    const white = new ColorMatrixFilter()
    white.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    for (const key in PLACEHOLDER_SPRITES) {
      const draw = PLACEHOLDER_SPRITES[key]!
      const g = new Graphics()
      draw(g)
      const b = g.getLocalBounds()
      const frame = b.rectangle.clone()
      const texture = this.renderer.generateTexture({ target: g, frame, resolution: BAKE_RES, antialias: true })
      // Map graphics-origin (0,0) to a normalized anchor inside the baked frame.
      const anchorX = b.width > 0 ? -b.minX / b.width : 0.5
      const anchorY = b.height > 0 ? -b.minY / b.height : 0.5
      this.map.set(key, { texture, anchorX, anchorY })
      if (enemyKeys.has(key)) {
        g.filters = [white]
        const flash = this.renderer.generateTexture({ target: g, frame, resolution: BAKE_RES, antialias: true })
        this.map.set(key + WHITE, { texture: flash, anchorX, anchorY })
      }
      g.destroy()
    }
    white.destroy()
  }

  /** White hazard decals: disc, lane, 120 degree sector and the cage ring,
   *  tinted per hazard at draw time. */
  bakeHazards(): void {
    const { discR, laneLen, laneHalf, sectorR, cageR } = HZ_TEX
    const disc = new Graphics()
    disc.circle(0, 0, discR).fill({ color: 0xffffff, alpha: 0.45 })
    disc.circle(0, 0, discR * 0.9).stroke({ width: discR * 0.16, color: 0xffffff, alpha: 0.4 })
    disc.circle(0, 0, discR - 3).stroke({ width: 6, color: 0xffffff, alpha: 1 })
    this.bakeCentered('hzDisc', disc, BAKE_RES)

    const lane = new Graphics()
    lane.roundRect(0, -laneHalf, laneLen, laneHalf * 2, laneHalf * 0.5).fill({ color: 0xffffff, alpha: 0.5 })
    lane.roundRect(2, -laneHalf + 2, laneLen - 4, laneHalf * 2 - 4, laneHalf * 0.5).stroke({ width: 4, color: 0xffffff, alpha: 1 })
    this.bakeCentered('hzLane', lane, BAKE_RES)

    const sector = new Graphics()
    const half = Math.PI / 3
    sector.moveTo(0, 0).arc(0, 0, sectorR, -half, half).lineTo(0, 0).fill({ color: 0xffffff, alpha: 0.5 })
    sector.moveTo(0, 0).arc(0, 0, sectorR - 2, -half, half).lineTo(0, 0).stroke({ width: 4, color: 0xffffff, alpha: 1 })
    this.bakeCentered('hzSector', sector, BAKE_RES)

    const cage = new Graphics()
    cage.circle(0, 0, cageR - 14).stroke({ width: 28, color: 0xffffff, alpha: 0.18 })
    cage.circle(0, 0, cageR - 14).stroke({ width: 8, color: 0xffffff, alpha: 1 })
    this.bakeCentered('hzCage', cage, CAGE_BAKE_RES)
  }

  /** Bake `g` with its drawing origin as the sprite anchor, then free it. */
  private bakeCentered(key: string, g: Graphics, resolution: number): void {
    const b = g.getLocalBounds()
    const texture = this.renderer.generateTexture({ target: g, frame: b.rectangle.clone(), resolution, antialias: true })
    this.map.set(key, { texture, anchorX: -b.minX / b.width, anchorY: -b.minY / b.height })
    g.destroy()
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

  /** Repoint an existing sprite at `key`'s texture + origin anchor (pool reuse). */
  applySprite(sprite: Sprite, key: string): void {
    const baked = this.map.get(key)
    if (!baked) throw new Error('missing texture: ' + key)
    sprite.texture = baked.texture
    sprite.anchor.set(baked.anchorX, baked.anchorY)
  }
}
