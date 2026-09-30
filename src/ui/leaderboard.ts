import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'
import { KNOWN_WORLDS, dailySpec } from '../core/rules.ts'
import { arenaById } from '../content/arenas.ts'
import { todayUtc } from '../state/daily.ts'
import { Button } from './button.ts'
import { FONT, T } from './tokens.ts'
import { fetchBoard, getPlayerName, optInState, type BoardResult, type BoardRow } from '../net/leaderboard.ts'

const ROWS = 12
const ROW_MIN = 24
const TAB_W = 104
const GAP = 8
const JOIN_W = 96

type Tab = 'daily' | 'week' | 'all'
const TABS: { key: Tab; label: string }[] = [
  { key: 'daily', label: 'DAILY' },
  { key: 'week', label: 'THIS WEEK' },
  { key: 'all', label: 'ALL TIME' },
]

/** Leaderboard screen: the Daily board and the Standard boards of one world
 *  (this week, all time), the player's own row, and the opt-in bar. Every
 *  failure shows as an offline line; nothing retries on its own. */
export class Leaderboard {
  readonly view = new Container()
  onBack: () => void = () => {}
  /** JOIN (not posting yet): name prompt and opt-in. Resolves null when the
   *  player cancels, else once posting is on, with the posts it started. */
  onJoin: () => Promise<{ posts: Promise<unknown> } | null> = async () => null
  /** Tap on the name while posting: edit it; resolves when done. */
  onEditName: () => Promise<void> = async () => {}

  private backdrop = new Graphics()
  private title: Text
  private nameLabel: Text
  private nameHit = new Container()
  private subhead: Text
  private status: Text
  private me: Text
  private tabBtns: Button[] = []
  private underline = new Graphics()
  private rows: { left: Text; right: Text }[] = []
  private world: Button
  private join: Button
  private back: Button
  private tab: Tab = 'daily'
  private worldId = KNOWN_WORLDS[0]!
  private reqId = 0
  /** The posts a JOIN started: a board loads after they land, so it shows them. */
  private posting: Promise<unknown> = Promise.resolve()
  /** Top of the world row, the list column and the rows that fit. */
  private worldY = 0
  private listX = 0
  private listW = 0
  private meY = 0
  private shownRows = ROWS

  constructor() {
    this.title = new Text({ text: 'LEADERBOARD', style: { fontFamily: FONT.display, fontSize: 28, fontWeight: '900', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0.5)

    this.nameLabel = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 13, fill: T.textPrimary } })
    this.nameLabel.anchor.set(0.5)
    this.nameHit.addChild(this.nameLabel)
    this.nameHit.eventMode = 'static'
    this.nameHit.cursor = 'pointer'
    this.nameHit.on('pointertap', () => void this.onEditName().then(() => this.refreshName()))

