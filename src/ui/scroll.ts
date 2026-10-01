import { Container, Graphics, Rectangle, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js'
import { T } from './tokens.ts'

/** A drag shorter than this (px) is a tap, not a scroll. */
const DRAG_SLOP = 6
const THUMB_W = 3
const THUMB_MIN = 24

export interface ScrollRow {
  view: Container
  /** Height of the row from its `view.y`. */
  h: number
}

/**
 * A vertical scroll area: the content is clipped to the viewport and moves
 * with a drag or the mouse wheel. Rows wholly outside the viewport are hidden,
 * so a long list costs only its visible rows to draw.
 */
export class ScrollView {
  readonly view = new Container()
  readonly content = new Container()
  private readonly clip = new Graphics()
  private readonly thumb = new Graphics()
  private rows: ScrollRow[] = []
  private vw = 0
  private vh = 0
  private contentH = 0
  private scroll = 0
  private pressed = false
  private dragging = false
  private startY = 0
  private startScroll = 0

  constructor() {
    this.view.addChild(this.content, this.clip, this.thumb)
    this.content.mask = this.clip
    this.thumb.eventMode = 'none'
    this.view.eventMode = 'static'
    this.view.on('pointerdown', (e: FederatedPointerEvent) => {
      this.pressed = true
      this.dragging = false
      this.startY = e.global.y
      this.startScroll = this.scroll
    })
    this.view.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.pressed) return
      const dy = e.global.y - this.startY
      if (!this.dragging && Math.abs(dy) < DRAG_SLOP) return
      this.dragging = true
      this.scrollTo(this.startScroll - dy / this.view.worldTransform.d)
    })
    const end = (): void => {
      this.pressed = false
      this.dragging = false
    }
    this.view.on('pointerup', end)
    this.view.on('pointerupoutside', end)
    this.view.on('wheel', (e: FederatedWheelEvent) => this.scrollTo(this.scroll + e.deltaY))
  }

  /** The viewport in the parent's coordinates. */
  setViewport(x: number, y: number, w: number, h: number): void {
    this.view.position.set(x, y)
    this.vw = w
    this.vh = h
    this.view.hitArea = new Rectangle(0, 0, w, h)
    this.clip.clear()
    this.clip.rect(0, 0, w, h).fill(0xffffff)
    this.scrollTo(this.scroll)
  }

  /** The rows the content holds, laid out by the caller, and the content height. */
  setRows(rows: ScrollRow[], contentH: number): void {
    for (const r of this.rows) r.view.visible = false
    this.rows = rows
    this.contentH = contentH
    this.scrollTo(this.scroll)
  }

  scrollTo(y: number): void {
    const max = Math.max(0, this.contentH - this.vh)
    this.scroll = y < 0 ? 0 : y > max ? max : y
    this.content.y = -this.scroll
    const top = this.scroll
    const bottom = this.scroll + this.vh
    for (const r of this.rows) r.view.visible = r.view.y + r.h > top && r.view.y < bottom
    this.thumb.clear()
    if (max > 0) {
      const th = Math.max(THUMB_MIN, (this.vh * this.vh) / this.contentH)
      const ty = (this.scroll / max) * (this.vh - th)
      this.thumb.roundRect(this.vw - THUMB_W, ty, THUMB_W, th, THUMB_W / 2).fill({ color: T.lineStrong, alpha: 0.8 })
    }
  }
}
