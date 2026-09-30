import { Container, Graphics, Text } from 'pixi.js'
import { Button } from './button.ts'
import { FONT, RADIUS, T, TARGET } from './tokens.ts'

const PAD = 16
const GAP = 8

/**
 * The leaderboard opt-in card (section 8.1, copy in A15). A panel inside the
 * recap, never a modal: CHOOSE A NAME opens the name prompt, NO THANKS turns
 * posting off. Positioned by its top-left corner; `layout` returns its height.
 */
export class OptInCard {
  readonly view = new Container()
  onChoose: () => void = () => {}
  onDecline: () => void = () => {}

  private readonly bg = new Graphics()
  private readonly title: Text
  private readonly body: Text
  private choose: Button | null = null
  private decline: Button | null = null
  private buttonW = 0

  constructor() {
    this.title = new Text({ text: 'JOIN THE LEADERBOARD?', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 15, fill: T.textPrimary, letterSpacing: 1 } })
    this.body = new Text({
      text: 'Post your scores under a nickname. The board shows your nickname, score, run stats, pilot, world and country.',
      style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 13, lineHeight: 18, fill: T.textHi, wordWrap: true },
    })
    this.view.addChild(this.bg, this.title, this.body)
    this.view.visible = false
  }

  /** Lay the card out `w` wide; returns its height. */
  layout(w: number): number {
    const inner = w - PAD * 2
    this.title.scale.set(1)
    if (this.title.width > inner) this.title.scale.set(inner / this.title.width)
    this.title.position.set(PAD, PAD)
    this.body.style.wordWrapWidth = inner
    this.body.position.set(PAD, PAD + 24)
    const bw = Math.floor((inner - GAP) / 2)
    if (bw !== this.buttonW) this.buildButtons(bw)
    const by = this.body.y + this.body.height + 12
    this.decline!.position(PAD, by)
    this.choose!.position(PAD + bw + GAP, by)
    const h = by + TARGET.compact + PAD
    this.bg.clear()
    this.bg.roundRect(0, 0, w, h, RADIUS.card).fill(T.surfacePanel).stroke({ width: 1, color: T.lineStrong })
    return h
  }

  /** Buttons are fixed-width, so a new card width builds new ones. */
  private buildButtons(bw: number): void {
    this.choose?.view.destroy({ children: true })
    this.decline?.view.destroy({ children: true })
    this.buttonW = bw
    this.choose = new Button('CHOOSE A NAME', bw, TARGET.compact, 'primary', 14)
    this.decline = new Button('NO THANKS', bw, TARGET.compact, 'secondary', 14)
    this.choose.onClick = () => this.onChoose()
    this.decline.onClick = () => this.onDecline()
    this.view.addChild(this.decline.view, this.choose.view)
  }
}
