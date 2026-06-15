import { COLORS, FIXED_DT } from '../config.ts'
import { lerp, lerpAngle } from '../core/vec.ts'
import type { World } from '../game/world.ts'

/**
 * Pushes simulation state onto the Pixi sprites every rendered frame, with:
 *   - interpolation (prev -> current by alpha) for smooth motion,
 *   - rotate-to-face for enemies/projectiles,
 *   - procedural squash/stretch wobble layered on the still enemy sprite so one
 *     illustration reads as a living, skittering creature,
 *   - hit-flash via tint.
 * No simulation happens here — it's pure presentation.
 */
export function renderEntities(world: World, alpha: number): void {
  // A render-time clock (sim time + the in-between fraction) drives wobble.
  const t = world.time + alpha * FIXED_DT

  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    const s = e.sprite
    s.x = lerp(e.prevX, e.x, alpha)
    s.y = lerp(e.prevY, e.y, alpha)
    s.rotation = lerpAngle(e.prevFacing, e.facing, alpha)
    // Area-preserving-ish squash perpendicular to a fast scuttle.
    const wob = Math.sin(t * 14 + e.animPhase)
    s.scale.set(1 + wob * 0.1, 1 - wob * 0.1)
    s.tint = e.flash > 0 ? COLORS.swarmerHurt : COLORS.swarmer
  }

  const projs = world.projectiles.active
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i]!
    const s = p.sprite
    s.x = lerp(p.prevX, p.x, alpha)
    s.y = lerp(p.prevY, p.y, alpha)
    s.rotation = p.facing
  }

  const parts = world.particles.active
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    const s = p.sprite
    s.x = lerp(p.prevX, p.x, alpha)
    s.y = lerp(p.prevY, p.y, alpha)
    s.rotation = p.rotation
    s.alpha = p.life / p.maxLife
    s.scale.set(p.size)
    // tint/blendMode are set once at spawn (fx.ts), not per frame.
  }

  const floaters = world.floaters.active
  for (let i = 0; i < floaters.length; i++) {
    const ft = floaters[i]!
    const k = ft.life / ft.maxLife
    ft.text.x = ft.x
    ft.text.y = lerp(ft.prevY, ft.y, alpha)
    ft.text.alpha = k
    ft.text.scale.set(1 + (1 - k) * 0.3) // a little pop as it rises
  }
}
