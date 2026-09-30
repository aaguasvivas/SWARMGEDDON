import { COLORS, MAX_PARTICLES } from '../config.ts'
import type { Particle } from '../game/particle.ts'
import type { World } from '../game/world.ts'

/**
 * Particle emitters. All respect the population cap (skip-when-full) so
 * worst-case combat can't blow the budget. Scatter draws from the cosmetic
 * `fx` stream inside the sim tick, so runs stay reproducible and no emitter can
 * shift a sim stream.
 */

/** Share of a kill's gibs thrown along the killing shot, and their half-cone. */
const GIB_AIMED_FRAC = 0.6
const GIB_CONE = 0.6
/** Rail and beam shots stretch along travel by 1 + speed / this. */
export const TRACER_STRETCH_SPEED = 1800
const MUZZLE_FLASH_LIFE = 0.06
/** The flash quad's center sits this far ahead of the muzzle (half its length). */
const MUZZLE_FLASH_AHEAD = 11
/** One particle's draws, from Rng.fill: an emitter makes no call that returns
 *  a number, so nothing is boxed on the heap per particle. A value written
 *  `min + R[k] * (max - min)` is Rng.range(min, max) on that draw, and
 *  `R[k] * Math.PI * 2` is Rng.angle(), in the order the calls were made. */
const R = new Float64Array(8)

function begin(p: Particle, x: number, y: number, tint: number): void {
  p.x = p.prevX = x
  p.y = p.prevY = y
  p.grow = 0
  p.drag = 0
  p.spin = 0
  p.rotation = 0
  p.additive = false
  p.tint = tint
}

/** Multiply an 0xRRGGBB color toward black (for gib shade variety). */
function darken(color: number, f: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * f)
  const g = Math.floor(((color >> 8) & 0xff) * f)
  const b = Math.floor((color & 0xff) * f)
  return (r << 16) | (g << 8) | b
}

/** Chunky gore shards bursting from a kill, colored to the enemy. Most fly
 *  along (dirX, dirY), the killing shot's velocity; a zero vector sprays them
 *  radially. */
export function spawnGibs(world: World, x: number, y: number, count: number, color: number, dirX: number, dirY: number): void {
  const rng = world.rngs.fx
  const dark = darken(color, 0.55)
  const aimed = dirX !== 0 || dirY !== 0 ? Math.round(count * GIB_AIMED_FRAC) : 0
  const base = aimed > 0 ? Math.atan2(dirY, dirX) : 0
  for (let i = 0; i < count; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    rng.fill(R, 7)
    const a = i < aimed ? base + (-GIB_CONE + R[0]! * (GIB_CONE - -GIB_CONE)) : R[0]! * Math.PI * 2
    const sp = 70 + R[1]! * (300 - 70)
    const life = 0.35 + R[2]! * (0.7 - 0.35)
    const size = 0.7 + R[3]! * (1.4 - 0.7)
    const grow = -(0.5 + R[4]! * (1.1 - 0.5))
    const spin = -14 + R[5]! * (14 - -14)
    begin(p, x, y, R[6]! < 0.5 ? color : dark)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = life
    p.size = size
    p.grow = grow
    p.drag = 5
    p.spin = spin
    p.tex = world.gibTex
  }
}

/** Bright additive sparks at a bullet impact, biased along travel direction. */
export function spawnHitSpark(world: World, x: number, y: number, vx: number, vy: number): void {
  const rng = world.rngs.fx
  const baseAng = Math.atan2(vy, vx)
  for (let i = 0; i < 3; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y, COLORS.gib)
    rng.fill(R, 4)
    const a = baseAng + (-0.9 + R[0]! * (0.9 - -0.9))
    const sp = 120 + R[1]! * (320 - 120)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = 0.12 + R[2]! * (0.26 - 0.12)
    p.size = 0.4 + R[3]! * (0.8 - 0.4)
    p.grow = -1.2
    p.drag = 6
    p.additive = true
    p.tex = world.sparkTex
  }
}

