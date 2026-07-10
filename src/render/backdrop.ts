import { Sprite, Texture, type BLEND_MODES } from 'pixi.js'
import { Rng, seedFromString } from '../core/rng.ts'
import type { ArenaTheme } from '../content/arenas.ts'
import type { Layers } from './app.ts'
import type { PostFX } from './postfx.ts'
import type { Vignette } from './vignette.ts'

/**
 * Per-world atmosphere: the ANIMATED and SCREEN-SPACE half of a world's identity
 * (the static world-space structure lives in `Arena`). It owns:
 *   - a fixed pool of world-space ambient MOTES (spores rise / marine-snow falls
 *     / embers rise + ash falls), recycled within the camera window,
 *   - a small set of screen-space ATMOSPHERE sprites (breathing blooms / god-rays
 *     / ember haze), children of the bloomed `scene`,
 *   - the per-world color GRADE (via PostFX) and tinted VIGNETTE.
 *
 * Every texture is baked ONCE at construction (generic white shapes) and merely
 * tinted / repositioned / re-counted per world — nothing re-bakes on `setTheme`,
 * so there is no VRAM churn or teardown to get wrong. All motion is driven by a
 * render clock with zero per-frame allocation (pools mutated in place).
 */

const MAX_MOTES = 128
const MAX_GLOWS = 12 // breathing ground-glows parked on the arena's glowSpots
const MARGIN = 80 // world-unit offscreen band for recycling
const RAND_LEN = 512
const BLOB = 32 // baked mote/bloom base size in px
const RAMP_H = 128

interface Mote {
  sprite: Sprite
  x: number
  y: number
  vy: number // world-units/sec (negative = rising)
  size: number
  baseA: number
  ph: number
  sway: number // horizontal sway frequency
  amp: number // horizontal sway amplitude (units/sec)
}

interface Atm {
  sprite: Sprite
  role: 0 | 1 | 2 // 0 bloom, 1 ray, 2 haze
  fx: number // base x as a fraction of the viewport
  fy: number // base y as a fraction of the viewport (blooms)
  ph: number
  baseA: number
  swayAmp: number // px
  px: number // resolved base x (set in layout)
}

interface GroundGlow {
  sprite: Sprite
  ph: number
  baseA: number
  baseS: number
}

export class BackdropSystem {
  private readonly motes: Mote[] = []
  private readonly atm: Atm[] = []
  private readonly glows: GroundGlow[] = []
  private readonly rand = new Float32Array(RAND_LEN)
  private ri = 0
  private readonly blobTex: Texture
  private readonly bloomTex: Texture
  private readonly rampUp: Texture // opaque top -> clear bottom (god-rays)
  private readonly rampDown: Texture // clear top -> opaque bottom (ember haze)

  private themeId = ''
  private moteCount = 0
  private seeded = false
  private qual = 1 // quality multiplier (Glow tier); scales motes + atmosphere
  private viewW = 0
  private viewH = 0

