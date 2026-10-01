import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { PAD_A, PAD_B, PAD_DOWN, PAD_START, PAD_UP } from '../input/input.ts'
import type { Insets } from '../platform/safeArea.ts'
import { BuildGrid, type BuildTile } from './buildGrid.ts'
import { Button } from './button.ts'
import { makeIcon, setIcon } from './icons.ts'
import { setSeparated } from './textFit.ts'
import { FONT, GUTTER, INK, RADIUS, T, TARGET, TYPE } from './tokens.ts'
import { Ease, Prop, tweens } from './tween.ts'

const COL_MAX_W = 360
const TITLE_PX = 28
/** RESUME counts down 3 2 1, this long each (section 9.4). */
const COUNT_MS = 450
/** QUIT AND SCORE asks again for this long. */
const CONFIRM_MS = 3000
const LANDSCAPE_INFO = 0.55
const TIMELINE_H = 4
const MARK_LABEL_GAP = 8

/** A boss on the run's timeline: `BOSS 4:00`, `PRIME 10:30`. */
export interface PauseMark {
  at: number
  label: string
  prime: boolean
}

export interface PauseInfo {
  /** `HIVE MEADOW · NOVA · T1 · 4:12 · 1,287 KILLS` */
  run: string
  /** A Daily's mark: RANKED or PRACTICE; '' outside the Daily. */
  daily: '' | 'RANKED' | 'PRACTICE'
  marks: readonly PauseMark[]
  /** Run time now and the timeline's span, in seconds. */
  now: number
  span: number
  build: readonly BuildTile[]
}

/**
 * The pause sheet (section 9.4): the run line, a labeled timeline, the build,
 * and RESUME, SETTINGS and QUIT AND SCORE. RESUME counts down 3 2 1; QUIT asks
 * again inline for 3 s. Landscape splits it into an info column (55%) and a
 * button column.
 */
export class PauseSheet {
  readonly view = new Container()
  onResume: () => void = () => {}
  onSettings: () => void = () => {}
  onQuit: () => void = () => {}
  /** One countdown beat: 3, 2 or 1. */
  onCount: (n: number) => void = () => {}
  /** The countdown finished: the run goes on. */
  onCountdownDone: () => void = () => {}

