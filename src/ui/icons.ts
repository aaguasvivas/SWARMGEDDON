import { Graphics, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js'

/**
 * UI icons (A19) and perk glyphs (A2), drawn white on a 24-unit grid with a
 * 2-unit stroke and baked once at 2x (48 px) so they tint like text. They
 * replace every emoji and dingbat.
 */
export const ICONS = [
  'pause', 'play', 'gear', 'trophy', 'share', 'lock', 'check', 'skull', 'chevronL',
  'chevronR', 'close', 'reroll', 'banish', 'skip', 'flag', 'diamond', 'clock', 'arrow',
] as const
export const GLYPHS = [
  'rate', 'damage', 'multishot', 'pierce', 'range', 'speed', 'regen', 'lifesteal', 'hp', 'magnet',
  'crit', 'bounce', 'explode', 'cryo', 'burn', 'arc', 'knockback', 'shield', 'reaper', 'dash',
] as const
export type IconName = (typeof ICONS)[number] | (typeof GLYPHS)[number]

const GRID = 24
const S = { width: 2, color: 0xffffff, cap: 'round', join: 'round' } as const
const W = 0xffffff

function star(g: Graphics, points: number, rOut: number, rIn: number, rot: number): Graphics {
  const pts: number[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn
    const a = rot + (i * Math.PI) / points
    pts.push(12 + Math.cos(a) * r, 12 + Math.sin(a) * r)
  }
  return g.poly(pts)
}

const DRAW: Record<IconName, (g: Graphics) => void> = {
  pause: (g) => g.roundRect(6, 5, 4, 14, 1).roundRect(14, 5, 4, 14, 1).fill(W),
  play: (g) => g.poly([8, 5, 19, 12, 8, 19]).fill(W),
  gear: (g) => {
    g.circle(12, 12, 6.5).stroke(S).circle(12, 12, 2.5).fill(W)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      g.moveTo(12 + Math.cos(a) * 7, 12 + Math.sin(a) * 7).lineTo(12 + Math.cos(a) * 10, 12 + Math.sin(a) * 10)
    }
    g.stroke({ ...S, width: 3 })
  },
  trophy: (g) =>
    g.moveTo(7, 4).lineTo(17, 4).lineTo(16, 11).lineTo(12, 14).lineTo(8, 11).closePath()
      .moveTo(7, 6).lineTo(4, 6).lineTo(5, 10).lineTo(7.5, 11)
      .moveTo(17, 6).lineTo(20, 6).lineTo(19, 10).lineTo(16.5, 11)
      .moveTo(12, 14).lineTo(12, 19).moveTo(8, 20).lineTo(16, 20).stroke(S),
  share: (g) =>
    g.moveTo(9, 10).lineTo(6, 10).lineTo(6, 20).lineTo(18, 20).lineTo(18, 10).lineTo(15, 10)
      .moveTo(12, 15).lineTo(12, 3).moveTo(8, 7).lineTo(12, 3).lineTo(16, 7).stroke(S),
  lock: (g) => g.roundRect(5, 11, 14, 10, 2).fill(W).moveTo(8, 11).lineTo(8, 8).arc(12, 8, 4, Math.PI, 0).lineTo(16, 11).stroke(S),
  check: (g) => g.moveTo(5, 12.5).lineTo(10, 17.5).lineTo(19, 7).stroke({ ...S, width: 2.5 }),
  skull: (g) => g.circle(12, 10, 8).fill(W).circle(9, 10, 2.2).circle(15, 10, 2.2).cut().rect(8, 15, 8, 5).fill(W).rect(11, 17, 2, 3).cut(),
  chevronL: (g) => g.moveTo(15, 5).lineTo(8, 12).lineTo(15, 19).stroke({ ...S, width: 2.5 }),
  chevronR: (g) => g.moveTo(9, 5).lineTo(16, 12).lineTo(9, 19).stroke({ ...S, width: 2.5 }),
  close: (g) => g.moveTo(6, 6).lineTo(18, 18).moveTo(18, 6).lineTo(6, 18).stroke({ ...S, width: 2.5 }),
  reroll: (g) => g.arc(12, 12, 7, -1.1, 4.1).stroke(S).poly([16.5, 3, 16, 8.5, 21, 7]).fill(W),
  banish: (g) => g.circle(12, 12, 8).moveTo(6.3, 6.3).lineTo(17.7, 17.7).stroke(S),
  skip: (g) => g.moveTo(5, 6).lineTo(11, 12).lineTo(5, 18).moveTo(12, 6).lineTo(18, 12).lineTo(12, 18).stroke({ ...S, width: 2.5 }),
  flag: (g) => g.moveTo(6, 21).lineTo(6, 3).stroke(S).poly([6, 4, 19, 4, 15.5, 8, 19, 12, 6, 12]).fill(W),
  diamond: (g) => g.poly([12, 3, 20, 12, 12, 21, 4, 12]).fill(W),
  clock: (g) => g.circle(12, 12, 8.5).moveTo(12, 7).lineTo(12, 12).lineTo(15.5, 14).stroke(S),
  arrow: (g) => g.poly([4, 9.5, 13, 9.5, 13, 5, 20, 12, 13, 19, 13, 14.5, 4, 14.5]).fill(W),

  rate: (g) => g.roundRect(10, 4, 10, 4, 2).roundRect(4, 10, 16, 4, 2).roundRect(10, 16, 10, 4, 2).fill(W),
  damage: (g) => g.poly([12, 2, 17, 8, 17, 20, 7, 20, 7, 8]).fill(W).rect(7, 16, 10, 1.5).cut(),
  multishot: (g) =>
    g.moveTo(12, 20).lineTo(12, 7).moveTo(12, 20).lineTo(5.5, 9).moveTo(12, 20).lineTo(18.5, 9).stroke(S)
      .circle(12, 5, 2.2).circle(5, 7.5, 2.2).circle(19, 7.5, 2.2).fill(W),
  pierce: (g) => g.moveTo(11, 4).lineTo(11, 20).stroke({ ...S, width: 3 }).moveTo(2, 12).lineTo(18, 12).stroke(S).poly([16, 8, 22, 12, 16, 16]).fill(W),
  range: (g) =>
    g.circle(12, 12, 7).moveTo(12, 2).lineTo(12, 7).moveTo(12, 17).lineTo(12, 22).moveTo(2, 12).lineTo(7, 12)
      .moveTo(17, 12).lineTo(22, 12).stroke(S).circle(12, 12, 1.8).fill(W),
  speed: (g) => g.moveTo(3, 8).lineTo(9, 8).moveTo(1, 12).lineTo(8, 12).moveTo(3, 16).lineTo(9, 16).stroke(S).circle(16, 12, 5.5).fill(W),
  regen: (g) => g.circle(12, 12, 9).stroke(S).rect(10.5, 6.5, 3, 11).rect(6.5, 10.5, 11, 3).fill(W),
  lifesteal: (g) => g.moveTo(12, 3).bezierCurveTo(12, 3, 19, 11, 19, 15).arc(12, 15, 7, 0, Math.PI).bezierCurveTo(5, 11, 12, 3, 12, 3).fill(W),
  hp: (g) => g.circle(8.2, 9.5, 4.8).circle(15.8, 9.5, 4.8).poly([3.6, 11, 20.4, 11, 12, 20.5]).fill(W),
  magnet: (g) => g.moveTo(6.5, 4).lineTo(6.5, 11).arc(12, 11, 5.5, Math.PI, 0, true).lineTo(17.5, 4).stroke({ ...S, width: 4, cap: 'butt' }),
  crit: (g) => star(g, 4, 10, 3, -Math.PI / 2).fill(W),
  bounce: (g) => g.moveTo(3, 18).lineTo(9, 8).lineTo(15, 16).lineTo(19, 9).stroke(S).poly([16.5, 7, 21, 5, 20.5, 10]).fill(W),
  explode: (g) => star(g, 8, 10, 5, 0).fill(W).circle(12, 12, 2.5).cut(),
  cryo: (g) => {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 2
      const dx = Math.cos(a) * 9
      const dy = Math.sin(a) * 9
      g.moveTo(12 - dx, 12 - dy).lineTo(12 + dx, 12 + dy)
    }
    g.stroke(S).circle(12, 12, 2).fill(W)
  },
  burn: (g) => g.moveTo(12, 2).bezierCurveTo(14, 7, 19, 10, 18, 15).arc(12, 15, 6, 0, Math.PI).bezierCurveTo(6, 11, 9, 8, 12, 2).fill(W).circle(12, 16, 2.5).cut(),
  arc: (g) => g.poly([14, 2, 5, 13, 11, 13, 9, 22, 19, 10, 13, 10, 16, 2]).fill(W),
  knockback: (g) => g.poly([2, 9.5, 11, 9.5, 11, 5.5, 17, 12, 11, 18.5, 11, 14.5, 2, 14.5]).fill(W).moveTo(21, 5).lineTo(21, 19).stroke({ ...S, width: 2.5 }),
  shield: (g) => g.poly([12, 2.5, 19.5, 5.5, 19.5, 12, 12, 21.5, 4.5, 12, 4.5, 5.5]).fill(W),
  reaper: (g) => g.moveTo(6, 21).lineTo(15, 4).stroke(S).moveTo(15, 4).quadraticCurveTo(7, 2, 3, 9).stroke({ ...S, width: 3 }),
  dash: (g) => g.poly([9, 5, 21, 12, 9, 19, 12, 12]).fill(W).moveTo(2, 8.5).lineTo(7, 8.5).moveTo(1, 12).lineTo(8, 12).moveTo(2, 15.5).lineTo(7, 15.5).stroke(S),
}

const baked = new Map<IconName, Texture>()

/** Bake every icon and glyph (boot, after the renderer exists). */
export function bakeIcons(renderer: Renderer): void {
  for (const name of [...ICONS, ...GLYPHS]) {
    const g = new Graphics()
    DRAW[name](g)
    baked.set(name, renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, GRID, GRID), resolution: 2, antialias: true }))
    g.destroy()
  }
}

function iconTexture(name: IconName): Texture {
  const tex = baked.get(name)
  if (!tex) throw new Error('icon not baked: ' + name)
  return tex
}

/** Point an existing icon sprite at another icon (pooled views reuse their sprite). */
export function setIcon(s: Sprite, name: IconName, size: number): void {
  s.texture = iconTexture(name)
  s.width = size
  s.height = size
}

/** A centered icon sprite `size` px across, tinted `tint`. */
export function makeIcon(name: IconName, size: number, tint = 0xffffff): Sprite {
  const s = new Sprite(iconTexture(name))
  s.anchor.set(0.5)
  s.width = size
  s.height = size
  s.tint = tint
  return s
}
