import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import { FAMILIES } from '../content/perks.ts'
import type { Insets } from '../platform/safeArea.ts'
import { canBanish, type CardRarity, type DraftCard, type DraftState } from '../systems/draft.ts'
import { Button } from './button.ts'
import { FONT, T } from './tokens.ts'

interface CardView {
  root: Container
  bg: Graphics
  hover: Graphics
  index: Text
  name: Text
  rarity: Text
  stack: Text
  family: Text
  stat: Text
  tag: Text
  desc: Text
}

const RARITY_COLOR: Readonly<Record<CardRarity, number>> = {
  common: T.rarityCommon,
  rare: T.rarityRare,
  fusion: T.rarityFusion,
  fallback: T.rarityFallback,
}
const CARD_FILL = 0x0e1726
const DESC_FILL = 0xbfeee0
const GAP = 12
const PAD = 12

function text(size: number, fill: number, weight: 'bold' | 'normal' = 'normal'): Text {
  return new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: size, fontWeight: weight, fill, lineHeight: Math.round(size * 1.3) } })
}

/**
 * Level-up draft. Freezes the sim (the caller sets `world.paused`) and shows
 * the open draft's cached `DraftCard`s with REROLL, BANISH and SKIP. Pick by
 * tap or keys 1 to 3; in banish mode a tap banishes that card instead.
 * P16 replaces this with the full card anatomy and ceremony (section 9.3).
 */
export class LevelUpModal {
  readonly view = new Container()
  onPick: (i: number) => void = () => {}
  onBanish: (i: number) => void = () => {}
  onReroll: () => void = () => {}
  onSkip: () => void = () => {}
  /** Whether REROLL can change the cards (draft.ts `canReroll`). */
  canReroll: () => boolean = () => false

