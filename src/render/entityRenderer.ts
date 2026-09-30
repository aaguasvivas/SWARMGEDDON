import { BOSS_EMERGE, COLORS, FIXED_DT } from '../config.ts'
import { lerp, lerpAngle } from '../core/vec.ts'
import type { World } from '../game/world.ts'
import { setTint } from './textures.ts'

/** Seconds an enemy takes to fade/scale in after spawning (cosmetic only). */
const EMERGE_TIME = 0.45

/**
 * Pushes simulation state onto Pixi sprites each rendered frame: interpolation
 * (prev -> current by alpha), rotate-to-face, procedural squash/wobble (so one
 * still illustration reads as a living creature), and hit-flash via tint. Pure
 * presentation, no simulation here.
 *
 * One function per pool: each loop gets its own optimizer inlining budget, so
 * the Pixi setters inline and no double is boxed per sprite.
 */
export function renderEntities(world: World, alpha: number): void {
  const t = world.time + alpha * FIXED_DT
  renderEnemies(world, alpha, t)
  renderProjectiles(world, alpha)
  renderEnemyShots(world, alpha, t)
  renderParticles(world, alpha)
  renderPickups(world, alpha, t)
  renderAcid(world, t)
}

function renderEnemies(world: World, alpha: number, t: number): void {
  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    const s = e.sprite
    s.position.set(lerp(e.prevX, e.x, alpha), lerp(e.prevY, e.y, alpha))
    s.rotation = lerpAngle(e.prevFacing, e.facing, alpha)
    if (e.submerged && !e.def.boss) {
      // A faint burrow mound while underground (intangible).
      s.scale.set(e.def.scale * 0.6)
      s.alpha = 0.28
      setTint(s, 0x2a1d10)
      continue
    }
    // Emerge: fade/scale in over the first beat after spawn so enemies never
    // pop into existence. That matters on huge viewports where the fixed spawn ring
    // can sit in view, and for splitter offspring / queen broods which spawn
    // mid-screen by design. Pure presentation (reads sim time, mutates nothing).
    // A boss is untargetable for its whole BOSS_EMERGE, so it fades in over that.
    const emerge = Math.min(1, Math.max(0, (t - e.bornAt) / (e.def.boss ? BOSS_EMERGE : EMERGE_TIME)))
    s.alpha = emerge
    const base = e.def.scale * (e.buffed > 0 ? 1.08 : 1) * (0.55 + 0.45 * emerge)
    const wob = Math.sin(t * 14 + e.animPhase)
    if (e.phase === 1) {
      // Charger windup telegraph: coil (squash along the locked heading, sprite
      // rotation IS the heading) + a fast white flicker. Read-only cosmetics.
      s.scale.set(base * 0.78, base * 1.22)
      setTint(s, Math.sin(t * 42) > 0 ? 0xffffff : e.tint)
    } else if (e.phase === 2) {
      // Dash: stretch along the line.
      s.scale.set(base * 1.35, base * 0.72)
      setTint(s, e.flash > 0 ? COLORS.swarmerHurt : e.tint)
    } else {
      s.scale.set(base * (1 + wob * 0.1), base * (1 - wob * 0.1))
      setTint(s, e.flash > 0 ? COLORS.swarmerHurt : e.slow > 0 ? 0x7fd8ff : e.tint)
    }
  }
}

function renderProjectiles(world: World, alpha: number): void {
  const projs = world.projectiles.active
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i]!
    const s = p.sprite
    s.position.set(lerp(p.prevX, p.x, alpha), lerp(p.prevY, p.y, alpha))
    s.rotation = p.facing
  }
}

function renderEnemyShots(world: World, alpha: number, t: number): void {
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    const s = p.sprite
    s.position.set(lerp(p.prevX, p.x, alpha), lerp(p.prevY, p.y, alpha))
    s.rotation = p.facing
    // gentle pulse on the acid glob
    s.scale.set(1 + Math.sin(t * 12 + p.facing) * 0.12)
  }
}

function renderParticles(world: World, alpha: number): void {
  const parts = world.particles.active
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    const s = p.sprite
    // Emitted since the last frame (the pool hides a freed sprite): the
    // emitter recorded the look, and its Pixi setters stay out of the sim tick.
    if (!s.visible) {
      s.texture = p.tex!
      s.blendMode = p.additive ? 'add' : 'normal'
      setTint(s, p.tint)
      s.visible = true
    }
    s.position.set(lerp(p.prevX, p.x, alpha), lerp(p.prevY, p.y, alpha))
    s.rotation = p.rotation
    s.alpha = p.life / p.maxLife
    s.scale.set(p.size)
  }
}

function renderPickups(world: World, alpha: number, t: number): void {
  const pickups = world.pickups.active
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i]!
    const s = p.sprite
    const x = lerp(p.prevX, p.x, alpha)
    let y = lerp(p.prevY, p.y, alpha)
    // One call per property below: few call sites keep every Pixi setter
    // inlined, so no double is boxed per pickup.
    let rot: number
    let scale: number
    if (p.kind === 'xp') {
      // Spin + a lively pulse + a vertical bob so gems read as "grab me".
      rot = t * 2.4 + p.phase
      scale = 1.15 * (1 + Math.sin(t * 6 + p.phase) * 0.2)
      y += Math.sin(t * 4 + p.phase) * 3
    } else if (p.kind === 'bank') {
      // The bank gem grows with the XP it holds (A6).
      const base = Math.min(2.4, 1.2 + 0.25 * Math.log2(1 + p.xp / 20))
      rot = t * 1.6 + p.phase
      scale = base * (1 + Math.sin(t * 5 + p.phase) * 0.12)
    } else if (p.kind === 'health') {
      // Heartbeat pulse + bob; a gentle sway, no spin (reads as a medkit).
      rot = Math.sin(t * 3 + p.phase) * 0.12
      scale = 1 + Math.sin(t * 5 + p.phase) * 0.16
      y += Math.sin(t * 4 + p.phase) * 3
    } else {
      // A pod swells while the player holds it (hold-to-take fill).
      rot = Math.sin(t * 2 + p.phase) * 0.15
      scale = (1 + Math.sin(t * 5 + p.phase) * 0.12) * (1 + 0.35 * p.hold)
    }
    s.rotation = rot
    s.scale.set(scale)
    s.position.set(x, y)
    s.alpha = p.life < 1.5 ? p.life / 1.5 : 1
  }
}

function renderAcid(world: World, t: number): void {
  const acid = world.acid.active
  for (let i = 0; i < acid.length; i++) {
    const ap = acid[i]!
    const k = ap.life / ap.maxLife
    ap.sprite.alpha = (0.26 + 0.22 * k) * (0.9 + Math.sin(t * 7 + ap.x) * 0.1)
  }
}
