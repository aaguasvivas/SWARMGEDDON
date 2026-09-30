import { Container, Sprite, type Texture } from 'pixi.js'
import { NUM_CHARS, getNumFont } from '../render/fonts.ts'

export const CH_COMMA = 44
export const CH_COLON = 58
export const CH_PLUS = 43
export const CH_BANG = 33
export const CH_K = 75

/** The numMono atlas indexed by char code. Metrics are in the font's
 *  measurement units: drawn at scale `px / em`, glyphs render at font size `px`. */
export interface NumGlyphs {
  tex: (Texture | null)[]
  adv: Float32Array
  xOff: Float32Array
  em: number
}

let glyphs: NumGlyphs | null = null

export function numGlyphs(): NumGlyphs {
  if (glyphs) return glyphs
  const font = getNumFont()
  const tex = new Array<Texture | null>(128).fill(null)
  const adv = new Float32Array(128)
  const xOff = new Float32Array(128)
  for (const ch of NUM_CHARS) {
    const c = font.chars[ch]
    if (!c) continue
    const code = ch.charCodeAt(0)
    tex[code] = c.texture ?? null
    adv[code] = c.xAdvance
    xOff[code] = c.xOffset
  }
  glyphs = { tex, adv, xOff, em: font.baseMeasurementFontSize }
  return glyphs
}

/** Writes `v` (a non-negative integer) as char codes into `out` from `at`.
 *  Returns the new end index; stops at `out.length`. */
export function writeInt(out: Uint8Array, at: number, v: number, group: boolean): number {
  let digits = 1
  for (let t = Math.floor(v / 10); t > 0; t = Math.floor(t / 10)) digits++
  const len = digits + (group ? Math.floor((digits - 1) / 3) : 0)
  if (at + len > out.length) {
    for (let i = at; i < out.length; i++) out[i] = 57 // saturate to 9s
    return out.length
  }
  let pos = at + len - 1
  let t = v
  let k = 0
  do {
    out[pos--] = 48 + (t % 10)
    t = Math.floor(t / 10)
    k++
    if (group && k % 3 === 0 && t > 0) out[pos--] = CH_COMMA
  } while (t > 0)
  return at + len
}

/** Lays glyph sprites out for `codes[0..n)`, anchored by `align` (0 left,
 *  0.5 center, 1 right). Returns the width in font px. */
export function layoutGlyphs(sprites: Sprite[], codes: Uint8Array, n: number, align: number): number {
  const g = numGlyphs()
  let pen = 0
  for (let i = 0; i < n; i++) pen += g.adv[codes[i]!]!
  let x = -pen * align
  for (let i = 0; i < sprites.length; i++) {
    const s = sprites[i]!
    if (i >= n) {
      s.visible = false
      continue
    }
    const code = codes[i]!
    const tex = g.tex[code]
    if (tex) s.texture = tex
    s.x = x + g.xOff[code]!
    s.visible = tex !== null
    x += g.adv[code]!
  }
  return pen
}

/**
 * A number drawn from pooled glyph sprites: no Text, no string per update, and
 * the glyphs change only when the shown value changes.
 */
export class DigitStrip {
  readonly view = new Container()
  /** Current width in CSS px. */
  width = 0
  private readonly sprites: Sprite[] = []
  private readonly codes: Uint8Array
  private lastV = -1
  private lastKey = -1
  private scale = 1

  constructor(max: number, sizePx: number, tint = 0xffffff, private readonly align = 0) {
    const g = numGlyphs()
    this.codes = new Uint8Array(max)
    for (let i = 0; i < max; i++) {
      const s = new Sprite(g.tex[48]!)
      s.anchor.set(0, 0.5)
      s.tint = tint
      s.visible = false
      this.sprites.push(s)
      this.view.addChild(s)
    }
    this.setSize(sizePx)
  }

  setSize(px: number): void {
    this.scale = px / numGlyphs().em
    this.view.scale.set(this.scale)
  }

  setTint(tint: number): void {
    for (const s of this.sprites) s.tint = tint
  }

  /** `prefix` and `suffix` are char codes (0 = none), e.g. 120 for `x5`. */
  setInt(v: number, group = false, prefix = 0, suffix = 0): void {
    const n = v > 0 ? Math.floor(v) : 0
    const key = (group ? 1 : 0) + prefix * 2 + suffix * 256
    if (n === this.lastV && key === this.lastKey) return
    this.lastV = n
    this.lastKey = key
    const c = this.codes
    let i = 0
    if (prefix && i < c.length) c[i++] = prefix
    i = writeInt(c, i, n, group)
    if (suffix && i < c.length) c[i++] = suffix
    this.width = layoutGlyphs(this.sprites, c, i, this.align) * this.scale
  }

  /** Whole seconds as `m:ss`. */
  setTime(sec: number): void {
    const s = sec > 0 ? Math.floor(sec) : 0
    if (s === this.lastV && this.lastKey === -2) return
    this.lastV = s
    this.lastKey = -2
    const c = this.codes
    let i = writeInt(c, 0, Math.floor(s / 60), false)
    if (i + 3 <= c.length) {
      const r = s % 60
      c[i++] = CH_COLON
      c[i++] = 48 + Math.floor(r / 10)
      c[i++] = 48 + (r % 10)
    }
    this.width = layoutGlyphs(this.sprites, c, i, this.align) * this.scale
  }
}
