import { Container, type Texture } from 'pixi.js'
import { BONUS, BOSS_EMERGE, ENEMY_EMERGE, FIXED_DT, PICKUP_RESERVE, PODS } from '../config.ts'
import { lerpHex } from '../core/color.ts'
import { lerp, lerpAngle } from '../core/vec.ts'
import { WEAPONS } from '../content/weapons.ts'
import type { World } from '../game/world.ts'
import { SegRing } from './segRing.ts'
import { WHITE } from './textures.ts'

/** Section 6.4: a struck enemy shows its white silhouette at this scale. */
const HIT_PULSE = 1.12
/** A pod in its last PODS.blinkLast seconds blinks at this rate (Hz) and dims to this alpha. */
const POD_BLINK_HZ = 6
const POD_BLINK_ALPHA = 0.3
const FRENZY_TINT = 0xff5a6e
/** Per EnemyDef.idx: the sprite texture and its white silhouette (filled lazily). */
const baseTex: (Texture | undefined)[] = []
const whiteTex: (Texture | undefined)[] = []

/**
 * Pushes simulation state onto Pixi sprites each rendered frame: interpolation
 * (prev -> current by alpha), rotate-to-face, procedural squash/wobble (so one
 * still illustration reads as a living creature), and hit-flash via tint. Pure
 * presentation, no simulation here.
 */
export function renderEntities(world: World, alpha: number): void {
  const t = world.time + alpha * FIXED_DT
  const frozen = world.freezeT > 0

  const enemies = world.enemies.active
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!
    const s = e.sprite
    s.x = lerp(e.prevX, e.x, alpha)
    s.y = lerp(e.prevY, e.y, alpha)
    s.rotation = lerpAngle(e.prevFacing, e.facing, alpha)
    if (e.submerged && !e.def.boss) {
      // A faint burrow mound while underground (intangible).
      s.scale.set(e.def.scale * 0.6)
      s.alpha = 0.28
      s.tint = 0x2a1d10
      continue
    }
    // Emerge: fade/scale in over the first beat after spawn so enemies never
    // pop into existence. That matters on huge viewports where the fixed spawn ring
    // can sit in view, and for splitter offspring / queen broods which spawn
    // mid-screen by design. Pure presentation (reads sim time, mutates nothing).
    // A boss is untargetable for its whole BOSS_EMERGE, so it fades in over that.
    const emerge = Math.min(1, Math.max(0, (t - e.bornAt) / (e.def.boss ? BOSS_EMERGE : ENEMY_EMERGE)))
    s.alpha = emerge
    const idx = e.def.idx
    let base0 = baseTex[idx]
    if (!base0) {
      base0 = baseTex[idx] = world.texReg.getTexture(e.def.sprite)
      whiteTex[idx] = world.texReg.getTexture(e.def.sprite + WHITE)
    }
    const hit = e.flash > 0
    const tex = hit ? whiteTex[idx]! : base0
    if (s.texture !== tex) s.texture = tex
    const base = e.def.scale * (e.buffed > 0 ? 1.08 : 1) * (0.55 + 0.45 * emerge) * (hit ? HIT_PULSE : 1)
    const wob = Math.sin(t * 14 + e.animPhase)
    if (hit) {
      s.scale.set(base)
      s.tint = 0xffffff
    } else if (e.phase === 1) {
      // Charger windup telegraph: coil (squash along the locked heading, sprite
      // rotation IS the heading) + a fast white flicker. Read-only cosmetics.
      s.scale.set(base * 0.78, base * 1.22)
      s.tint = Math.sin(t * 42) > 0 ? 0xffffff : e.tint
    } else if (e.phase === 2) {
      // Dash: stretch along the line.
      s.scale.set(base * 1.35, base * 0.72)
      s.tint = e.tint
    } else {
      s.scale.set(base * (1 + wob * 0.1), base * (1 - wob * 0.1))
      s.tint = e.slow > 0 || (frozen && !e.def.boss) ? 0x7fd8ff : e.def.boss && world.director.frenzy > 0 ? lerpHex(e.tint, FRENZY_TINT, 0.3 + 0.25 * Math.sin(t * 8)) : e.tint
    }
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
    } else if (p.kind === 'bank') {
      // The bank gem grows with the XP it holds (A6).
      const base = Math.min(2.4, 1.2 + 0.25 * Math.log2(1 + p.xp / 20))
      s.rotation = t * 1.6 + p.phase
      s.scale.set(base * (1 + Math.sin(t * 5 + p.phase) * 0.12))
    } else if (p.kind === 'health') {
      // Heartbeat pulse + bob; a gentle sway, no spin (reads as a medkit).
      s.rotation = Math.sin(t * 3 + p.phase) * 0.12
      s.scale.set(1 + Math.sin(t * 5 + p.phase) * 0.16)
      s.y += Math.sin(t * 4 + p.phase) * 3
    } else if (p.kind === 'shard') {
      s.rotation = Math.sin(t * 2.5) * 0.25
      s.scale.set(1 + Math.sin(t * 6) * 0.1)
      s.y += Math.sin(t * 3) * 3
    } else if (p.kind === 'core') {
      s.rotation = t * 0.8
      s.scale.set(1 + Math.sin(t * 3.5) * 0.08)
    } else if (p.kind === 'bonus') {
      s.rotation = t * 1.5
      s.scale.set(1 + Math.sin(t * 7) * 0.12)
      s.alpha = p.life < BONUS.blinkLast && Math.sin(t * 25) < 0 ? 0.3 : 1
      continue
    } else {
      // A pod swells while the player holds it (hold-to-take fill) and blinks
      // through its last PODS.blinkLast seconds.
      s.rotation = Math.sin(t * 2 + p.phase) * 0.15
      s.scale.set((1 + Math.sin(t * 5 + p.phase) * 0.12) * (1 + 0.2 * p.hold))
      s.alpha = p.life < PODS.blinkLast && Math.floor(t * POD_BLINK_HZ * 2) % 2 === 1 ? POD_BLINK_ALPHA : 1
      continue
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
