import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { PAD_A, PAD_DOWN, PAD_UP, PAD_Y } from '../input/input.ts'
import type { Insets } from '../platform/safeArea.ts'
import { Button } from './button.ts'
import { FONT, GUTTER, INK, RADIUS, T, TARGET, TYPE } from './tokens.ts'
import { Ease, Prop, tweens } from './tween.ts'

/** Taps are ignored this long after the panel opens (section 9.5). */
const INPUT_LOCK_MS = 450
const BUTTON_W = 311
const TITLE_PX = 28
const BODY_MAX_W = 340
const KEY_HINT = 'Press Enter to extract or O for Overtime'
const PAD_HINT = 'Press A to extract or Y for Overtime'
const FLAWLESS = 0x7dffd6

function fmtClock(sec: number): string {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * The Standard WIN panel (section 9.5): the script's win text, the clear time,
 * a FLAWLESS tag when the PRIME fight took no hit, and EXTRACT or OVERTIME. No
 * timer; input counts only from presses that start 450 ms after it opens.
 * Keys: Enter and O. Pad: A and Y, or the d-pad focus and A.
 */
export class WinPanel {
  readonly view = new Container()
  onExtract: () => void = () => {}
  onOvertime: () => void = () => {}
  private readonly scrim = new Graphics()
  private readonly title: Text
  private readonly sub: Text
  private readonly flawless = new Container()
  private readonly flawlessBg = new Graphics()
  private readonly flawlessText: Text
  private readonly body: Text
  private readonly keyHint: Text
  private readonly extract: Button
  private readonly overtime: Button
  private readyAt = 0
  private downAt = 0
  private focus = 0
  private pad = false
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.title = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '900', fontSize: TITLE_PX, fill: T.accentGold, letterSpacing: 2 } })
    this.title.anchor.set(0.5, 0)
    this.sub = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: TYPE.body, fill: T.textPrimary, letterSpacing: 1 } })
    this.sub.anchor.set(0.5, 0)
    this.flawlessText = new Text({ text: 'FLAWLESS', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, fill: INK, letterSpacing: 1 } })
    this.flawlessText.anchor.set(0.5)
    this.flawless.addChild(this.flawlessBg, this.flawlessText)
    const cw = Math.ceil(this.flawlessText.width) + 16
    this.flawlessBg.roundRect(-cw / 2, -10, cw, 20, RADIUS.chip).fill(FLAWLESS)
    this.body = new Text({
      text: 'Extract to bank the win, or push into Overtime for more score.',
      style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: TYPE.body, lineHeight: TYPE.bodyLine, fill: T.textHi, align: 'center', wordWrap: true, wordWrapWidth: BODY_MAX_W },
    })
    this.body.anchor.set(0.5, 0)
    this.keyHint = new Text({ text: KEY_HINT, style: { fontFamily: FONT.mono, fontSize: 13, fill: T.textMuted, align: 'center', wordWrap: true, wordWrapWidth: BODY_MAX_W } })
    this.keyHint.anchor.set(0.5, 0)
    this.extract = new Button('EXTRACT', BUTTON_W, TARGET.primary, 'primary', 18)
    this.overtime = new Button('OVERTIME', BUTTON_W, TARGET.secondary, 'secondary', 16)
    this.extract.onClick = () => this.acceptsPress() && this.onExtract()
    this.overtime.onClick = () => this.acceptsPress() && this.onOvertime()
    const down = (): void => {
      this.downAt = performance.now()
    }
    this.extract.view.on('pointerdown', down)
    this.overtime.view.on('pointerdown', down)
    this.scrim.eventMode = 'static'
    this.view.addChild(this.scrim, this.title, this.sub, this.flawless, this.body, this.extract.view, this.overtime.view, this.keyHint)
    this.view.visible = false
  }

  isOpen(): boolean {
    return this.view.visible
  }

  acceptsInput(): boolean {
    return performance.now() >= this.readyAt
  }

  /** A tap counts only when its press started after the lock. */
  private acceptsPress(): boolean {
    return this.acceptsInput() && this.downAt >= this.readyAt
  }

  /** Keyboard: Enter is EXTRACT and O is OVERTIME, after the same input lock as a tap. */
  pressKey(key: string): void {
    if (!this.acceptsInput()) return
    if (key === 'Enter') this.onExtract()
    else if (key === 'o' || key === 'O') this.onOvertime()
  }

  /** Pad: A presses the focused button (EXTRACT first), Y is OVERTIME, up and down move the focus. */
  padPress(bits: number): void {
    if (!this.view.visible || bits === 0) return
    if (!this.pad) {
      this.pad = true
      this.showHint()
    }
    if (bits & PAD_UP) this.focus = 0
    if (bits & PAD_DOWN) this.focus = 1
    this.drawFocus()
    if (!this.acceptsInput()) return
    if (bits & PAD_A) (this.focus === 0 ? this.onExtract : this.onOvertime)()
    else if (bits & PAD_Y) this.onOvertime()
  }

  /** `input`: the last input type, which picks the key or pad hint. */
  show(winText: string, clearSec: number, flawless: boolean, input: 'kbm' | 'touch' | 'gamepad'): void {
    this.title.text = winText
    this.sub.text = `CLEARED IN ${fmtClock(clearSec)}`
    this.flawless.visible = flawless
    this.pad = input === 'gamepad'
    this.keyHint.visible = input !== 'touch'
    this.showHint()
    this.focus = 0
    this.view.visible = true
    this.view.alpha = 0
    tweens.to(this.view, Prop.Alpha, 1, 220, Ease.OutCubic)
    this.readyAt = performance.now() + INPUT_LOCK_MS
    this.downAt = 0
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

  private showHint(): void {
    this.keyHint.text = this.pad ? PAD_HINT : KEY_HINT
    if (this.pad) this.keyHint.visible = true
    this.drawFocus()
  }

  private drawFocus(): void {
    this.extract.setFocused(this.pad && this.focus === 0)
    this.overtime.setFocused(this.pad && this.focus === 1)
  }

  private relayout(): void {
    const { w, h, insets } = this
    this.scrim.clear()
    this.scrim.rect(0, 0, w, h).fill({ color: T.scrim, alpha: T.scrimAlpha })
    this.scrim.hitArea = new Rectangle(0, 0, w, h)
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
    const tagH = this.flawless.visible ? 20 + 10 : 0
    const hintH = this.keyHint.visible ? gapHint + this.keyHint.height : 0
    const total =
      this.title.height + gapSub + this.sub.height + tagH + gapBody + this.body.height + gapButtons + TARGET.primary + gapBetween + TARGET.secondary + hintH
    const top = insets.top + Math.max(GUTTER, (h - insets.top - insets.bottom - total) / 2)
    let y = top
    this.title.position.set(cx, y)
    y += this.title.height + gapSub
    this.sub.position.set(cx, y)
    y += this.sub.height
    if (this.flawless.visible) {
      this.flawless.position.set(cx, y + 10 + 10)
      y += tagH
    }
    y += gapBody
    this.body.position.set(cx, y)
    y += this.body.height + gapButtons
    // A phone under 343 px wide scales the buttons to the column.
    const k = Math.min(1, colW / BUTTON_W)
    this.extract.view.scale.set(k)
    this.overtime.view.scale.set(k)
    this.extract.position(cx - (BUTTON_W * k) / 2, y)
    y += TARGET.primary * k + gapBetween
    this.overtime.position(cx - (BUTTON_W * k) / 2, y)
    y += TARGET.secondary * k + gapHint
    this.keyHint.position.set(cx, y)
  }
}
