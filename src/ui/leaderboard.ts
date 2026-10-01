import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'
import { KNOWN_WORLDS, dailySpec } from '../core/rules.ts'
import { arenaById } from '../content/arenas.ts'
import { characterById } from '../content/characters.ts'
import { paintById } from '../content/paints.ts'
import { todayUtc } from '../state/daily.ts'
import { Button, Segmented } from './button.ts'
import { clip } from './goalsPanel.ts'
import { IconButton } from './iconButton.ts'
import { ScrollView, type ScrollRow } from './scroll.ts'
import { FONT, INK, RADIUS, T, TARGET, uiScale } from './tokens.ts'
import { fetchBoard, getPlayerName, optInState, type BoardResult, type BoardRow } from '../net/leaderboard.ts'

const LIMIT = 50
const ROW_H = 30
const BAR_H = 52
const HEAD_H = 18
const LEFT_W = 260
/** Design widths of the row columns (12 px text). */
const C_RANK = 30
const C_GLYPH = 16
const C_TIME = 40
const C_KILLS = 44
const C_SCORE = 76
const THREAT_W = 26
/** The list never grows wider than this (design px); a wide screen centers it. */
const LIST_MAX_W = 620
const GAP = 6
/** Room kept right of the rows for the scroll thumb. */
const THUMB_ROOM = 8
/** Below this screen width (design px) the KILLS column hides. */
const KILLS_MIN_W = 360
/** Top-3 rank chips; every chip takes INK ink. */
const PODIUM = [T.accentGold, T.textHi, T.rarityEvolution] as const

type Tab = 'daily' | 'week' | 'all'
const TABS: readonly Tab[] = ['daily', 'week', 'all']
const SEP = ' · '

function group(v: number): string {
  return Math.floor(v).toLocaleString('en-US')
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/** One board row: rank chip, pilot glyph in the row's paint, name and country,
 *  THREAT chip, TIME, KILLS and SCORE. Pooled; filled at event rate. */
class RowView {
  readonly view = new Container()
  private readonly chip = new Graphics()
  private readonly rank: Text
  private readonly glyph = new Graphics()
  private readonly name: Text
  private readonly country: Text
  private readonly threatBg = new Graphics()
  private readonly threat: Text
  private readonly time: Text
  private readonly kills: Text
  private readonly score: Text

  constructor() {
    const t = (size: number, fill: number, weight: '500' | '800'): Text => new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: weight, fontSize: size, fill } })
    this.rank = t(12, T.textHi, '800')
    this.rank.anchor.set(0.5)
    this.name = t(13, T.textHi, '800')
    this.name.anchor.set(0, 0.5)
    this.country = t(12, T.textMuted, '500')
    this.country.anchor.set(0, 0.5)
    this.threat = t(12, INK, '800')
    this.threat.anchor.set(0.5)
    this.time = t(12, T.textMuted, '500')
    this.time.anchor.set(1, 0.5)
    this.kills = t(12, T.textMuted, '500')
    this.kills.anchor.set(1, 0.5)
    this.score = t(13, T.accentGold, '800')
    this.score.anchor.set(1, 0.5)
    this.view.addChild(this.chip, this.rank, this.glyph, this.name, this.country, this.threatBg, this.threat, this.time, this.kills, this.score)
  }

  fill(e: BoardRow, w: number, kills: boolean): void {
    const cy = ROW_H / 2
    const podium = e.rank <= 3 ? PODIUM[e.rank - 1]! : -1
    this.chip.clear()
    this.chip.roundRect(0, cy - 10, C_RANK, 20, RADIUS.chip).fill(podium >= 0 ? podium : T.surfaceRaised)
    this.rank.text = String(e.rank)
    this.rank.style.fill = podium >= 0 ? INK : T.textHi
    this.rank.position.set(C_RANK / 2, cy)
    drawGlyph(this.glyph, e.pilot, e.paint)
    this.glyph.position.set(C_RANK + GAP + C_GLYPH / 2, cy)

    let x = w
    this.score.text = group(e.score)
    this.score.position.set(x, cy)
    x -= C_SCORE + GAP
    this.kills.visible = kills
    if (kills) {
      this.kills.text = group(e.kills)
      this.kills.position.set(x, cy)
      x -= C_KILLS + GAP
    }
    this.time.text = clock(e.timeMs)
    this.time.position.set(x, cy)
    x -= C_TIME + GAP

    // Name, then the THREAT chip, then the country, all left of the TIME column.
    const nx = C_RANK + GAP + C_GLYPH + GAP
    const right = x
    const chipW = e.threat > 0 ? THREAT_W + 6 : 0
    this.name.text = e.name
    this.name.position.set(nx, cy)
    clip(this.name, right - nx - chipW)
    let cx = nx + this.name.width + 6
    this.threatBg.clear()
    this.threat.visible = e.threat > 0
    if (e.threat > 0) {
      this.threat.text = 'T' + e.threat
      this.threatBg.roundRect(cx, cy - 9, THREAT_W, 18, RADIUS.chip).fill(T.accentDanger)
      this.threat.position.set(cx + THREAT_W / 2, cy)
      cx += THREAT_W + 6
    }
    this.country.text = e.country ?? ''
    this.country.position.set(cx, cy)
    this.country.visible = !!e.country && cx + this.country.width <= right
  }
}

