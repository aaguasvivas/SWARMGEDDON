/**
 * Tiny color math for faction/theme tinting. Pure functions, no allocation
 * beyond the return value — safe to call from content code at spawn time.
 */

/** Hue-rotate a 0xRRGGBB color by `deg` degrees, keeping saturation/lightness. */
export function hueShiftHex(hex: number, deg: number): number {
  if (deg === 0) return hex
  const r = ((hex >> 16) & 0xff) / 255
  const g = ((hex >> 8) & 0xff) / 255
  const b = (hex & 0xff) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }

  h = (((h + deg / 360) % 1) + 1) % 1

  if (s === 0) return hex // grays don't rotate
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number): number => {
    t = ((t % 1) + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const to255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)))
  return (to255(channel(h + 1 / 3)) << 16) | (to255(channel(h)) << 8) | to255(channel(h - 1 / 3))
}