/** Muzzle flash: one additive flash quad along the aim plus 2 forward sparks. */
export function spawnMuzzle(world: World, x: number, y: number, ang: number): void {
  const rng = world.rngs.fx
  if (world.particles.size >= MAX_PARTICLES) return
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const f = world.particles.acquire()
  begin(f, x + c * MUZZLE_FLASH_AHEAD, y + s * MUZZLE_FLASH_AHEAD, COLORS.muzzle)
  f.vx = 0
  f.vy = 0
  f.rotation = ang
  f.life = f.maxLife = MUZZLE_FLASH_LIFE
  f.size = 1
  f.grow = -6
  f.additive = true
  f.tex = world.flashTex
  for (let i = 0; i < 2; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y, COLORS.muzzle)
    rng.fill(R, 4)
    const a = ang + (-0.35 + R[0]! * (0.35 - -0.35))
    const sp = 180 + R[1]! * (420 - 180)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = 0.06 + R[2]! * (0.14 - 0.06)
    p.size = 0.5 + R[3]! * (1.0 - 0.5)
    p.grow = -2
    p.drag = 8
    p.additive = true
    p.tex = world.sparkTex
  }
}

/** Small puff where a bullet expires on an enemy. */
export function spawnImpact(world: World, x: number, y: number): void {
  if (world.particles.size >= MAX_PARTICLES) return
  const p = world.particles.acquire()
  begin(p, x, y, COLORS.gib)
  p.vx = 0
  p.vy = 0
  p.life = p.maxLife = 0.16
  p.size = 0.5
  p.grow = 4
  p.additive = true
  p.tex = world.sparkTex
}

/** Acid splash burst when a pool forms. */
export function spawnAcidSplash(world: World, x: number, y: number): void {
  const rng = world.rngs.fx
  for (let i = 0; i < 5; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y, world.arenaTheme.hazardTint)
    rng.fill(R, 4)
    const a = R[0]! * Math.PI * 2
    const sp = 40 + R[1]! * (160 - 40)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = 0.2 + R[2]! * (0.4 - 0.2)
    p.size = 0.5 + R[3]! * (1.0 - 0.5)
    p.grow = -1
    p.drag = 7
    p.additive = true
    p.tex = world.sparkTex
  }
}

/** Radial burst (teleport poof, burrow emerge). */
export function spawnPoof(world: World, x: number, y: number, tint: number, count: number): void {
  const rng = world.rngs.fx
  for (let i = 0; i < count; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y, tint)
    rng.fill(R, 4)
    const a = R[0]! * Math.PI * 2
    const sp = 80 + R[1]! * (240 - 80)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = 0.2 + R[2]! * (0.4 - 0.2)
    p.size = 0.6 + R[3]! * (1.2 - 0.6)
    p.grow = -1.2
    p.drag = 6
    p.additive = true
    p.tex = world.sparkTex
  }
}

/** Explosion burst (rockets / explosive rounds). */
export function spawnExplosion(world: World, x: number, y: number, radius: number): void {
  const rng = world.rngs.fx
  const n = Math.min(18, Math.floor(radius / 6))
  for (let i = 0; i < n; i++) {
    if (world.particles.size >= MAX_PARTICLES) break
    const p = world.particles.acquire()
    rng.fill(R, 5)
    const a = R[0]! * Math.PI * 2
    const sp = 120 + R[1]! * (radius * 6 - 120)
    const life = 0.25 + R[2]! * (0.5 - 0.25)
    const size = 0.9 + R[3]! * (1.8 - 0.9)
    begin(p, x, y, R[4]! < 0.5 ? 0xffd27a : COLORS.muzzle)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = life
    p.size = size
    p.grow = -1.4
    p.drag = 5
    p.additive = true
    p.tex = world.sparkTex
  }
}

/** Expanding shockwave ring (death-pop / explosion). Blooms beautifully. */
export function spawnRing(world: World, x: number, y: number, color: number, targetScale: number): void {
  if (world.particles.size >= MAX_PARTICLES) return
  const p = world.particles.acquire()
  begin(p, x, y, color)
  p.vx = 0
  p.vy = 0
  p.life = p.maxLife = 0.34
  p.size = 0.2
  p.grow = (targetScale - 0.2) / 0.34
  p.additive = true
  p.tex = world.ringTex
}

/** Lightning arc sparks along a segment (chain lightning). */
export function spawnChainArc(world: World, x1: number, y1: number, x2: number, y2: number): void {
  const rng = world.rngs.fx
  const steps = 5
  for (let i = 0; i <= steps; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const t = i / steps
    const p = world.particles.acquire()
    rng.fill(R, 4)
    begin(p, x1 + (x2 - x1) * t + (-5 + R[0]! * (5 - -5)), y1 + (y2 - y1) * t + (-5 + R[1]! * (5 - -5)), 0x9be7ff)
    p.vx = 0
    p.vy = 0
    p.life = p.maxLife = 0.08 + R[2]! * (0.16 - 0.08)
    p.size = 0.4 + R[3]! * (0.8 - 0.4)
    p.grow = -1
    p.additive = true
    p.tex = world.sparkTex
  }
}
