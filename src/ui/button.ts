import { Container, FederatedPointerEvent, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS } from '../config.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'

/** Reusable rounded button with hover state. Positioned by top-left corner. */
export class Button {
  readonly view = new Container()
  onClick: () => void = () => {}
  enabled = true

  private bg = new Graphics()
  private label: Text

  constructor(
    text: string,
    private w: number,
    private h: number,
    private accent: number = COLORS.xpBar,
    fontSize = 18,
  ) {
    this.label = new Text({ text, style: { fontFamily: MONO, fontSize, fontWeight: 'bold', fill: 0xffffff } })
    this.label.anchor.set(0.5)
    this.view.addChild(this.bg, this.label)
    this.view.eventMode = 'static'
    this.view.cursor = 'pointer'
    this.view.hitArea = new Rectangle(0, 0, w, h)
    this.view.on('pointertap', () => {
      if (this.enabled) this.onClick()
    })
    this.view.on('pointerover', () => this.draw(true))
    this.view.on('pointerout', () => this.draw(false))
    this.draw(false)
  }

  setText(t: string): void {
    this.label.text = t
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.draw(false)
  }

  position(x: number, y: number): void {
    this.view.position.set(x, y)
  }

  private draw(hover: boolean): void {
    const a = this.enabled ? (hover ? 0.28 : 0.15) : 0.05
    this.bg.clear()
    this.bg.roundRect(0, 0, this.w, this.h, 10).fill({ color: this.accent, alpha: a })
    this.bg.roundRect(0, 0, this.w, this.h, 10).stroke({ width: 2, color: this.accent, alpha: this.enabled ? (hover ? 1 : 0.6) : 0.25 })
    this.label.position.set(this.w / 2, this.h / 2)
    this.label.alpha = this.enabled ? 1 : 0.4
  }
}

/** Horizontal slider, value in [0,1]. Drag the track or click to set. */
export class Slider {
  readonly view = new Container()
  onChange: (v: number) => void = () => {}
  value = 0

  private track = new Graphics()
  private fill = new Graphics()
  private knob = new Graphics()
  private dragging = false

  constructor(
    private w: number,
    private accent: number = COLORS.xpBar,
  ) {
    this.view.addChild(this.track, this.fill, this.knob)
    this.view.eventMode = 'static'
    this.view.cursor = 'pointer'
    this.view.hitArea = { contains: (x: number, y: number) => x >= -10 && x <= w + 10 && y >= -14 && y <= 14 }
    this.view.on('pointerdown', (e: FederatedPointerEvent) => {
      this.dragging = true
      this.setFromEvent(e)
    })
    this.view.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (this.dragging) this.setFromEvent(e)
    })
    this.view.on('pointerup', () => (this.dragging = false))
    this.view.on('pointerupoutside', () => (this.dragging = false))
  }

  set(v: number): void {
    this.value = Math.max(0, Math.min(1, v))
    this.draw()
  }

  private setFromEvent(e: FederatedPointerEvent): void {
    const local = e.getLocalPosition(this.view)
    this.set(local.x / this.w)
    this.onChange(this.value)
  }

  private draw(): void {
    const x = this.value * this.w
    this.track.clear()
    this.track.roundRect(0, -3, this.w, 6, 3).fill({ color: 0x1d2c44, alpha: 0.9 })
    this.fill.clear()
    this.fill.roundRect(0, -3, x, 6, 3).fill(this.accent)
    this.knob.clear()
    this.knob.circle(x, 0, 9).fill(this.accent)
    this.knob.circle(x, 0, 9).stroke({ width: 2, color: 0x05070d })
  }
}
