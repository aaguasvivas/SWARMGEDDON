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

/** Hollow ring (death-pop shockwave). White, tinted at spawn; expands + fades. */
function drawRing(g: Graphics): void {
  g.circle(0, 0, 28).stroke({ width: 6, color: W, alpha: 0.95 })
  g.circle(0, 0, 28).stroke({ width: 14, color: W, alpha: 0.2 })
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

/** Health medkit cross (tinted at spawn). */
function drawHealth(g: Graphics): void {
  g.roundRect(-3.5, -10, 7, 20, 2).fill(W)
  g.roundRect(-10, -3.5, 20, 7, 2).fill(W)
  g.roundRect(-2, -8.5, 4, 17, 1.5).fill({ color: W, alpha: 0.6 })
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

/** Burrower: clawed digging head, snout forward (+x). */
function drawBurrower(g: Graphics): void {
  g.poly([13, -6, 27, -13, 18, -2]).fill(W)
  g.poly([13, 6, 27, 13, 18, 2]).fill(W)
  g.ellipse(-11, 0, 9, 9).fill(SHADE)
  g.ellipse(-3, 0, 11, 10).fill(MID)
  g.ellipse(9, 0, 11, 9).fill(LIGHT)
  g.poly([18, -4, 25, 0, 18, 4]).fill(W)
  g.moveTo(-3, -9).lineTo(-3, 9).stroke({ width: 2, color: DARK, alpha: 0.4 })
  g.circle(10, -3, 1.8).fill(EYE)
  g.circle(10, 3, 1.8).fill(EYE)
}

/** Hive mind: pulsing brain-sac with radiating tendrils. */
function drawHivemind(g: Graphics): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12).lineTo(Math.cos(a) * 24, Math.sin(a) * 24).stroke({ width: 3, color: DARK, cap: 'round' })
    g.circle(Math.cos(a) * 24, Math.sin(a) * 24, 2.5).fill(SHADE)
  }
  g.circle(0, 0, 16).fill(MID)
  g.circle(0, 0, 16).stroke({ width: 2, color: DARK })
  g.circle(-5, -4, 5).fill(LIGHT)
  g.circle(5, -3, 5).fill(LIGHT)
  g.circle(0, 5, 5).fill(LIGHT)
  g.circle(0, 0, 4.5).fill(W)
}

/** Psychic: floating eye orb with a halo. */
function drawPsychic(g: Graphics): void {
  g.circle(0, 0, 16).stroke({ width: 2.5, color: W, alpha: 0.5 })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.5 + (i - 1.5) * 0.4
    g.moveTo(Math.cos(a) * 9, Math.sin(a) * 9).lineTo(Math.cos(a) * 18, Math.sin(a) * 18).stroke({ width: 2, color: DARK, cap: 'round' })
  }
  g.circle(0, 0, 11).fill(LIGHT)
  g.circle(3, 0, 6).fill(SHADE)
  g.circle(4, 0, 3).fill(EYE)
  g.circle(5, -1, 1.2).fill(W)
}

/** Reality-warper: fractured crystalline cluster. */
function drawWarper(g: Graphics): void {
  g.poly([16, 0, 6, -11, -9, -6, -12, 5, -2, 13, 9, 6]).fill(MID)
  g.poly([16, 0, 6, -11, 2, -2]).fill(LIGHT)
  g.poly([-9, -6, -12, 5, -2, 0]).fill(SHADE)
  g.moveTo(16, 0).lineTo(-2, 0).stroke({ width: 1.5, color: W, alpha: 0.5 })
  g.moveTo(6, -11).lineTo(-2, 13).stroke({ width: 1.5, color: DARK, alpha: 0.4 })
  g.circle(0, 0, 3).fill(W)
}

