import { Container, Graphics } from 'pixi.js'
import { COLORS, TOUCH_STICK_RADIUS, TOUCH_STICK_DEADZONE } from '../config.ts'
import { normalizeInto, type Vec2 } from '../core/vec.ts'

const KNOB_RADIUS = 30

/**
 * On-screen dual virtual joysticks for touch. Floating-origin style: each stick
 * spawns wherever the finger first lands within its half of the screen — left
 * half drives movement, right half drives aim (and, from Phase 1, autofire).
 *
 * Multi-touch is tracked by `pointerId` so both thumbs work independently.
 * Outputs are plain vectors read by the InputManager each tick; this class owns
 * only its own rendering.
 */
export class TouchControls {
  readonly view = new Container()

  /** Movement vector, magnitude in [0,1]. */
  readonly move: Vec2 = { x: 0, y: 0 }
  /** Aim unit direction, or (0,0) when the aim stick is within its deadzone. */
  readonly aim: Vec2 = { x: 0, y: 0 }
  /** True while the aim stick is pushed past its deadzone (drives autofire later). */
  aimActive = false

  private moveId = -1
  private aimId = -1
  private moveBaseX = 0
  private moveBaseY = 0
  private aimBaseX = 0
  private aimBaseY = 0

  private moveStick: Container
  private moveKnob: Graphics
  private aimStick: Container
  private aimKnob: Graphics

  constructor() {
    this.moveStick = this.buildStick()
    this.moveKnob = this.moveStick.getChildAt(1) as Graphics
    this.aimStick = this.buildStick()
    this.aimKnob = this.aimStick.getChildAt(1) as Graphics
    this.view.addChild(this.moveStick, this.aimStick)
    this.view.eventMode = 'none' // sticks are drawn-only; input comes from window pointer events
  }

  /** Any thumb currently down. */
  get active(): boolean {
    return this.moveId !== -1 || this.aimId !== -1
  }

  private buildStick(): Container {
    const c = new Container()
    const base = new Graphics()
    base.circle(0, 0, TOUCH_STICK_RADIUS).stroke({ width: 3, color: COLORS.touchStickBase, alpha: 0.9 })
    base.circle(0, 0, TOUCH_STICK_RADIUS).fill({ color: COLORS.touchStickBase, alpha: 0.12 })
    const knob = new Graphics()
    knob.circle(0, 0, KNOB_RADIUS).fill({ color: COLORS.touchStickKnob, alpha: 0.35 })
    knob.circle(0, 0, KNOB_RADIUS).stroke({ width: 2, color: COLORS.touchStickKnob, alpha: 0.8 })
    c.addChild(base, knob)
    c.visible = false
    return c
  }

  onDown(id: number, x: number, y: number, screenW: number): void {
    if (x < screenW / 2) {
      if (this.moveId !== -1) return
      this.moveId = id
      this.moveBaseX = x
      this.moveBaseY = y
      this.moveStick.position.set(x, y)
      this.moveStick.visible = true
      this.moveKnob.position.set(0, 0)
    } else {
      if (this.aimId !== -1) return
      this.aimId = id
      this.aimBaseX = x
      this.aimBaseY = y
      this.aimStick.position.set(x, y)
      this.aimStick.visible = true
      this.aimKnob.position.set(0, 0)
    }
  }

  onMove(id: number, x: number, y: number): void {
    if (id === this.moveId) {
      const { kx, ky } = this.clampKnob(x - this.moveBaseX, y - this.moveBaseY)
      this.moveKnob.position.set(kx, ky)
      let mx = kx / TOUCH_STICK_RADIUS
      let my = ky / TOUCH_STICK_RADIUS
      const m = Math.hypot(mx, my)
      if (m < TOUCH_STICK_DEADZONE) {
        mx = 0
        my = 0
      }
      this.move.x = mx
      this.move.y = my
    } else if (id === this.aimId) {
      const { kx, ky } = this.clampKnob(x - this.aimBaseX, y - this.aimBaseY)
      this.aimKnob.position.set(kx, ky)
      const mag = Math.hypot(kx, ky) / TOUCH_STICK_RADIUS
      if (mag < TOUCH_STICK_DEADZONE) {
        this.aim.x = 0
        this.aim.y = 0
        this.aimActive = false
      } else {
        normalizeInto(kx, ky, this.aim)
        this.aimActive = true
      }
    }
  }

  onUp(id: number): void {
    if (id === this.moveId) {
      this.moveId = -1
      this.moveStick.visible = false
      this.move.x = 0
      this.move.y = 0
    } else if (id === this.aimId) {
      this.aimId = -1
      this.aimStick.visible = false
      this.aim.x = 0
      this.aim.y = 0
      this.aimActive = false
    }
  }

  /** Drop all touches (call on resize / window blur to avoid stuck sticks). */
  reset(): void {
    this.onUp(this.moveId)
    this.onUp(this.aimId)
  }

  /** Clamp a knob offset to the stick's travel radius. */
  private clampKnob(dx: number, dy: number): { kx: number; ky: number } {
    const l = Math.hypot(dx, dy)
    if (l > TOUCH_STICK_RADIUS) {
      const s = TOUCH_STICK_RADIUS / l
      return { kx: dx * s, ky: dy * s }
    }
    return { kx: dx, ky: dy }
  }
}
