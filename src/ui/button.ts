import { CanvasSource, Container, FederatedPointerEvent, Graphics, NineSliceSprite, Rectangle, Text, Texture } from 'pixi.js'
import { haptic } from '../platform/haptics.ts'
import { FONT, INK, MOTION, RADIUS, T, TARGET, TYPE } from './tokens.ts'
import { Ease, Prop, tweens } from './tween.ts'

/** Hit rect for a `w x h` visual: TARGET.pad past every edge and at least
 *  TARGET.compact on each axis. */
export function hitRect(w: number, h: number): Rectangle {
  const hw = Math.max(w + TARGET.pad * 2, TARGET.compact)
  const hh = Math.max(h + TARGET.pad * 2, TARGET.compact)
  return new Rectangle((w - hw) / 2, (h - hh) / 2, hw, hh)
}

function label(text: string, size: number, fill: number): Text {
  const t = new Text({ text, style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: size, fill } })
  t.anchor.set(0.5)
  return t
}

/** Shrink `t` to fit `maxW`, never below the 12 px label floor. */
function fit(t: Text, size: number, maxW: number): void {
  t.scale.set(1)
  const w = t.width
  if (w > maxW) t.scale.set(Math.max(TYPE.label / size, maxW / w))
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

/**
 * Rounded button (section 9.1). primary: accent fill with INK text; secondary:
 * a faint fill and a line.strong border; danger: danger fill with INK text;
 * ghost: text only. Pressing scales the face to 0.96. Positioned by its
 * top-left corner.
 */
export class Button {
  readonly view = new Container()
  onClick: () => void = () => {}
  enabled = true
  private readonly face = new Container()
  private readonly bg = new Graphics()
  private readonly text: Text
  private readonly focusRing = new Graphics()

  constructor(
    text: string,
    private readonly w: number,
    private readonly h: number,
    private readonly variant: ButtonVariant = 'secondary',
    private readonly fontSize = 16,
    private readonly color: number = variant === 'danger' ? T.accentDanger : T.accentPlayer,
  ) {
    const ink = variant === 'primary' || variant === 'danger' ? INK : variant === 'ghost' ? T.textPrimary : T.textHi
    this.text = label(text, fontSize, ink)
    this.face.pivot.set(w / 2, h / 2)
    this.face.position.set(w / 2, h / 2)
    this.text.position.set(w / 2, h / 2)
    this.face.addChild(this.bg, this.text)
    this.focusRing.roundRect(-4, -4, w + 8, h + 8, RADIUS.button + 4).stroke({ width: 2, color: T.accentXp })
    this.focusRing.visible = false
    this.view.addChild(this.focusRing, this.face)
    this.view.eventMode = 'static'
    this.view.cursor = 'pointer'
    this.view.hitArea = hitRect(w, h)
    this.view.on('pointertap', () => {
      if (this.enabled) this.onClick()
    })
    this.view.on('pointerdown', () => {
      if (!this.enabled) return
      haptic('light')
      tweens.to(this.face, Prop.Scale, MOTION.pressScale, MOTION.pressInMs, Ease.OutCubic)
    })
    const release = (): void => tweens.to(this.face, Prop.Scale, 1, MOTION.pressOutMs, Ease.OutCubic)
    this.view.on('pointerup', release)
    this.view.on('pointerupoutside', release)
    this.view.on('pointerover', () => this.draw(true))
    this.view.on('pointerout', () => {
      release()
      this.draw(false)
    })
    fit(this.text, fontSize, w - 20)
    this.draw(false)
  }

  setText(t: string): void {
    this.text.text = t
    fit(this.text, this.fontSize, this.w - 20)
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.view.cursor = on ? 'pointer' : 'default'
    this.draw(false)
  }

  position(x: number, y: number): void {
    this.view.position.set(x, y)
  }

  /** The pad's focus ring (a gamepad moves focus with the d-pad and presses A). */
  setFocused(on: boolean): void {
    this.focusRing.visible = on
  }

  /** A press from a key or the pad: what a tap does. */
  activate(): void {
    if (this.enabled && this.view.visible) this.onClick()
  }

  private draw(hover: boolean): void {
    const { w, h, variant } = this
    const r = RADIUS.button
    this.bg.clear()
    if (variant === 'primary' || variant === 'danger') {
      this.bg.roundRect(0, 0, w, h, r).fill({ color: this.color, alpha: hover ? 0.88 : 1 })
    } else if (variant === 'secondary') {
      this.bg.roundRect(0, 0, w, h, r).fill({ color: T.secondaryFill, alpha: hover ? 0.26 : T.secondaryAlpha })
      this.bg.roundRect(1, 1, w - 2, h - 2, r - 1).stroke({ width: 2, color: T.lineStrong })
    } else if (hover) {
      this.bg.roundRect(0, 0, w, h, r).fill({ color: T.secondaryFill, alpha: T.secondaryAlpha })
    }
    this.face.alpha = this.enabled ? 1 : 0.4
  }
}

/** On/off switch: a 52 x 28 pill. */
export class Toggle {
  static readonly W = 52
  static readonly H = 28
  readonly view = new Container()
  onChange: (on: boolean) => void = () => {}
  value = false
  private readonly g = new Graphics()

  constructor() {
    this.view.addChild(this.g)
    this.view.eventMode = 'static'
    this.view.cursor = 'pointer'
    this.view.hitArea = hitRect(Toggle.W, Toggle.H)
    this.view.on('pointertap', () => {
      this.set(!this.value)
      this.onChange(this.value)
    })
    this.set(false)
  }

  set(on: boolean): void {
    this.value = on
    const { W, H } = Toggle
    const r = H / 2
    this.g.clear()
    if (on) {
      this.g.roundRect(0, 0, W, H, r).fill(T.accentPlayer)
      this.g.circle(W - r, r, r - 4).fill(INK)
    } else {
      this.g.roundRect(0, 0, W, H, r).fill({ color: T.secondaryFill, alpha: T.secondaryAlpha })
      this.g.roundRect(1, 1, W - 2, H - 2, r - 1).stroke({ width: 2, color: T.lineStrong })
      this.g.circle(r, r, r - 6).fill(T.textMuted)
    }
  }
}

/** A row of mutually exclusive options, 44 high. */
export class Segmented {
  static readonly H = 44
  readonly view = new Container()
  onChange: (index: number) => void = () => {}
  index = 0
  private readonly bg = new Graphics()
  private readonly labels: Text[] = []
  private readonly segW: number

  constructor(options: readonly string[], private readonly w: number, fontSize = 13) {
    this.segW = w / options.length
    this.view.addChild(this.bg)
    options.forEach((o, i) => {
      const t = label(o, fontSize, T.textHi)
      t.position.set(this.segW * (i + 0.5), Segmented.H / 2)
      fit(t, fontSize, this.segW - 12)
      this.labels.push(t)
      this.view.addChild(t)
    })
    this.view.eventMode = 'static'
    this.view.cursor = 'pointer'
    this.view.hitArea = hitRect(w, Segmented.H)
    this.view.on('pointertap', (e: FederatedPointerEvent) => {
      const x = e.getLocalPosition(this.view).x
      const i = Math.max(0, Math.min(this.labels.length - 1, Math.floor(x / this.segW)))
      if (i === this.index) return
      this.set(i)
      this.onChange(i)
    })
    this.set(0)
  }

  set(index: number): void {
    this.index = index
    const { w, segW } = this
    const h = Segmented.H
    const r = RADIUS.button
    this.bg.clear()
    this.bg.roundRect(0, 0, w, h, r).fill({ color: T.secondaryFill, alpha: T.secondaryAlpha })
    this.bg.roundRect(1, 1, w - 2, h - 2, r - 1).stroke({ width: 2, color: T.lineStrong })
    this.bg.roundRect(segW * index + 3, 3, segW - 6, h - 6, r - 3).fill(T.accentPlayer)
    this.labels.forEach((t, i) => (t.style.fill = i === index ? INK : T.textHi))
  }
}

/** Horizontal slider, value in [0,1]. Drag or tap anywhere in its 44 px band. */
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
    private accent: number = T.accentPlayer,
  ) {
    this.view.addChild(this.track, this.fill, this.knob)
    this.view.eventMode = 'static'
    this.view.cursor = 'pointer'
    this.view.hitArea = new Rectangle(-12, -TARGET.compact / 2, w + 24, TARGET.compact)
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
    this.track.roundRect(0, -3, this.w, 6, 3).fill(T.lineFaint)
    this.fill.clear()
    this.fill.roundRect(0, -3, x, 6, 3).fill(this.accent)
    this.knob.clear()
    this.knob.circle(x, 0, 10).fill(this.accent)
    this.knob.circle(x, 0, 10).stroke({ width: 2, color: INK })
  }
}

