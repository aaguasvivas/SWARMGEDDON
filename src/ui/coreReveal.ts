import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { CORES } from '../config.ts'
import { doubleFields } from '../core/fields.ts'
import { findPerk } from '../content/perks.ts'
import { WEAPONS } from '../content/weapons.ts'
import type { Insets } from '../platform/safeArea.ts'
import type { CoreState } from '../systems/cores.ts'
import { Button } from './button.ts'
import { FONT, GUTTER, T, TARGET, TYPE } from './tokens.ts'
import { Ease, Prop, tweens } from './tween.ts'

const TITLE_PX = 28
const BUTTON_W = 300
const ROW_H = 22
const MAX_ROWS = 5
/** Rows land this far apart as the reveal plays. */
const ROW_STAGGER_MS = 110
/** Landscape with a choice: the levels on the left, the buttons on the right. */
const TWO_COL_MAX_H = 480
const COL_GAP = 32

function revealMs(levels: number): number {
  const s = CORES.revealSec
  return 1000 * (levels >= 5 ? s[5] : levels >= 3 ? s[3] : s[1])
}

/**
 * The Hive Core reveal (section 4.6), minimal version (P16 polishes it): the
 * core's levels and where they go, its reroll and banish, and the evolution
 * choice when one is offered. Without a choice it closes by itself after
 * CORES.revealSec, and a tap skips it after CORES.skipAfterSec.
 */
