import { Container, Graphics } from 'pixi.js'
import { COLORS, ARENA_MARGIN } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/** A dim floor speck, stored in normalized [0,1] arena space so it scales on resize. */
export interface DecorSpeck {
  nx: number
  ny: number
  r: number
  alpha: number
}

const GRID = 64 // grid cell size in world units

/**
 * The bounded play-field. Fixed camera (Crimsonland-style): the arena simply
 * fills the viewport inside the safe-area inset + a margin, and the player is
 * clamped within. Background + grid + glowing border are redrawn only on
 * resize (cold path), so per-frame floor cost is zero.
 */
export class Arena {
  readonly view = new Container()
  bounds: Bounds = { x: 0, y: 0, w: 0, h: 0 }

  private floor = new Graphics()
  private decorG = new Graphics()
  private grid = new Graphics()
  private border = new Graphics()
  private decor: readonly DecorSpeck[] = []

  constructor() {
    this.view.addChild(this.floor, this.decorG, this.grid, this.border)
  }

  /**
   * Deterministic floor specks generated from the seeded RNG. Same seed -> same
   * scatter on every reload, which is the simplest visible proof that the PRNG
   * pipeline is deterministic (and that the daily challenge will reproduce).
   */
  setDecor(decor: readonly DecorSpeck[]): void {
    this.decor = decor
    if (this.bounds.w > 0) this.draw()
  }

  /** Recompute bounds for the current screen + insets, then redraw. */
  layout(screenW: number, screenH: number, insets: Insets): void {
    const x = insets.left + ARENA_MARGIN
    const y = insets.top + ARENA_MARGIN
    const w = screenW - insets.left - insets.right - ARENA_MARGIN * 2
    const h = screenH - insets.top - insets.bottom - ARENA_MARGIN * 2
    this.bounds = { x, y, w: Math.max(0, w), h: Math.max(0, h) }
    this.draw()
  }

  private draw(): void {
    const { x, y, w, h } = this.bounds

    this.floor.clear()
    this.floor.rect(x, y, w, h).fill(COLORS.arenaFloor)

    // Deterministic spore specks (seeded). Drawn beneath the grid.
    this.decorG.clear()
    for (const s of this.decor) {
      this.decorG.circle(x + s.nx * w, y + s.ny * h, s.r).fill({ color: COLORS.ichor, alpha: s.alpha })
    }

    // Grid lines, brighter every 4th cell for a readable motion reference.
    this.grid.clear()
    for (let gx = 0; gx <= w; gx += GRID) {
      const bright = (gx / GRID) % 4 === 0
      this.grid
        .moveTo(x + gx, y)
        .lineTo(x + gx, y + h)
        .stroke({ width: 1, color: bright ? COLORS.gridLineBright : COLORS.gridLine, alpha: 0.9 })
    }
    for (let gy = 0; gy <= h; gy += GRID) {
      const bright = (gy / GRID) % 4 === 0
      this.grid
        .moveTo(x, y + gy)
        .lineTo(x + w, y + gy)
        .stroke({ width: 1, color: bright ? COLORS.gridLineBright : COLORS.gridLine, alpha: 0.9 })
    }

    // Border: a soft outer glow line + a crisp inner line.
    this.border.clear()
    this.border
      .rect(x - 2, y - 2, w + 4, h + 4)
      .stroke({ width: 6, color: COLORS.arenaBorderGlow, alpha: 0.18 })
    this.border.rect(x, y, w, h).stroke({ width: 2, color: COLORS.arenaBorder, alpha: 0.9 })
  }
}
