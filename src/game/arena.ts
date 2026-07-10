import { Container, Graphics } from 'pixi.js'
import { ARENA_H, ARENA_W } from '../config.ts'
import { clamp } from '../core/vec.ts'
import { Rng, seedFromString } from '../core/rng.ts'
import { ARENAS, type ArenaTheme } from '../content/arenas.ts'

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/** A dim floor speck, stored in normalized [0,1] arena space. */
export interface DecorSpeck {
  nx: number
  ny: number
  r: number
  alpha: number
}

/**
 * The bounded play-field: a FIXED large world (camera follows the player). The
 * floor, per-world structure, and glowing border are drawn once at boot (and on
 * theme swap) — per-frame floor cost is zero, and the structure scrolling under
 * the camera sells the sense of a huge field. The player is clamped to these
 * bounds.
 */
export class Arena {
  readonly view = new Container()
  readonly bounds: Bounds = { x: 0, y: 0, w: ARENA_W, h: ARENA_H }

  private floor = new Graphics()
  private structure = new Graphics() // per-world terrain bed (replaces the grid)
  private decorG = new Graphics()
  private border = new Graphics()
  private decor: readonly DecorSpeck[] = []
  private theme: ArenaTheme = ARENAS[0]!
  private built = false
  /** World-space anchor points where the backdrop parks breathing glows (pod
   *  clusters / magma hotspots). Deterministic — filled by draw() from the same
   *  constant-seed structure RNG. Empty for worlds whose identity is darkness. */
  readonly glowSpots: { x: number; y: number }[] = []

  constructor() {
    this.view.addChild(this.floor, this.structure, this.decorG, this.border)
  }

  /** Deterministic floor specks generated from the seeded RNG. */
  setDecor(decor: readonly DecorSpeck[]): void {
    this.decor = decor
    if (this.built) this.draw()
  }

  /** Swap the visual theme (palette only — bounds/logic identical) and redraw. */
  setTheme(theme: ArenaTheme): void {
    if (theme.id === this.theme.id && this.built) return
    this.theme = theme
    if (this.built) this.draw()
  }

  /** Draw the fixed world once. */
  build(): void {
    this.built = true
    this.draw()
  }

  private draw(): void {
    const { x, y, w, h } = this.bounds
    const t = this.theme

    this.floor.clear()
    this.floor.rect(x, y, w, h).fill(t.floor)

    // Per-world structure replaces the old universal square grid. Drawn ONCE per
    // theme swap from a per-world CONSTANT-seed RNG (never the sim rng), so it is
    // device-identical and stable across swaps, and spans the whole arena so
    // parallax reads everywhere the player stands.
    this.structure.clear()
    this.glowSpots.length = 0
    const srng = new Rng(seedFromString('swarmgeddon:structure:' + t.id))
    switch (t.decorStyle) {
      case 'trench':
        drawContours(this.structure, t, srng, this.bounds) // no glows — the deep stays dark
        break
      case 'plates':
        drawBasalt(this.structure, t, srng, this.bounds, this.glowSpots)
        break
      default:
        drawMembrane(this.structure, t, srng, this.bounds, this.glowSpots)
    }

    // Deterministic decor specks (seeded), rendered in the theme's silhouette
    // language — pods / trench rings / cracked plates. Drawn ONCE at build.
    this.decorG.clear()
    const g = this.decorG
    for (const s of this.decor) {
      const cx = x + s.nx * w
      const cy = y + s.ny * h
      // Deterministic per-speck variation without an RNG (cosmetic only).
      const v = (s.nx * 7919 + s.ny * 104729) % 1
      switch (t.decorStyle) {
        case 'trench': {
          // Sonar-like ring + a small elongated glow mote.
          g.circle(cx, cy, s.r * 2.4).stroke({ width: 1.2, color: t.decorColor, alpha: s.alpha * 0.7 })
          g.ellipse(cx + s.r, cy - s.r, s.r * 0.9, s.r * 0.35).fill({ color: t.decorColor, alpha: s.alpha })
          break
        }
        case 'plates': {
          // Cracked plate shard + an ash-drift streak.
          const r = s.r * 1.6
          const k = 0.6 + v * 0.5
          g.poly([cx - r, cy - r * 0.4, cx + r * k, cy - r * 0.9, cx + r, cy + r * 0.5, cx - r * 0.5, cy + r * k]).fill({ color: t.decorColor, alpha: s.alpha * 0.55 })
          g.moveTo(cx - r * 1.6, cy + r).lineTo(cx + r * 1.4, cy + r * 0.7).stroke({ width: 1, color: t.decorColor, alpha: s.alpha * 0.5 })
          break
        }
        default: {
          // Pods: the classic spore cluster.
          g.circle(cx, cy, s.r).fill({ color: t.decorColor, alpha: s.alpha })
          g.circle(cx + s.r * 1.1, cy + s.r * 0.5, s.r * 0.55).fill({ color: t.decorColor, alpha: s.alpha * 0.8 })
          g.circle(cx - s.r * 0.7, cy + s.r * 0.9, s.r * 0.4).fill({ color: t.decorColor, alpha: s.alpha * 0.7 })
        }
      }
    }

    // Border: a soft outer glow line + a crisp inner line (the world edge).
    this.border.clear()
    this.border
      .rect(x - 3, y - 3, w + 6, h + 6)
      .stroke({ width: 8, color: t.borderGlow, alpha: 0.22 })
    this.border.rect(x, y, w, h).stroke({ width: 3, color: t.border, alpha: 0.95 })
  }
}