  private backdrop = new Graphics()
  private title: Text
  private hint: Text
  private cardLayer = new Container()
  private views: CardView[] = []
  private controls = new Container()
  private rerollBtn: Button | null = null
  private banishBtn: Button | null = null
  private skipBtn: Button | null = null
  private btnW = 0
  private draft: DraftState | null = null
  private banishMode = false
  private touch = false
  private open_ = false
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.title = new Text({
      text: 'LEVEL UP',
      style: { fontFamily: FONT.display, fontSize: 26, fontWeight: '900', fill: COLORS.xpBar },
    })
    this.title.anchor.set(0.5)
    this.hint = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 13, fill: T.textMuted } })
    this.hint.anchor.set(0.5)

    this.backdrop.eventMode = 'static' // swallow clicks behind the modal
    this.view.addChild(this.backdrop, this.title, this.hint, this.cardLayer, this.controls)
    this.view.visible = false
    for (let i = 0; i < 3; i++) this.views.push(this.makeCard(i))
  }

  isOpen(): boolean {
    return this.open_
  }

  setScreen(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (this.open_) this.refresh()
  }

  open(draft: DraftState, touch: boolean): void {
    this.draft = draft
    this.touch = touch
    this.banishMode = false
    this.view.visible = true
    this.open_ = true
    this.refresh()
  }

  close(): void {
    this.view.visible = false
    this.open_ = false
    this.banishMode = false
  }

  /** A card tap or a 1 to 3 key: banish it in banish mode, else pick it. */
  pressCard(i: number): void {
    const d = this.draft
    if (!d || !this.open_ || i >= d.count) return
    if (this.banishMode) {
      if (d.cards[i]!.kind === 'fallback') return
      this.banishMode = false
      this.onBanish(i)
      this.refresh()
    } else {
      this.onPick(i)
    }
  }

  /** REROLL (button or R key). */
  reroll(): void {
    if (!this.draft || !this.open_) return
    this.banishMode = false
    this.onReroll()
    this.refresh()
  }

  toggleBanish(): void {
    const d = this.draft
    if (!d || !canBanish(d)) return
    this.banishMode = !this.banishMode
    this.refresh()
  }

  /** Re-read the draft (after a reroll or banish) and lay it out again. */
  refresh(): void {
    const d = this.draft
    if (!d || !this.open_) return
    for (let i = 0; i < 3; i++) {
      const v = this.views[i]!
      v.root.visible = i < d.count
      if (i < d.count) this.fill(v, d.cards[i]!, i)
    }
    this.relayout()
  }

  private makeCard(i: number): CardView {
    const root = new Container()
    const bg = new Graphics()
    const hover = new Graphics()
    hover.visible = false
    const v: CardView = {
      root,
      bg,
      hover,
      index: text(14, T.textMuted, 'bold'),
      name: text(17, T.textHi, 'bold'),
      rarity: text(12, T.textPrimary, 'bold'),
      stack: text(12, T.textPrimary, 'bold'),
      family: text(12, T.textPrimary, 'bold'),
      stat: text(13, T.textHi),
      tag: text(12, T.accentGold, 'bold'),
      desc: text(13, DESC_FILL),
    }
    root.addChild(bg, hover, v.index, v.name, v.rarity, v.stack, v.family, v.stat, v.tag, v.desc)
    root.eventMode = 'static'
    root.cursor = 'pointer'
    root.on('pointertap', () => this.pressCard(i))
    root.on('pointerover', () => (hover.visible = true))
    root.on('pointerout', () => (hover.visible = false))
    this.cardLayer.addChild(root)
    return v
  }

  private fill(v: CardView, c: DraftCard, i: number): void {
    v.index.text = String(i + 1)
    v.name.text = c.name
    v.rarity.text = c.keystone ? 'KEYSTONE' : c.rarity.toUpperCase()
    v.rarity.style.fill = c.keystone ? T.accentGold : RARITY_COLOR[c.rarity]
    v.stack.text = c.kind === 'fallback' ? '' : c.stacks === 0 ? 'NEW' : `LV ${c.stacks} → ${c.stacks + 1}`
    v.stack.style.fill = c.stacks === 0 ? T.accentGold : T.textPrimary
    const fam = c.family >= 0 ? FAMILIES[c.family]! : null
    v.family.text = fam ? fam.name : ''
    v.family.style.fill = fam ? fam.color : T.textPrimary
    v.stat.text = c.stat
    v.tag.text = c.tagText
    v.desc.text = c.desc
  }

  private buttons(bw: number): void {
    if (this.btnW === bw && this.rerollBtn) return
    this.btnW = bw
    this.controls.removeChildren() // not destroyed: a press tween may still target the old face
    this.rerollBtn = new Button('REROLL', bw, 48, 'secondary', 14)
    this.banishBtn = new Button('BANISH', bw, 48, 'secondary', 14)
    this.skipBtn = new Button('SKIP', bw, 48, 'secondary', 14)
    this.rerollBtn.onClick = () => this.reroll()
    this.banishBtn.onClick = () => this.toggleBanish()
    this.skipBtn.onClick = () => this.onSkip()
    this.controls.addChild(this.rerollBtn.view, this.banishBtn.view, this.skipBtn.view)
  }

  private relayout(): void {
    const d = this.draft
    if (!d) return
    const { w, h, insets } = this
    const availW = w - insets.left - insets.right
    const availH = h - insets.top - insets.bottom
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: T.scrim, alpha: 0.88 })

    const horizontal = w >= 560
    const n = d.count
    const cardW = horizontal ? (Math.min(availW - 32, 760) - GAP * (n - 1)) / n : Math.min(380, availW - 32)
    let cardH = 0
    for (let i = 0; i < n; i++) cardH = Math.max(cardH, this.layoutCard(this.views[i]!, cardW, horizontal))
    const bw = horizontal ? 140 : Math.min(140, Math.floor((cardW - 16) / 3))
    this.buttons(bw)

    const titleH = 34
    const ctrlH = 48
    const hintH = 18
    const cardsH = horizontal ? cardH : cardH * n + GAP * (n - 1)
    const total = titleH + 12 + cardsH + 14 + ctrlH + 10 + hintH
    const y0 = insets.top + Math.max(8, (availH - total) / 2)
    const cx = insets.left + availW / 2

    this.title.position.set(cx, y0 + titleH / 2)
    const cardsY = y0 + titleH + 12
    const startX = horizontal ? cx - (cardW * n + GAP * (n - 1)) / 2 : cx - cardW / 2
    for (let i = 0; i < n; i++) {
      const v = this.views[i]!
      const c = d.cards[i]!
      const x = horizontal ? startX + i * (cardW + GAP) : startX
      const y = horizontal ? cardsY : cardsY + i * (cardH + GAP)
      v.root.position.set(x, y)
      v.root.hitArea = new Rectangle(0, 0, cardW, cardH)
      const banishable = this.banishMode && c.kind !== 'fallback'
      const border = banishable ? T.accentDanger : c.keystone ? T.accentGold : c.rarity === 'common' ? T.lineStrong : RARITY_COLOR[c.rarity]
      v.bg.clear()
      v.bg.roundRect(0, 0, cardW, cardH, 10).fill({ color: CARD_FILL, alpha: 0.97 })
      v.bg.roundRect(0, 0, cardW, cardH, 10).stroke({ width: banishable ? 3 : 2, color: border })
      v.hover.clear()
      v.hover.roundRect(0, 0, cardW, cardH, 10).stroke({ width: 3, color: this.banishMode ? T.accentDanger : COLORS.xpBar })
    }

    const ctrlY = cardsY + cardsH + 14
    const bx = cx - (bw * 3 + 16) / 2
    this.rerollBtn!.setText(`REROLL (${d.rerolls})`)
    this.rerollBtn!.setEnabled(this.canReroll())
    this.banishBtn!.setText(this.banishMode ? 'CANCEL' : `BANISH (${d.banishes})`)
    this.banishBtn!.setEnabled(canBanish(d))
    this.rerollBtn!.position(bx, ctrlY)
    this.banishBtn!.position(bx + bw + 8, ctrlY)
    this.skipBtn!.position(bx + (bw + 8) * 2, ctrlY)

    const act = this.touch ? 'Tap' : 'Click'
    this.hint.text = this.banishMode ? `${act} a card to banish` : this.touch ? 'Tap a card to choose' : 'Click a card or press 1, 2, 3'
    this.hint.style.fill = this.banishMode ? T.accentDanger : T.textMuted
    this.hint.position.set(cx, ctrlY + ctrlH + 10 + hintH / 2)
    this.hint.visible = ctrlY + ctrlH + 10 + hintH <= h - insets.bottom
  }

  /** Place one card's texts for a `cardW` wide card; returns its content height. */
  private layoutCard(v: CardView, cardW: number, vertical: boolean): number {
    const inner = cardW - PAD * 2
    for (const t of [v.name, v.stat, v.tag, v.desc]) {
      t.style.wordWrap = true
      // Portrait: the name shares its row with the index and the rarity label.
      t.style.wordWrapWidth = !vertical && t === v.name ? inner - 22 - v.rarity.width - 8 : inner
      t.style.align = vertical ? 'center' : 'left'
      t.anchor.set(vertical ? 0.5 : 0, 0)
    }
    v.index.position.set(PAD, 10)
    v.rarity.anchor.set(1, 0)
    v.rarity.position.set(cardW - PAD, 12)
    let y: number
    if (vertical) {
      const cx = cardW / 2
      y = 32
      v.name.position.set(cx, y)
      y += v.name.height + 6
      const rowW = v.stack.width + (v.family.text ? 10 + v.family.width : 0)
      v.stack.position.set(cx - rowW / 2, y)
      v.family.position.set(cx - rowW / 2 + v.stack.width + 10, y)
      if (v.stack.text || v.family.text) y += v.stack.height + 6
      v.stat.position.set(cx, y)
    } else {
      v.name.position.set(PAD + 22, 9)
      y = 9 + v.name.height + 4
      v.stack.position.set(PAD, y)
      v.family.position.set(PAD + v.stack.width + (v.stack.text ? 10 : 0), y)
      if (v.stack.text || v.family.text) y += v.stack.height + 4
      v.stat.position.set(PAD, y)
    }
    if (v.stat.text) y += v.stat.height + 4
    v.tag.position.set(vertical ? cardW / 2 : PAD, y)
    if (v.tag.text) y += v.tag.height + 4
    v.desc.position.set(vertical ? cardW / 2 : PAD, y)
    y += v.desc.height
    return Math.ceil(y + PAD)
  }
}
