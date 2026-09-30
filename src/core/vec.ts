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

/**
 * Math.hypot(x, y) without its allocation: V8's builtin copies its arguments
 * into a fresh array on every call. The steps are V8's and JavaScriptCore's
 * two-argument algorithm (scale by the larger magnitude, then sum), so the
 * result is bit-identical to Math.hypot and the Daily replays unchanged.
 * Math.sqrt(x * x + y * y) differs in the last bit for about 40% of inputs.
 * Magnitudes by comparison, not Math.abs: V8's mid tier calls Math.abs as a
 * builtin that boxes its result. A -0 magnitude is harmless: it is squared,
 * or it lands in the zero case, which returns +0 as Math.hypot does.
 */
export function hypot(x: number, y: number): number {
  const ax = x < 0 ? -x : x
  const ay = y < 0 ? -y : y
  const m = ax > ay ? ax : ay
  if (m === 0) return 0
  if (m === Infinity) return m
  const nx = ax / m
  const ny = ay / m
  return Math.sqrt(nx * nx + ny * ny) * m
}

export function len(x: number, y: number): number {
  return hypot(x, y)
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return hypot(ax - bx, ay - by)
}

/** Squared distance. Use for comparisons to skip the sqrt. */
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
  const l = hypot(x, y)
  if (l < 1e-6) {
    out.x = 0
    out.y = 0
    return 0
  }
  out.x = x / l
  out.y = y / l
  return l
}
