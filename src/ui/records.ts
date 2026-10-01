import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import { ARENAS } from '../content/arenas.ts'
import { CHARACTERS } from '../content/characters.ts'
import { FEATS, rewardLine, type FeatDef } from '../content/feats.ts'
import type { Insets } from '../platform/safeArea.ts'
import { loadJSON } from '../platform/storage.ts'
import { loadFeats } from '../state/feats.ts'
import { loadWorldBest } from '../state/persistence.ts'
import { loadStats, type LifetimeStats } from '../state/stats.ts'
import { isOwned } from '../state/unlocks.ts'
import { Segmented } from './button.ts'
import { featProgress, featValue } from './goalsPanel.ts'
import { IconButton } from './iconButton.ts'
import { ScrollView, type ScrollRow } from './scroll.ts'
import { FONT, RADIUS, T, TARGET, ensureContrast, uiScale } from './tokens.ts'

const COL_MAX = 520
const SEP = ' · '

/** FEATS tab groups, by what the feat rewards. */
const GROUPS: { title: string; has: (reward: string) => boolean }[] = [
  { title: 'PILOTS AND WORLDS', has: (r) => r.indexOf(':') < 0 },
  { title: 'WEAPONS', has: (r) => r.startsWith('weapon:') },
  { title: 'PERKS', has: (r) => r.startsWith('perk:') },
  { title: 'PAINTS', has: (r) => r.startsWith('paint:') },
]

function txt(size: number, fill: number, weight: '500' | '700' | '800' = '500', display = false): Text {
  return new Text({ text: '', style: { fontFamily: display ? FONT.display : FONT.mono, fontWeight: weight, fontSize: size, lineHeight: Math.round(size * 1.35), fill } })
}

function group(v: number): string {
  return Math.floor(v).toLocaleString('en-US')
}

