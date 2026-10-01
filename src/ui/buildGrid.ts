import { Container, Graphics, Sprite, Text } from 'pixi.js'
import { FAMILIES, FUSIONS, findPerk } from '../content/perks.ts'
import { makeIcon, setIcon, type IconName } from './icons.ts'
import { FONT, INK, T } from './tokens.ts'

/** One owned build entry as a glyph tile: a perk in its family color, a fusion
 *  in the fusion color with a fusion border, SHARPEN in the fallback color. */
export interface BuildTile {
  glyph: IconName
  stacks: number
  tint: number
  fusion: boolean
}

/** The build in the order it was taken (perkStacks or RunResult.perks). */
export function buildTiles(entries: Iterable<readonly [string, number]>): BuildTile[] {
  const out: BuildTile[] = []
  for (const [id, stacks] of entries) {
    const p = findPerk(id)
    if (p) {
      out.push({ glyph: p.glyph as IconName, stacks, tint: FAMILIES[p.family]!.color, fusion: false })
      continue
    }
    const f = FUSIONS.find((x) => x.id === id)
    if (f) out.push({ glyph: findPerk(f.a)!.glyph as IconName, stacks, tint: T.rarityFusion, fusion: true })
    else if (id === 'sharpen') out.push({ glyph: 'damage', stacks, tint: T.rarityFallback, fusion: false })
  }
  return out
}

const GAP = 6

/**
 * A grid of glyph tiles with stack digits (pause sheet 32 px, recap 28 px).
 * Tiles are pooled; `set` runs at event rate (sheet open, recap). When the
 * build has more tiles than fit, the last tile reads `+N`.
 */
export class BuildGrid {
  readonly view = new Container()
  height = 0
  width = 0
  private readonly tiles: { root: Container; bg: Graphics; glyph: Sprite; digit: Text }[] = []
  private readonly more: Text

  constructor(
    private readonly size: number,
    private readonly perRow: number,
    private readonly maxRows: number,
  ) {
    for (let i = 0; i < perRow * maxRows; i++) {
      const root = new Container()
      const bg = new Graphics()
      const glyph = makeIcon('rate', Math.round(size * 0.6))
      glyph.position.set(size / 2, size / 2 - 1)
      const digit = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 12, fontWeight: '800', fill: T.textHi, stroke: { color: INK, width: 3, join: 'round' } } })
      digit.anchor.set(1, 1)
      digit.position.set(size + 2, size + 3)
      root.addChild(bg, glyph, digit)
      this.tiles.push({ root, bg, glyph, digit })
      this.view.addChild(root)
    }
    this.more = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 12, fontWeight: '800', fill: T.textPrimary } })
    this.more.anchor.set(0.5)
    this.view.addChild(this.more)
    this.view.eventMode = 'none'
  }

  /** Fill and lay out from the top-left; `width` caps the tiles per row. */
  set(build: readonly BuildTile[], width: number): void {
    const s = this.size
    const perRow = Math.max(1, Math.min(this.perRow, Math.floor((width + GAP) / (s + GAP))))
    const cap = perRow * this.maxRows
    const overflow = build.length > cap
    const shown = overflow ? cap - 1 : build.length
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i]!
      t.root.visible = i < shown
      if (i >= shown) continue
      const b = build[i]!
      t.root.position.set((i % perRow) * (s + GAP), Math.floor(i / perRow) * (s + GAP))
      t.bg.clear()
      t.bg.roundRect(0, 0, s, s, 6).fill({ color: b.tint, alpha: 0.16 }).stroke({ width: b.fusion ? 2 : 1, color: b.tint, alpha: b.fusion ? 1 : 0.6 })
      setIcon(t.glyph, b.glyph, Math.round(s * 0.6))
      t.glyph.tint = b.tint
      t.digit.text = b.stacks > 1 ? String(b.stacks) : ''
    }
    this.more.visible = overflow
    if (overflow) {
      this.more.text = `+${build.length - shown}`
      this.more.position.set((shown % perRow) * (s + GAP) + s / 2, Math.floor(shown / perRow) * (s + GAP) + s / 2)
    }
    const n = overflow ? cap : build.length
    const rows = Math.ceil(n / perRow)
    this.height = n === 0 ? 0 : rows * s + (rows - 1) * GAP
    this.width = n === 0 ? 0 : Math.min(n, perRow) * (s + GAP) - GAP
  }
}
