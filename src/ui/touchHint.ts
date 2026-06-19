import { Container, Graphics, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'

/**
 * First-run touch onboarding. New players (especially the "I thought it was
 * stationary, I just aimed and shot" case) need to be told the LEFT side moves
 * and the RIGHT side aims + fires. Two animated stick guides + labels make it
 * obvious; each side fades out the moment the player actually uses it, so it
 * never gets in the way once you've got it.
 */
export class TouchHint {
  readonly view = new Container()

  private banner: Text
  private left: Guide
  private right: Guide
  private clock = 0

  constructor() {
    this.banner = new Text({
      text: 'drag to play — left side moves, right side aims & fires',
      style: { fontFamily: MONO, fontSize: 13, fill: COLORS.hudText, align: 'center', dropShadow: { color: 0x000000, blur: 0, distance: 1, angle: Math.PI / 4, alpha: 0.8 } },
    })
    this.banner.anchor.set(0.5)
    this.left = new Guide('MOVE', COLORS.player)
    this.right = new Guide('AIM + FIRE', 0xff9a3c)
    this.view.addChild(this.banner, this.left.view, this.right.view)
    this.view.eventMode = 'none'
  }

  layout(w: number, h: number, insets: Insets): void {
    const cx = insets.left + (w - insets.left - insets.right) / 2
    const bottom = h - insets.bottom
    const y = bottom - (h - insets.top - insets.bottom) * 0.26
    this.left.view.position.set(insets.left + (w - insets.left - insets.right) * 0.24, y)
    this.right.view.position.set(insets.left + (w - insets.left - insets.right) * 0.76, y)
    this.banner.position.set(cx, insets.top + 70)
  }

  /** `moveUsed`/`aimUsed` = whether the player has used that stick this run. */
  update(dt: number, moveUsed: boolean, aimUsed: boolean): void {
    this.clock += dt
    this.left.update(dt, this.clock, moveUsed)
    this.right.update(dt, this.clock, aimUsed)
    const bannerTarget = moveUsed && aimUsed ? 0 : 0.85
    this.banner.alpha += (bannerTarget - this.banner.alpha) * Math.min(1, dt * 4)
  }
}

/** One ghosted stick: a ring, a knob that circles to suggest dragging, a label. */
class Guide {
  readonly view = new Container()
  private knob = new Graphics()
  private label: Text
  private alpha = 1

  constructor(text: string, color: number) {
    const ring = new Graphics()
    ring.circle(0, 0, 56).fill({ color, alpha: 0.08 })
    ring.circle(0, 0, 56).stroke({ width: 3, color, alpha: 0.5 })
    this.knob.circle(0, 0, 24).fill({ color, alpha: 0.4 })
    this.knob.circle(0, 0, 24).stroke({ width: 2.5, color, alpha: 0.9 })
    this.label = new Text({ text, style: { fontFamily: MONO, fontSize: 13, fontWeight: 'bold', fill: color, dropShadow: { color: 0x000000, blur: 0, distance: 1, angle: Math.PI / 4, alpha: 0.8 } } })
    this.label.anchor.set(0.5)
    this.label.position.set(0, 84)
    this.view.addChild(ring, this.knob, this.label)
  }

  update(dt: number, t: number, used: boolean): void {
    this.alpha += ((used ? 0 : 1) - this.alpha) * Math.min(1, dt * 5)
    this.view.alpha = this.alpha
    // Circle the knob to read as "drag me"; a gentle breathing pulse draws the eye.
    this.knob.position.set(Math.cos(t * 2.2) * 22, Math.sin(t * 2.2) * 22)
    this.view.scale.set(1 + Math.sin(t * 3) * 0.05)
  }
}
