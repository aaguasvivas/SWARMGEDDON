import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { Button } from './button.ts'
import { clip } from './goalsPanel.ts'
import { FONT, RADIUS, T } from './tokens.ts'

const PAD = 12
/** Under this width the button stacks under the text. */
const NARROW_W = 320
const BTN_W = 116
const BTN_H = 36
const SEP = ' · '
/** Width of the longest countdown, `NEW DAILY IN 23H 59M` at 12 px. */
const CLOCK_MAX_W = 146

/** What the menu's Daily card shows (A15 card copy). */
export interface DailyCardModel {
  number: number
  world: string
  pilot: string
  threat: number
  threatName: string
  /** Today's ranked attempt is still open. */
  rankedOpen: boolean
  /** The ranked score of today, when this device posted one in v2. */
  rankedScore: number | null
  practiceBest: number
  played: number
  streak: number
  /** The Daily's pilot is locked in the player's own save. */
  pilotFree: boolean
}

function group(v: number): string {
  return Math.floor(v).toLocaleString('en-US')
}

/** `NEW DAILY IN 5H 12M`, `NEW DAILY IN 42M`. */
export function countdownText(nowMs: number): string {
  const next = (Math.floor(nowMs / 86_400_000) + 1) * 86_400_000
  const min = Math.max(1, Math.ceil((next - nowMs) / 60_000))
  const h = Math.floor(min / 60)
  return h > 0 ? `NEW DAILY IN ${h}H ${min % 60}M` : `NEW DAILY IN ${min}M`
}

/**
 * The Daily card (section 9.7, A15): today's number, world and pilot, the ranked
 * attempt or its result, and PLAY RANKED or PRACTICE. The countdown text changes
 * once a minute.
 */
export class DailyCard {
  readonly view = new Container()
  onPlay: () => void = () => {}
  private readonly bg = new Graphics()
  private readonly title: Text
  private readonly clock: Text
  private readonly where: Text
  private readonly status: Text
  private readonly extra: Text
  private play: Button | null = null
  private practice: Button | null = null
  private btnW = 0
  private h = 0
  private model: DailyCardModel | null = null
  private clockMin = -1

  constructor() {
    this.title = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '700', fontSize: 16, fill: T.accentGold, letterSpacing: 1 } })
    this.clock = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, fill: T.textMuted } })
    this.clock.anchor.set(1, 0)
    const body = { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, fill: T.textHi } as const
    this.where = new Text({ text: '', style: { ...body } })
    this.status = new Text({ text: '', style: { ...body, fontWeight: '800' } })
    this.extra = new Text({ text: '', style: { ...body, fill: T.textMuted } })
    this.bg.eventMode = 'static'
    this.view.addChild(this.bg, this.title, this.clock, this.where, this.status, this.extra)
  }

  /** Fill the card `w` wide and return its height. A card under NARROW_W stacks
   *  the button under the text, full width, and grows taller. */
  set(m: DailyCardModel, w: number): number {
    this.model = m
    const narrow = w < NARROW_W
    const inner = w - PAD * 2
    const left = narrow ? inner : inner - BTN_W - 8
    this.title.text = `DAILY #${m.number}`
    this.title.position.set(PAD, 7)
    this.clockMin = -1
    this.tick(Date.now())

    const parts: string[] = []
    this.where.text = `${m.world}${SEP}AS ${m.pilot}`
    if (this.where.width > left) {
      this.where.text = m.world
      parts.push(`AS ${m.pilot}`)
    }
    clip(this.where, left)
    this.where.position.set(PAD, 30)

    this.status.text = m.rankedOpen ? 'RANKED ATTEMPT READY' : m.rankedScore !== null ? `RANKED ${group(m.rankedScore)}` : ''
    this.status.style.fill = m.rankedOpen ? T.textPrimary : T.accentGold
    clip(this.status, left)
    this.status.position.set(PAD, 46)

    const btnY = narrow ? 66 : 28
    const bottomY = narrow ? btnY + BTN_H + 6 : 67
    // The countdown sits on the title row when it fits there; a narrow card gives
    // it a row of its own under the bottom line, a wide one shares the bottom line.
    const clockLow = this.title.width + 16 + CLOCK_MAX_W > inner
    const clockRow = clockLow && narrow
    const bottomW = inner - (clockLow && !narrow ? CLOCK_MAX_W + 8 : 0)

    if (m.threat > 0) parts.push(`THREAT ${m.threat}: ${m.threatName}`)
    if (m.practiceBest > 0) parts.push(`PRACTICE BEST ${group(m.practiceBest)}`)
    if (m.pilotFree) parts.push(`${m.pilot} is free to fly today.`)
    if (m.played > 0) parts.push(`${m.played} DAILIES PLAYED` + (m.streak >= 2 ? `${SEP}${m.streak} IN A ROW` : ''))
    // The bottom line takes each part in order while the line still fits.
    let line = ''
    for (const p of parts) {
      const next = line ? line + SEP + p : p
      this.extra.text = next
      if (this.extra.width <= bottomW) line = next
    }
    this.extra.text = line
    this.extra.position.set(PAD, bottomY)
    const clockY = clockRow ? (line ? bottomY + 17 : bottomY) : clockLow ? bottomY : 8
    this.clock.position.set(w - PAD, clockY)
    this.h = Math.max(bottomY, clockY) + 19

    const bw = narrow ? inner : BTN_W
    if (bw !== this.btnW) this.buildButtons(bw)
    this.play!.view.visible = m.rankedOpen
    this.practice!.view.visible = !m.rankedOpen
    const bx = narrow ? PAD : w - PAD - BTN_W
    this.play!.position(bx, btnY)
    this.practice!.position(bx, btnY)

    this.bg.clear()
    this.bg.roundRect(0, 0, w, this.h, RADIUS.card).fill(T.surfaceCard)
    this.bg.roundRect(1, 1, w - 2, this.h - 2, RADIUS.card - 1).stroke({ width: 2, color: m.rankedOpen ? T.accentGold : T.lineStrong, alpha: m.rankedOpen ? 0.7 : 1 })
    this.bg.hitArea = new Rectangle(0, 0, w, this.h)
    return this.h
  }

  /** The card's height after `set`. */
  get height(): number {
    return this.h
  }

  private buildButtons(bw: number): void {
    this.play?.view.destroy({ children: true })
    this.practice?.view.destroy({ children: true })
    this.btnW = bw
    this.play = new Button('PLAY RANKED', bw, BTN_H, 'primary', 14, T.accentGold)
    this.practice = new Button('PRACTICE', bw, BTN_H, 'secondary', 14)
    this.play.onClick = () => this.onPlay()
    this.practice.onClick = () => this.onPlay()
    this.view.addChild(this.play.view, this.practice.view)
  }

  /** Refresh the countdown (cheap: the text changes once a minute). */
  tick(nowMs: number): void {
    const min = Math.floor(nowMs / 60_000)
    if (min === this.clockMin || !this.model) return
    this.clockMin = min
    this.clock.text = countdownText(nowMs)
  }
}