/** Colossal queen: boss-scale ornate insectoid, crown forward (+x). */
function drawQueen(g: Graphics): void {
  for (const s of [-1, 1]) {
    g.moveTo(-6, s * 16).lineTo(-22, s * 30).stroke({ width: 5, color: DARK, cap: 'round' })
    g.moveTo(2, s * 18).lineTo(-2, s * 34).stroke({ width: 5, color: DARK, cap: 'round' })
    g.moveTo(10, s * 16).lineTo(18, s * 30).stroke({ width: 5, color: DARK, cap: 'round' })
  }
  g.ellipse(-16, 0, 22, 20).fill(MID)
  g.ellipse(-16, 0, 22, 20).stroke({ width: 3, color: DARK })
  g.ellipse(-20, -5, 10, 7).fill({ color: W, alpha: 0.3 })
  g.moveTo(-16, -18).lineTo(-16, 18).stroke({ width: 2, color: DARK, alpha: 0.5 })
  g.ellipse(4, 0, 15, 14).fill(LIGHT)
  g.ellipse(22, 0, 11, 11).fill(LIGHT)
  g.poly([28, -6, 39, -13, 30, -2]).fill(W)
  g.poly([28, 6, 39, 13, 30, 2]).fill(W)
  g.poly([32, 0, 43, 0, 33, -3]).fill(W)
  g.poly([28, -3, 36, -5, 30, 0]).fill(W)
  g.poly([28, 3, 36, 5, 30, 0]).fill(W)
  g.circle(24, -4, 2.6).fill(EYE)
  g.circle(24, 4, 2.6).fill(EYE)
}

/** Broodmother: a pregnant splitter — swollen abdomen trailing egg pods. */
function drawBroodmother(g: Graphics): void {
  for (const s of [-1, 1]) {
    g.moveTo(-8, s * 9).lineTo(-16, s * 17).stroke({ width: 3.5, color: DARK, cap: 'round' })
    g.moveTo(0, s * 10).lineTo(-1, s * 18).stroke({ width: 3.5, color: DARK, cap: 'round' })
  }
  // Three swollen abdomen segments shrinking rearward.
  g.ellipse(-14, 0, 12, 11).fill(SHADE)
  g.ellipse(-4, 0, 14, 12).fill(MID)
  g.ellipse(8, 0, 10, 8).fill(LIGHT)
  g.ellipse(-2, -3, 8, 4).fill({ color: W, alpha: 0.3 })
  // Egg-pod cluster riding the back — the tell that this thing multiplies.
  for (const [ex, ey] of [[-16, -7], [-10, -11], [-3, -9], [-17, 6], [-9, 10], [-2, 9]] as const) {
    g.circle(ex, ey, 3.4).fill({ color: W, alpha: 0.5 })
    g.circle(ex + 0.8, ey + 0.6, 1.1).fill(EYE)
  }
  // Forward mandibles + eyes.
  g.poly([14, -4, 24, -2, 15, 1]).fill(W)
  g.poly([14, 4, 24, 2, 15, -1]).fill(W)
  g.circle(10, -3, 2).fill(EYE)
  g.circle(10, 3, 2).fill(EYE)
}

/** Deep caller: an abyssal jellyfish — bell, trailing tendrils, one bright lure. */
function drawDeepCaller(g: Graphics): void {
  // Trailing tendrils (behind, -x) with bead dots.
  for (const [oy, len] of [[-8, 16], [-4, 22], [0, 26], [4, 22], [8, 16]] as const) {
    g.moveTo(-6, oy)
      .bezierCurveTo(-12, oy + 3, -14, oy - 3, -6 - len, oy + (oy >= 0 ? 5 : -5))
      .stroke({ width: 2, color: SHADE, cap: 'round' })
    g.circle(-8 - len * 0.7, oy + (oy >= 0 ? 3 : -3), 1.5).fill(LIGHT)
  }
  // Bell dome facing +x with an inner glow crescent + scalloped rim.
  g.ellipse(2, 0, 13, 12).fill(MID)
  g.ellipse(5, -3, 7, 4.5).fill({ color: W, alpha: 0.55 })
  for (const ry of [-8, -3, 2, 7]) g.circle(-5, ry, 2.6).fill(SHADE)
  // The lure: one bright core (no eyes — it isn't looking, it's calling).
  g.circle(9, 0, 3.4).fill(W)
}

