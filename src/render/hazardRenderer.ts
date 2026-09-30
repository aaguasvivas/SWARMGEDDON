import { Container, type Sprite } from 'pixi.js'
import { FIXED_DT, MAX_HAZARDS } from '../config.ts'
import { lerpHex } from '../core/color.ts'
import { ENEMIES } from '../content/enemies.ts'
import { HZ_CIRCLE, HZ_LANE, HZ_SWEEP } from '../game/hazard.ts'
import type { World } from '../game/world.ts'
import { sweepAngle } from '../systems/hazards.ts'
import { HZ_TEX, setTint, type TextureRegistry } from './textures.ts'

/** Damaging hazards read as danger; markers and boss telegraphs wear the boss color. */
const DANGER_TINT = 0xff5a3c
/** Markers take the boss color this far toward white: a boss color sits close
 *  to its own world's floor and glow hues (violet Depths, ember Wastes). */
const MARKER_LIGHTEN = 0.15
/** Section 6.5: the telegraph fill ramps from TELE_ALPHA0 to TELE_ALPHA1. */
const TELE_ALPHA0 = 0.25
const TELE_ALPHA1 = 0.55
/** A marker (no damage of its own) is pale, so it ramps higher to read,
 *  unless it is wider than MARKER_MAX_R: a cage-wide wash would hide the swarm. */
const MARKER_ALPHA0 = 0.45
const MARKER_ALPHA1 = 0.85
const MARKER_MAX_R = 200
const LIVE_ALPHA = 0.8
const MARKER_LIVE_ALPHA = 0.45
/** A burning sweep dims its sector: only the flame line hurts. While the
 *  sweep warns, its flame line waits on the start edge on the marker ramp. */
const SWEEP_LIVE_ALPHA = 0.2
/** Flame lines drawn at once (one boss sweep is live at a time). */
const MAX_SWEEP_LINES = 4
const CAGE_FORM_SEC = 1.5
const CAGE_ALPHA = 0.9

/**
 * Draws the sim's hazards and the boss cage (world space, on the floor under
 * the swarm). Reads sim state only; nothing here reaches the sim.
 */
export class HazardRenderer {
  readonly view = new Container()
  private readonly sprites: Sprite[] = []
  private readonly lines: Sprite[] = []
  private readonly cage: Sprite

  constructor(private readonly texReg: TextureRegistry) {
    for (let i = 0; i < MAX_HAZARDS; i++) {
      const s = texReg.makeSprite('hzDisc')
      this.sprites.push(s)
      this.view.addChild(s)
    }
    for (let i = 0; i < MAX_SWEEP_LINES; i++) {
      const s = texReg.makeSprite('hzLane')
      s.tint = DANGER_TINT
      s.alpha = LIVE_ALPHA
      this.lines.push(s)
      this.view.addChild(s)
    }
    this.cage = texReg.makeSprite('hzCage')
    this.view.addChild(this.cage)
  }

  update(world: World, alpha: number): void {
    const bossTint = world.broodTint(ENEMIES[world.script.boss.midId]!.tint)
    const markTint = lerpHex(bossTint, 0xffffff, MARKER_LIGHTEN)
    const a = world.hazards.active
    let n = 0
    let nl = 0
    for (let i = 0; i < a.length && n < MAX_HAZARDS; i++) {
      const h = a[i]!
      if (!h.alive) continue
      const s = this.sprites[n++]!
      s.visible = true
      s.position.set(h.x, h.y)
      if (h.shape === HZ_CIRCLE) {
        this.texReg.applySprite(s, 'hzDisc')
        s.rotation = 0
        s.scale.set(h.r / HZ_TEX.discR)
      } else if (h.shape === HZ_LANE) {
        this.texReg.applySprite(s, 'hzLane')
        s.rotation = h.ang
        s.scale.set(h.len / HZ_TEX.laneLen, h.r / HZ_TEX.laneHalf)
      } else {
        this.texReg.applySprite(s, 'hzSector')
        s.rotation = h.ang + h.arc / 2
        s.scale.set(h.len / HZ_TEX.sectorR)
      }
      setTint(s, h.damage > 0 ? DANGER_TINT : markTint)
      const k = h.tele > 0 ? 1 - h.tele / h.teleMax : 1
      if (h.tele > 0) {
        const pale = h.damage === 0 && !(h.shape === HZ_CIRCLE && h.r > MARKER_MAX_R)
        s.alpha = pale ? MARKER_ALPHA0 + (MARKER_ALPHA1 - MARKER_ALPHA0) * k : TELE_ALPHA0 + (TELE_ALPHA1 - TELE_ALPHA0) * k
      } else if (h.shape === HZ_SWEEP) s.alpha = SWEEP_LIVE_ALPHA
      else s.alpha = h.damage > 0 ? LIVE_ALPHA : MARKER_LIVE_ALPHA
      if (h.shape === HZ_SWEEP && nl < MAX_SWEEP_LINES) {
        const line = this.lines[nl++]!
        line.visible = true
        line.position.set(h.x, h.y)
        line.rotation = sweepAngle(h)
        line.scale.set(h.len / HZ_TEX.laneLen, h.r / HZ_TEX.laneHalf)
        line.alpha = h.tele > 0 ? MARKER_ALPHA0 + (MARKER_ALPHA1 - MARKER_ALPHA0) * k : LIVE_ALPHA
      }
    }
    for (let i = n; i < MAX_HAZARDS; i++) this.sprites[i]!.visible = false
    for (let i = nl; i < MAX_SWEEP_LINES; i++) this.lines[i]!.visible = false

    const c = world.director.cage
    const ring = this.cage
    ring.visible = c.active
    if (c.active) {
      // The ring forms with a scale-in, easing out, over CAGE_FORM_SEC.
      const k = Math.min(1, (world.time + alpha * FIXED_DT - c.formingFrom) / CAGE_FORM_SEC)
      const form = 1 - (1 - k) * (1 - k) * (1 - k)
      ring.position.set(c.x, c.y)
      ring.scale.set((c.r / HZ_TEX.cageR) * (0.6 + 0.4 * form))
      ring.alpha = CAGE_ALPHA * form
      setTint(ring, bossTint)
    }
  }
}
