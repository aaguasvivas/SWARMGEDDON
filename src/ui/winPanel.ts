import { Container, Graphics, Text } from 'pixi.js'
import type { Insets } from '../platform/safeArea.ts'
import { Button } from './button.ts'
import { FONT, GUTTER, T, TARGET, TYPE } from './tokens.ts'

/** Taps are ignored this long after the panel opens (section 9.5). */
const INPUT_LOCK_MS = 450
const BUTTON_W = 311
const TITLE_PX = 28
const BODY_MAX_W = 340
const KEY_HINT = 'Press Enter to extract or O for Overtime'

function fmtClock(sec: number): string {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * The Standard WIN panel, stub version (P16 builds the final one): the win
 * text, the clear time, and two buttons, EXTRACT and OVERTIME.
 */
export class WinPanel {
  readonly view = new Container()
  onExtract: () => void = () => {}
  onOvertime: () => void = () => {}
  private readonly scrim = new Graphics()
  private readonly title: Text
  private readonly sub: Text
  private readonly body: Text
  private readonly keyHint: Text
  private readonly extract: Button
  private readonly overtime: Button
  private readyAt = 0
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.title = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '900', fontSize: TITLE_PX, fill: T.accentGold, letterSpacing: 2 } })
    this.title.anchor.set(0.5, 0)
    this.sub = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: TYPE.body, fill: T.textPrimary, letterSpacing: 1 } })
    this.sub.anchor.set(0.5, 0)
    this.body = new Text({
      text: 'Extract to bank the win, or push into Overtime for more score.',
      style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: TYPE.body, lineHeight: TYPE.bodyLine, fill: T.textHi, align: 'center', wordWrap: true, wordWrapWidth: BODY_MAX_W },
    })
    this.body.anchor.set(0.5, 0)
    this.keyHint = new Text({ text: KEY_HINT, style: { fontFamily: FONT.mono, fontSize: 13, fill: T.textMuted, align: 'center', wordWrap: true, wordWrapWidth: BODY_MAX_W } })
    this.keyHint.anchor.set(0.5, 0)
    this.extract = new Button('EXTRACT', BUTTON_W, TARGET.primary, 'primary', 18)
    this.overtime = new Button('OVERTIME', BUTTON_W, TARGET.secondary, 'secondary', 16)
    this.extract.onClick = () => this.acceptsInput() && this.onExtract()
    this.overtime.onClick = () => this.acceptsInput() && this.onOvertime()
    this.view.addChild(this.scrim, this.title, this.sub, this.body, this.extract.view, this.overtime.view, this.keyHint)
    this.view.visible = false
  }

  acceptsInput(): boolean {
    return performance.now() >= this.readyAt
  }

  /** Keyboard: Enter is EXTRACT and O is OVERTIME, after the same input lock as a tap. */
  pressKey(key: string): void {
    if (!this.acceptsInput()) return
    if (key === 'Enter') this.onExtract()
    else if (key === 'o' || key === 'O') this.onOvertime()
  }

  /** `keys`: the last input was keyboard and mouse, so the key hint shows. */
  show(winText: string, clearSec: number, keys: boolean): void {
    this.title.text = winText
    this.sub.text = `CLEARED IN ${fmtClock(clearSec)}`
    this.keyHint.visible = keys
    this.view.visible = true
    this.readyAt = performance.now() + INPUT_LOCK_MS
    this.relayout()
  }

  hide(): void {
    this.view.visible = false
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    this.relayout()
  }

  private relayout(): void {
    const { w, h, insets } = this
    this.scrim.clear()
    this.scrim.rect(0, 0, w, h).fill({ color: T.scrim, alpha: T.scrimAlpha })
    const availW = w - insets.left - insets.right
    const cx = insets.left + availW / 2
    const colW = Math.min(availW - GUTTER * 2, BUTTON_W)
    this.title.scale.set(1)
    if (this.title.width > colW) this.title.scale.set(Math.max(TYPE.label / TITLE_PX, colW / this.title.width))
    this.body.style.wordWrapWidth = Math.min(availW - GUTTER * 2, BODY_MAX_W)
    this.keyHint.style.wordWrapWidth = this.body.style.wordWrapWidth

    const gapSub = 8
    const gapBody = 16
    const gapButtons = 24
    const gapBetween = 12
    const gapHint = 16
    const hintH = this.keyHint.visible ? gapHint + this.keyHint.height : 0
    const total =
      this.title.height + gapSub + this.sub.height + gapBody + this.body.height + gapButtons + TARGET.primary + gapBetween + TARGET.secondary + hintH
    const top = insets.top + Math.max(GUTTER, (h - insets.top - insets.bottom - total) / 2)
    let y = top
    this.title.position.set(cx, y)
    y += this.title.height + gapSub
    this.sub.position.set(cx, y)
    y += this.sub.height + gapBody
    this.body.position.set(cx, y)
    y += this.body.height + gapButtons
    this.extract.position(cx - BUTTON_W / 2, y)
    y += TARGET.primary + gapBetween
    this.overtime.position(cx - BUTTON_W / 2, y)
    y += TARGET.secondary + gapHint
    this.keyHint.position.set(cx, y)
  }
}
