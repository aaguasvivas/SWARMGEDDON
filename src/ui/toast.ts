import { Container, Text } from 'pixi.js'
import type { Insets } from '../platform/safeArea.ts'
import { Plate } from './button.ts'
import { FONT, T } from './tokens.ts'

const PAD_X = 16
const PAD_Y = 10
const MAX_W = 420
const FADE_S = 0.3

/** A column a screen keeps free for the toast: left edge, top and width. */
export interface ToastSlot {
  x: number
  y: number
  w: number
}

/** One short message on the menu, gone after `sec` seconds: at the top of the
 *  screen, or in the menu's slot when the top holds the title. */
export class Toast {
  readonly view = new Container()
  private readonly plate = new Plate(10, 10, T.surfaceRaised, 0.96)
  private readonly label: Text
  private left = 0
  private w = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  private slot: ToastSlot | null = null

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

  hide(): void {
    this.view.visible = false
  }

  layout(w: number, insets: Insets, slot: ToastSlot | null): void {
    this.w = w
    this.insets = insets
    this.slot = slot
    this.place()
  }

  update(fd: number): void {
    if (!this.view.visible) return
    this.left -= fd
    if (this.left <= 0) this.view.visible = false
    else this.view.alpha = Math.min(1, this.left / FADE_S)
  }

  private place(): void {
    const s = this.slot
    const left = Math.max(s ? s.x : 0, this.insets.left + 16)
    const right = s ? s.x + s.w : this.w - this.insets.right - 16
    const room = Math.min(right - left, MAX_W)
    this.label.style.wordWrapWidth = room - PAD_X * 2
    const bw = Math.min(room, this.label.width + PAD_X * 2)
    const bh = this.label.height + PAD_Y * 2
    const cx = (left + right) / 2
    const y = Math.max(s ? s.y : 0, this.insets.top + 8)
    this.plate.resize(bw, bh)
    this.plate.view.position.set(cx - bw / 2, y)
    this.label.position.set(cx, y + PAD_Y)
  }
}
