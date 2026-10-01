import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import type { Insets } from '../platform/safeArea.ts'
import { Button } from './button.ts'
import { FONT, RADIUS, T, TARGET } from './tokens.ts'

const PAD = 16
const GAP = 8
const MAX_W = 340

/** Taps are ignored this long after the sheet opens. */
const INPUT_LOCK_MS = 300

/**
 * A modal yes/no sheet over any screen: title, body and two buttons. The scrim
 * swallows every tap under it. Enter confirms and Escape backs out.
 */
export class ConfirmSheet {
  readonly view = new Container()
  private readonly scrim = new Graphics()
  private readonly card = new Graphics()
  private readonly title: Text
  private readonly body: Text
  private ok: Button | null = null
  private back: Button | null = null
  private okLabel = ''
  private backLabel = ''
  private danger = false
  private buttonW = 0
  private onOk: (() => void) | null = null
  private readyAt = 0
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.scrim.eventMode = 'static'
    this.title = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '700', fontSize: 18, fill: T.accentGold, letterSpacing: 1 } })
    this.body = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 14, lineHeight: 20, fill: T.textHi, wordWrap: true } })
    this.view.addChild(this.scrim, this.card, this.title, this.body)
    this.view.visible = false
  }

  /** `danger` draws the confirm button in the danger color (a destructive action). */
  open(title: string, body: string, okLabel: string, backLabel: string, onOk: () => void, danger = false): void {
    this.title.text = title
    this.body.text = body
    this.onOk = onOk
    if (okLabel !== this.okLabel || backLabel !== this.backLabel || danger !== this.danger) {
      this.okLabel = okLabel
      this.backLabel = backLabel
      this.danger = danger
      this.buttonW = 0
    }
    this.view.visible = true
    this.readyAt = performance.now() + INPUT_LOCK_MS
    this.relayout()
  }

  close(): void {
    this.view.visible = false
    this.onOk = null
  }

  isOpen(): boolean {
    return this.view.visible
  }

  /** Enter confirms, Escape backs out. True when the key was used. */
  pressKey(key: string): boolean {
    if (!this.view.visible) return false
    if (key === 'Enter') this.confirm()
    else if (key === 'Escape') this.cancel()
    else return false
    return true
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (this.view.visible) this.relayout()
  }

  private confirm(): void {
    if (performance.now() < this.readyAt) return
    const f = this.onOk
    this.close()
    f?.()
  }

  private cancel(): void {
    if (performance.now() < this.readyAt) return
    this.close()
  }

  private relayout(): void {
    const { w, h, insets } = this
    this.scrim.clear()
    this.scrim.rect(0, 0, w, h).fill({ color: T.scrim, alpha: T.scrimAlpha })
    this.scrim.hitArea = new Rectangle(0, 0, w, h)
    const cw = Math.min(MAX_W, w - insets.left - insets.right - 32)
    const inner = cw - PAD * 2
    this.title.scale.set(1)
    if (this.title.width > inner) this.title.scale.set(inner / this.title.width)
    this.body.style.wordWrapWidth = inner
    const bw = Math.floor((inner - GAP) / 2)
    if (bw !== this.buttonW) this.buildButtons(bw)
    const ch = PAD + this.title.height + 12 + this.body.height + 16 + TARGET.secondary + PAD
    const x = insets.left + (w - insets.left - insets.right - cw) / 2
    const y = Math.max(insets.top + 16, insets.top + (h - insets.top - insets.bottom - ch) / 2)
    this.card.clear()
    this.card.roundRect(x, y, cw, ch, RADIUS.card).fill(T.surfacePanel).stroke({ width: 1, color: T.lineStrong })
    this.title.position.set(x + PAD, y + PAD)
    this.body.position.set(x + PAD, y + PAD + this.title.height + 12)
    const by = this.body.y + this.body.height + 16
    this.back!.position(x + PAD, by)
    this.ok!.position(x + PAD + bw + GAP, by)
  }

  private buildButtons(bw: number): void {
    this.ok?.view.destroy({ children: true })
    this.back?.view.destroy({ children: true })
    this.buttonW = bw
    this.ok = new Button(this.okLabel, bw, TARGET.secondary, this.danger ? 'danger' : 'primary', 16)
    this.back = new Button(this.backLabel, bw, TARGET.secondary, 'secondary', 16)
    this.ok.onClick = () => this.confirm()
    this.back.onClick = () => this.cancel()
    this.view.addChild(this.back.view, this.ok.view)
  }
}