/** Cinder mortarch: hunched artillery dome with a forward mortar tube. */
function drawCinderMortarch(g: Graphics): void {
  for (const s of [-1, 1]) {
    g.moveTo(-4, s * 9).lineTo(-10, s * 16).stroke({ width: 4, color: DARK, cap: 'round' })
    g.moveTo(4, s * 9).lineTo(6, s * 16).stroke({ width: 4, color: DARK, cap: 'round' })
  }
  // Armored dome with crack strokes.
  g.ellipse(-2, 0, 14, 12).fill(MID)
  g.ellipse(-4, -3, 8, 5).fill({ color: W, alpha: 0.3 })
  g.moveTo(-10, -4).lineTo(-3, -1).lineTo(-7, 4).stroke({ width: 1.5, color: DARK })
  g.moveTo(1, -8).lineTo(4, -3).stroke({ width: 1.5, color: DARK })
  // Forward-angled mortar tube with a white muzzle ring.
  g.poly([4, -4, 20, -7, 22, -1, 6, 2]).fill(SHADE)
  g.ellipse(21, -4, 2.6, 3.4).fill(W)
  // Tucked head under the tube.
  g.circle(8, 5, 4).fill(LIGHT)
  g.circle(9.5, 4, 1.5).fill(EYE)
  g.circle(7, 7, 1.5).fill(EYE)
}

/** Abyssal maw: a drifting ring-mouth — inward teeth and a dark throat. */
function drawMaw(g: Graphics): void {
  // Outer body ring.
  g.circle(0, 0, 14).fill(MID)
  g.circle(0, 0, 14).stroke({ width: 2, color: SHADE })
  // Throat (the well).
  g.circle(2, 0, 8).fill(EYE)
  g.circle(2, 0, 5).fill({ color: SHADE, alpha: 0.6 })
  // Inward-curving teeth around the mouth.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const ox = 2 + Math.cos(a) * 10
    const oy = Math.sin(a) * 10
    g.poly([
      ox, oy,
      ox + Math.cos(a) * 4 - Math.sin(a) * 1.6, oy + Math.sin(a) * 4 + Math.cos(a) * 1.6,
      ox - Math.cos(a) * 2, oy - Math.sin(a) * 2,
    ]).fill(W)
  }
  // Faint drift fins.
  g.ellipse(-12, -8, 5, 2.5).fill({ color: LIGHT, alpha: 0.5 })
  g.ellipse(-12, 8, 5, 2.5).fill({ color: LIGHT, alpha: 0.5 })
}

/** Cinder charger: a wedge ram-bug — the silhouette says "get out of the lane". */
function drawCharger(g: Graphics): void {
  for (const s of [-1, 1]) {
    g.moveTo(-6, s * 6).lineTo(-12, s * 13).stroke({ width: 3, color: DARK, cap: 'round' })
    g.moveTo(2, s * 7).lineTo(4, s * 14).stroke({ width: 3, color: DARK, cap: 'round' })
  }
  // Tapered abdomen + heavy triangular head plate.
  g.ellipse(-8, 0, 9, 7).fill(SHADE)
  g.poly([-2, -9, 16, 0, -2, 9]).fill(MID)
  g.poly([2, -5, 12, 0, 2, 5]).fill({ color: W, alpha: 0.35 })
  // Twin forward horns.
  g.poly([12, -5, 24, -8, 14, -1]).fill(W)
  g.poly([12, 5, 24, 8, 14, 1]).fill(W)
  // Ember-crack seams across the plate.
  g.moveTo(-1, -6).lineTo(6, -2).stroke({ width: 1.4, color: DARK })
  g.moveTo(-1, 6).lineTo(6, 2).stroke({ width: 1.4, color: DARK })
  g.circle(6, -2.5, 1.6).fill(EYE)
  g.circle(6, 2.5, 1.6).fill(EYE)
}

export const PLACEHOLDER_SPRITES: Record<string, SpriteBuilder> = {
  swarmer: drawSwarmer,
  broodmother: drawBroodmother,
  deepCaller: drawDeepCaller,
  cinderMortarch: drawCinderMortarch,
  maw: drawMaw,
  charger: drawCharger,
  flyer: drawFlyer,
  beetle: drawBeetle,
  spitter: drawSpitter,
  splitter: drawSplitter,
  burrower: drawBurrower,
  hivemind: drawHivemind,
  psychic: drawPsychic,
  warper: drawWarper,
  queen: drawQueen,
  bullet: drawBullet,
  acidGlob: drawAcidGlob,
  particle: drawParticle,
  ring: drawRing,
  gib: drawGib,
  gem: drawGem,
  health: drawHealth,
  crate: drawCrate,
  acidPool: drawAcidPool,
}
