import { Container, type Texture } from 'pixi.js'
import { BONUS, BOSS_EMERGE, ENEMY_EMERGE, FIXED_DT, PICKUP_RESERVE, PODS } from '../config.ts'
import { lerpHex } from '../core/color.ts'
import { lerp, lerpAngle } from '../core/vec.ts'
import { WEAPONS } from '../content/weapons.ts'
import type { World } from '../game/world.ts'
import { packColor } from './quads.ts'
import { SegRing } from './segRing.ts'
import { WHITE } from './textures.ts'

/** Section 6.4: a struck enemy shows its white silhouette at this scale. */
const HIT_PULSE = 1.12
/** A pod in its last PODS.blinkLast seconds blinks at this rate (Hz) and dims to this alpha. */
const POD_BLINK_HZ = 6
const POD_BLINK_ALPHA = 0.3
const FRENZY_TINT = 0xff5a6e
/** Frozen (FREEZE) or slowed (cryo) enemies. */
const ICE_TINT = 0x7fd8ff
/** Per EnemyDef.idx: the sprite texture and its white silhouette (filled lazily). */
const baseTex: (Texture | undefined)[] = []
const whiteTex: (Texture | undefined)[] = []

/**
 * Pushes simulation state onto the pools' quads each rendered frame:
 * interpolation (prev -> current by alpha), rotate-to-face, procedural
 * squash/wobble (so one still illustration reads as a living creature), and
 * hit-flash via the white silhouette. Pure presentation, no simulation here.
 * Quads are plain fields drawn by ParticleContainers, so nothing here goes
 * through a Pixi setter or the scene-graph transform update.
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
  const frozen = world.freezeT > 0
  const frenzy = world.director.frenzy > 0
  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    const q = e.quad
    q.x = lerp(e.prevX, e.x, alpha)
    q.y = lerp(e.prevY, e.y, alpha)
    q.rotation = lerpAngle(e.prevFacing, e.facing, alpha)
    if (e.submerged && !e.def.boss) {
      // A faint burrow mound while underground (intangible).
      q.scaleX = q.scaleY = e.def.scale * 0.6
      q.alpha = 0.28
      q.color = packColor(0x2a1d10, 0.28)
      continue
    }
    // Emerge: fade/scale in over the first beat after spawn so enemies never
    // pop into existence. That matters on huge viewports where the fixed spawn ring
    // can sit in view, and for splitter offspring / queen broods which spawn
    // mid-screen by design. Pure presentation (reads sim time, mutates nothing).
    // A boss is untargetable for its whole BOSS_EMERGE, so it fades in over that.
    const emerge = Math.min(1, Math.max(0, (t - e.bornAt) / (e.def.boss ? BOSS_EMERGE : ENEMY_EMERGE)))
    const idx = e.def.idx
    let base0 = baseTex[idx]
    if (!base0) {
      base0 = baseTex[idx] = world.texReg.getTexture(e.def.sprite)
      whiteTex[idx] = world.texReg.getTexture(e.def.sprite + WHITE)
    }
    const hit = e.flash > 0
    q.texture = hit ? whiteTex[idx]! : base0
    const base = e.def.scale * (e.buffed > 0 ? 1.08 : 1) * (0.55 + 0.45 * emerge) * (hit ? HIT_PULSE : 1)
    // FREEZE skips the AI step of every non-boss enemy, so a charger's windup
    // or dash waits for the thaw: it holds its pose, with no flicker or wobble.
    const iced = frozen && !e.def.boss
    const wob = iced ? 0 : Math.sin(t * 14 + e.animPhase)
    let tint: number
    if (hit) {
      q.scaleX = q.scaleY = base
      tint = 0xffffff
    } else if (e.phase === 1) {
      // Charger windup telegraph: coil (squash along the locked heading, sprite
      // rotation IS the heading) + a fast white flicker. Read-only cosmetics.
      q.scaleX = base * 0.78
      q.scaleY = base * 1.22
      tint = iced ? ICE_TINT : Math.sin(t * 42) > 0 ? 0xffffff : e.tint
    } else if (e.phase === 2) {
      // Dash: stretch along the line.
      q.scaleX = base * 1.35
      q.scaleY = base * 0.72
      tint = iced ? ICE_TINT : e.tint
    } else {
      q.scaleX = base * (1 + wob * 0.1)
      q.scaleY = base * (1 - wob * 0.1)
      tint =
        e.slow > 0 || iced
          ? ICE_TINT
          : e.def.boss && frenzy
            ? lerpHex(e.tint, FRENZY_TINT, 0.3 + 0.25 * Math.sin(t * 8))
            : e.tint
    }
    q.alpha = emerge
    q.color = packColor(tint, emerge)
  }
}

function renderProjectiles(world: World, alpha: number): void {
  const projs = world.projectiles.active
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i]!
    const q = p.quad
    q.x = lerp(p.prevX, p.x, alpha)
    q.y = lerp(p.prevY, p.y, alpha)
    q.rotation = p.facing
    q.paint()
  }
}

function renderEnemyShots(world: World, alpha: number, t: number): void {
  const eps = world.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    const q = p.quad
    q.x = lerp(p.prevX, p.x, alpha)
    q.y = lerp(p.prevY, p.y, alpha)
    q.rotation = p.facing
    // gentle pulse on the acid glob
    q.scaleX = q.scaleY = 1 + Math.sin(t * 12 + p.facing) * 0.12
    q.paint()
  }
}

/** Particles go to the layer of their blend, refilled in pool order each frame. */
function renderParticles(world: World, alpha: number): void {
  const normal = world.particleQuads
  const add = world.particleAddQuads
  normal.begin()
  add.begin()
  const parts = world.particles.active
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    const tex = p.tex!
    const q = p.additive ? add.next(tex) : normal.next(tex)
    q.texture = tex
    q.x = lerp(p.prevX, p.x, alpha)
    q.y = lerp(p.prevY, p.y, alpha)
    q.rotation = p.rotation
    q.scaleX = q.scaleY = p.size
    q.color = packColor(p.tint, p.life / p.maxLife)
  }
  normal.end()
  add.end()
}

