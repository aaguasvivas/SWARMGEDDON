import { COLORS, MAX_FLOATERS, MAX_PARTICLES } from '../config.ts'
import type { Particle } from '../game/particle.ts'
import type { World } from '../game/world.ts'

/**
 * Particle / floating-text emitters. All of them respect the population caps
 * (skip-when-full, never recycle mid-life) so worst-case combat can't blow the
 * budget. Velocities/scatter use the seeded RNG, keeping runs reproducible.
 */

function begin(p: Particle, x: number, y: number): void {
  p.x = p.prevX = x
  p.y = p.prevY = y
  p.grow = 0
  p.drag = 0
  p.spin = 0
  p.rotation = 0
  p.additive = false
  p.sprite.visible = true
}

/** Chunky gore shards bursting from a kill. */
export function spawnGibs(world: World, x: number, y: number, count: number): void {
  const rng = world.rng
  for (let i = 0; i < count; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y)
    const a = rng.angle()
    const sp = rng.range(70, 300)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = rng.range(0.35, 0.7)
    p.size = rng.range(0.7, 1.4)
    p.grow = -rng.range(0.5, 1.1)
    p.drag = 5
    p.spin = rng.range(-14, 14)
    p.tint = rng.bool(0.55) ? COLORS.gib : COLORS.gibDark
    p.sprite.texture = world.gibTex
    p.sprite.blendMode = 'normal'
  }
}

/** Bright additive sparks at a bullet impact, biased along travel direction. */
export function spawnHitSpark(world: World, x: number, y: number, vx: number, vy: number): void {
  const rng = world.rng
  const baseAng = Math.atan2(vy, vx)
  for (let i = 0; i < 3; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y)
    const a = baseAng + rng.range(-0.9, 0.9)
    const sp = rng.range(120, 320)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = rng.range(0.12, 0.26)
    p.size = rng.range(0.4, 0.8)
    p.grow = -1.2
    p.drag = 6
    p.tint = COLORS.gib
    p.additive = true
    p.sprite.texture = world.sparkTex
    p.sprite.blendMode = 'add'
  }
}

/** Muzzle flash: a forward cone of sparks. */
export function spawnMuzzle(world: World, x: number, y: number, ang: number): void {
  const rng = world.rng
  for (let i = 0; i < 4; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y)
    const a = ang + rng.range(-0.35, 0.35)
    const sp = rng.range(180, 420)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = rng.range(0.06, 0.14)
    p.size = rng.range(0.5, 1.0)
    p.grow = -2
    p.drag = 8
    p.tint = COLORS.muzzle
    p.additive = true
    p.sprite.texture = world.sparkTex
    p.sprite.blendMode = 'add'
  }
}

/** Small puff where a bullet expires on an enemy. */
export function spawnImpact(world: World, x: number, y: number): void {
  if (world.particles.size >= MAX_PARTICLES) return
  const p = world.particles.acquire()
  begin(p, x, y)
  p.vx = 0
  p.vy = 0
  p.life = p.maxLife = 0.16
  p.size = 0.5
  p.grow = 4
  p.tint = COLORS.gib
  p.additive = true
  p.sprite.texture = world.sparkTex
  p.sprite.blendMode = 'add'
}

/** Floating damage number (capped — Text is the priciest pooled object). */
export function spawnDamageNumber(world: World, x: number, y: number, dmg: number): void {
  if (world.floaters.size >= MAX_FLOATERS) return
  const rng = world.rng
  const f = world.floaters.acquire()
  f.x = x + rng.range(-6, 6)
  f.y = f.prevY = y - 8
  f.vy = -rng.range(46, 74)
  f.life = f.maxLife = 0.55
  f.text.text = String(Math.round(dmg))
  f.text.visible = true
}
