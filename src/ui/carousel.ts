import { Container, Graphics, Text, type Sprite } from 'pixi.js'
import { haptic } from '../platform/haptics.ts'
import { IconButton } from './iconButton.ts'
import { makeIcon } from './icons.ts'
import { FONT, RADIUS, T } from './tokens.ts'

/** Arrow buttons (visual; the hit rect is 6 px wider each side) and their gap to the card. */
const ARROW = 40
const ARROW_GAP = 4

/** Lock state of the item a carousel shows: the feat that unlocks it. */
export interface LockInfo {
  desc: string
  /** `3 / 8`, `1:12 / 2:30`. */
  progress: string
  frac: number
}

/** Width of a carousel with its arrows, for a `cardW` card. */
export function carouselWidth(cardW: number): number {
  return cardW + 2 * (ARROW + ARROW_GAP)
}

/**
 * A card between two arrow buttons (section 9.7). The caller fills `body`
 * (card-local coordinates); a locked item shows the lock bar instead of the
 * body: a lock icon, the feat that unlocks it, its progress and a bar.
 */
export class Carousel {
  readonly view = new Container()
  readonly body = new Container()
  onStep: (dir: -1 | 1) => void = () => {}
  private readonly bg = new Graphics()
  private readonly prev = new IconButton('chevronL', ARROW)
  private readonly next = new IconButton('chevronR', ARROW)
  private readonly lock = new Container()
  private readonly lockIcon: Sprite
  private readonly lockTitle: Text
  private readonly lockDesc: Text
  private readonly lockProg: Text
  private readonly lockBar = new Graphics()
  private cardH = 0

  constructor(readonly cardW: number) {
    this.prev.onClick = () => this.step(-1)
    this.next.onClick = () => this.step(1)
    const icon = makeIcon('lock', 16, T.accentGold)
    icon.position.set(20, 20)
    this.lockIcon = icon
    this.lockTitle = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '700', fontSize: 15, fill: T.textHi } })
    this.lockTitle.position.set(34, 11)
    this.lockDesc = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, lineHeight: 16, fill: T.textHi, wordWrap: true, wordWrapWidth: cardW - 24 } })
    this.lockProg = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, fill: T.textMuted } })
    this.lockProg.anchor.set(1, 0)
    this.lock.addChild(icon, this.lockTitle, this.lockDesc, this.lockProg, this.lockBar)
    this.view.addChild(this.bg, this.body, this.lock, this.prev.view, this.next.view)
  }

  /** Card height, the arrows (only when there is a choice) and whether the
   *  item is locked (`title` names it on the lock bar). */
  set(cardH: number, arrows: boolean, locked: LockInfo | null, title = ''): void {
    this.cardH = cardH
    this.prev.view.visible = this.next.view.visible = arrows
    const x0 = ARROW + ARROW_GAP
    const ay = (cardH - ARROW) / 2
    this.prev.position(0, ay)
    this.next.position(x0 + this.cardW + ARROW_GAP, ay)
    this.body.position.set(x0, 0)
    this.lock.position.set(x0, 0)
    this.body.visible = locked === null
    this.lock.visible = locked !== null
    const w = this.cardW
    this.bg.clear()
    this.bg.roundRect(x0, 0, w, cardH, RADIUS.card).fill(T.surfaceCard)
    this.bg.roundRect(x0 + 1, 1, w - 2, cardH - 2, RADIUS.card - 1).stroke({ width: 2, color: locked ? T.decorDim : T.lineStrong })
    if (!locked) return
    // A short card (the world card) packs the rows tighter and thins the bar.
    const small = cardH < 80
    const top = small ? 8 : 11
    this.lockTitle.text = title
    this.lockTitle.y = top
    this.lockIcon.y = top + 9
    this.lockProg.text = locked.progress
    this.lockProg.position.set(w - 12, top + 2)
    this.lockDesc.text = locked.desc
    this.lockDesc.position.set(12, small ? 30 : 34)
    const bh = small ? 3 : 4
    const by = cardH - (small ? 7 : 14)
    this.lockBar.clear()
    this.lockBar.roundRect(12, by, w - 24, bh, bh / 2).fill(T.lineFaint)
    if (locked.frac > 0) this.lockBar.roundRect(12, by, Math.max(bh, (w - 24) * Math.min(1, locked.frac)), bh, bh / 2).fill(T.accentGold)
  }

  get height(): number {
    return this.cardH
  }

  /** Total width with the arrows. */
  get width(): number {
    return carouselWidth(this.cardW)
  }

  private step(dir: -1 | 1): void {
    haptic('selection')
    this.onStep(dir)
  }
}
