import { lerpHex } from '../core/color.ts'

/**
 * Design tokens (NEXT-LEVEL A18 and section 9.1). Every contrast figure in the
 * comments is WCAG against INK (#05070d).
 */

export const INK = 0x05070d

export const T = {
  bgVoid: 0x05070d,
  surfacePanel: 0x0c1220,
  surfaceCard: 0x0e1726,
  surfaceRaised: 0x141d2e,
  plate: 0x05070d,
  plateAlpha: 0.85,
  scrim: 0x05070d,
  scrimAlpha: 0.88,
  textHi: 0xeafff6, // 19.31
  textPrimary: 0x7dffd6, // 16.45
  textMuted: 0x7da99c, // 7.70
  accentPlayer: 0x1ce8b5, // 12.72
  accentXp: 0x57c8ff, // 10.66
  accentGold: 0xffc24a, // 12.53
  accentCrit: 0xffe066, // 15.45
  accentDanger: 0xff5a6e, // 6.66
  bossText: 0xff6aa8, // 7.56
  lineStrong: 0x6f8f89, // 5.72, control borders
  /** Decor only, never text. */
  lineFaint: 0x1d2c44,
  /** Decor only, never text. */
  decorDim: 0x3a5a52,
  rarityCommon: 0x7dffd6,
  rarityRare: 0x5aa9ff,
  rarityFusion: 0xff5ad1,
  rarityEvolution: 0xff9a4a,
  rarityFallback: 0x7da99c,
  hpGreen: 0x2ee6a6,
  hpYellow: 0xe8c64a,
  hpRed: 0xe8434a,
  bossFill: 0xff3a8a,
  levelChip: 0x57c8ff,
  secondaryFill: 0x8aa6a0,
  secondaryAlpha: 0.14,
} as const

/** Display face for titles, body and numbers in mono. The fallbacks cover
 *  glyphs outside the shipped subset. */
export const FONT = {
  display: 'Orbitron, "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
  mono: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
} as const

export const TYPE = {
  displayXl: 40,
  displayL: 26,
  displayM: 18,
  displayS: 14,
  body: 14,
  bodyLine: 20,
  label: 12,
  numXl: 44,
  numM: 18,
  numS: 13,
} as const

export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const
export const GUTTER = 16
export const RADIUS = { chip: 6, button: 12, card: 12, plate: 12 } as const
/** Visual heights; the hit area extends `pad` past the visual on every side. */
export const TARGET = { primary: 56, secondary: 48, compact: 44, pad: 6 } as const

export const MOTION = {
  enterMs: 220,
  exitMs: 130,
  pressInMs: 60,
  pressOutMs: 100,
  pressScale: 0.96,
  countUpMs: 600,
  stampMs: 140,
  reducedMs: 120,
} as const

export function uiScale(w: number, h: number): number {
  const s = Math.min(w, h) / 375
  return s < 1 ? 1 : s > 1.4 ? 1.4 : s
}

function channel(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function luminance(hex: number): number {
  return 0.2126 * channel((hex >> 16) & 0xff) + 0.7152 * channel((hex >> 8) & 0xff) + 0.0722 * channel(hex & 0xff)
}

export function contrastRatio(a: number, b: number): number {
  const la = luminance(a)
  const lb = luminance(b)
  return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05)
}

/** `fg` moved toward white (dark `bg`) or black (light `bg`) until it reaches
 *  `min` contrast. For dynamic colors (weapon tints, world glows). */
export function ensureContrast(fg: number, bg: number, min = 4.5): number {
  if (contrastRatio(fg, bg) >= min) return fg
  const toward = luminance(bg) < 0.18 ? 0xffffff : 0x000000
  let c = fg
  for (let i = 1; i <= 20; i++) {
    c = lerpHex(fg, toward, i / 20)
    if (contrastRatio(c, bg) >= min) return c
  }
  return toward
}
