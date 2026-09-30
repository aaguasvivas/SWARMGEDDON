import { Container, Text } from 'pixi.js'
import type { Insets } from '../platform/safeArea.ts'
import { Plate } from './button.ts'
import { FONT, T } from './tokens.ts'

const PAD_X = 16
const PAD_Y = 10
const MAX_W = 420
const FADE_S = 0.3

/** One short message at the top of the screen, gone after `sec` seconds. */
export class Toast {
  readonly view = new Container()
  private readonly plate = new Plate(10, 10, T.surfaceRaised, 0.96)
  private readonly label: Text
  private left = 0
  private w = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.label = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 14, lineHeight: 20, fill: T.textHi, align: 'center', wordWrap: true } })
    this.label.anchor.set(0.5, 0)
    this.view.addChild(this.plate.view, this.label)
    this.view.visible = false
  }

  show(text: string, sec = 5): void {
    this.label.text = text
    this.left = sec
    this.view.alpha = 1
    this.view.visible = true
    this.place()
  }

  layout(w: number, insets: Insets): void {
    this.w = w
    this.insets = insets
    this.place()
  }

  update(fd: number): void {
    if (!this.view.visible) return
    this.left -= fd
    if (this.left <= 0) this.view.visible = false
    else this.view.alpha = Math.min(1, this.left / FADE_S)
  }

  private place(): void {
    const room = Math.min(this.w - this.insets.left - this.insets.right - 32, MAX_W)
    this.label.style.wordWrapWidth = room - PAD_X * 2
    const bw = Math.min(room, this.label.width + PAD_X * 2)
    const bh = this.label.height + PAD_Y * 2
    const cx = this.insets.left + (this.w - this.insets.left - this.insets.right) / 2
    const y = this.insets.top + 8
    this.plate.resize(bw, bh)
    this.plate.view.position.set(cx - bw / 2, y)
    this.label.position.set(cx, y + PAD_Y)
  }
}
