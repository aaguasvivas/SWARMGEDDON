import { Container, Graphics } from 'pixi.js'
import { haptic } from '../platform/haptics.ts'
import { hitRect } from './button.ts'
import { makeIcon, type IconName } from './icons.ts'
import { MOTION, RADIUS, T, TARGET } from './tokens.ts'
import { Ease, Prop, tweens } from './tween.ts'

/** A square icon-only button (carousel arrows, close): the secondary button
 *  look, a 44 visual and a hit area 6 px past it. Positioned by its top-left. */
export class IconButton {
  readonly view = new Container()
  onClick: () => void = () => {}
  private readonly face = new Container()
  private readonly bg = new Graphics()

  constructor(icon: IconName, readonly size: number = TARGET.compact, iconSize = 22) {
    const s = size
    this.face.pivot.set(s / 2, s / 2)
    this.face.position.set(s / 2, s / 2)
    const ic = makeIcon(icon, iconSize, T.textHi)
    ic.position.set(s / 2, s / 2)
    this.face.addChild(this.bg, ic)
    this.view.addChild(this.face)
    this.view.eventMode = 'static'
    this.view.cursor = 'pointer'
    this.view.hitArea = hitRect(s, s)
    this.view.on('pointertap', () => this.onClick())
    this.view.on('pointerdown', () => {
      haptic('light')
      tweens.to(this.face, Prop.Scale, MOTION.pressScale, MOTION.pressInMs, Ease.OutCubic)
    })
    const release = (): void => tweens.to(this.face, Prop.Scale, 1, MOTION.pressOutMs, Ease.OutCubic)
    this.view.on('pointerup', release)
    this.view.on('pointerupoutside', release)
    this.view.on('pointerout', release)
    this.bg.roundRect(0, 0, s, s, RADIUS.button).fill({ color: T.secondaryFill, alpha: T.secondaryAlpha })
    this.bg.roundRect(1, 1, s - 2, s - 2, RADIUS.button - 1).stroke({ width: 2, color: T.lineStrong })
  }

  position(x: number, y: number): void {
    this.view.position.set(x, y)
  }
}