/** A small hull per pilot (NOVA round, EMBER wedge, VESPER hex) in the row's paint. */
function drawGlyph(g: Graphics, pilot: string, paintId: string): void {
  const c = characterById(pilot)
  const p = paintById(paintId)
  const body = p ? p.body : c.colors.body
  const outline = p ? p.outline : c.colors.outline
  const r = 7
  g.clear()
  if (c.shape === 'dart') g.poly([r * 1.2, 0, -r, -r * 0.85, -r * 0.5, 0, -r, r * 0.85])
  else if (c.shape === 'heavy') {
    const pts: number[] = []
    for (let i = 0; i < 6; i++) pts.push(Math.cos((Math.PI / 3) * i) * r, Math.sin((Math.PI / 3) * i) * r)
    g.poly(pts)
  } else g.circle(0, 0, r)
  g.fill(body).stroke({ width: 1.5, color: outline === INK ? T.lineStrong : outline })
}

/**
 * The leaderboard (section 8.5): DAILY, THIS WEEK and ALL TIME, world chips
 * under the Standard views, a scrolling list, the pinned YOU row, and the
 * opt-in bar with JOIN. Every failure (no network, a server still on v1, a
 * client too old) shows one plain line; nothing retries on its own.
 */
export class Leaderboard {
  readonly view = new Container()
  onBack: () => void = () => {}
  /** JOIN (not posting yet): name prompt and opt-in. Resolves null when the
   *  player cancels, else once posting is on, with the posts it started. */
  onJoin: () => Promise<{ posts: Promise<unknown> } | null> = async () => null
  /** Tap on the name while posting: edit it; resolves when done. */
  onEditName: () => Promise<void> = async () => {}