  constructor(
    private readonly layers: Layers,
    private readonly postFX: PostFX,
    private readonly vignette: Vignette,
  ) {
    this.blobTex = bakeBlob(BLOB, 0.5)
    this.bloomTex = bakeBlob(BLOB, 0.12) // softer, wider falloff for glows
    this.rampUp = bakeRamp(true)
    this.rampDown = bakeRamp(false)

    const rng = new Rng(seedFromString('swarmgeddon:backdrop'))
    for (let i = 0; i < RAND_LEN; i++) this.rand[i] = rng.float()

    // Ground glows FIRST so they draw beneath the drifting motes.
    for (let i = 0; i < MAX_GLOWS; i++) {
      const s = new Sprite(this.bloomTex)
      s.anchor.set(0.5)
      s.blendMode = 'add'
      s.visible = false
      this.layers.backdrop.addChild(s)
      this.glows.push({ sprite: s, ph: 0, baseA: 0.1, baseS: 1 })
    }
    for (let i = 0; i < MAX_MOTES; i++) {
      const s = new Sprite(this.blobTex)
      s.anchor.set(0.5)
      s.visible = false
      this.layers.backdrop.addChild(s)
      this.motes.push({ sprite: s, x: 0, y: 0, vy: 0, size: 1, baseA: 0.3, ph: 0, sway: 0.5, amp: 5 })
    }
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(this.bloomTex)
      s.anchor.set(0.5)
      s.blendMode = 'add'
      s.visible = false
      this.layers.atmosphere.addChild(s)
      this.atm.push({ sprite: s, role: 0, fx: 0.5, fy: 0.5, ph: 0, baseA: 0.1, swayAmp: 0, px: 0 })
    }
  }

  /** Glow tier -> quality multiplier. 0 (off) => a lean fallback for weak phones. */
  setQuality(glow: number): void {
    this.qual = glow <= 0.02 ? 0.5 : 1
  }

  /** Reconfigure for a world (tints/counts/positions only — no re-bake).
   *  `glowSpots` are the arena's deterministic anchor points for the breathing
   *  ground-glows (pod clusters / magma hotspots); pass `arena.glowSpots`. */
  setTheme(theme: ArenaTheme, glowSpots: readonly { x: number; y: number }[] = []): void {
    if (theme.id === this.themeId) return
    this.themeId = theme.id
    this.postFX.setGrade(theme.grade)
    this.vignette.setTheme(theme.vignette.color, theme.vignette.strength)
    this.configMotes(theme)
    this.configAtmosphere(theme)
    this.configGlows(theme, glowSpots)
    this.layout(this.viewW, this.viewH)
  }

  /** Breathing ground-glows on the arena's glowSpots (membrane pods / molten
   *  seams). Tinted with the world's atmosphere color; static positions, only
   *  alpha + a slight swell animate. Worlds with no spots (depths) show none. */
  private configGlows(theme: ArenaTheme, spots: readonly { x: number; y: number }[]): void {
    const n = Math.min(MAX_GLOWS, spots.length)
    for (let i = 0; i < MAX_GLOWS; i++) {
      const gl = this.glows[i]!
      if (i >= n) {
        gl.sprite.visible = false
        continue
      }
      const r0 = this.rand[(i * 5 + 2) % RAND_LEN]!
      gl.sprite.visible = true
      gl.sprite.tint = theme.atmosphere.color
      gl.sprite.position.set(spots[i]!.x, spots[i]!.y)
      gl.ph = r0 * 6.2832
      gl.baseA = (0.09 + r0 * 0.05) * this.qual
      gl.baseS = ((110 + r0 * 60) * 2) / BLOB
      gl.sprite.scale.set(gl.baseS)
    }
  }

  private configMotes(theme: ArenaTheme): void {
    const kind = theme.motes.kind
    const total = Math.min(MAX_MOTES, Math.round(theme.motes.count * this.qual))
    this.moteCount = total
    for (let i = 0; i < MAX_MOTES; i++) {
      const mo = this.motes[i]!
      const s = mo.sprite
      if (i >= total) {
        s.visible = false
        continue
      }
      s.visible = true
      const r0 = this.rand[(i * 3) % RAND_LEN]!
      const r1 = this.rand[(i * 3 + 1) % RAND_LEN]!
      const r2 = this.rand[(i * 3 + 2) % RAND_LEN]!
      let tint: number
      let blend: BLEND_MODES
      if (kind === 'spores') {
        mo.vy = -(8 + r0 * 18)
        mo.size = 1 + r1 * 1.6
        mo.baseA = 0.15 + r2 * 0.35
        mo.sway = 0.4 + r0 * 0.7
        mo.amp = 4 + r1 * 6
        tint = i % 6 ? 0x6cff5a : 0xb6ffcf
        blend = 'add'
      } else if (kind === 'marineSnow') {
        mo.vy = 12 + r0 * 20
        mo.size = 1 + r1 * 2
        mo.baseA = 0.15 + r2 * 0.35
        mo.sway = 0.3 + r0 * 0.5
        mo.amp = 3 + r1 * 4
        tint = i % 4 ? 0xd8e4ff : 0x8a5cff
        blend = i < 6 ? 'add' : 'normal' // most diffuse so bloom doesn't blow it out
      } else {
        // emberAsh — first ~60% rise as embers (additive), rest fall as ash.
        if (i < total * 0.6) {
          mo.vy = -(14 + r0 * 20)
          mo.size = 1 + r1 * 1.4
          mo.baseA = 0.2 + r2 * 0.35
          mo.sway = 0.5 + r0 * 0.7
          mo.amp = 4 + r1 * 5
          tint = i % 3 ? 0xff965a : 0xffd27a
          blend = 'add'
        } else {
          mo.vy = 8 + r0 * 12
          mo.size = 1 + r1
          mo.baseA = 0.25 + r2 * 0.2
          mo.sway = 0.4 + r0 * 0.5
          mo.amp = 3 + r1 * 3
          tint = 0x60504a
          blend = 'normal'
        }
      }
      mo.ph = r0 * 6.2832
      s.tint = tint
      s.blendMode = blend
      s.scale.set((mo.size * 2) / BLOB)
    }
    this.seeded = false // reseed positions across the camera window on next update
  }

  private configAtmosphere(theme: ArenaTheme): void {
    for (const a of this.atm) a.sprite.visible = false
    const at = theme.atmosphere
    if (at.kind === 'none') return
    const alpha = at.alpha * this.qual
    if (at.kind === 'breathingBlooms') {
      this.setupAtm(0, { role: 0, tex: this.bloomTex, tint: at.color, fx: 0.28, fy: 0.3, a: alpha, ph: 0, sway: 0 })
      this.setupAtm(1, { role: 0, tex: this.bloomTex, tint: at.color2, fx: 0.74, fy: 0.72, a: alpha, ph: 2.1, sway: 0 })
      this.setupAtm(2, { role: 0, tex: this.bloomTex, tint: at.color, fx: 0.52, fy: 0.5, a: alpha * 0.8, ph: 4, sway: 0 })
    } else if (at.kind === 'godRays') {
      this.setupAtm(0, { role: 1, tex: this.rampUp, tint: at.color, fx: 0.3, a: alpha, ph: 0, sway: 14 })
      this.setupAtm(1, { role: 1, tex: this.rampUp, tint: at.color, fx: 0.58, a: alpha * 0.9, ph: 1.7, sway: 11 })
      this.setupAtm(2, { role: 1, tex: this.rampUp, tint: at.color2, fx: 0.84, a: alpha, ph: 3.4, sway: 16 })
    } else {
      // emberHaze — one broad glow along the bottom edge.
      this.setupAtm(0, { role: 2, tex: this.rampDown, tint: at.color, fx: 0.5, a: alpha, ph: 0, sway: 0 })
    }
  }

  private setupAtm(
    i: number,
    o: { role: 0 | 1 | 2; tex: Texture; tint: number; fx: number; fy?: number; a: number; ph: number; sway: number },
  ): void {
    const a = this.atm[i]!
    a.sprite.visible = true
    a.sprite.texture = o.tex
    a.sprite.tint = o.tint
    a.role = o.role
    a.fx = o.fx
    a.fy = o.fy ?? 0.5
    a.baseA = o.a
    a.ph = o.ph
    a.swayAmp = o.sway
    // anchors per role: bloom centered, ray hangs from the top, haze sits on the floor
    if (o.role === 0) a.sprite.anchor.set(0.5)
    else if (o.role === 1) a.sprite.anchor.set(0.5, 0)
    else a.sprite.anchor.set(0.5, 1)
  }

  /** Resolve screen-space atmosphere geometry to the viewport. */
  layout(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
    if (w === 0 || h === 0) return
    for (const a of this.atm) {
      if (!a.sprite.visible) continue
      a.px = a.fx * w
      const s = a.sprite
      if (a.role === 0) {
        s.position.set(a.px, a.fy * h)
        s.scale.set((h * 1.1) / BLOB)
      } else if (a.role === 1) {
        s.position.set(a.px, -h * 0.05)
        s.width = w * 0.16
        s.height = h * 1.15
        s.rotation = (a.fx - 0.5) * 0.25
      } else {
        s.position.set(w / 2, h)
        s.width = w * 1.2
        s.height = h * 0.55
      }
    }
  }

  /** Advance motes + atmosphere. Called AFTER the camera is written this frame. */
  update(clock: number, fd: number, camX: number, camY: number, viewW: number, viewH: number): void {
    const left = camX - MARGIN
    const right = camX + viewW + MARGIN
    const top = camY - MARGIN
    const bottom = camY + viewH + MARGIN

    if (!this.seeded && viewW > 0) {
      for (let i = 0; i < this.moteCount; i++) {
        const mo = this.motes[i]!
        mo.x = left + this.nextRand() * (right - left)
        mo.y = top + this.nextRand() * (bottom - top)
      }
      this.seeded = true
    }

    for (let i = 0; i < this.moteCount; i++) {
      const mo = this.motes[i]!
      mo.x += Math.sin(clock * mo.sway + mo.ph) * mo.amp * fd
      mo.y += mo.vy * fd
      if (mo.vy < 0) {
        if (mo.y < top) {
          mo.y = bottom
          mo.x = left + this.nextRand() * (right - left)
        }
      } else if (mo.y > bottom) {
        mo.y = top
        mo.x = left + this.nextRand() * (right - left)
      }
      if (mo.x < left) mo.x = right
      else if (mo.x > right) mo.x = left
      const s = mo.sprite
      s.position.set(mo.x, mo.y)
      s.alpha = mo.baseA * (0.6 + 0.4 * Math.sin(clock * 2 + mo.ph))
    }

    for (let i = 0; i < this.glows.length; i++) {
      const gl = this.glows[i]!
      if (!gl.sprite.visible) continue
      const k = 0.55 + 0.45 * Math.sin(clock * 0.7 + gl.ph)
      gl.sprite.alpha = gl.baseA * k
      gl.sprite.scale.set(gl.baseS * (0.94 + 0.08 * k))
    }

    for (let i = 0; i < this.atm.length; i++) {
      const a = this.atm[i]!
      if (!a.sprite.visible) continue
      if (a.role === 0) {
        a.sprite.alpha = a.baseA * (0.5 + 0.5 * Math.sin(clock * 0.45 + a.ph))
      } else if (a.role === 1) {
        a.sprite.x = a.px + Math.sin(clock * 0.15 + a.ph) * a.swayAmp
        a.sprite.alpha = a.baseA * (0.7 + 0.3 * Math.sin(clock * 0.4 + a.ph))
      } else {
        a.sprite.alpha = a.baseA * (0.7 + 0.3 * Math.sin(clock * 1.3 + a.ph))
      }
    }
  }

  private nextRand(): number {
    this.ri = (this.ri + 1) % RAND_LEN
    return this.rand[this.ri]!
  }
}

/** Soft round white blob; `mid` sets the falloff knee (lower = softer/wider). */
function bakeBlob(size: number, mid: number): Texture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(mid, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return Texture.from(c)
}

/** Vertical white ramp. `topBright` -> opaque top (god-rays); else opaque bottom. */
function bakeRamp(topBright: boolean): Texture {
  const w = 16
  const c = document.createElement('canvas')
  c.width = w
  c.height = RAMP_H
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, RAMP_H)
  if (topBright) {
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  } else {
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,1)')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, RAMP_H)
  return Texture.from(c)
}
