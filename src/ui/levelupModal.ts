import { Container, Graphics, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { PerkDef } from '../content/perks.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'

interface Card {
  root: Container
  bg: Graphics
  hover: Graphics
  index: Text
  name: Text
  rarity: Text
  desc: Text
  perkId: string
}

/**
 * Level-up perk draft. Freezes the sim (caller sets `world.paused`) and presents
 * up to 3 perk cards; pick by click/tap or keys 1/2/3. Rebuilt each level so it
 * also handles multiple queued level-ups back to back.
 */
export class LevelUpModal {
  readonly view = new Container()
  onPick: (perkId: string) => void = () => {}

  private backdrop = new Graphics()
  private title: Text
  private hint: Text
  private cardLayer = new Container()
  private cards: Card[] = []
  private open_ = false
  private w = 0
  private h = 0

  constructor() {
    this.title = new Text({
      text: 'LEVEL UP',
      style: { fontFamily: MONO, fontSize: 26, fontWeight: 'bold', fill: COLORS.xpBar },
    })
    this.title.anchor.set(0.5)
    this.hint = new Text({
      text: 'choose a perk   ·   click  or  press 1 / 2 / 3',
      style: { fontFamily: MONO, fontSize: 13, fill: COLORS.hudDim },
    })
    this.hint.anchor.set(0.5)

    this.backdrop.eventMode = 'static' // swallow clicks behind the modal
    this.view.addChild(this.backdrop, this.title, this.hint, this.cardLayer)
    this.view.visible = false
  }

  isOpen(): boolean {
    return this.open_
  }

  setScreen(w: number, h: number): void {
    this.w = w
    this.h = h
    if (this.open_) this.relayout()
  }

  open(perks: PerkDef[]): void {
    this.buildCards(perks)
    this.relayout()
    this.view.visible = true
    this.open_ = true
  }

  close(): void {
    this.view.visible = false
    this.open_ = false
  }

  pickByIndex(i: number): void {
    const c = this.cards[i]
    if (c) this.onPick(c.perkId)
  }

  private buildCards(perks: PerkDef[]): void {
    this.cardLayer.removeChildren()
    this.cards = []
    perks.forEach((perk, idx) => {
      const root = new Container()
      const bg = new Graphics()
      const hover = new Graphics()
      hover.visible = false
      const index = new Text({ text: String(idx + 1), style: { fontFamily: MONO, fontSize: 16, fontWeight: 'bold', fill: COLORS.hudDim } })
      const rarityColor = perk.rarity === 'rare' ? 0xffc24a : COLORS.hudText
      const rarity = new Text({ text: perk.rarity.toUpperCase(), style: { fontFamily: MONO, fontSize: 10, fontWeight: 'bold', fill: rarityColor } })
      const name = new Text({ text: perk.name, style: { fontFamily: MONO, fontSize: 18, fontWeight: 'bold', fill: 0xffffff } })
      const desc = new Text({ text: perk.desc, style: { fontFamily: MONO, fontSize: 13, fill: 0xbfeee0, wordWrap: true, wordWrapWidth: 200 } })

      root.addChild(bg, hover, index, rarity, name, desc)
      root.eventMode = 'static'
      root.cursor = 'pointer'
      root.on('pointertap', () => this.onPick(perk.id))
      root.on('pointerover', () => (hover.visible = true))
      root.on('pointerout', () => (hover.visible = false))

      this.cardLayer.addChild(root)
      this.cards.push({ root, bg, hover, index, name, rarity, desc, perkId: perk.id })
    })
  }

  private relayout(): void {
    const { w, h } = this
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.78 })

    const n = this.cards.length
    const horizontal = w >= 560
    const cardW = horizontal ? Math.min(240, (Math.min(w - 48, 760) - 16 * (n - 1)) / n) : Math.min(380, w - 48)
    const cardH = horizontal ? Math.min(210, h * 0.46) : 84
    const gap = 16
    const totalW = horizontal ? cardW * n + gap * (n - 1) : cardW
    const totalH = horizontal ? cardH : cardH * n + gap * (n - 1)

    this.title.position.set(w / 2, h / 2 - totalH / 2 - 52)
    this.hint.position.set(w / 2, h / 2 + totalH / 2 + 30)

    const startX = horizontal ? w / 2 - totalW / 2 : w / 2 - cardW / 2
    const startY = h / 2 - totalH / 2

    this.cards.forEach((c, i) => {
      const cx = horizontal ? startX + i * (cardW + gap) : startX
      const cy = horizontal ? startY : startY + i * (cardH + gap)
      c.root.position.set(cx, cy)

      c.bg.clear()
      c.bg.roundRect(0, 0, cardW, cardH, 10).fill({ color: 0x0e1726, alpha: 0.96 })
      c.bg.roundRect(0, 0, cardW, cardH, 10).stroke({ width: 2, color: 0x274055 })
      c.hover.clear()
      c.hover.roundRect(0, 0, cardW, cardH, 10).stroke({ width: 2.5, color: COLORS.xpBar })

      c.index.position.set(12, 10)
      c.rarity.anchor.set(1, 0)
      c.rarity.position.set(cardW - 12, 13)
      ;(c.desc.style as { wordWrapWidth: number }).wordWrapWidth = cardW - 24

      if (horizontal) {
        c.name.anchor.set(0.5, 0)
        c.name.position.set(cardW / 2, 44)
        c.desc.anchor.set(0.5, 0)
        c.desc.style.align = 'center'
        c.desc.position.set(cardW / 2, 84)
      } else {
        c.name.anchor.set(0, 0)
        c.name.position.set(14, 30)
        c.desc.anchor.set(0, 0)
        c.desc.style.align = 'left'
        c.desc.position.set(14, 54)
      }
    })
  }
}