  private readonly root = new Container()
  private readonly backdrop = new Graphics()
  private readonly title: Text
  private readonly close = new IconButton('close')
  private readonly nameLabel: Text
  private readonly nameHit = new Container()
  private tabs: Segmented
  private worlds: Segmented
  private readonly subhead: Text
  private readonly head: Text[]
  private readonly scroll = new ScrollView()
  private readonly rows: RowView[] = []
  private readonly status: Text
  private readonly retry: Button
  private readonly bar = new Graphics()
  private readonly me: Text
  private readonly join: Button
  private tab: Tab = 'daily'
  private worldId = KNOWN_WORLDS[0]!
  private reqId = 0
  /** The posts a JOIN started: a board loads after they land, so it shows them. */
  private posting: Promise<unknown> = Promise.resolve()
  private last: BoardResult | null = null
  private readonly barRect = new Rectangle()
  private listW = 0
  private showKills = true
  private segW = 0
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.backdrop.eventMode = 'static'
    this.title = new Text({ text: 'LEADERBOARD', style: { fontFamily: FONT.display, fontSize: 22, fontWeight: '900', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0, 0.5)
    this.close.onClick = () => this.onBack()

    this.nameLabel = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 13, fill: T.textPrimary } })
    this.nameLabel.anchor.set(0.5)
    this.nameHit.addChild(this.nameLabel)
    this.nameHit.eventMode = 'static'
    this.nameHit.cursor = 'pointer'
    this.nameHit.on('pointertap', () => void this.onEditName().then(() => this.refreshName()))

    this.tabs = this.makeTabs(343)
    this.worlds = this.makeWorlds(343)
    this.subhead = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 13, letterSpacing: 1, fill: T.accentGold } })
    this.subhead.anchor.set(0.5)
    this.head = ['#', 'PILOT', 'TIME', 'KILLS', 'SCORE'].map(
      (s) => new Text({ text: s, style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, letterSpacing: 1, fill: T.textMuted } }),
    )
    for (let i = 0; i < LIMIT; i++) {
      const r = new RowView()
      r.view.visible = false
      this.rows.push(r)
      this.scroll.content.addChild(r.view)
    }
    this.status = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 14, lineHeight: 20, fill: T.textHi, align: 'center', wordWrap: true } })
    this.status.anchor.set(0.5, 0)
    this.retry = new Button('TRY AGAIN', 160, TARGET.compact, 'secondary', 14)
    this.retry.onClick = () => void this.load()
    this.me = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 13, fill: COLORS.player, wordWrap: true } })
    this.me.anchor.set(0, 0.5)
    this.join = new Button('JOIN', 96, TARGET.compact, 'primary', 15)
    this.join.onClick = () =>
      void this.onJoin().then((joined) => {
        if (!joined) return
        this.posting = joined.posts
        this.refreshName()
        this.layout(this.w, this.h, this.insets)
        void this.load()
      })

    this.root.addChild(this.backdrop, this.title, this.close.view, this.nameHit, this.tabs.view, this.worlds.view, this.subhead, ...this.head)
    this.root.addChild(this.scroll.view, this.status, this.retry.view, this.bar, this.me, this.join.view)
    this.view.addChild(this.root)
    this.view.visible = false
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (!this.view.visible) return
    const s = uiScale(w, h)
    this.root.scale.set(s)
    const W = w / s
    const H = h / s
    const L = insets.left / s
    const R = insets.right / s
    const top = insets.top / s
    const bottom = H - insets.bottom / s
    const landscape = W > H
    this.backdrop.clear()
    this.backdrop.rect(0, 0, W, H).fill(T.bgVoid)
    this.backdrop.hitArea = new Rectangle(0, 0, W, H)
    const x0 = L + 16
    const cw = W - L - R - 32
    this.title.position.set(x0, top + 12 + TARGET.compact / 2)
    this.close.position(W - R - 16 - TARGET.compact, top + 12)
    this.showKills = W >= KILLS_MIN_W

    // The controls column: one centered column in portrait, the left one in landscape.
    const colW = landscape ? Math.min(LEFT_W, cw * 0.42) : Math.min(cw, 420)
    const ccx = landscape ? x0 + colW / 2 : x0 + cw / 2
    let y = top + 12 + TARGET.compact + 8
    const posting = optInState() === true
    this.nameHit.visible = posting
    if (posting) {
      this.nameHit.position.set(ccx, y + 12)
      this.nameHit.hitArea = new Rectangle(-colW / 2, -TARGET.compact / 2, colW, TARGET.compact)
      y += 32
    }
    if (Math.round(colW) !== this.segW) {
      this.segW = Math.round(colW)
      this.rebuildSegments(colW)
    }
    this.tabs.view.position.set(ccx - colW / 2, y)
    y += Segmented.H + 8
    this.worlds.view.position.set(ccx - colW / 2, y)
    this.subhead.position.set(ccx, y + Segmented.H / 2)
    y += Segmented.H + 12

    // The YOU / JOIN bar: under the list in portrait, at the left column's foot in landscape.
    const barW = landscape ? colW : Math.min(cw, 520)
    const barX = landscape ? x0 : x0 + (cw - barW) / 2
    const barY = bottom - 16 - BAR_H
    this.barRect.x = barX
    this.barRect.y = barY
    this.barRect.width = barW
    this.me.position.set(barX + 12, barY + BAR_H / 2)
    this.join.position(barX + barW - 12 - 96, barY + (BAR_H - TARGET.compact) / 2)

    const areaX = landscape ? x0 + colW + 24 : barX
    const areaW = landscape ? W - R - 16 - areaX : barW
    this.listW = Math.min(areaW, LIST_MAX_W)
    const listX = areaX + (areaW - this.listW) / 2
    const listTop = (landscape ? top + 12 + TARGET.compact + 8 : y) + HEAD_H + 4
    const listBottom = landscape ? bottom - 12 : barY - 8
    this.placeHead(listX, listTop - HEAD_H - 4)
    const rowsFit = Math.max(1, Math.floor((listBottom - listTop) / ROW_H))
    this.scroll.setViewport(listX, listTop, this.listW, rowsFit * ROW_H)
    this.status.style.wordWrapWidth = this.listW - 24
    this.status.position.set(listX + this.listW / 2, listTop + ROW_H)
    this.retry.position(listX + this.listW / 2 - 80, listTop + ROW_H + 52)
    if (this.last) this.show(this.last)
    this.placeBar()
  }

  /** Open on `worldId`'s Standard boards (the Daily tab first). */
  open(worldId: string): void {
    if (KNOWN_WORLDS.includes(worldId)) this.worldId = worldId
    this.view.visible = true
    this.refreshName()
    this.tab = 'daily'
    this.tabs.set(0)
    this.worlds.set(Math.max(0, KNOWN_WORLDS.indexOf(this.worldId)))
    this.layout(this.w, this.h, this.insets)
    void this.load()
  }

  hide(): void {
    this.view.visible = false
  }

  isOpen(): boolean {
    return this.view.visible
  }

  private makeTabs(w: number): Segmented {
    const s = new Segmented(['DAILY', 'THIS WEEK', 'ALL TIME'], w, 13)
    s.onChange = (i) => {
      this.tab = TABS[i]!
      void this.load()
    }
    return s
  }

  private makeWorlds(w: number): Segmented {
    const s = new Segmented(KNOWN_WORLDS.map((id) => id.toUpperCase()), w, 13)
    s.onChange = (i) => {
      this.worldId = KNOWN_WORLDS[i]!
      void this.load()
    }
    return s
  }

  private rebuildSegments(w: number): void {
    for (const [old, make] of [
      [this.tabs, (x: number) => (this.tabs = this.makeTabs(x))],
      [this.worlds, (x: number) => (this.worlds = this.makeWorlds(x))],
    ] as const) {
      const i = this.root.getChildIndex(old.view)
      old.view.destroy({ children: true })
      const s = make(w)
      this.root.addChildAt(s.view, i)
    }
    this.tabs.set(TABS.indexOf(this.tab))
    this.worlds.set(Math.max(0, KNOWN_WORLDS.indexOf(this.worldId)))
  }

  private placeHead(x: number, y: number): void {
    const [rank, pilot, time, kills, score] = this.head as [Text, Text, Text, Text, Text]
    rank.anchor.set(0.5, 0)
    rank.position.set(x + C_RANK / 2, y)
    pilot.position.set(x + C_RANK + GAP, y)
    let rx = x + this.listW - THUMB_ROOM
    score.anchor.set(1, 0)
    score.position.set(rx, y)
    rx -= C_SCORE + GAP
    kills.anchor.set(1, 0)
    if (this.showKills) {
      kills.position.set(rx, y)
      rx -= C_KILLS + GAP
    }
    time.anchor.set(1, 0)
    time.position.set(rx, y)
  }

  private refreshName(): void {
    const posting = optInState() === true
    this.nameHit.visible = posting
    this.nameLabel.text = posting ? `NAME: ${getPlayerName()}  (TAP TO EDIT)` : ''
  }

  private async load(): Promise<void> {
    const daily = this.tab === 'daily'
    const spec = dailySpec(todayUtc())
    this.worlds.view.visible = !daily
    this.subhead.visible = daily
    this.subhead.text = `DAILY #${spec.number}${SEP}${arenaById(spec.world).name}`
    this.last = null
    for (const r of this.rows) r.view.visible = false
    this.scroll.setRows([], 0)
    this.scroll.scrollTo(0)
    this.status.text = 'LOADING'
    this.status.visible = true
    for (const t of this.head) t.visible = false
    this.retry.view.visible = false
    this.placeBar()
    const id = ++this.reqId
    await this.posting
    if (id !== this.reqId || !this.view.visible) return
    this.refreshName() // a post can come back renamed
    const res = await fetchBoard(daily ? { board: 'daily', day: spec.date, limit: LIMIT } : { board: 'endless', world: this.worldId, period: this.tab === 'week' ? 'week' : 'all', limit: LIMIT })
    if (id !== this.reqId || !this.view.visible) return // a newer tab switch superseded this fetch
    this.last = res
    this.show(res)
    this.placeBar()
  }

  private show(res: BoardResult): void {
    for (const t of this.head) t.visible = res.ok && res.rows.length > 0
    if (!this.showKills) this.head[3]!.visible = false
    if (!res.ok) {
      this.status.text =
        res.reason === 'gone' ? 'The leaderboard is offline.' : res.reason === 'outdated' ? 'Update the game to see the leaderboard.' : 'Could not reach the leaderboard.'
      this.status.visible = true
      this.retry.view.visible = res.reason === 'offline'
      return
    }
    this.retry.view.visible = false
    this.status.visible = res.rows.length === 0
    this.status.text = res.rows.length === 0 ? 'No scores yet. Be the first.' : ''
    const shown: ScrollRow[] = []
    res.rows.slice(0, LIMIT).forEach((e, i) => {
      const r = this.rows[i]!
      r.fill(e, this.listW - THUMB_ROOM, this.showKills)
      r.view.y = i * ROW_H
      shown.push({ view: r.view, h: ROW_H })
    })
    for (let i = res.rows.length; i < this.rows.length; i++) this.rows[i]!.view.visible = false
    this.scroll.setRows(shown, shown.length * ROW_H)
  }

  /** The YOU line while posting; the opt-in bar with JOIN otherwise. */
  private placeBar(): void {
    const posting = optInState() === true
    this.join.view.visible = !posting
    const b = this.barRect
    this.bar.clear()
    this.bar.roundRect(b.x, b.y, b.width, BAR_H, RADIUS.card).fill(T.surfaceRaised).stroke({ width: 2, color: posting ? T.accentPlayer : T.lineStrong })
    this.me.style.wordWrapWidth = b.width - 24 - (posting ? 0 : 96 + 8)
    const res = this.last
    if (!posting) {
      this.me.text = 'You are not posting scores.'
      this.me.style.fill = T.textHi
    } else if (res && res.ok) {
      this.me.text = res.me ? `YOU  #${group(res.me.rank)} OF ${group(res.me.of)}${SEP}TOP ${res.me.pct}%` : 'YOU  no score on this board yet'
      this.me.style.fill = res.me ? COLORS.player : T.textMuted
    }
    // Posting with no board to rank against: the bar has nothing to say.
    const empty = posting && !(res && res.ok)
    this.bar.visible = this.me.visible = !empty
  }
}
