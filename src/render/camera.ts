import type { Container } from 'pixi.js'
import { clamp } from '../core/vec.ts'

/** A18 camera constants. Render only: nothing here reaches the sim. */
export const CAM = {
  SHORT_TARGET: 560, LONG_MAX_RATIO: 2.2, Z_MIN: 0.5, Z_MAX: 3.0, LOOK_FRAC: 0.14,
  LOOK_RATE: 5, LOOK_RETURN: 3, TOUCH_PORTRAIT_BIAS: 0.06, BOSS_BIAS: 0.2, BOSS_BIAS_MAX_FRAC: 0.25,
  BOSS_ZOOM: 0.92, BOSS_ZOOM_RATE: 1.5,
} as const

/** Transient zoom punches fade at this rate (1/s). */
const PUNCH_DECAY = 8

export interface CameraBounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Normalized-zoom follow camera (section 6.3). Every device sees about the same
 * world area: the short screen side shows SHORT_TARGET units unless the long
 * side would show more than SHORT_TARGET x LONG_MAX_RATIO. The ship is followed
 * hard; only the aim look-ahead eases, and the boss pull and fight zoom blend
 * in and out at BOSS_ZOOM_RATE so a boss arriving or dying never snaps the view.
 *
 * `x, y, w, h` is the visible window in world units (without the punch).
 */
export class Camera {
  x = 0
  y = 0
  w = 1
  h = 1
  zoom = 1
  baseZoom = 1
  reduceMotion = false
  /** Zoom added and held (the death punch), as a fraction. */
  hold = 0
  private screenW = 1
  private screenH = 1
  private lookX = 0
  private lookY = 0
  private fight = 0
  private pullX = 0
  private pullY = 0
  private punch = 0
  private shipX = 0
  private shipY = 0
  private shipSX = 0
  private shipSY = 0

  resize(screenW: number, screenH: number): void {
    this.screenW = Math.max(1, screenW)
    this.screenH = Math.max(1, screenH)
    const short = Math.min(this.screenW, this.screenH)
    const long = Math.max(this.screenW, this.screenH)
    const z = Math.max(short / CAM.SHORT_TARGET, long / (CAM.SHORT_TARGET * CAM.LONG_MAX_RATIO))
    this.baseZoom = z < CAM.Z_MIN ? CAM.Z_MIN : z > CAM.Z_MAX ? CAM.Z_MAX : z
  }

  /** Drop the eased state (run start, menu). */
  reset(): void {
    this.lookX = this.lookY = 0
    this.fight = 0
    this.pullX = this.pullY = 0
    this.punch = 0
    this.hold = 0
  }

  /** Add a transient zoom punch (fraction of the zoom, e.g. 0.04). */
  punchZoom(amount: number): void {
    if (!this.reduceMotion) this.punch += amount
  }

  /**
   * Advance by `fd` real seconds. `aimX, aimY` is the unit aim (0, 0 = none);
   * `boss` is the live boss or null; `touchPortrait` shifts the ship up out of
   * the thumbs.
   */
  update(
    fd: number, shipX: number, shipY: number, aimX: number, aimY: number,
    touchPortrait: boolean, boss: { x: number; y: number } | null, bounds: CameraBounds,
  ): void {
    const lookMax = CAM.LOOK_FRAC * CAM.SHORT_TARGET * (this.reduceMotion ? 0.5 : 1)
    const tx = aimX * lookMax
    const ty = aimY * lookMax
    const k = 1 - Math.exp(-(tx !== 0 || ty !== 0 ? CAM.LOOK_RATE : CAM.LOOK_RETURN) * fd)
    this.lookX += (tx - this.lookX) * k
    this.lookY += (ty - this.lookY) * k

    const step = CAM.BOSS_ZOOM_RATE * fd
    if (boss) {
      const m = CAM.BOSS_BIAS_MAX_FRAC * CAM.SHORT_TARGET
      this.pullX = clamp(CAM.BOSS_BIAS * (boss.x - shipX), -m, m)
      this.pullY = clamp(CAM.BOSS_BIAS * (boss.y - shipY), -m, m)
      this.fight = Math.min(1, this.fight + step)
    } else {
      this.fight = Math.max(0, this.fight - step)
    }
    this.punch *= Math.exp(-PUNCH_DECAY * fd)

    const fightZoom = this.reduceMotion ? 1 : 1 + (CAM.BOSS_ZOOM - 1) * this.fight
    const z = this.baseZoom * fightZoom
    this.w = this.screenW / z
    this.h = this.screenH / z
    let cx = shipX + this.lookX + this.pullX * this.fight
    let cy = shipY + this.lookY + this.pullY * this.fight + (touchPortrait ? CAM.TOUCH_PORTRAIT_BIAS * this.h : 0)
    cx = this.w >= bounds.w ? bounds.x + bounds.w / 2 : clamp(cx, bounds.x + this.w / 2, bounds.x + bounds.w - this.w / 2)
    cy = this.h >= bounds.h ? bounds.y + bounds.h / 2 : clamp(cy, bounds.y + this.h / 2, bounds.y + bounds.h - this.h / 2)
    this.x = cx - this.w / 2
    this.y = cy - this.h / 2

    // Punches zoom about the ship, so it holds its place on screen.
    this.shipX = shipX
    this.shipY = shipY
    this.shipSX = (shipX - this.x) * z
    this.shipSY = (shipY - this.y) * z
    this.zoom = this.reduceMotion ? z : z * (1 + this.punch + this.hold)
  }

  /** Write the transform (plus screen-px shake) onto every world-space layer. */
  apply(layers: readonly Container[], shakeX: number, shakeY: number, rotation: number): void {
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i]!
      l.pivot.set(this.shipX, this.shipY)
      l.position.set(this.shipSX + shakeX, this.shipSY + shakeY)
      l.scale.set(this.zoom)
      l.rotation = rotation
    }
  }

  worldToScreenX(wx: number): number {
    return (wx - this.shipX) * this.zoom + this.shipSX
  }

  worldToScreenY(wy: number): number {
    return (wy - this.shipY) * this.zoom + this.shipSY
  }
}
