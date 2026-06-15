import { COLORS, FIXED_DT } from '../config.ts'
import { lerp, lerpAngle } from '../core/vec.ts'
import type { World } from '../game/world.ts'

/**
 * Pushes simulation state onto Pixi sprites each rendered frame: interpolation
 * (prev -> current by alpha), rotate-to-face, procedural squash/wobble (so one
 * still illustration reads as a living creature), and hit-flash via tint. Pure
 * presentation — no simulation here.
 */
export function renderEntities(world: World, alpha: number): void {
  const t = world.time + alpha * FIXED_DT

  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    const s = e.sprite
    const base = e.def.scale
    s.x = lerp(e.prevX, e.x, alpha)
    s.y = lerp(e.prevY, e.y, alpha)
    s.rotation = lerpAngle(e.prevFacing, e.facing, alpha)
    const wob = Math.sin(t * 14 + e.animPhase)
    s.scale.set(base * (1 + wob * 0.1), base * (1 - wob * 0.1))
    s.tint = e.flash > 0 ? COLORS.swarmerHurt : e.def.tint
  }

  renderProjectiles(world, alpha)

  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    const s = p.sprite
    s.x = lerp(p.prevX, p.x, alpha)
    s.y = lerp(p.prevY, p.y, alpha)
    s.rotation = p.facing
    // gentle pulse on the acid glob
    s.scale.set(1 + Math.sin(t * 12 + p.facing) * 0.12)
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
  }

  const floaters = world.floaters.active
  for (let i = 0; i < floaters.length; i++) {
    const ft = floaters[i]!
    const k = ft.life / ft.maxLife
    ft.text.x = ft.x
    ft.text.y = lerp(ft.prevY, ft.y, alpha)
    ft.text.alpha = k
    ft.text.scale.set(1 + (1 - k) * 0.3)
  }

  const pickups = world.pickups.active
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i]!
    const s = p.sprite
    s.x = lerp(p.prevX, p.x, alpha)
    s.y = lerp(p.prevY, p.y, alpha)
    const pulse = 1 + Math.sin(t * 5 + p.phase) * 0.12
    if (p.kind === 'xp') {
      s.rotation = t * 2 + p.phase
      s.scale.set(0.9 * pulse)
    } else {
      s.rotation = Math.sin(t * 2 + p.phase) * 0.15
      s.scale.set(pulse)
    }
    s.alpha = p.life < 1.5 ? p.life / 1.5 : 1
  }

  const acid = world.acid.active
  for (let i = 0; i < acid.length; i++) {
    const ap = acid[i]!
    const s = ap.sprite
    const k = ap.life / ap.maxLife
    s.alpha = (0.26 + 0.22 * k) * (0.9 + Math.sin(t * 7 + ap.x) * 0.1)
  }
}

function renderProjectiles(world: World, alpha: number): void {
  const projs = world.projectiles.active
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i]!
    const s = p.sprite
    s.x = lerp(p.prevX, p.x, alpha)
    s.y = lerp(p.prevY, p.y, alpha)
    s.rotation = p.facing
  }
}
