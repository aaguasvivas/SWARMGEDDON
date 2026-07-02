import { Container, Graphics } from 'pixi.js'
import { ARENA_H, ARENA_W } from '../config.ts'
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

const GRID = 80 // grid cell size in world units

/**
 * The bounded play-field: a FIXED large world (camera follows the player). The
 * floor, grid, and glowing border are drawn once at boot — per-frame floor cost
 * is zero, and the grid scrolling under the camera sells the sense of a huge
 * field. The player is clamped to these bounds.
 */
export class Arena {
  readonly view = new Container()
  readonly bounds: Bounds = { x: 0, y: 0, w: ARENA_W, h: ARENA_H }

  private floor = new Graphics()
  private decorG = new Graphics()
  private grid = new Graphics()
  private border = new Graphics()
  private decor: readonly DecorSpeck[] = []
  private theme: ArenaTheme = ARENAS[0]!
  private built = false

  constructor() {
    this.view.addChild(this.floor, this.decorG, this.grid, this.border)
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

    // Deterministic spore specks (seeded). Drawn beneath the grid.
    this.decorG.clear()
    for (const s of this.decor) {
      this.decorG.circle(x + s.nx * w, y + s.ny * h, s.r).fill({ color: t.decorColor, alpha: s.alpha })
    }

    // Grid lines, brighter every 4th cell for a readable motion reference.
    this.grid.clear()
    for (let gx = 0; gx <= w; gx += GRID) {
      const bright = (gx / GRID) % 4 === 0
      this.grid
        .moveTo(x + gx, y)
        .lineTo(x + gx, y + h)
        .stroke({ width: 1, color: bright ? t.gridLineBright : t.gridLine, alpha: 0.9 })
    }
    for (let gy = 0; gy <= h; gy += GRID) {
      const bright = (gy / GRID) % 4 === 0
      this.grid
        .moveTo(x, y + gy)
        .lineTo(x + w, y + gy)
        .stroke({ width: 1, color: bright ? t.gridLineBright : t.gridLine, alpha: 0.9 })
    }

    // Border: a soft outer glow line + a crisp inner line (the world edge).
    this.border.clear()
    this.border
      .rect(x - 3, y - 3, w + 6, h + 6)
      .stroke({ width: 8, color: t.borderGlow, alpha: 0.22 })
    this.border.rect(x, y, w, h).stroke({ width: 3, color: t.border, alpha: 0.95 })
  }
}
