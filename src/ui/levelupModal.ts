import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js'
import { FAMILIES } from '../content/perks.ts'
import { PAD_A, PAD_B, PAD_DOWN, PAD_LEFT, PAD_RIGHT, PAD_UP, PAD_X, PAD_Y } from '../input/input.ts'
import type { Insets } from '../platform/safeArea.ts'
import { TAG_COMPLETES_FUSION, TAG_EVOLVES_HELD, canBanish, type CardRarity, type DraftCard, type DraftState } from '../systems/draft.ts'
import { Button } from './button.ts'
import { makeIcon, setIcon, type IconName } from './icons.ts'
import { FONT, INK, MOTION, RADIUS, T } from './tokens.ts'
import { Ease, Prop, tweens } from './tween.ts'

const RARITY_COLOR: Readonly<Record<CardRarity, number>> = {
  common: T.rarityCommon,
  rare: T.rarityRare,
  fusion: T.rarityFusion,
  fallback: T.rarityFallback,
}
const RARITY_LABEL: Readonly<Record<CardRarity, string>> = { common: 'COMMON', rare: 'RARE', fusion: 'FUSION', fallback: 'BASIC' }
const DESC_FILL = 0xbfeee0
const TITLE_FILL = 0x57c8ff
const GAP = 12

// Section 9.3 portrait anatomy (card-local px).
const CARD_H = 128
const CARD_H_STEPS = [128, 112, 96] as const
const CARD_MAX_W = 420
const TILE = 40
const TILE_X = 18
const TILE_Y = 16
const TEXT_X = 70
const NAME_Y = 14
const CHIP_Y = 38
const BODY_Y = 58
const LINE = 18
const PAD_R = 12
const PAD_BOTTOM = 8
const CHIP_H = 18

// Landscape: vertical anatomy, cards side by side.
const L_MAX_ROW_W = 760
const L_CARD_MAX_H = 210
const L_ICON = 40
const L_PAD = 12
const BTN_W_L = 140
const BTN_W_P = 109
const BTN_H = 48

// Section 6.5 ceremony (ms after open).
const DEAL_FULL = [160, 230, 300] as const
const DEAL_SHORT = [0, 60, 120] as const
const LOCK_FULL_MS = 450
const LOCK_SHORT_MS = 300
const SCRIM_IN_MS = 200
const RING_MS = 300
const RING_R = 180
const FLASH_PEAK = 0.22
const FLASH_MS = 260
const DEAL_RISE = 24
const DEAL_MS = 180
const PICK_SCALE = 1.06
const PICK_MS = 120

function text(size: number, fill: number, weight: '500' | '800' = '500', family: string = FONT.mono): Text {
  return new Text({ text: '', style: { fontFamily: family, fontSize: size, fontWeight: weight, fill, lineHeight: LINE } })
}

/** A filled pill with INK text (NEW, the family, FUSION). */
class Chip {
  readonly view = new Container()
  readonly label: Text
  private readonly bg = new Graphics()
  width = 0

  constructor() {
    this.label = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 12, fontWeight: '800', fill: INK, letterSpacing: 0.5 } })
    this.label.anchor.set(0, 0.5)
    this.label.position.set(6, CHIP_H / 2)
    this.view.addChild(this.bg, this.label)
  }

  set(t: string, fill: number): void {
    this.view.visible = t !== ''
    if (!t) {
      this.width = 0
      return
    }
    this.label.text = t
    this.width = Math.ceil(this.label.width) + 12
    this.bg.clear()
    this.bg.roundRect(0, 0, this.width, CHIP_H, RADIUS.chip).fill(fill)
  }
}

interface CardView {
  root: Container
  face: Container
  halo: Graphics
  bg: Graphics
  focus: Graphics
  stripe: Graphics
  tile: Graphics
  glyph: Sprite
  name: Text
  rarity: Text
  lv: Text
  chipNew: Chip
  chipFam: Chip
  stat: Text
  tag: Text
  desc: Text
  /** performance.now() of the pointerdown that started the current press. */
  downAt: number
}

export interface DraftOpen {
  touch: boolean
  pad: boolean
  /** The level reached (the `LEVEL 7` stamp). */
  level: number
  /** The full ceremony (a run's first DRAFT.fullCeremonies drafts) or the short one. */
  full: boolean
  /** The controls hint shows (the first drafts per install). */
  hint: boolean
  /** The ship's screen position (the ring starts there). */
  shipX: number
  shipY: number
}

