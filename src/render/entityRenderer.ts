import { COLORS, FIXED_DT } from '../config.ts'
import { lerp, lerpAngle } from '../core/vec.ts'
import type { World } from '../game/world.ts'

/** Seconds an enemy takes to fade/scale in after spawning (cosmetic only). */
const EMERGE_TIME = 0.45

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
    s.x = lerp(e.prevX, e.x, alpha)
    s.y = lerp(e.prevY, e.y, alpha)
    s.rotation = lerpAngle(e.prevFacing, e.facing, alpha)
    if (e.submerged) {
      // A faint burrow mound while underground (intangible).
      s.scale.set(e.def.scale * 0.6)
      s.alpha = 0.28
      s.tint = 0x2a1d10
      continue
    }
    // Emerge: fade/scale in over the first beat after spawn so enemies never
    // pop into existence — matters on huge viewports where the fixed spawn ring
    // can sit in view, and for splitter offspring / queen broods which spawn
    // mid-screen by design. Pure presentation (reads sim time, mutates nothing).
    const emerge = Math.min(1, Math.max(0, (t - e.bornAt) / EMERGE_TIME))
    s.alpha = emerge
    const base = e.def.scale * (e.buffed > 0 ? 1.08 : 1) * (0.55 + 0.45 * emerge)
    const wob = Math.sin(t * 14 + e.animPhase)
    s.scale.set(base * (1 + wob * 0.1), base * (1 - wob * 0.1))
    s.tint = e.flash > 0 ? COLORS.swarmerHurt : e.slow > 0 ? 0x7fd8ff : e.tint
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
    if (p.kind === 'xp') {
      // Spin + a lively pulse + a vertical bob so gems read as "grab me".
      s.rotation = t * 2.4 + p.phase
      s.scale.set(1.15 * (1 + Math.sin(t * 6 + p.phase) * 0.2))
      s.y += Math.sin(t * 4 + p.phase) * 3
    } else if (p.kind === 'health') {
      // Heartbeat pulse + bob; a gentle sway, no spin (reads as a medkit).
      s.rotation = Math.sin(t * 3 + p.phase) * 0.12
      s.scale.set(1 + Math.sin(t * 5 + p.phase) * 0.16)
      s.y += Math.sin(t * 4 + p.phase) * 3
    } else {
      s.rotation = Math.sin(t * 2 + p.phase) * 0.15
      s.scale.set(1 + Math.sin(t * 5 + p.phase) * 0.12)
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
