import { COLORS, MAX_FLOATERS, MAX_PARTICLES } from '../config.ts'
import type { Particle } from '../game/particle.ts'
import type { World } from '../game/world.ts'

/**
 * Particle / floating-text emitters. All respect the population caps
 * (skip-when-full) so worst-case combat can't blow the budget. Scatter uses the
 * seeded RNG, keeping runs reproducible.
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

/** Multiply an 0xRRGGBB color toward black (for gib shade variety). */
function darken(color: number, f: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * f)
  const g = Math.floor(((color >> 8) & 0xff) * f)
  const b = Math.floor((color & 0xff) * f)
  return (r << 16) | (g << 8) | b
}

/** Chunky gore shards bursting from a kill, colored to the enemy. */
export function spawnGibs(world: World, x: number, y: number, count: number, color: number): void {
  const rng = world.rng
  const dark = darken(color, 0.55)
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
    p.tint = rng.bool(0.5) ? color : dark
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

/** Acid splash burst when a pool forms. */
export function spawnAcidSplash(world: World, x: number, y: number): void {
  const rng = world.rng
  for (let i = 0; i < 5; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y)
    const a = rng.angle()
    const sp = rng.range(40, 160)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = rng.range(0.2, 0.4)
    p.size = rng.range(0.5, 1.0)
    p.grow = -1
    p.drag = 7
    p.tint = COLORS.acid
    p.additive = true
    p.sprite.texture = world.sparkTex
    p.sprite.blendMode = 'add'
  }
}

/** Radial burst (teleport poof, burrow emerge). */
export function spawnPoof(world: World, x: number, y: number, tint: number, count: number): void {
  const rng = world.rng
  for (let i = 0; i < count; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const p = world.particles.acquire()
    begin(p, x, y)
    const a = rng.angle()
    const sp = rng.range(80, 240)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = rng.range(0.2, 0.4)
    p.size = rng.range(0.6, 1.2)
    p.grow = -1.2
    p.drag = 6
    p.tint = tint
    p.additive = true
    p.sprite.texture = world.sparkTex
    p.sprite.blendMode = 'add'
  }
}

/** Explosion burst (rockets / explosive rounds). */
export function spawnExplosion(world: World, x: number, y: number, radius: number): void {
  const rng = world.rng
  const n = Math.min(18, Math.floor(radius / 6))
  for (let i = 0; i < n; i++) {
    if (world.particles.size >= MAX_PARTICLES) break
    const p = world.particles.acquire()
    begin(p, x, y)
    const a = rng.angle()
    const sp = rng.range(120, radius * 6)
    p.vx = Math.cos(a) * sp
    p.vy = Math.sin(a) * sp
    p.life = p.maxLife = rng.range(0.25, 0.5)
    p.size = rng.range(0.9, 1.8)
    p.grow = -1.4
    p.drag = 5
    p.tint = rng.bool(0.5) ? 0xffd27a : COLORS.muzzle
    p.additive = true
    p.sprite.texture = world.sparkTex
    p.sprite.blendMode = 'add'
  }
}

/** Expanding shockwave ring (death-pop / explosion). Blooms beautifully. */
export function spawnRing(world: World, x: number, y: number, color: number, targetScale: number): void {
  if (world.particles.size >= MAX_PARTICLES) return
  const p = world.particles.acquire()
  begin(p, x, y)
  p.vx = 0
  p.vy = 0
  p.life = p.maxLife = 0.34
  p.size = 0.2
  p.grow = (targetScale - 0.2) / 0.34
  p.tint = color
  p.additive = true
  p.sprite.texture = world.ringTex
  p.sprite.blendMode = 'add'
}

/** Lightning arc sparks along a segment (chain lightning). */
export function spawnChainArc(world: World, x1: number, y1: number, x2: number, y2: number): void {
  const rng = world.rng
  const steps = 5
  for (let i = 0; i <= steps; i++) {
    if (world.particles.size >= MAX_PARTICLES) return
    const t = i / steps
    const p = world.particles.acquire()
    begin(p, x1 + (x2 - x1) * t + rng.range(-5, 5), y1 + (y2 - y1) * t + rng.range(-5, 5))
    p.vx = 0
    p.vy = 0
    p.life = p.maxLife = rng.range(0.08, 0.16)
    p.size = rng.range(0.4, 0.8)
    p.grow = -1
    p.tint = 0x9be7ff
    p.additive = true
    p.sprite.texture = world.sparkTex
    p.sprite.blendMode = 'add'
  }
}

/** Floating damage number (capped). Crits are larger and gold. */
export function spawnDamageNumber(world: World, x: number, y: number, dmg: number, crit: boolean): void {
  if (world.floaters.size >= MAX_FLOATERS) return
  const f = world.floaters.acquire()
  // Purely-visual jitter must NOT come from the sim RNG: these draws sit behind
  // the floater-cap early-return, and the cap's population can differ per device
  // (the one-time gem hint is gated on local storage) — which would fork the
  // Daily Challenge sim stream. Math.random, same as screen shake (juice.ts).
  f.x = x + (Math.random() * 12 - 6)
  f.y = f.prevY = y - 8
  f.vy = -(46 + Math.random() * 28)
  f.life = f.maxLife = crit ? 0.7 : 0.5
  f.text.text = crit ? `${Math.round(dmg)}!` : String(Math.round(dmg))
  f.text.style.fontSize = crit ? 20 : 14
  f.text.style.fill = crit ? COLORS.critText : COLORS.damageText
  f.text.visible = true
}

/** Floating announcement (e.g. weapon pickup name). */
export function announce(world: World, text: string, x: number, y: number, color: number): void {
  if (world.floaters.size >= MAX_FLOATERS) return
  const f = world.floaters.acquire()
  f.x = x
  f.y = f.prevY = y
  f.vy = -34
  f.life = f.maxLife = 1.1
  f.text.text = text
  f.text.style.fontSize = 17
  f.text.style.fill = color
  f.text.visible = true
}