export class CoreReveal {
  readonly view = new Container()
  /** `evolve`: the player took the evolution instead of the levels. */
  onClose: (evolve: boolean) => void = () => {}
  private readonly scrim = new Graphics()
  private readonly title: Text
  private readonly sub: Text
  private readonly rows: Text[] = []
  private readonly extra: Text
  private readonly evolveDesc: Text
  private readonly hint: Text
  private readonly evolveBtn: Button
  private readonly levelsBtn: Button
  private choice = false
  private rowN = 0
  private openAt = 0
  private closeAt = 0
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.title = new Text({ text: 'HIVE CORE', style: { fontFamily: FONT.display, fontWeight: '900', fontSize: TITLE_PX, fill: T.accentGold, letterSpacing: 2 } })
    this.title.anchor.set(0.5)
    this.sub = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: TYPE.displayM, fill: T.textHi, letterSpacing: 1 } })
    this.sub.anchor.set(0.5, 0)
    for (let i = 0; i < MAX_ROWS; i++) {
      const t = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: TYPE.body, fill: T.textPrimary } })
      t.anchor.set(0.5, 0)
      this.rows.push(t)
    }
    this.extra = new Text({ text: '+1 REROLL · +1 BANISH', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 13, fill: T.textMuted } })
    this.extra.anchor.set(0.5, 0)
    this.evolveDesc = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 13, lineHeight: 18, fill: T.textHi, align: 'center', wordWrap: true, wordWrapWidth: BUTTON_W } })
    this.evolveDesc.anchor.set(0.5, 0)
    this.hint = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 13, fill: T.textMuted, align: 'center', wordWrap: true, wordWrapWidth: BUTTON_W } })
    this.hint.anchor.set(0.5, 0)
    this.evolveBtn = new Button('EVOLVE', BUTTON_W, TARGET.primary, 'primary', 17, T.rarityEvolution)
    this.levelsBtn = new Button('TAKE LEVELS', BUTTON_W, TARGET.secondary, 'secondary', 15)
    this.evolveBtn.onClick = () => this.choose(true)
    this.levelsBtn.onClick = () => this.choose(false)
    this.scrim.eventMode = 'static'
    this.scrim.on('pointertap', () => {
      if (!this.choice && this.acceptsInput()) this.onClose(false)
    })
    this.view.addChild(this.scrim, this.title, this.sub, ...this.rows, this.extra, this.evolveDesc, this.evolveBtn.view, this.levelsBtn.view, this.hint)
    this.view.visible = false
    doubleFields(this)
  }

  isOpen(): boolean {
    return this.view.visible
  }

  acceptsInput(): boolean {
    return performance.now() >= this.openAt + CORES.skipAfterSec * 1000
  }

  /** `stacks`: the perk levels owned before this core. `keys`: the last input
   *  was keyboard and mouse, so the key hint shows. */
  show(core: CoreState, stacks: ReadonlyMap<string, number>, keys: boolean): void {
    this.choice = core.evolveTo !== ''
    this.title.text = core.prime ? 'PRIME CORE' : 'HIVE CORE'
    this.sub.text = `+${core.levels} ${core.levels === 1 ? 'LEVEL' : 'LEVELS'}`
    this.fillRows(core, stacks)
    if (this.choice) {
      const from = WEAPONS[core.evolveFrom]!.name.toUpperCase()
      const to = WEAPONS[core.evolveTo]!.name.toUpperCase()
      this.evolveBtn.setText(`EVOLVE: ${to}`)
      this.levelsBtn.setText(`TAKE ${core.levels} ${core.levels === 1 ? 'LEVEL' : 'LEVELS'}`)
      this.evolveDesc.text = `${from} becomes ${to}. Infinite ammo for the rest of the run.`
      this.hint.text = keys ? 'Press 1 to evolve or 2 for the levels' : ''
    } else {
      this.hint.text = keys ? 'Press Enter to continue' : 'Tap to continue'
    }
    this.evolveBtn.view.visible = this.choice
    this.levelsBtn.view.visible = this.choice
    this.evolveDesc.visible = this.choice
    this.hint.visible = this.hint.text !== ''
    this.openAt = performance.now()
    this.closeAt = this.choice ? Infinity : this.openAt + revealMs(core.levels)
    this.view.visible = true
    this.relayout()
    this.title.scale.set(this.title.scale.x * 1.3)
    tweens.to(this.title, Prop.Scale, this.title.scale.x / 1.3, 140, Ease.OutBack)
    for (let i = 0; i < this.rowN; i++) {
      const r = this.rows[i]!
      r.alpha = 0
      tweens.to(r, Prop.Alpha, 1, 160, Ease.OutCubic, 120 + i * ROW_STAGGER_MS)
    }
  }

  hide(): void {
    this.view.visible = false
  }

  /** Real-clock tick: a reveal with no choice closes after CORES.revealSec. */
  update(nowMs: number): void {
    if (this.view.visible && nowMs >= this.closeAt) this.onClose(false)
  }

  /** Keyboard: 1 evolves, 2 takes the levels; with no choice Enter or Space continues. */
  pressKey(key: string): void {
    if (!this.acceptsInput()) return
    if (this.choice) {
      if (key === '1') this.onClose(true)
      else if (key === '2') this.onClose(false)
    } else if (key === 'Enter' || key === ' ') {
      this.onClose(false)
    }
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (this.view.visible) this.relayout()
  }

  private choose(evolve: boolean): void {
    if (this.acceptsInput()) this.onClose(evolve)
  }

  /** One row per perk, in the order the levels went: `HEAVY ROUNDS  LV 2 → 4`. */
  private fillRows(core: CoreState, stacks: ReadonlyMap<string, number>): void {
    let n = 0
    for (let i = 0; i < core.levels; i++) {
      const id = core.ids[i]!
      let seen = false
      for (let k = 0; k < i; k++) if (core.ids[k] === id) seen = true
      if (seen) continue
      let add = 0
      for (let k = i; k < core.levels; k++) if (core.ids[k] === id) add++
      const s = stacks.get(id) ?? 0
      const p = findPerk(id)
      this.rows[n++]!.text = p ? `${p.name.toUpperCase()}  LV ${s} → ${s + add}` : `SHARPEN x${add}`
    }
    this.rowN = n
    for (let i = 0; i < MAX_ROWS; i++) this.rows[i]!.visible = i < n
  }

  private relayout(): void {
    const { w, h, insets } = this
    this.scrim.clear()
    this.scrim.rect(0, 0, w, h).fill({ color: T.scrim, alpha: T.scrimAlpha })
    this.scrim.hitArea = new Rectangle(0, 0, w, h)
    const availW = w - insets.left - insets.right
    const availH = h - insets.top - insets.bottom
    const twoCol = this.choice && availH < TWO_COL_MAX_H && availW >= BUTTON_W * 2 + COL_GAP + GUTTER * 2
    const colW = twoCol ? BUTTON_W : Math.min(availW - GUTTER * 2, BUTTON_W)
    this.title.scale.set(1)
    if (this.title.width > colW) this.title.scale.set(Math.max(TYPE.label / TITLE_PX, colW / this.title.width))
    for (let i = 0; i < this.rowN; i++) {
      const r = this.rows[i]!
      r.scale.set(1)
      if (r.width > colW) r.scale.set(Math.max(TYPE.label / TYPE.body, colW / r.width))
    }
    this.evolveDesc.style.wordWrapWidth = colW
    this.hint.style.wordWrapWidth = colW

    // Column A: the core and its levels.
    const gapSub = 8
    const gapRows = 14
    const gapExtra = 8
    const aH = this.title.height + gapSub + this.sub.height + gapRows + this.rowN * ROW_H + gapExtra + this.extra.height
    // Column B: the choice, or the continue hint.
    const gapDesc = 8
    const gapBtn = 12
    const gapHint = 12
    let bH = 0
    if (this.choice) bH = TARGET.primary + gapDesc + this.evolveDesc.height + gapBtn + TARGET.secondary
    if (this.hint.visible) bH += (bH > 0 ? gapHint : 0) + this.hint.height
    const gapAB = 24
    const top = (colH: number): number => insets.top + Math.max(GUTTER, (availH - colH) / 2)

    let ax = insets.left + availW / 2
    let bx = ax
    const ay = top(twoCol ? aH : aH + gapAB + bH)
    let by = ay + aH + gapAB
    if (twoCol) {
      const left = insets.left + (availW - (BUTTON_W * 2 + COL_GAP)) / 2
      ax = left + BUTTON_W / 2
      bx = left + BUTTON_W + COL_GAP + BUTTON_W / 2
      by = top(bH)
    }
    let y = ay
    this.title.position.set(ax, y + this.title.height / 2)
    y += this.title.height + gapSub
    this.sub.position.set(ax, y)
    y += this.sub.height + gapRows
    for (let i = 0; i < this.rowN; i++) {
      this.rows[i]!.position.set(ax, y)
      y += ROW_H
    }
    y += gapExtra
    this.extra.position.set(ax, y)

    y = by
    if (this.choice) {
      this.evolveBtn.position(bx - BUTTON_W / 2, y)
      y += TARGET.primary + gapDesc
      this.evolveDesc.position.set(bx, y)
      y += this.evolveDesc.height + gapBtn
      this.levelsBtn.position(bx - BUTTON_W / 2, y)
      y += TARGET.secondary + gapHint
    }
    this.hint.position.set(bx, y)
  }
}