  private readonly scrim = new Graphics()
  private readonly content = new Container()
  private readonly title: Text
  private readonly dailyChip = new Container()
  private readonly dailyBg = new Graphics()
  private readonly dailyText: Text
  private readonly runLine: Text
  private readonly timeline = new Graphics()
  private readonly markLabels: Text[] = []
  private readonly markIcons = [makeIcon('diamond', 12), makeIcon('diamond', 12), makeIcon('diamond', 12)]
  private readonly grid = new BuildGrid(32, 8, 3)
  private readonly gridLabel: Text
  private resume: Button
  private settings: Button
  private quit: Button
  private readonly count: Text
  private info: PauseInfo | null = null
  private open_ = false
  private countAt = -1
  private confirmUntil = 0
  private focus = 0
  private pad = false
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.title = new Text({ text: 'PAUSED', style: { fontFamily: FONT.display, fontWeight: '900', fontSize: TITLE_PX, fill: T.textHi, letterSpacing: 3 } })
    this.title.anchor.set(0.5, 0)
    this.dailyText = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, fill: INK, letterSpacing: 1 } })
    this.dailyText.anchor.set(0.5)
    this.dailyChip.addChild(this.dailyBg, this.dailyText)
    this.runLine = new Text({
      text: '',
      style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 13, lineHeight: 18, fill: T.textPrimary, align: 'center', wordWrap: true },
    })
    this.runLine.anchor.set(0.5, 0)
    for (let i = 0; i < 3; i++) {
      const t = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, fill: T.textMuted } })
      t.anchor.set(0.5, 0)
      this.markLabels.push(t)
    }
    this.gridLabel = new Text({ text: 'BUILD', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, fill: T.textMuted, letterSpacing: 1 } })
    this.gridLabel.anchor.set(0, 0)
    this.resume = new Button('RESUME', 300, TARGET.primary, 'primary', 18)
    this.settings = new Button('SETTINGS', 300, TARGET.secondary, 'secondary', 15)
    this.quit = new Button('QUIT AND SCORE', 300, TARGET.secondary, 'danger', 15)
    this.resume.onClick = () => this.startCountdown()
    this.settings.onClick = () => this.open_ && this.onSettings()
    this.quit.onClick = () => this.pressQuit()
    this.count = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '900', fontSize: 64, fill: T.textHi, stroke: { color: INK, width: 8, join: 'round' } } })
    this.count.anchor.set(0.5)
    this.count.visible = false
    this.count.eventMode = 'none'
    this.scrim.eventMode = 'static'
    this.content.addChild(
      this.title, this.dailyChip, this.runLine, this.timeline, ...this.markIcons, ...this.markLabels, this.gridLabel, this.grid.view,
      this.resume.view, this.settings.view, this.quit.view,
    )
    this.view.addChild(this.scrim, this.content, this.count)
    this.view.visible = false
  }

  /** The sheet is up (its buttons take input). */
  isOpen(): boolean {
    return this.open_
  }

  /** The sheet or its countdown is on screen (the sim stays paused). */
  isShown(): boolean {
    return this.view.visible
  }

  counting(): boolean {
    return this.countAt >= 0
  }

  show(info: PauseInfo, pad: boolean): void {
    this.info = info
    this.open_ = true
    this.countAt = -1
    this.confirmUntil = 0
    this.pad = pad
    this.focus = 0
    this.quit.setText('QUIT AND SCORE')
    this.view.visible = true
    this.content.visible = true
    this.scrim.visible = true
    this.count.visible = false
    this.content.alpha = 0
    tweens.to(this.content, Prop.Alpha, 1, 160, Ease.OutCubic)
    this.relayout()
  }

  /** Back from SETTINGS: the same sheet again. */
  reshow(): void {
    if (!this.info) return
    this.show(this.info, this.pad)
  }

  /** Leave at once (the run ended, or SETTINGS covers the sheet). */
  hide(): void {
    this.view.visible = false
    this.open_ = false
    this.countAt = -1
  }

  /** RESUME, Esc, P, back, B or Start: the countdown begins. */
  startCountdown(): void {
    if (!this.open_) return
    this.open_ = false
    this.content.visible = false
    this.scrim.visible = false
    this.countAt = performance.now()
    this.beat(3)
    this.onResume()
  }

  /** Real clock: the countdown and the QUIT confirm window. */
  update(nowMs: number): void {
    if (this.confirmUntil > 0 && nowMs >= this.confirmUntil) {
      this.confirmUntil = 0
      this.quit.setText('QUIT AND SCORE')
    }
    if (this.countAt < 0) return
    const n = 3 - Math.floor((nowMs - this.countAt) / COUNT_MS)
    if (n <= 0) {
      this.hide()
      this.onCountdownDone()
    } else if (String(n) !== this.count.text) {
      this.beat(n)
    }
  }

  /** Pad: up and down move the focus, A presses it, B and Start resume. */
  padPress(bits: number): void {
    if (!this.open_ || bits === 0) return
    this.pad = true
    if (bits & PAD_UP) this.focus = (this.focus + 2) % 3
    if (bits & PAD_DOWN) this.focus = (this.focus + 1) % 3
    this.drawFocus()
    if (bits & PAD_A) [this.resume, this.settings, this.quit][this.focus]!.activate()
    else if (bits & (PAD_B | PAD_START)) this.startCountdown()
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (this.view.visible) this.relayout()
  }

  private pressQuit(): void {
    if (!this.open_) return
    if (this.confirmUntil > 0) {
      this.confirmUntil = 0
      this.onQuit()
      return
    }
    this.confirmUntil = performance.now() + CONFIRM_MS
    this.quit.setText(this.pad ? 'PRESS A AGAIN TO END RUN' : 'TAP AGAIN TO END RUN')
  }

  private beat(n: number): void {
    this.count.text = String(n)
    this.count.visible = true
    this.count.scale.set(1.4)
    this.count.alpha = 1
    tweens.to(this.count, Prop.Scale, 1, 180, Ease.OutBack)
    this.onCount(n)
  }

  private drawFocus(): void {
    const b = [this.resume, this.settings, this.quit]
    for (let i = 0; i < 3; i++) b[i]!.setFocused(this.pad && i === this.focus)
  }

  private relayout(): void {
    const { w, h, insets } = this
    const info = this.info
    this.scrim.clear()
    this.scrim.rect(0, 0, w, h).fill({ color: T.scrim, alpha: T.scrimAlpha })
    this.scrim.hitArea = new Rectangle(0, 0, w, h)
    const availW = w - insets.left - insets.right
    const availH = h - insets.top - insets.bottom
    this.count.position.set(insets.left + availW / 2, insets.top + availH * 0.42)
    if (!info) return
    const landscape = w > h
    const infoW = landscape ? Math.min(COL_MAX_W, (availW - GUTTER * 3) * LANDSCAPE_INFO) : Math.min(COL_MAX_W, availW - GUTTER * 2)
    const btnW = landscape ? Math.min(300, (availW - GUTTER * 3) * (1 - LANDSCAPE_INFO)) : infoW
    this.ensureButtons(btnW)

    // The info column, measured top-down from 0.
    let y = 0
    this.title.position.set(infoW / 2, y)
    y += this.title.height + 8
    this.dailyChip.visible = info.daily !== ''
    this.dailyChip.position.set(infoW / 2, y + 10)
    if (info.daily) {
      this.dailyText.text = info.daily
      const cw = Math.ceil(this.dailyText.width) + 16
      this.dailyBg.clear()
      this.dailyBg.roundRect(-cw / 2, -10, cw, 20, RADIUS.chip).fill(info.daily === 'RANKED' ? T.accentGold : T.textMuted)
      y += 28
    }
    setSeparated(this.runLine, info.run, infoW)
    this.runLine.position.set(infoW / 2, y)
    y += this.runLine.height + 18
    y = this.layoutTimeline(info, infoW, y) + 18
    this.grid.set(info.build, infoW)
    this.gridLabel.visible = info.build.length > 0
    if (info.build.length > 0) {
      this.gridLabel.position.set((infoW - this.grid.width) / 2, y)
      y += 18
      this.grid.view.position.set((infoW - this.grid.width) / 2, y)
      y += this.grid.height
    }
    const infoH = y

    const btnH = TARGET.primary + 10 + TARGET.secondary + 10 + TARGET.secondary
    if (landscape) {
      const total = infoW + GUTTER * 2 + btnW
      const x0 = insets.left + (availW - total) / 2
      const iy = insets.top + Math.max(GUTTER, (availH - infoH) / 2)
      this.placeInfo(x0, iy)
      const bx = x0 + infoW + GUTTER * 2
      this.placeButtons(bx, insets.top + Math.max(GUTTER, (availH - btnH) / 2))
    } else {
      const total = infoH + 28 + btnH
      const x0 = insets.left + (availW - infoW) / 2
      const top = insets.top + Math.max(GUTTER, (availH - total) / 2)
      this.placeInfo(x0, top)
      this.placeButtons(x0 + (infoW - btnW) / 2, top + infoH + 28)
    }
    this.drawFocus()
  }

  /** Children of `content` were laid out from (0, 0); move the info block. */
  private placeInfo(x: number, y: number): void {
    for (const c of [this.title, this.dailyChip, this.runLine, this.timeline, ...this.markIcons, ...this.markLabels, this.gridLabel, this.grid.view]) {
      c.x += x
      c.y += y
    }
  }

  private placeButtons(x: number, y: number): void {
    this.resume.position(x, y)
    y += TARGET.primary + 10
    this.settings.position(x, y)
    y += TARGET.secondary + 10
    this.quit.position(x, y)
  }

  private builtW = 0
  private ensureButtons(bw: number): void {
    if (this.builtW === bw) return
    this.builtW = bw
    // Buttons are fixed-width: rebuild them for a new column width.
    const old = [this.resume, this.settings, this.quit]
    const made = [
      new Button('RESUME', bw, TARGET.primary, 'primary', 18),
      new Button('SETTINGS', bw, TARGET.secondary, 'secondary', 15),
      new Button(this.quit.view.visible && this.confirmUntil > 0 ? 'TAP AGAIN TO END RUN' : 'QUIT AND SCORE', bw, TARGET.secondary, 'danger', 15),
    ]
    made[0]!.onClick = () => this.startCountdown()
    made[1]!.onClick = () => this.open_ && this.onSettings()
    made[2]!.onClick = () => this.pressQuit()
    for (let i = 0; i < 3; i++) {
      const at = this.content.getChildIndex(old[i]!.view)
      this.content.removeChildAt(at)
      old[i]!.view.destroy({ children: true })
      this.content.addChildAt(made[i]!.view, at)
    }
    ;[this.resume, this.settings, this.quit] = made as [Button, Button, Button]
  }

  /** The bar with a tick per boss and its label under it, and a now cursor. */
  private layoutTimeline(info: PauseInfo, width: number, y: number): number {
    const g = this.timeline
    g.clear()
    g.position.set(0, 0)
    g.roundRect(0, y, width, TIMELINE_H, 2).fill(T.lineFaint)
    const frac = Math.max(0, Math.min(1, info.now / info.span))
    g.roundRect(0, y, Math.max(2, width * frac), TIMELINE_H, 2).fill(T.accentPlayer)
    g.rect(width * frac - 1, y - 6, 2, TIMELINE_H + 12).fill(T.textHi)
    let lastRight = -Infinity
    for (let i = 0; i < this.markLabels.length; i++) {
      const m = info.marks[i]
      const lbl = this.markLabels[i]!
      const icon = this.markIcons[i]!
      lbl.visible = icon.visible = !!m
      if (!m) continue
      const x = width * Math.max(0, Math.min(1, m.at / info.span))
      setIcon(icon, m.prime ? 'flag' : 'diamond', m.prime ? 14 : 12)
      icon.tint = m.prime ? T.accentGold : T.bossFill
      icon.position.set(x, y + TIMELINE_H / 2)
      lbl.text = m.label
      lbl.style.fill = m.prime ? T.accentGold : T.bossText
      // Keep the labels inside the column and apart from each other.
      const half = lbl.width / 2
      let lx = Math.max(half, Math.min(width - half, x))
      if (lx - half < lastRight + MARK_LABEL_GAP) lx = lastRight + MARK_LABEL_GAP + half
      lbl.position.set(lx, y + 12)
      lastRight = lx + half
    }
    return y + 12 + TYPE.label + 6
  }
}
