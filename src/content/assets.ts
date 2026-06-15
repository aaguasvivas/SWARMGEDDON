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

/** Flyer: sleek swept-wing diver, arrow body pointing +x. */
function drawFlyer(g: Graphics): void {
  g.poly([2, -3, -15, -17, -6, -2]).fill(MID)
  g.poly([2, 3, -15, 17, -6, 2]).fill(MID)
  g.poly([0, -3, -13, -15, -9, -9]).fill(W)
  g.poly([0, 3, -13, 15, -9, 9]).fill(W)
  g.poly([17, 0, -6, -6, -2, 0, -6, 6]).fill(LIGHT)
  g.poly([17, 0, 3, -3, 3, 3]).fill(W)
  g.circle(6, -2, 1.6).fill(EYE)
  g.circle(6, 2, 1.6).fill(EYE)
}

/** Beetle: armored tank with a frontal horn (+x). */
function drawBeetle(g: Graphics): void {
  for (const s of [-1, 1]) {
    g.moveTo(-4, s * 12).lineTo(-13, s * 21).stroke({ width: 4, color: DARK, cap: 'round' })
    g.moveTo(5, s * 12).lineTo(11, s * 21).stroke({ width: 4, color: DARK, cap: 'round' })
  }
  g.ellipse(-2, 0, 21, 16).fill(MID)
  g.ellipse(-2, 0, 21, 16).stroke({ width: 3, color: DARK })
  g.ellipse(-6, 0, 12, 12).fill(SHADE)
  g.moveTo(-2, -15).lineTo(-2, 15).stroke({ width: 3, color: DARK, alpha: 0.6 })
  g.ellipse(-5, -6, 8, 4).fill({ color: W, alpha: 0.4 })
  g.ellipse(15, 0, 7, 8).fill(LIGHT)
  g.poly([20, -2, 29, 0, 20, 2]).fill(W)
  g.circle(15, -3, 1.8).fill(EYE)
  g.circle(15, 3, 1.8).fill(EYE)
}

/** Spitter: bulbous acid sac with a front spout (+x). */
function drawSpitter(g: Graphics): void {
  for (const s of [-1, 1]) {
    g.moveTo(-4, s * 8).lineTo(-12, s * 15).stroke({ width: 3, color: DARK, cap: 'round' })
    g.moveTo(2, s * 9).lineTo(2, s * 17).stroke({ width: 3, color: DARK, cap: 'round' })
  }
  g.ellipse(-5, 0, 14, 13).fill(MID)
  g.ellipse(-7, -2, 7, 6).fill({ color: W, alpha: 0.35 })
  g.circle(-5, 0, 5).fill(SHADE)
  g.ellipse(8, 0, 8, 7).fill(LIGHT)
  g.poly([14, -3, 23, 0, 14, 3]).fill(W)
  g.circle(9, -3, 1.8).fill(EYE)
  g.circle(9, 3, 1.8).fill(EYE)
}

/** Splitter: lumpy segmented grub that looks ready to break apart. */
function drawSplitter(g: Graphics): void {
  g.circle(-9, 0, 9).fill(MID)
  g.circle(-1, 0, 10).fill(LIGHT)
  g.circle(8, 0, 8).fill(MID)
  g.circle(-2, -2, 5).fill({ color: W, alpha: 0.4 })
  g.moveTo(-1, -10).lineTo(-1, 10).stroke({ width: 2, color: DARK, alpha: 0.5 })
  g.moveTo(5, -9).lineTo(5, 9).stroke({ width: 1.5, color: DARK, alpha: 0.4 })
  g.poly([14, -2, 21, -4, 15, 1]).fill(W)
  g.poly([14, 2, 21, 4, 15, -1]).fill(W)
  g.circle(10, -3, 1.6).fill(EYE)
  g.circle(10, 3, 1.6).fill(EYE)
}

/** Enemy acid glob projectile (tinted green at spawn). */
function drawAcidGlob(g: Graphics): void {
  g.circle(0, 0, 5.5).fill({ color: W, alpha: 0.6 })
  g.circle(1, -1, 3.5).fill(W)
  g.circle(-2, 2, 2.5).fill({ color: W, alpha: 0.85 })
}

/** XP crystal (tinted at spawn). */
function drawGem(g: Graphics): void {
  g.poly([0, -7, 5, 0, 0, 7, -5, 0]).fill(W)
  g.poly([0, -7, 0, 7, -5, 0]).fill({ color: 0xbfbfbf, alpha: 1 })
  g.poly([0, -7, 5, 0, 0, 0]).fill(W)
}

/** Weapon pickup pod (tinted to the weapon's color). */
function drawCrate(g: Graphics): void {
  g.roundRect(-12, -12, 24, 24, 6).fill({ color: W, alpha: 0.92 })
  g.roundRect(-12, -12, 24, 24, 6).stroke({ width: 2.5, color: DARK })
  g.roundRect(-6, -6, 12, 12, 3).fill(SHADE)
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    g.moveTo(sx * 8, sy * 11).lineTo(sx * 11, sy * 11).lineTo(sx * 11, sy * 8).stroke({ width: 2, color: W })
  }
}

/** Acid ground pool (tinted green, semi-transparent; scaled per pool). */
function drawAcidPool(g: Graphics): void {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    g.circle(Math.cos(a) * 9, Math.sin(a) * 9, 9).fill({ color: W, alpha: 0.3 })
  }
  g.circle(0, 0, 14).fill({ color: W, alpha: 0.45 })
}

export const PLACEHOLDER_SPRITES: Record<string, SpriteBuilder> = {
  swarmer: drawSwarmer,
  flyer: drawFlyer,
  beetle: drawBeetle,
  spitter: drawSpitter,
  splitter: drawSplitter,
  bullet: drawBullet,
  acidGlob: drawAcidGlob,
  particle: drawParticle,
  gib: drawGib,
  gem: drawGem,
  crate: drawCrate,
  acidPool: drawAcidPool,
}