const plateTextures = new Map<number, Texture>()

/** White rounded-rect nine-slice source for radius `r`, baked once. */
function plateTexture(r: number): Texture {
  let tex = plateTextures.get(r)
  if (tex) return tex
  const res = 3
  const s = (r * 2 + 8) * res
  const k = r * res
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(k, 0)
  ctx.arcTo(s, 0, s, s, k)
  ctx.arcTo(s, s, 0, s, k)
  ctx.arcTo(0, s, 0, 0, k)
  ctx.arcTo(0, 0, s, 0, k)
  ctx.closePath()
  ctx.fill()
  tex = new Texture({ source: new CanvasSource({ resource: c, resolution: res }) })
  plateTextures.set(r, tex)
  return tex
}

/** A tinted rounded panel that resizes without redrawing (HUD plates, bars). */
export class Plate {
  readonly view: NineSliceSprite

  constructor(w: number, h: number, color: number = T.plate, alpha: number = T.plateAlpha, radius: number = RADIUS.plate) {
    this.view = new NineSliceSprite({
      texture: plateTexture(radius),
      leftWidth: radius,
      topHeight: radius,
      rightWidth: radius,
      bottomHeight: radius,
      width: w,
      height: h,
    })
    this.view.tint = color
    this.view.alpha = alpha
  }

  resize(w: number, h: number): void {
    this.view.width = w
    this.view.height = h
  }
}