// --- per-world structure beds (drawn once per theme swap; static geometry) ----
// All three span the full arena so the camera always has a scrolling reference,
// and stay dim/dark so entities + neon bullets keep the foreground.

/** HIVE: a dim honeycomb membrane laced with glowing capillary veins + pods. */
function drawMembrane(g: Graphics, t: ArenaTheme, rng: Rng, b: Bounds, glowSpots: { x: number; y: number }[]): void {
  const { x, y, w, h } = b
  const R = 88
  const hx = 1.5 * R
  const vstep = Math.sqrt(3) * R
  // Honeycomb lattice — accumulate every cell into ONE path, stroke once.
  let colIdx = 0
  for (let cx = x - R; cx < x + w + R; cx += hx, colIdx++) {
    const off = colIdx % 2 ? vstep / 2 : 0
    for (let cy = y + off - vstep; cy < y + h + vstep; cy += vstep) {
      for (let i = 0; i <= 6; i++) {
        const a = (Math.PI / 3) * (i % 6)
        const px = cx + R * 0.96 * Math.cos(a)
        const py = cy + R * 0.96 * Math.sin(a)
        if (i === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
    }
  }
  g.stroke({ width: 1.1, color: t.gridLine, alpha: 0.5 })
  // Capillary veins wandering across cells (kills the lattice-repeat read).
  for (let i = 0; i < 8; i++) {
    let px = x + rng.float() * w
    let py = y + rng.float() * h
    g.moveTo(px, py)
    for (let k = 0; k < 5; k++) {
      const nx = clamp(px + rng.range(-w * 0.22, w * 0.22), x, x + w)
      const ny = clamp(py + rng.range(-h * 0.22, h * 0.22), y, y + h)
      g.quadraticCurveTo(px + rng.range(-40, 40), py + rng.range(-40, 40), nx, ny)
      px = nx
      py = ny
    }
    g.stroke({ width: rng.range(1.5, 3.5), color: t.decorColor, alpha: 0.14 })
  }
  // Pod clusters at random junctions with a bright warm core. The first few
  // double as anchors for the backdrop's breathing membrane glows.
  for (let i = 0; i < 26; i++) {
    const cx = x + rng.float() * w
    const cy = y + rng.float() * h
    const r = rng.range(3, 6)
    g.circle(cx, cy, r).fill({ color: t.decorColor, alpha: 0.12 })
    g.circle(cx, cy, r * 0.4).fill({ color: t.borderGlow, alpha: 0.5 })
    if (i < 10) glowSpots.push({ x: cx, y: cy })
  }
}

/** DEPTHS: bathymetric contour rings + rim-lit crevasses over dark silt. */
function drawContours(g: Graphics, t: ArenaTheme, rng: Rng, b: Bounds): void {
  const { x, y, w, h } = b
  // Uneven silt bed.
  for (let i = 0; i < 28; i++) {
    g.circle(x + rng.float() * w, y + rng.float() * h, rng.range(30, 90)).fill({ color: t.gridLineBright, alpha: 0.06 })
  }
  // Concentric contour islands (the grid replacement — organic, never square).
  for (let i = 0; i < 9; i++) {
    const cx = x + rng.range(0.1, 0.9) * w
    const cy = y + rng.range(0.1, 0.9) * h
    const loops = 3 + rng.int(0, 3)
    for (let L = 0; L < loops; L++) {
      const rr = (L + 1) * rng.range(11, 18)
      let first = true
      for (let a = 0; a < 6.2832; a += Math.PI / 12) {
        const j = 1 + Math.sin(a * 3 + i) * 0.13
        const px = cx + Math.cos(a) * rr * j
        const py = cy + Math.sin(a) * rr * j * 0.82
        if (first) {
          g.moveTo(px, py)
          first = false
        } else g.lineTo(px, py)
      }
      g.closePath()
      g.stroke({ width: 1, color: L % 3 === 0 ? t.gridLineBright : t.gridLine, alpha: 0.75 })
    }
  }
  // Crevasses: dark ribbons with one rim-lit violet edge (strong motion cue).
  for (let i = 0; i < 3; i++) {
    let px = x + rng.range(0.1, 0.5) * w
    let py = y
    const spine: number[][] = [[px, py]]
    while (py < y + h) {
      px = clamp(px + rng.range(-w * 0.12, w * 0.2), x, x + w)
      py += rng.range(h * 0.12, h * 0.24)
      spine.push([px, py])
    }
    g.moveTo(spine[0]![0]!, spine[0]![1]!)
    for (let k = 1; k < spine.length; k++) g.lineTo(spine[k]![0]!, spine[k]![1]!)
    for (let k = spine.length - 1; k >= 0; k--) g.lineTo(spine[k]![0]! + rng.range(16, 30), spine[k]![1]!)
    g.closePath()
    g.fill({ color: 0x06040e, alpha: 0.85 })
    g.moveTo(spine[0]![0]!, spine[0]![1]!)
    for (let k = 1; k < spine.length; k++) g.lineTo(spine[k]![0]!, spine[k]![1]!)
    g.stroke({ width: 1.4, color: t.borderGlow, alpha: 0.22 })
  }
  // Faint micro-specks so open water still scrolls with a reference.
  for (let i = 0; i < 130; i++) {
    g.circle(x + rng.float() * w, y + rng.float() * h, rng.range(0.8, 1.6)).fill({ color: t.gridLineBright, alpha: 0.1 })
  }
}

/** WASTES: cracked basalt plates split by a branching delta of molten seams. */
function drawBasalt(g: Graphics, t: ArenaTheme, rng: Rng, b: Bounds, glowSpots: { x: number; y: number }[]): void {
  const { x, y, w, h } = b
  // Lifted clearly off the 0x140b0a floor so the shattered crust actually reads
  // (the original palette's darkest plate was the floor color — invisible).
  const plate = [0x1c100c, 0x241410, 0x2e1a12]
  // Plate shards (shatters the flat floor; the seams carry the light).
  for (let i = 0; i < 34; i++) {
    const cx = x + rng.float() * w
    const cy = y + rng.float() * h
    const rr = rng.range(40, 120)
    const n = 4 + rng.int(0, 2)
    const pts: number[] = []
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.2832 + rng.range(-0.3, 0.3)
      const pr = rr * rng.range(0.6, 1)
      pts.push(cx + Math.cos(a) * pr, cy + Math.sin(a) * pr)
    }
    g.poly(pts).fill({ color: plate[i % 3]!, alpha: 0.9 })
    g.poly(pts).stroke({ width: 1.2, color: 0x3a2018, alpha: 0.8 })
  }
  // Hero magma seams: random-walk polylines with a baked halo/body/core glow.
  const seams: number[][][] = []
  for (let s = 0; s < 4; s++) {
    let px = x + rng.range(0.1, 0.9) * w
    let py = y
    const p: number[][] = [[px, py]]
    while (py < y + h) {
      px = clamp(px + rng.range(-w * 0.16, w * 0.16), x + 4, x + w - 4)
      py += rng.range(h * 0.08, h * 0.17)
      p.push([px, py])
    }
    seams.push(p)
  }
  const strokeSeam = (p: number[][], width: number, color: number, alpha: number): void => {
    g.moveTo(p[0]![0]!, p[0]![1]!)
    for (let k = 1; k < p.length; k++) g.lineTo(p[k]![0]!, p[k]![1]!)
    g.stroke({ width, color, alpha })
  }
  for (const p of seams) {
    strokeSeam(p, 7, t.borderGlow, 0.16)
    strokeSeam(p, 3, t.hazardTint, 0.5)
    strokeSeam(p, 1.5, 0xffd27a, 0.95)
    // Two hotspots per seam anchor the backdrop's molten-breath glows.
    const a = p[Math.floor(p.length / 3)]!
    const c = p[Math.floor((2 * p.length) / 3)]!
    glowSpots.push({ x: a[0]!, y: a[1]! }, { x: c[0]!, y: c[1]! })
  }
  // Faint micro-embers so scorched flats still scroll with a reference.
  for (let i = 0; i < 120; i++) {
    g.circle(x + rng.float() * w, y + rng.float() * h, rng.range(0.8, 1.6)).fill({ color: t.decorColor, alpha: 0.1 })
  }
}
