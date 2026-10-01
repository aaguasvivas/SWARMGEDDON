import { Container, type Sprite } from 'pixi.js'
import { FIXED_DT, MAX_HAZARDS } from '../config.ts'
import { lerpHex } from '../core/color.ts'
import { ENEMIES } from '../content/enemies.ts'
import { HZ_CIRCLE, HZ_END_SPAWN, HZ_LANE, HZ_SWEEP } from '../game/hazard.ts'
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
/** Section 6.5: a hazard flashes white for this long when it detonates. */
const DETONATE_FLASH_S = 0.08
/** An event's arrival markers (BLINK STORM) wear the event alert color (A15), not the boss's. */
const EVENT_MARKER_TINT = 0xff5a6e
/** Charger windup lanes (section 6.5): pooled decals, pulsing at LANE_HZ. */
const CHARGER_LANES = 6
const LANE_HZ = 8
const LANE_ALPHA0 = 0.22
const LANE_ALPHA1 = 0.5

/**
 * Draws the sim's hazards and the boss cage (world space, on the floor under
 * the swarm). Reads sim state only; nothing here reaches the sim.
 */
export class HazardRenderer {
  readonly view = new Container()
  private readonly sprites: Sprite[] = []
  private readonly lines: Sprite[] = []
  private readonly lanes: Sprite[] = []
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
    for (let i = 0; i < CHARGER_LANES; i++) {
      const s = texReg.makeSprite('hzLane')
      this.lanes.push(s)
      this.view.addChild(s)
    }
    this.cage = texReg.makeSprite('hzCage')
    this.view.addChild(this.cage)
  }

  update(world: World, alpha: number): void {
    const bossTint = world.broodTint(ENEMIES[world.script.boss.midId]!.tint)
    const markTint = lerpHex(bossTint, 0xffffff, MARKER_LIGHTEN)
    const eventMarkTint = lerpHex(EVENT_MARKER_TINT, 0xffffff, MARKER_LIGHTEN)
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
      const flash = h.tele <= 0 && h.damage > 0 && h.liveMax - h.live < DETONATE_FLASH_S
      setTint(s, flash ? 0xffffff : h.damage > 0 ? DANGER_TINT : h.onEnd === HZ_END_SPAWN && !h.boss ? eventMarkTint : markTint)
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

    // A charger in windup shows the lane its dash will sweep: 2r wide, as
    // long as the dash, in the world's hazard tint.
    // Under FREEZE the dash waits for the thaw, so the lane holds dim and still.
    const t = world.time + alpha * FIXED_DT
    const pulse = world.freezeT > 0 ? LANE_ALPHA0 : LANE_ALPHA0 + (LANE_ALPHA1 - LANE_ALPHA0) * (0.5 + 0.5 * Math.sin(t * LANE_HZ * Math.PI * 2))
    const laneTint = world.arenaTheme.hazardTint
    let nc = 0
    const es = world.enemies.active
    for (let i = 0; i < es.length && nc < CHARGER_LANES; i++) {
      const e = es[i]!
      const c = e.def.charge
      if (!e.alive || e.phase !== 1 || !c) continue
      const lane = this.lanes[nc++]!
      lane.visible = true
      lane.position.set(e.quad.x, e.quad.y)
      lane.rotation = e.phaseDir
      lane.scale.set((c.dashSpeed * c.dashTime) / HZ_TEX.laneLen, e.radius / HZ_TEX.laneHalf)
      setTint(lane, laneTint)
      lane.alpha = pulse
    }
    for (let i = nc; i < CHARGER_LANES; i++) this.lanes[i]!.visible = false

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
