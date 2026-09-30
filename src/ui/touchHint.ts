import { Container, Graphics, Text } from 'pixi.js'
import { COLORS, DASH_BTN } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'
import { FONT, INK } from './tokens.ts'

/** Portrait rest points: this far above the safe bottom, or higher when the
 *  guide's label (LABEL_DY below it) would reach the weapon pill. */
const PORTRAIT_REST_UP = 124
const LABEL_DY = 84
/** Section 9.2: the banner wraps at min(W - 32, this). */
const BANNER_WRAP = 340
const LABEL_CLEAR = 16
const GUIDE_R = 56
const GUIDE_STROKE = 3
const GUIDE_PULSE = 0.05
/** A guide ring's outer stroke edge at its largest pulse. */
const GUIDE_OUTER = (GUIDE_R + GUIDE_STROKE / 2) * (1 + GUIDE_PULSE)
/** Center distances that keep 8 px between drawn edges: aim guide to the DASH
 *  button (its 2 px ring stroke reaches visualD / 2 + 1), and guide to guide. */
const DASH_CLEAR = GUIDE_OUTER + DASH_BTN.visualD / 2 + 1 + 8
const GUIDE_CLEAR = GUIDE_OUTER * 2 + 8

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
      text: 'LEFT THUMB MOVES · RIGHT THUMB AIMS AND FIRES',
      style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 13, fill: COLORS.hudText, align: 'center', wordWrap: true, stroke: { color: INK, width: 4, join: 'round' } },
    })
    this.banner.anchor.set(0.5)
    this.left = new Guide('MOVE', COLORS.player)
    this.right = new Guide('AIM + FIRE', 0xff9a3c)
    this.view.addChild(this.banner, this.left.view, this.right.view)
    this.view.eventMode = 'none'
  }

  /** `dashX, dashY` = the DASH button center from TouchControls.layoutDash;
   *  `pillTop` = the HUD weapon pill's top; `bannerY` = where the banner line sits. */
  layout(w: number, h: number, insets: Insets, dashX: number, dashY: number, pillTop: number, bannerY: number): void {
    const availW = w - insets.left - insets.right
    const cx = insets.left + availW / 2
    const bottom = h - insets.bottom
    // The guides mark the thumbs' rest points. In portrait the DASH button sits
    // 200 px above the bottom on the right, so the rest points sit lower. The
    // aim guide moves left of the button as far as the clearance needs.
    const portrait = h > w
    const y = Math.min(portrait ? bottom - PORTRAIT_REST_UP : bottom - (h - insets.top - insets.bottom) * 0.26, pillTop - LABEL_DY - LABEL_CLEAR)
    const dy = dashY - y
    const minDx = Math.sqrt(Math.max(0, DASH_CLEAR * DASH_CLEAR - dy * dy))
    const rightX = Math.min(insets.left + availW * (portrait ? 0.7 : 0.76), dashX - minDx)
    this.left.view.position.set(Math.min(insets.left + availW * 0.24, rightX - GUIDE_CLEAR), y)
    this.right.view.position.set(rightX, y)
    this.banner.style.wordWrapWidth = Math.min(availW - 32, BANNER_WRAP)
    this.banner.position.set(cx, bannerY)
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
    ring.circle(0, 0, GUIDE_R).fill({ color, alpha: 0.08 })
    ring.circle(0, 0, GUIDE_R).stroke({ width: GUIDE_STROKE, color, alpha: 0.5 })
    this.knob.circle(0, 0, 24).fill({ color, alpha: 0.4 })
    this.knob.circle(0, 0, 24).stroke({ width: 2.5, color, alpha: 0.9 })
    this.label = new Text({ text, style: { fontFamily: FONT.mono, fontSize: 13, fontWeight: '800', fill: color, stroke: { color: INK, width: 4, join: 'round' } } })
    this.label.anchor.set(0.5)
    this.label.position.set(0, LABEL_DY)
    this.view.addChild(ring, this.knob, this.label)
  }

  update(dt: number, t: number, used: boolean): void {
    this.alpha += ((used ? 0 : 1) - this.alpha) * Math.min(1, dt * 5)
    this.view.alpha = this.alpha
    // Circle the knob to read as "drag me"; a gentle breathing pulse draws the eye.
    this.knob.position.set(Math.cos(t * 2.2) * 22, Math.sin(t * 2.2) * 22)
    this.view.scale.set(1 + Math.sin(t * 3) * GUIDE_PULSE)
  }
}
