import type { Graphics } from 'pixi.js'

/**
 * Asset manifest — placeholder edition.
 *
 * Each entry draws a sprite in GRAYSCALE pointing +x (the facing direction), so
 * the render system can rotate-to-face and recolor per entity via `tint`
 * (white body * green tint = green creature; tint white = hit-flash). Baked once
 * into GPU textures at boot (see render/textures.ts) and drawn as batched
 * Sprites — never re-rendered as Graphics in the hot loop.
 *
 * This is the seam for real art: replace these draw fns (or, later, point the
 * registry at a TexturePacker atlas keyed by the same names) and nothing else
 * in the engine changes.
 */
export type SpriteBuilder = (g: Graphics) => void

const W = 0xffffff
const LIGHT = 0xf0f3e6
const MID = 0xc7d0b6
const SHADE = 0x9aa090
const DARK = 0x3a3a3a
const EYE = 0x161616

/** Swarmer: fast little hive bug. Bold readable silhouette, mandibles forward. */
function drawSwarmer(g: Graphics): void {
  // Six legs (drawn under the body).
  for (const s of [-1, 1]) {
    g.moveTo(-6, s * 7).lineTo(-13, s * 14).stroke({ width: 3, color: DARK, cap: 'round' })
    g.moveTo(0, s * 8).lineTo(-2, s * 16).stroke({ width: 3, color: DARK, cap: 'round' })
    g.moveTo(5, s * 7).lineTo(10, s * 15).stroke({ width: 3, color: DARK, cap: 'round' })
  }
  // Abdomen (rear) + thorax/head (front, +x).
  g.ellipse(-6, 0, 11, 10).fill(MID)
  g.ellipse(7, 0, 10, 8).fill(LIGHT)
  // Carapace highlight ridge.
  g.ellipse(-3, -2, 6, 3.2).fill(W)
  g.ellipse(2, 0, 9, 6).fill({ color: W, alpha: 0.25 })
  // Mandibles snapping forward.
  g.poly([13, -3, 24, -6, 15, 0]).fill(W)
  g.poly([13, 3, 24, 6, 15, 0]).fill(W)
  // Belly shadow.
  g.ellipse(-6, 4, 8, 4).fill({ color: SHADE, alpha: 0.6 })
  // Eyes.
  g.circle(10, -3.2, 2).fill(EYE)
  g.circle(10, 3.2, 2).fill(EYE)
}

/** Projectile: a bright streak capsule pointing +x. */
function drawBullet(g: Graphics): void {
  g.roundRect(-9, -2.6, 18, 5.2, 2.6).fill({ color: W, alpha: 0.85 })
  g.roundRect(-9, -1.4, 16, 2.8, 1.4).fill(W)
  g.circle(8, 0, 2.8).fill(W)
}

/** Soft spark dot (additive). White so it tints to any FX color. */
function drawParticle(g: Graphics): void {
  g.circle(0, 0, 6).fill({ color: W, alpha: 0.5 })
  g.circle(0, 0, 3).fill(W)
}

/** Chunky gib shard — irregular for organic gore. */
function drawGib(g: Graphics): void {
  g.poly([-4, -3, 3, -4, 5, 1, 1, 4, -4, 3]).fill(W)
  g.poly([-4, -3, 3, -4, 0, 0]).fill({ color: SHADE, alpha: 0.7 })
}

export const PLACEHOLDER_SPRITES: Record<string, SpriteBuilder> = {
  swarmer: drawSwarmer,
  bullet: drawBullet,
  particle: drawParticle,
  gib: drawGib,
}