    this.subhead = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 12, fill: T.textMuted, letterSpacing: 1 } })
    this.subhead.anchor.set(0.5)
    this.status = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 14, fill: T.textMuted, align: 'center', wordWrap: true, wordWrapWidth: 320 } })
    this.status.anchor.set(0.5)
    this.me = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 14, fontWeight: '800', fill: COLORS.player } })
    this.me.anchor.set(0.5)

    for (const t of TABS) {
      const b = new Button(t.label, TAB_W, 44, 'secondary', 13)
      b.onClick = () => this.select(t.key)
      this.tabBtns.push(b)
    }
    this.world = new Button('', 200, 44, 'secondary', 13)
    this.world.onClick = () => {
      const i = KNOWN_WORLDS.indexOf(this.worldId)
      this.worldId = KNOWN_WORLDS[(i + 1) % KNOWN_WORLDS.length]!
      void this.load()
    }

    for (let i = 0; i < ROWS; i++) {
      const left = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 14, fill: COLORS.hudText } })
      left.anchor.set(0, 0.5)
      const right = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 14, fontWeight: 'bold', fill: 0xffe066 } })
      right.anchor.set(1, 0.5)
      this.rows.push({ left, right })
    }

    this.join = new Button('JOIN', JOIN_W, 44, 'primary', 14)
    this.join.onClick = () => void this.onJoin().then((joined) => {
      if (!joined) return
      this.posting = joined.posts
      this.refreshName()
      void this.load()
    })
    this.back = new Button('BACK', 160, 46, 'secondary', 16)
    this.back.onClick = () => this.onBack()

    this.view.addChild(this.backdrop, this.title, this.nameHit, this.subhead, this.underline, this.world.view)
    for (const b of this.tabBtns) this.view.addChild(b.view)
    for (const r of this.rows) this.view.addChild(r.left, r.right)
    this.view.addChild(this.status, this.me, this.join.view, this.back.view)
    this.view.visible = false
  }

  /** Portrait: one centered column. Short screens: the header, tabs and BACK
   *  in a left column, the rows and the YOU line in a right one. */
  layout(w: number, h: number, insets: Insets): void {
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.9 })
    const short = h < 560
    const left = insets.left + 16
    const right = w - insets.right - 16
    const colW = TABS.length * TAB_W + (TABS.length - 1) * GAP
    const hx = short ? left + colW / 2 : (left + right) / 2
    let y = short ? insets.top + 28 : Math.max(insets.top + 40, h * 0.5 - 270)
    this.title.scale.set(1)
    if (this.title.width > colW) this.title.scale.set(colW / this.title.width)
    this.title.position.set(hx, y)
    y += 30
    this.nameHit.position.set(hx, y)
    this.nameHit.hitArea = new Rectangle(-colW / 2, -22, colW, 44)
    y += 26
    let tx = hx - colW / 2
    for (const b of this.tabBtns) {
      b.position(tx, y)
      tx += TAB_W + GAP
    }
    y += 52
    this.worldY = y
    this.world.position(hx - 100, y)
    this.subhead.position.x = hx
    y += 44 + 32

    const backY = h - insets.bottom - 16 - 46
    this.back.position(hx - 80, backY)
    let listTop: number
    let listBottom: number
    if (short) {
      this.listX = left + colW + 24
      this.listW = right - this.listX
      listTop = insets.top + 16
      listBottom = h - insets.bottom - 16 - 44 - 8
    } else {
      this.listW = Math.min(440, right - left)
      this.listX = (left + right - this.listW) / 2
      listTop = y
      listBottom = backY - 16 - 44 - 8
    }
    this.meY = listBottom + 8 + 22
    this.shownRows = Math.max(1, Math.min(ROWS, Math.floor((listBottom - listTop) / ROW_MIN)))
    const rowH = Math.min(28, (listBottom - listTop) / this.shownRows)
    for (let i = 0; i < ROWS; i++) {
      const ry = listTop + rowH * (i + 0.5)
      this.rows[i]!.left.position.set(this.listX, ry)
      this.rows[i]!.right.position.set(this.listX + this.listW, ry)
      this.rows[i]!.left.visible = this.rows[i]!.right.visible = i < this.shownRows
    }
    this.status.style.wordWrapWidth = this.listW
    this.status.position.set(this.listX + this.listW / 2, listTop + rowH * 3)
    this.join.position(this.listX + this.listW - JOIN_W, this.meY - 22)
    this.drawUnderline()
    this.placeMe()
    this.placeSubhead()
  }

  /** Open on `worldId`'s Standard boards (the Daily tab first). */
  open(worldId: string): void {
    if (KNOWN_WORLDS.includes(worldId)) this.worldId = worldId
    this.view.visible = true
    this.refreshName()
    this.select('daily')
  }

  hide(): void {
    this.view.visible = false
  }

  private refreshName(): void {
    const posting = optInState() === true
    this.nameHit.visible = posting
    this.nameLabel.text = posting ? `NAME: ${getPlayerName()}  (TAP TO EDIT)` : ''
  }

  private select(tab: Tab): void {
    this.tab = tab
    this.drawUnderline()
    void this.load()
  }

  private drawUnderline(): void {
    this.underline.clear()
    const idx = TABS.findIndex((t) => t.key === this.tab)
    const btn = this.tabBtns[idx]
    if (!btn) return
    const x = btn.view.position.x
    const yb = btn.view.position.y + 46
    this.underline.roundRect(x + 12, yb, TAB_W - 24, 3, 1.5).fill(COLORS.player)
  }

  private async load(): Promise<void> {
    const daily = this.tab === 'daily'
    const spec = dailySpec(todayUtc())
    const worldName = arenaById(daily ? spec.world : this.worldId).name
    this.world.view.visible = !daily
    this.world.setText(worldName)
    this.subhead.text = daily ? `DAILY #${spec.number} · ${worldName}` : 'TAP THE WORLD TO SWITCH IT'
    this.placeSubhead()
    for (const r of this.rows) {
      r.left.text = ''
      r.right.text = ''
    }
    this.me.text = ''
    this.status.text = 'LOADING'
    this.placeMe()
    const id = ++this.reqId
    await this.posting
    if (id !== this.reqId || !this.view.visible) return
    this.refreshName() // a post can come back renamed
    const res = await fetchBoard(daily ? { board: 'daily', day: spec.date, limit: ROWS } : { board: 'endless', world: this.worldId, period: this.tab === 'week' ? 'week' : 'all', limit: ROWS })
    if (id !== this.reqId || !this.view.visible) return // a newer tab switch superseded this fetch
    this.show(res)
  }

  private show(res: BoardResult): void {
    if (!res.ok) {
      this.status.text =
        res.reason === 'gone' ? 'The leaderboard is offline.' : res.reason === 'outdated' ? 'Update the game to see the leaderboard.' : 'Could not reach the leaderboard.'
      this.placeMe()
      return
    }
    this.status.text = res.rows.length === 0 ? 'No scores yet. Be the first.' : ''
    res.rows.slice(0, this.shownRows).forEach((e, i) => this.fillRow(i, e))
    if (optInState() === true) {
      this.me.text = res.me
        ? `YOU  #${res.me.rank.toLocaleString('en-US')} OF ${res.me.of.toLocaleString('en-US')} · TOP ${res.me.pct}%`
        : 'YOU  no score on this board yet'
    }
    this.placeMe()
  }

  /** The Daily's subhead takes the world button's place; a Standard one sits under it. */
  private placeSubhead(): void {
    this.subhead.position.y = this.tab === 'daily' ? this.worldY + 22 : this.worldY + 44 + 16
  }

  /** The YOU line while posting; the opt-in bar with JOIN otherwise. */
  private placeMe(): void {
    const posting = optInState() === true
    this.join.view.visible = !posting
    this.me.position.y = this.meY
    if (!posting) {
      this.me.text = 'You are not posting scores.'
      this.me.style.fill = T.textMuted
      this.me.style.wordWrap = true
      this.me.style.wordWrapWidth = this.listW - JOIN_W - 12
      this.me.anchor.set(0, 0.5)
      this.me.position.x = this.listX
    } else {
      this.me.style.fill = COLORS.player
      this.me.style.wordWrap = false
      this.me.anchor.set(0.5)
      this.me.position.x = this.listX + this.listW / 2
    }
  }

  private fillRow(i: number, e: BoardRow): void {
    const row = this.rows[i]
    if (!row) return
    const loc = e.country ? ` ${e.country}` : ''
    const threat = e.threat > 0 ? ` T${e.threat}` : ''
    row.right.text = e.score.toLocaleString('en-US')
    row.left.text = `${String(e.rank).padStart(2)}  ${e.name}${loc}${threat}`
    // A narrow column drops the country and threat before a row runs into its score.
    if (row.left.width + 12 + row.right.width > this.listW) row.left.text = `${String(e.rank).padStart(2)}  ${e.name}`
    row.left.style.fill = i === 0 ? 0xffe066 : COLORS.hudText
    row.right.style.fill = 0xffe066
  }
}
