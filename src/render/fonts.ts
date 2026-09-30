import { BitmapFontManager, type BitmapFont } from 'pixi.js'
import orbitron700 from '../assets/fonts/orbitron-700.woff2?url'
import orbitron900 from '../assets/fonts/orbitron-900.woff2?url'
import mono500 from '../assets/fonts/jetbrains-mono-500.woff2?url'
import mono800 from '../assets/fonts/jetbrains-mono-800.woff2?url'
import { FONT, INK } from '../ui/tokens.ts'

/** Bitmap atlas for damage numbers and DigitStrips (A18). */
export const NUM_FONT = 'numMono'
export const NUM_CHARS = '0123456789,:+-!x%#/K'

const FACES: readonly [string, string, string][] = [
  ['Orbitron', orbitron700, '700'],
  ['Orbitron', orbitron900, '900'],
  ['JetBrains Mono', mono500, '500'],
  ['JetBrains Mono', mono800, '800'],
]
const LOAD_TIMEOUT_MS = 2500

let numFont: BitmapFont | null = null

/**
 * Loads the bundled faces, then rasterizes the number atlas. Runs once at boot
 * before any Text exists: canvas text measured before its face loads keeps the
 * fallback metrics. A slow or failed load gives up after the timeout and the
 * game renders with the fallback stack.
 */
export async function loadFonts(): Promise<boolean> {
  let ok = false
  try {
    const loads = FACES.map(([family, url, weight]) => {
      const face = new FontFace(family, `url(${url})`, { weight, style: 'normal' })
      document.fonts.add(face)
      return face.load()
    })
    ok = await Promise.race([
      Promise.all(loads).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), LOAD_TIMEOUT_MS)),
    ])
  } catch {
    ok = false
  }
  numFont = BitmapFontManager.install({
    name: NUM_FONT,
    style: {
      fontFamily: FONT.mono,
      fontWeight: '800',
      fontSize: 40,
      fill: 0xffffff,
      stroke: { color: INK, width: 6, join: 'round' },
    },
    chars: NUM_CHARS,
    resolution: 2,
    padding: 6,
  })
  return ok
}

export function getNumFont(): BitmapFont {
  if (!numFont) throw new Error('loadFonts() has not run')
  return numFont
}
