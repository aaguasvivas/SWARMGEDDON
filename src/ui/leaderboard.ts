import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import { Button } from './button.ts'
import { fetchBoard, getPlayerName, setPlayerName, leaderboardEnabled, type BoardEntry } from '../net/leaderboard.ts'
import { promptName } from './namePrompt.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'
const ROWS = 12

type Tab = 'global' | 'region' | 'daily'
const TABS: { key: Tab; label: string; mode: 'endless' | 'daily'; board: 'alltime' | 'daily'; scope: 'global' | 'region' }[] = [
  { key: 'global', label: 'GLOBAL', mode: 'endless', board: 'alltime', scope: 'global' },
  { key: 'region', label: 'REGION', mode: 'endless', board: 'alltime', scope: 'region' },
  { key: 'daily', label: 'DAILY', mode: 'daily', board: 'daily', scope: 'global' },
]

/** Global leaderboard screen — Global / Region / Daily tabs, top scores, and an
 *  editable player name. No-ops gracefully when no backend is configured. */
export class Leaderboard {
  readonly view = new Container()
  onBack: () => void = () => {}

  private backdrop = new Graphics()
  private title: Text
  private nameLabel: Text
  private nameHit = new Container()
  private subhead: Text
  private status: Text
  private tabBtns: Button[] = []
  private underline = new Graphics()
  private rows: { left: Text; right: Text }[] = []
  private back: Button
  private tab: Tab = 'global'
  private reqId = 0

  constructor() {
    this.title = new Text({ text: 'LEADERBOARD', style: { fontFamily: MONO, fontSize: 30, fontWeight: 'bold', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0.5)

    this.nameLabel = new Text({ text: '', style: { fontFamily: MONO, fontSize: 13, fill: COLORS.hudText } })
    this.nameLabel.anchor.set(0.5)
    this.nameHit.addChild(this.nameLabel)
    this.nameHit.eventMode = 'static'
    this.nameHit.cursor = 'pointer'
    this.nameHit.on('pointertap', () => void this.editName())

    this.subhead = new Text({ text: '', style: { fontFamily: MONO, fontSize: 12, fill: COLORS.hudDim, letterSpacing: 1 } })
    this.subhead.anchor.set(0.5)
    this.status = new Text({ text: '', style: { fontFamily: MONO, fontSize: 14, fill: COLORS.hudDim, align: 'center' } })
    this.status.anchor.set(0.5)

    for (const t of TABS) {
      const b = new Button(t.label, 110, 38, COLORS.player, 13)
      b.onClick = () => this.select(t.key)
      this.tabBtns.push(b)
    }

    for (let i = 0; i < ROWS; i++) {
      const left = new Text({ text: '', style: { fontFamily: MONO, fontSize: 15, fill: COLORS.hudText } })
      left.anchor.set(0, 0.5)
      const right = new Text({ text: '', style: { fontFamily: MONO, fontSize: 15, fontWeight: 'bold', fill: 0xffe066 } })
      right.anchor.set(1, 0.5)
      this.rows.push({ left, right })
    }

    this.back = new Button('BACK', 160, 46, COLORS.hudDim)
    this.back.onClick = () => this.onBack()

    this.view.addChild(this.backdrop, this.title, this.nameHit, this.subhead, this.underline)
    for (const b of this.tabBtns) this.view.addChild(b.view)
    for (const r of this.rows) this.view.addChild(r.left, r.right)
    this.view.addChild(this.status, this.back.view)
    this.view.visible = false
  }

  layout(w: number, h: number): void {
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.82 })

    const cx = w / 2
    const listW = Math.min(440, w - 48)
    const lx = cx - listW / 2
    const rx = cx + listW / 2
    let y = Math.max(40, h * 0.5 - 250)
    this.title.position.set(cx, y)
    y += 30
    this.nameHit.position.set(cx, y)
    this.nameHit.hitArea = new Rectangle(-110, -12, 220, 24)
    y += 30

    // Tabs centered as a row.
    const tabW = 110
    const gap = 8
    const totalW = TABS.length * tabW + (TABS.length - 1) * gap
    let tx = cx - totalW / 2
    for (const b of this.tabBtns) {
      b.position(tx, y)
      tx += tabW + gap
    }
    y += 46
    this.subhead.position.set(cx, y)
    y += 22

    // Rows.
    const rowH = Math.min(30, (h - y - 90) / ROWS)
    for (let i = 0; i < ROWS; i++) {
      const ry = y + rowH * (i + 0.5)
      this.rows[i]!.left.position.set(lx, ry)
      this.rows[i]!.right.position.set(rx, ry)
    }
    this.status.position.set(cx, y + rowH * 3)
    this.back.position(cx - 80, h - Math.max(60, h * 0.08))
    this.drawUnderline()
  }

  open(): void {
    this.view.visible = true
    this.refreshName()
    this.select('global')
  }

  hide(): void {
    this.view.visible = false
  }

  private refreshName(): void {
    const n = getPlayerName()
    this.nameLabel.text = n ? `you — ${n}  ✎` : 'tap to set your name  ✎'
  }

  private async editName(): Promise<void> {
    const next = await promptName(getPlayerName())
    if (next !== null) {
      setPlayerName(next)
      this.refreshName()
    }
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
    const yb = btn.view.position.y + 40
    this.underline.roundRect(x + 12, yb, 110 - 24, 3, 1.5).fill(COLORS.player)
  }

  private async load(): Promise<void> {
    const cfg = TABS.find((t) => t.key === this.tab)!
    this.subhead.text = `${cfg.label} · ${cfg.board === 'daily' ? "TODAY'S DAILY" : 'ALL-TIME'}`
    for (const r of this.rows) {
      r.left.text = ''
      r.right.text = ''
    }
    if (!leaderboardEnabled()) {
      this.status.text = 'leaderboard not configured yet\n(set VITE_LEADERBOARD_URL)'
      return
    }
    this.status.text = 'loading…'
    const id = ++this.reqId
    const res = await fetchBoard({ mode: cfg.mode, board: cfg.board, scope: cfg.scope, limit: ROWS })
    if (id !== this.reqId) return // a newer tab switch superseded this fetch
    if (!res) {
      this.status.text = 'could not reach the leaderboard'
      return
    }
    if (res.entries.length === 0) {
      this.status.text = cfg.scope === 'region' && res.region ? `no scores in ${res.region} yet — be the first!` : 'no scores yet — be the first!'
      return
    }
    this.status.text = ''
    const myName = getPlayerName()
    res.entries.slice(0, ROWS).forEach((e, i) => this.fillRow(i, e, myName))
  }



  private fillRow(i: number, e: BoardEntry, myName: string): void {
    const row = this.rows[i]
    if (!row) return
    const loc = e.country ? ` ${e.country}` : ''
    row.left.text = `${String(e.rank).padStart(2)}.  ${e.name}${loc}`
    row.right.text = e.score.toLocaleString()
    const mine = myName && e.name === myName
    row.left.style.fill = mine ? COLORS.player : i === 0 ? 0xffe066 : COLORS.hudText
    row.right.style.fill = mine ? COLORS.player : 0xffe066
  }
}
