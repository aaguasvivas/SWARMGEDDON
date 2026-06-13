/**
 * 2D vector + scalar math helpers.
 *
 * Hot-loop code should avoid allocating, so most helpers take plain numbers or
 * write into an `out` object rather than returning new objects. The convenience
 * functions that return `{x,y}` are for cold paths (setup, UI).
 */

export interface Vec2 {
  x: number
  y: number
}

export const TAU = Math.PI * 2

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Linear interpolation between two angles taking the shortest path around the circle. */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % TAU
  if (diff > Math.PI) diff -= TAU
  else if (diff < -Math.PI) diff += TAU
  return a + diff * t
}

export function len(x: number, y: number): number {
  return Math.hypot(x, y)
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

/** Squared distance — use for comparisons to skip the sqrt. */
export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/**
 * Normalize (x,y) into `out`. If the input has near-zero length, writes (0,0).
 * Returns the original length so callers can branch on "was this a real input".
 */
export function normalizeInto(x: number, y: number, out: Vec2): number {
  const l = Math.hypot(x, y)
  if (l < 1e-6) {
    out.x = 0
    out.y = 0
    return 0
  }
  out.x = x / l
  out.y = y / l
  return l
}