function clock(sec: number): string {
  const s = Math.floor(sec)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

function hours(sec: number): string {
  const m = Math.floor(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}H ${m % 60}M` : `${m}M`
}

/** A row of the scrolling list, laid out to a width. */
interface Block extends ScrollRow {
  layout(w: number): void
}

/** One feat: name and status, task, reward line and progress bar. */
function featBlock(f: FeatDef): Block & { set(done: string | undefined, value: number): void } {
  const view = new Container()
  const name = txt(13, T.textHi, '800')
  const status = txt(12, T.textMuted, '800')
  status.anchor.set(1, 0)
  const desc = txt(12, T.textMuted)
  const reward = txt(12, T.accentGold)
  reward.style.wordWrap = true
  const bar = new Graphics()
  const line = new Graphics()
  view.addChild(name, status, desc, reward, bar, line)
  name.text = f.name
  desc.text = f.desc
  let done: string | undefined
  let frac = 0
  const b = {
    view,
    h: 0,
    set(d: string | undefined, value: number) {
      done = d
      frac = Math.min(1, value / f.target)
      status.text = d ? 'DONE ' + d : featProgress(f, value)
      status.style.fill = d ? T.textPrimary : T.textMuted
      const owned = !d && isOwned(f.reward)
      reward.text = rewardLine(f.reward) + (owned ? SEP + 'Already yours' : '')
    },
    layout(w: number) {
      name.position.set(0, 8)
      status.position.set(w, 9)
      desc.position.set(0, 28)
      reward.style.wordWrapWidth = w
      reward.position.set(0, 46)
      let y = 46 + reward.height + 6
      bar.clear()
      bar.visible = !done
      if (!done) {
        bar.roundRect(0, y, w, 3, 1.5).fill(T.lineFaint)
        if (frac > 0) bar.roundRect(0, y, Math.max(3, w * frac), 3, 1.5).fill(T.accentPlayer)
        y += 3
      }
      y += 10
      line.clear()
      line.rect(0, y - 1, w, 1).fill(T.lineFaint)
      b.h = y
    },
  }
  return b
}

function headBlock(title: string, size = 12, fill: number = T.textMuted, display = false): Block & { text: Text } {
  const view = new Container()
  const t = txt(size, fill, display ? '700' : '800', display)
  t.style.letterSpacing = 1
  t.text = title
  view.addChild(t)
  const b = {
    view,
    text: t,
    h: 0,
    layout() {
      t.position.set(0, 14)
      b.h = 14 + t.height + 6
    },
  }
  return b
}

/** Label and value pairs in two columns. */
function gridBlock(pairs: () => [string, string][], title?: () => [string, number]): Block {
  const view = new Container()
  const bg = new Graphics()
  const head = txt(15, T.textHi, '700', true)
  view.addChild(bg, head)
  const cells: { k: Text; v: Text }[] = []
  const b = {
    view,
    h: 0,
    layout(w: number) {
      const ps = pairs()
      while (cells.length < ps.length) {
        const k = txt(12, T.textMuted, '500')
        const v = txt(13, T.textHi, '800')
        v.anchor.set(1, 0)
        cells.push({ k, v })
        view.addChild(k, v)
      }
      let y = 10
      head.visible = !!title
      if (title) {
        const [t, color] = title()
        head.text = t
        head.style.fill = ensureContrast(color, T.surfaceCard)
        head.position.set(12, y)
        y += 28
      }
      const colW = (w - 24 - 16) / 2
      cells.forEach((c, i) => {
        const p = ps[i]
        c.k.visible = c.v.visible = !!p
        if (!p) return
        const cx = 12 + (i % 2) * (colW + 16)
        const cy = y + Math.floor(i / 2) * 22
        c.k.text = p[0]
        c.v.text = p[1]
        c.k.position.set(cx, cy)
        c.v.position.set(cx + colW, cy - 1)
      })
      const h = y + Math.ceil(ps.length / 2) * 22 + 6
      bg.clear()
      bg.roundRect(0, 0, w, h, RADIUS.card).fill(T.surfaceCard)
      b.h = h + 10
    },
  }
  return b
}

/**
 * RECORDS (section 9.9): the FEATS tab (every feat with its task, progress,
 * reward and done date, grouped by reward) and the RECORDS tab (a card per
 * world, a line per pilot, the career totals and the v1 legacy line).
 */
export class Records {
  readonly view = new Container()
  onBack: () => void = () => {}
  private readonly root = new Container()
  private readonly backdrop = new Graphics()
  private readonly title: Text
  private readonly close = new IconButton('close')
  private tabs: Segmented
  private tab = 0
  private readonly scroll = new ScrollView()
  private featsTab: Block[] = []
  private recordsTab: Block[] = []
  private feats: ReturnType<typeof featBlock>[] = []
  private featsHead: (Block & { text: Text }) | null = null
  private stats: LifetimeStats = loadStats()
  private tabW = 0
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.backdrop.eventMode = 'static'
    this.title = new Text({ text: 'RECORDS', style: { fontFamily: FONT.display, fontSize: 22, fontWeight: '900', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0, 0.5)
    this.close.onClick = () => this.onBack()
    this.tabs = this.makeTabs(343)
    this.root.addChild(this.backdrop, this.title, this.close.view, this.tabs.view, this.scroll.view)
    this.view.addChild(this.root)
    this.view.visible = false
  }

  open(): void {
    if (this.featsTab.length === 0) this.build()
    this.stats = loadStats()
    const s = loadFeats()
    let n = 0
    for (const b of this.feats) {
      const f = FEATS[this.feats.indexOf(b)]!
      const d = s.done[f.id]
      if (d) n++
      b.set(d, d ? f.target : featValue(f, s.prog, this.stats))
    }
    this.featsHead!.text.text = `FEATS ${n} / ${FEATS.length}`
    this.view.visible = true
    this.scroll.scrollTo(0)
    this.layout(this.w, this.h, this.insets)
  }

  hide(): void {
    this.view.visible = false
  }

  isOpen(): boolean {
    return this.view.visible
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
    this.backdrop.clear()
    this.backdrop.rect(0, 0, W, H).fill(T.bgVoid)
    this.backdrop.hitArea = new Rectangle(0, 0, W, H)
    const x0 = L + 16
    const cw = W - L - R - 32
    const cx = x0 + cw / 2
    this.title.position.set(x0, top + 12 + TARGET.compact / 2)
    this.close.position(W - R - 16 - TARGET.compact, top + 12)
    const colW = Math.min(cw, COL_MAX)
    if (Math.round(colW) !== this.tabW) {
      this.tabW = Math.round(colW)
      const i = this.root.getChildIndex(this.tabs.view)
      this.tabs.view.destroy({ children: true })
      this.tabs = this.makeTabs(colW)
      this.tabs.set(this.tab)
      this.root.addChildAt(this.tabs.view, i)
    }
    const tabsY = top + 12 + TARGET.compact + 12
    this.tabs.view.position.set(cx - colW / 2, tabsY)
    const listTop = tabsY + Segmented.H + 8
    for (const b of [...this.featsTab, ...this.recordsTab]) b.view.visible = false
    const blocks = this.tab === 0 ? this.featsTab : this.recordsTab
    let y = 0
    for (const b of blocks) {
      b.layout(colW - 8)
      b.view.y = y
      y += b.h
    }
    this.scroll.setViewport(cx - colW / 2, listTop, colW, bottom - 12 - listTop)
    this.scroll.setRows(blocks, y + 8)
  }

  private makeTabs(w: number): Segmented {
    const t = new Segmented(['FEATS', 'RECORDS'], w, 13)
    t.onChange = (i) => {
      this.tab = i
      this.scroll.scrollTo(0)
      this.layout(this.w, this.h, this.insets)
    }
    return t
  }

  private build(): void {
    this.featsHead = headBlock('', 16, T.textHi, true)
    const out: Block[] = [this.featsHead]
    this.feats = FEATS.map(featBlock)
    for (const g of GROUPS) {
      out.push(headBlock(g.title))
      FEATS.forEach((f, i) => {
        if (g.has(f.reward)) out.push(this.feats[i]!)
      })
    }
    this.featsTab = out

    const rec: Block[] = [headBlock('WORLDS')]
    for (const a of ARENAS) {
      rec.push(
        gridBlock(
          () => {
            const best = loadWorldBest(a.id)
            const ws = this.stats.perWorld[a.id]
            const threat = ws && ws.maxThreatCleared >= 0 ? 'T' + ws.maxThreatCleared : 'NONE'
            return [
              ['BEST TIME', clock(best.time)], ['MOST KILLS', group(best.kills)],
              ['BEST SCORE', group(best.score)], ['BEST CHAIN', group(best.chain)],
              ['RUNS', group(ws?.runs ?? 0)], ['CLEARS', group(ws?.clears ?? 0)],
              ['TOP THREAT', threat],
            ]
          },
          () => [a.name, a.borderGlow],
        ),
      )
    }
    rec.push(headBlock('PILOTS'))
    for (const c of CHARACTERS) {
      rec.push(
        gridBlock(
          () => {
            const p = this.stats.perPilot[c.id]
            return [
              ['RUNS', group(p?.runs ?? 0)], ['CLEARS', group(p?.clears ?? 0)],
              ['BEST LEVEL', group(p?.bestLevel ?? 0)], ['BEST TIME', clock(p?.bestTime ?? 0)],
            ]
          },
          () => [c.name, c.colors.body],
        ),
      )
    }
    rec.push(headBlock('CAREER'))
    rec.push(
      gridBlock(() => {
        const L = this.stats
        return [
          ['RUNS', group(L.runs)], ['PLAY TIME', hours(L.seconds)],
          ['KILLS', group(L.kills)], ['BOSSES', group(L.bosses)],
          ['ELITES', group(L.elites)], ['CLEARS', group(L.clears)],
          ['RANKED DAILIES', group(L.dailyRanked)], ['BEST CHAIN', group(L.bestChain)],
          ['PEAK MULT', 'x' + Math.max(1, L.peakTier)], ['CLOSE CALLS', group(L.closeCalls)],
          ['FUSIONS', group(L.fusionsTaken)], ['EVOLUTIONS', group(L.evolutions)],
        ]
      }),
    )
    const legacy = headBlock('', 12, T.textMuted)
    const legacyLayout = legacy.layout
    legacy.layout = (w: number) => {
      const v1 = Math.max(legacyScore('best:endless'), legacyScore('best:daily'))
      legacy.text.text = v1 > 0 ? `v1 best score: ${group(v1)} (old formula)` : ''
      legacyLayout(w)
      if (v1 <= 0) legacy.h = 0
    }
    rec.push(legacy)
    this.recordsTab = rec
    for (const b of [...this.featsTab, ...this.recordsTab]) this.scroll.content.addChild(b.view)
  }
}

/** A v1 best (`{ score }`), 0 when missing or malformed. */
function legacyScore(key: string): number {
  const v = loadJSON<unknown>(key, null)
  const s = v && typeof v === 'object' ? (v as { score?: unknown }).score : 0
  return typeof s === 'number' && Number.isFinite(s) ? s : 0
}