function renderPickups(world: World, alpha: number, t: number): void {
  const pickups = world.pickups.active
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i]!
    const q = p.quad
    const x = lerp(p.prevX, p.x, alpha)
    let y = lerp(p.prevY, p.y, alpha)
    let rot: number
    let scale: number
    let a = p.life < 1.5 ? p.life / 1.5 : 1
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
    } else if (p.kind === 'shard') {
      rot = Math.sin(t * 2.5) * 0.25
      scale = 1 + Math.sin(t * 6) * 0.1
      y += Math.sin(t * 3) * 3
    } else if (p.kind === 'core') {
      rot = t * 0.8
      scale = 1 + Math.sin(t * 3.5) * 0.08
    } else if (p.kind === 'bonus') {
      rot = t * 1.5
      scale = 1 + Math.sin(t * 7) * 0.12
      a = p.life < BONUS.blinkLast && Math.sin(t * 25) < 0 ? 0.3 : 1
    } else {
      // A pod swells while the player holds it (hold-to-take fill) and blinks
      // through its last PODS.blinkLast seconds.
      rot = Math.sin(t * 2 + p.phase) * 0.15
      scale = (1 + Math.sin(t * 5 + p.phase) * 0.12) * (1 + 0.2 * p.hold)
      a = p.life < PODS.blinkLast && Math.floor(t * POD_BLINK_HZ * 2) % 2 === 1 ? POD_BLINK_ALPHA : 1
    }
    q.rotation = rot
    q.scaleX = q.scaleY = scale
    q.x = x
    q.y = y
    q.alpha = a
    q.paint()
  }
}

function renderAcid(world: World, t: number): void {
  const acid = world.acid.active
  for (let i = 0; i < acid.length; i++) {
    const ap = acid[i]!
    const k = ap.life / ap.maxLife
    const q = ap.quad
    q.alpha = (0.26 + 0.22 * k) * (0.9 + Math.sin(t * 7 + ap.x) * 0.1)
    q.paint()
  }
}

const POD_RING_SEGS = 16
/** The hold ring sits this far outside the pod body (world units). */
const POD_RING_PAD = 12

/**
 * Hold-to-take rings (A5.1): while the player stands on a pod, a segmented
 * ring around it fills with the hold. One per pod slot (PICKUP_RESERVE.weapon).
 */
export class PodRings {
  readonly view = new Container()
  private readonly rings: SegRing[] = []

  constructor() {
    for (let i = 0; i < PICKUP_RESERVE.weapon; i++) {
      const r = new SegRing(POD_RING_SEGS, 30, 4, 6)
      r.view.visible = false
      this.rings.push(r)
      this.view.addChild(r.view)
    }
  }

  update(world: World, alpha: number): void {
    let n = 0
    const ps = world.pickups.active
    for (let i = 0; i < ps.length && n < this.rings.length; i++) {
      const p = ps[i]!
      if (!p.alive || p.kind !== 'weapon' || p.hold <= 0) continue
      const ring = this.rings[n++]!
      ring.view.visible = true
      ring.view.position.set(lerp(p.prevX, p.x, alpha), lerp(p.prevY, p.y, alpha))
      ring.view.scale.set((p.radius + POD_RING_PAD) / 30)
      ring.fill(p.hold * POD_RING_SEGS, WEAPONS[p.weaponId]!.tint, 1, 0.18)
    }
    for (let i = n; i < this.rings.length; i++) this.rings[i]!.view.visible = false
  }
}