/**
 * The level-up draft (section 9.3) with its ceremony (section 6.5). Freezes the
 * sim (the caller sets `world.paused`) and shows the open draft's cached
 * `DraftCard`s with REROLL, BANISH and SKIP. Pick by tap, keys 1 to 3 or the
 * pad (A on the focused card); in banish mode a pick banishes instead. Input
 * counts only from presses that start after the lock (450 ms for the full
 * ceremony, 300 ms after it).
 */
export class LevelUpModal {
  readonly view = new Container()
  onPick: (i: number) => void = () => {}
  onBanish: (i: number) => void = () => {}
  onReroll: () => void = () => {}
  onSkip: () => void = () => {}
  /** Whether REROLL can change the cards (draft.ts `canReroll`). */
  canReroll: () => boolean = () => false
  /** A card lands: the pitch-rising deal tick (card index 0 to 2). */
  onDeal: (i: number) => void = () => {}
  reduceMotion = false

  private readonly scrim = new Graphics()
  private readonly ring = new Graphics()
  private readonly flash = new Graphics()
  private readonly title: Text
  private readonly level: Text
  private readonly hint: Text
  private readonly cardLayer = new Container()
  private readonly views: CardView[] = []
  private readonly controls = new Container()
  private readonly rerollBtn: Button
  private readonly banishBtn: Button
  private readonly skipBtn: Button
  private readonly rerollBtnL: Button
  private readonly banishBtnL: Button
  private readonly skipBtnL: Button
  private draft: DraftState | null = null
  private banishMode = false
  private opts: DraftOpen = { touch: false, pad: false, level: 1, full: false, hint: false, shipX: 0, shipY: 0 }
  private open_ = false
  /** performance.now() at open, and when input starts to count. */
  private openAt = 0
  private unlockAt = 0
  private dealt = 0
  /** Real-clock ms the closing animation ends (0 = not closing). */
  private closingUntil = 0
  private focusIdx = 0
  /** The card under the mouse, or -1. */
  private hoverIdx = -1
  private landscape = false
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.title = new Text({ text: 'LEVEL UP', style: { fontFamily: FONT.display, fontSize: 26, fontWeight: '900', fill: TITLE_FILL, letterSpacing: 2 } })
    this.title.anchor.set(0.5)
    this.level = new Text({ text: '', style: { fontFamily: FONT.display, fontSize: 18, fontWeight: '900', fill: T.textHi, letterSpacing: 1 } })
    this.level.anchor.set(0.5)
    this.hint = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 13, fontWeight: '500', fill: T.textMuted, align: 'center' } })
    this.hint.anchor.set(0.5)
    this.scrim.eventMode = 'static' // swallow taps behind the modal
    this.ring.eventMode = 'none'
    this.flash.eventMode = 'none'
    this.view.addChild(this.scrim, this.ring, this.title, this.level, this.cardLayer, this.controls, this.hint, this.flash)
    this.view.visible = false
    for (let i = 0; i < 3; i++) this.views.push(this.makeCard(i))
    const btn = (label: string, w: number, fn: () => void): Button => {
      const b = new Button(label, w, BTN_H, 'secondary', 14)
      b.onClick = () => {
        if (this.accepts(this.downOn)) fn()
      }
      b.view.on('pointerdown', () => (this.downOn = performance.now()))
      this.controls.addChild(b.view)
      return b
    }
    this.rerollBtn = btn('REROLL', BTN_W_P, () => this.reroll())
    this.banishBtn = btn('BANISH', BTN_W_P, () => this.toggleBanish())
    this.skipBtn = btn('SKIP', BTN_W_P, () => this.skip())
    this.rerollBtnL = btn('REROLL', BTN_W_L, () => this.reroll())
    this.banishBtnL = btn('BANISH', BTN_W_L, () => this.toggleBanish())
    this.skipBtnL = btn('SKIP', BTN_W_L, () => this.skip())
  }

  /** performance.now() of the last pointerdown on a control. */
  private downOn = 0

  /** Open and taking input (false while the pick animation plays out). */
  isOpen(): boolean {
    return this.open_
  }

  /** On screen, open or closing. */
  isShown(): boolean {
    return this.view.visible
  }

  setScreen(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (this.open_) this.relayout()
  }

  open(draft: DraftState, opts: DraftOpen): void {
    this.draft = draft
    this.opts = opts
    this.banishMode = false
    this.focusIdx = 0
    this.hoverIdx = -1
    this.view.visible = true
    this.view.alpha = 1
    this.open_ = true
    this.closingUntil = 0
    this.openAt = performance.now()
    this.unlockAt = this.openAt + (opts.full ? LOCK_FULL_MS : LOCK_SHORT_MS)
    this.dealt = 0
    this.refresh()
    this.ceremony()
  }

  /** Hide at once (the run ended under the draft). */
  close(): void {
    this.view.visible = false
    this.open_ = false
    this.banishMode = false
    this.closingUntil = 0
  }

  /** Card `i` was taken: it pops to 1.06 while the modal fades out. Input is
   *  over at once; the sim resumes under the fade. */
  closeAfterPick(i: number): void {
    this.open_ = false
    this.drawFocus()
    const v = this.views[i]
    if (v && v.root.visible) tweens.to(v.face, Prop.Scale, PICK_SCALE, PICK_MS, Ease.OutBack)
    tweens.to(this.view, Prop.Alpha, 0, MOTION.exitMs, Ease.OutCubic, PICK_MS - 30)
    this.closingUntil = performance.now() + PICK_MS + MOTION.exitMs
  }

  /** Real clock: deal ticks as the cards land, and the end of the pick fade. */
  update(nowMs: number): void {
    if (!this.view.visible) return
    if (this.closingUntil > 0) {
      if (nowMs >= this.closingUntil) this.close()
      return
    }
    const deal = this.opts.full ? DEAL_FULL : DEAL_SHORT
    while (this.dealt < 3 && nowMs - this.openAt >= deal[this.dealt]!) this.onDeal(this.dealt++)
  }

  /** A card tap or a 1 to 3 key: banish it in banish mode, else pick it. */
  pressCard(i: number): void {
    const d = this.draft
    if (!d || !this.open_ || i >= d.count || !this.accepts(0)) return
    if (this.banishMode) {
      if (d.cards[i]!.kind === 'fallback') return
      this.banishMode = false
      this.onBanish(i)
      this.refresh()
      this.dealIn(i)
    } else {
      this.onPick(i)
    }
  }

  /** REROLL (button or R key). */
  reroll(): void {
    if (!this.draft || !this.open_ || !this.accepts(0) || !this.canReroll()) return
    this.banishMode = false
    this.onReroll()
    this.refresh()
    for (let i = 0; i < 3; i++) this.dealIn(i)
  }

  toggleBanish(): void {
    const d = this.draft
    if (!d || !this.open_ || !this.accepts(0) || !canBanish(d)) return
    this.banishMode = !this.banishMode
    this.refresh()
  }

  skip(): void {
    if (this.open_ && this.accepts(0)) this.onSkip()
  }

  /** Pad presses (PAD_* bits): the d-pad or stick moves the focus, A picks
   *  (or banishes), Y rerolls, X toggles banish, B skips. */
  pad(bits: number): void {
    const d = this.draft
    if (!d || !this.open_ || bits === 0) return
    this.opts.pad = true
    const n = d.count
    const back = this.landscape ? PAD_LEFT : PAD_UP
    const next = this.landscape ? PAD_RIGHT : PAD_DOWN
    if (bits & back) this.focusIdx = (this.focusIdx + n - 1) % n
    if (bits & next) this.focusIdx = (this.focusIdx + 1) % n
    if (bits & (back | next)) this.drawFocus()
    if (bits & PAD_A) this.pressCard(this.focusIdx)
    else if (bits & PAD_Y) this.reroll()
    else if (bits & PAD_X) this.toggleBanish()
    else if (bits & PAD_B) this.skip()
    this.refreshHint()
  }

  /** Re-read the draft (after a reroll or banish) and lay it out again. */
  refresh(): void {
    const d = this.draft
    if (!d || !this.view.visible) return
    for (let i = 0; i < 3; i++) {
      const v = this.views[i]!
      v.root.visible = i < d.count
      if (i < d.count) this.fill(v, d.cards[i]!)
    }
    this.relayout()
  }

  /** A press counts only when it started after the lock (`downAt` 0: a key or the pad). */
  private accepts(downAt: number): boolean {
    const now = performance.now()
    if (now < this.unlockAt) return false
    return downAt === 0 || downAt >= this.unlockAt
  }

  private ceremony(): void {
    const full = this.opts.full
    const deal = full ? DEAL_FULL : DEAL_SHORT
    tweens.kill(this.scrim)
    this.scrim.alpha = full ? 0 : 1
    if (full) tweens.to(this.scrim, Prop.Alpha, 1, SCRIM_IN_MS, Ease.OutCubic)
    for (let i = 0; i < 3; i++) {
      const v = this.views[i]!
      const y = v.root.y
      v.root.alpha = 0
      v.root.y = y + DEAL_RISE
      tweens.to(v.root, Prop.Alpha, 1, DEAL_MS, Ease.OutCubic, deal[i])
      tweens.to(v.root, Prop.Y, y, DEAL_MS, Ease.OutCubic, deal[i])
    }
    this.ring.visible = full && !this.reduceMotion
    this.flash.visible = full && !this.reduceMotion
    this.level.scale.set(1)
    if (!full) return
    if (!this.reduceMotion) {
      this.ring.position.set(this.opts.shipX, this.opts.shipY)
      this.ring.scale.set(0.01)
      this.ring.alpha = 1
      tweens.to(this.ring, Prop.Scale, 1, RING_MS, Ease.OutCubic)
      tweens.to(this.ring, Prop.Alpha, 0, RING_MS, Ease.Linear, RING_MS / 3)
      this.flash.alpha = FLASH_PEAK
      tweens.to(this.flash, Prop.Alpha, 0, FLASH_MS, Ease.OutCubic)
    }
    this.level.scale.set(1.6)
    tweens.to(this.level, Prop.Scale, 1, MOTION.stampMs, Ease.OutBack, 90)
  }

  /** A card that changed under a reroll or banish fades in again. */
  private dealIn(i: number): void {
    const v = this.views[i]
    if (!v || !v.root.visible) return
    v.root.alpha = 0
    tweens.to(v.root, Prop.Alpha, 1, DEAL_MS, Ease.OutCubic, i * 40)
    this.onDeal(i)
  }

  private makeCard(i: number): CardView {
    const root = new Container()
    const face = new Container()
    const v: CardView = {
      root,
      face,
      halo: new Graphics(),
      bg: new Graphics(),
      focus: new Graphics(),
      stripe: new Graphics(),
      tile: new Graphics(),
      glyph: makeIcon('rate', 24),
      name: text(16, T.textHi, '800', FONT.display),
      rarity: text(12, T.textPrimary, '800'),
      lv: text(12, T.textPrimary, '800'),
      chipNew: new Chip(),
      chipFam: new Chip(),
      stat: text(13, T.textHi),
      tag: text(12, T.accentGold, '800'),
      desc: text(13, DESC_FILL),
      downAt: 0,
    }
    v.name.style.fontWeight = '700'
    v.rarity.style.letterSpacing = 1
    v.focus.visible = false
    face.addChild(v.halo, v.bg, v.stripe, v.tile, v.glyph, v.name, v.rarity, v.lv, v.chipNew.view, v.chipFam.view, v.stat, v.tag, v.desc, v.focus)
    root.addChild(face)
    root.eventMode = 'static'
    root.cursor = 'pointer'
    root.on('pointerdown', () => (v.downAt = performance.now()))
    root.on('pointertap', () => {
      if (this.accepts(v.downAt)) this.pressCard(i)
    })
    root.on('pointerover', () => {
      this.hoverIdx = i
      this.drawFocus()
    })
    root.on('pointerout', () => {
      if (this.hoverIdx === i) this.hoverIdx = -1
      this.drawFocus()
    })
    this.cardLayer.addChild(root)
    return v
  }

  private fill(v: CardView, c: DraftCard): void {
    const fam = c.family >= 0 ? FAMILIES[c.family]! : null
    const accent = fam ? fam.color : RARITY_COLOR[c.rarity]
    v.name.text = c.name.toUpperCase()
    v.rarity.text = c.keystone ? 'KEYSTONE' : RARITY_LABEL[c.rarity]
    v.rarity.style.fill = c.keystone ? T.accentGold : RARITY_COLOR[c.rarity]
    // NEW for a first stack (a fusion is always new); LV a → b for an owned perk.
    const isNew = c.kind !== 'fallback' && c.stacks === 0
    v.chipNew.set(isNew ? 'NEW' : '', T.accentGold)
    v.lv.text = c.kind === 'perk' && c.stacks > 0 ? `LV ${c.stacks} → ${c.stacks + 1}` : ''
    v.chipFam.set(fam ? fam.name : c.kind === 'fusion' ? 'FUSION' : '', fam ? fam.color : T.rarityFusion)
    v.stat.text = c.stat
    v.tag.text = c.tagText
    v.tag.style.fill = c.tags & TAG_EVOLVES_HELD ? T.rarityEvolution : c.kind === 'fusion' || c.tags & TAG_COMPLETES_FUSION ? T.rarityFusion : T.accentGold
    v.desc.text = c.desc
    setIcon(v.glyph, (c.glyph || 'damage') as IconName, 24)
    v.glyph.tint = accent
    v.stripe.tint = c.keystone ? T.accentGold : RARITY_COLOR[c.rarity]
    v.tile.tint = accent
  }

  private relayout(): void {
    const d = this.draft
    if (!d) return
    const { w, h, insets } = this
    const L = insets.left
    const availW = w - L - insets.right
    const availH = h - insets.top - insets.bottom
    this.scrim.clear()
    this.scrim.rect(0, 0, w, h).fill({ color: T.scrim, alpha: T.scrimAlpha })
    this.scrim.hitArea = new Rectangle(0, 0, w, h)
    this.flash.clear()
    this.flash.rect(0, 0, w, h).fill(0xffffff)
    this.ring.clear()
    this.ring.circle(0, 0, RING_R).stroke({ width: 3, color: TITLE_FILL, alpha: 0.9 })
    this.level.text = `LEVEL ${this.opts.level}`
    this.landscape = w > h
    const cx = L + availW / 2
    const n = d.count

    this.rerollBtn.view.visible = this.banishBtn.view.visible = this.skipBtn.view.visible = !this.landscape
    this.rerollBtnL.view.visible = this.banishBtnL.view.visible = this.skipBtnL.view.visible = this.landscape
    const [rb, bb, sb] = this.landscape ? [this.rerollBtnL, this.banishBtnL, this.skipBtnL] : [this.rerollBtn, this.banishBtn, this.skipBtn]
    const bw = this.landscape ? BTN_W_L : BTN_W_P
    rb.setText(`REROLL (${d.rerolls})`)
    rb.setEnabled(this.canReroll())
    bb.setText(this.banishMode ? 'CANCEL' : `BANISH (${d.banishes})`)
    bb.setEnabled(canBanish(d))
    this.refreshHint()
    const hintH = this.hint.visible ? 26 : 0

    let cardW: number
    let cardH: number
    let top: number
    let cardsY: number
    let ctrlY: number
    if (this.landscape) {
      // Title row, then the cards side by side, then the controls row.
      const rowW = Math.min(availW - 32, L_MAX_ROW_W)
      cardW = (rowW - GAP * (n - 1)) / n
      cardH = Math.min(L_CARD_MAX_H, availH - 132)
      const block = 44 + cardH + 14 + BTN_H + hintH
      top = insets.top + Math.max(0, (availH - block) / 2)
      cardsY = top + 44
      ctrlY = cardsY + cardH + 14
      const gap = 12
      const pair = this.title.width + gap + this.level.width
      this.title.position.set(cx - pair / 2 + this.title.width / 2, top + 20)
      this.level.position.set(cx + pair / 2 - this.level.width / 2, top + 20)
    } else {
      cardW = Math.min(availW - 32, CARD_MAX_W)
      // Shrink the cards before anything leaves the screen (section 9.3 overflow).
      const fixed = 128 + 12 + BTN_H + hintH + 8
      cardH = CARD_H
      for (const step of CARD_H_STEPS) {
        cardH = step
        if (fixed + 3 * step + 2 * GAP <= availH) break
      }
      const block = fixed + 3 * cardH + 2 * GAP
      // Extra height centers the block; a short screen pulls the header up.
      const spare = availH - block
      top = insets.top + (spare > 0 ? spare / 2 : Math.max(-56, spare))
      this.title.position.set(cx, top + 72)
      this.level.position.set(cx, top + 100)
      cardsY = top + 128
      ctrlY = cardsY + n * cardH + (n - 1) * GAP + 12
    }

    const startX = this.landscape ? cx - (cardW * n + GAP * (n - 1)) / 2 : cx - cardW / 2
    for (let i = 0; i < n; i++) {
      const v = this.views[i]!
      const c = d.cards[i]!
      const x = this.landscape ? startX + i * (cardW + GAP) : startX
      const y = this.landscape ? cardsY : cardsY + i * (cardH + GAP)
      tweens.kill(v.root)
      v.root.alpha = 1
      v.root.position.set(x, y)
      v.face.pivot.set(cardW / 2, cardH / 2)
      v.face.position.set(cardW / 2, cardH / 2)
      v.face.scale.set(1)
      v.root.hitArea = new Rectangle(0, 0, cardW, cardH)
      if (this.landscape) this.layoutVertical(v, cardW, cardH)
      else this.layoutRow(v, cardW, cardH)
      this.drawCard(v, c, cardW, cardH)
    }
    this.drawFocus()

    const bx = cx - (bw * 3 + 16) / 2
    rb.position(bx, ctrlY)
    bb.position(bx + bw + 8, ctrlY)
    sb.position(bx + (bw + 8) * 2, ctrlY)
    this.hint.position.set(cx, ctrlY + BTN_H + 16)
  }

  private refreshHint(): void {
    const o = this.opts
    let t = ''
    let fill: number = T.textMuted
    if (this.banishMode) {
      t = o.pad ? 'Press A on a card to banish it' : o.touch ? 'Tap a card to banish' : 'Click a card to banish'
      fill = T.accentDanger
    } else if (o.pad) {
      t = 'A pick · Y reroll · X banish · B skip'
    } else if (o.hint) {
      t = o.touch ? 'Tap a card to choose' : 'Click a card or press 1, 2, 3'
    }
    this.hint.text = t
    this.hint.style.fill = fill
    this.hint.visible = t !== ''
  }

  private drawCard(v: CardView, c: DraftCard, cw: number, ch: number): void {
    const banishable = this.banishMode && c.kind !== 'fallback'
    const rare = c.rarity !== 'common' && c.rarity !== 'fallback'
    const border = banishable ? T.accentDanger : c.keystone ? T.accentGold : c.rarity === 'common' ? T.lineStrong : RARITY_COLOR[c.rarity]
    v.halo.clear()
    if (rare && !banishable) v.halo.roundRect(-3, -3, cw + 6, ch + 6, RADIUS.card + 3).stroke({ width: 4, color: border, alpha: 0.25 })
    v.bg.clear()
    v.bg.roundRect(0, 0, cw, ch, RADIUS.card).fill({ color: T.surfaceCard, alpha: 0.98 })
    v.bg.roundRect(1, 1, cw - 2, ch - 2, RADIUS.card - 1).stroke({ width: banishable ? 3 : 2, color: border })
    v.stripe.clear()
    v.stripe.roundRect(4, 10, 6, ch - 20, 3).fill(0xffffff)
    v.focus.clear()
    v.focus.roundRect(-5, -5, cw + 10, ch + 10, RADIUS.card + 5).stroke({ width: 2, color: this.banishMode ? T.accentDanger : TITLE_FILL })
  }

  /** The pad's focused card, or the card under the mouse. */
  private drawFocus(): void {
    for (let i = 0; i < 3; i++) this.views[i]!.focus.visible = this.open_ && ((this.opts.pad && i === this.focusIdx) || i === this.hoverIdx)
  }

  /** Portrait: icon tile left, text column right (section 9.3 table). */
  private layoutRow(v: CardView, cw: number, ch: number): void {
    const tileSize = ch >= 112 ? TILE : 32
    v.tile.clear()
    v.tile.roundRect(TILE_X, TILE_Y, tileSize, tileSize, 8).fill({ color: 0xffffff, alpha: 0.16 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 })
    v.glyph.anchor.set(0.5)
    v.glyph.width = v.glyph.height = tileSize * 0.6
    v.glyph.position.set(TILE_X + tileSize / 2, TILE_Y + tileSize / 2)
    const textX = TEXT_X
    const right = cw - PAD_R
    v.rarity.anchor.set(1, 0)
    v.rarity.position.set(right, 16)
    v.name.anchor.set(0, 0)
    v.name.position.set(textX, NAME_Y)
    fitWidth(v.name, 16, right - textX - v.rarity.width - 10)
    // Chips row: NEW or LV a → b, then the family.
    let x = textX
    v.chipNew.view.position.set(x, CHIP_Y)
    if (v.chipNew.view.visible) x += v.chipNew.width + 6
    v.lv.anchor.set(0, 0.5)
    v.lv.position.set(x, CHIP_Y + CHIP_H / 2)
    if (v.lv.text) x += Math.ceil(v.lv.width) + 8
    v.chipFam.view.position.set(x, CHIP_Y)
    const chips = v.chipNew.view.visible || v.lv.text !== '' || v.chipFam.view.visible
    this.flowBody(v, textX, chips ? BODY_Y : CHIP_Y, right - textX, ch - PAD_BOTTOM, 'left')
  }

  /** Landscape: icon on top, everything centered under it. */
  private layoutVertical(v: CardView, cw: number, ch: number): void {
    const cx = cw / 2
    const inner = cw - L_PAD * 2
    // The rarity label tops the card, the icon sits under it.
    v.rarity.anchor.set(0.5, 0)
    v.rarity.position.set(cx, 8)
    const iy = 28
    v.tile.clear()
    v.tile.roundRect(cx - L_ICON / 2, iy, L_ICON, L_ICON, 10).fill({ color: 0xffffff, alpha: 0.16 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7 })
    v.glyph.anchor.set(0.5)
    v.glyph.width = v.glyph.height = 24
    v.glyph.position.set(cx, iy + L_ICON / 2)
    let y = iy + L_ICON + 8
    v.name.anchor.set(0.5, 0)
    v.name.position.set(cx, y)
    fitWidth(v.name, 16, inner)
    y += 24
    const rowW = (v.chipNew.view.visible ? v.chipNew.width + 6 : 0) + (v.lv.text ? Math.ceil(v.lv.width) + 8 : 0) + v.chipFam.width
    let x = cx - rowW / 2
    v.chipNew.view.position.set(x, y)
    if (v.chipNew.view.visible) x += v.chipNew.width + 6
    v.lv.anchor.set(0, 0.5)
    v.lv.position.set(x, y + CHIP_H / 2)
    if (v.lv.text) x += Math.ceil(v.lv.width) + 8
    v.chipFam.view.position.set(x, y)
    if (rowW > 0) y += CHIP_H + 8
    this.flowBody(v, cx, y, inner, ch - PAD_BOTTOM, 'center')
  }

  /**
   * Stat, tag and description down from `y` to `bottom`, `width` wide. The stat
   * and the tag always show (wrapping as needed); the description takes the
   * lines left, at 13 px, then 12 px, then only its first sentence, and is left
   * out rather than cut mid-line.
   */
  private flowBody(v: CardView, x: number, y: number, width: number, bottom: number, align: 'left' | 'center'): void {
    const ax = align === 'center' ? 0.5 : 0
    for (const t of [v.stat, v.tag, v.desc]) {
      t.anchor.set(ax, 0)
      t.style.align = align
      t.style.wordWrap = true
      t.style.wordWrapWidth = width
      t.scale.set(1)
    }
    v.stat.style.fontSize = 13
    v.tag.style.fontSize = 12
    for (const t of [v.stat, v.tag]) {
      t.visible = t.text !== ''
      if (!t.visible) continue
      t.position.set(x, y)
      y += Math.round(t.height)
    }
    const full = v.desc.text
    v.desc.visible = false
    const lines = Math.floor((bottom - y) / LINE)
    if (lines <= 0 || !full) return
    const tries: [number, string][] = [[13, full], [12, full]]
    const first = full.indexOf('. ')
    if (first > 0) tries.push([13, full.slice(0, first + 1)], [12, full.slice(0, first + 1)])
    for (const [size, s] of tries) {
      v.desc.style.fontSize = size
      v.desc.text = s
      if (Math.round(v.desc.height / LINE) <= lines) {
        v.desc.visible = true
        v.desc.position.set(x, y)
        break
      }
    }
    if (!v.desc.visible) v.desc.text = full
  }
}

/** Shrink `t` to `maxW`, never under 12 px effective. */
function fitWidth(t: Text, size: number, maxW: number): void {
  t.scale.set(1)
  if (t.width > maxW) t.scale.set(Math.max(12 / size, maxW / t.width))
}

