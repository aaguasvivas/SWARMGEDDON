import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { PAD_A, PAD_B, PAD_DOWN, PAD_LEFT, PAD_RIGHT, PAD_UP } from '../input/input.ts'
import { STATS_MIN_RUN_S } from '../config.ts'
import { arenaById } from '../content/arenas.ts'
import { characterById } from '../content/characters.ts'
import { ENEMIES } from '../content/enemies.ts'
import { WORLD_SCRIPTS } from '../content/runScripts.ts'
import { WEAPONS } from '../content/weapons.ts'
import { leaderboardEnabled } from '../net/leaderboard.ts'
import type { Insets } from '../platform/safeArea.ts'
import type { FeatUnlock } from '../state/feats.ts'
import type { Goal } from '../state/recapGoals.ts'
import type { RunResult } from '../state/runResult.ts'
import { BuildGrid, buildTiles, type BuildTile } from './buildGrid.ts'
import { Button } from './button.ts'
import { DigitStrip } from './digits.ts'
import { OptInCard } from './optInCard.ts'
import type { ToastSlot } from './toast.ts'
import { setSeparated } from './textFit.ts'
import { FONT, GUTTER, INK, MOTION, RADIUS, T, TARGET } from './tokens.ts'
import { Ease, Prop, tweens } from './tween.ts'

/** Taps count only from presses that start this long after the recap appears. */
const INPUT_LOCK_MS = 450
const COL_MAX_W = 400
const HEADER_PX = 28
const SCORE_PX = 44
const TILE_H = 64
const TILE_H_SHORT = 56
const TILE_GAP = 8
const TILE_VALUE_PX = 22
const SMALL_W = 109
const BTN_ROW_GAP = 8
const UNLOCK_ROWS = 3
const GOAL_ROW_H = 34
const LINE = 18
/** A one-line toast needs this much free height (its plate plus a margin). */
const TOAST_ROOM = 48
/** Space a toast under the meta column keeps above the buttons. */
const TOAST_GAP = 8
const STAMP_ROT = (-6 * Math.PI) / 180
const L_ROW_MAX_W = 600

export type RankTone = 'rank' | 'muted'

/** One recap stat tile: `TIME 4:31` with `+0:23 vs best`. */
export interface RecapTile {
  label: string
  value: string
  sub: string
  subGold: boolean
}

/** Everything the recap shows, built once in `endRun` (section 9.6). */
export interface RecapModel {
  head: string
  headColor: number
  /** `STANDARD · HIVE MEADOW · NOVA · T1 · LV 18` or `DAILY #12 · RANKED · ...` */
  sub: string
  /** `Died at 9:40. Next was: FINAL SWARM` (death only), else ''. */
  nearMiss: string
  score: number
  /** `+12,400 OVER BEST` (gold) or `12,400 TO BEST` (muted); null for none. */
  delta: { text: string; gold: boolean } | null
  newBest: boolean
  tiles: [RecapTile, RecapTile, RecapTile]
  killer: string
  bosses: string
  build: BuildTile[]
  weapons: string
  /** The feats the run finished: `New pilot: EMBER`, or `FEAT · Already yours`. */
  unlocks: string[]
  /** UNLOCKED when any reward was new, else FEATS DONE. */
  unlockHead: string
  goals: Goal[]
  /** RETRY, PRACTICE or PRACTICE AGAIN. */
  primary: string
}

/** What the layout may drop or tighten, in the section 9.6 overflow order. */
interface Fit {
  build: boolean
  goals: number
  tileH: number
  tight: boolean
  unlockRows: number
}
const FITS: readonly Fit[] = [
  { build: true, goals: 3, tileH: TILE_H, tight: false, unlockRows: UNLOCK_ROWS },
  { build: false, goals: 3, tileH: TILE_H, tight: false, unlockRows: UNLOCK_ROWS },
  { build: false, goals: 1, tileH: TILE_H, tight: false, unlockRows: UNLOCK_ROWS },
  { build: false, goals: 1, tileH: TILE_H_SHORT, tight: false, unlockRows: UNLOCK_ROWS },
  { build: false, goals: 1, tileH: TILE_H_SHORT, tight: true, unlockRows: UNLOCK_ROWS },
  { build: false, goals: 0, tileH: TILE_H_SHORT, tight: true, unlockRows: UNLOCK_ROWS },
  { build: false, goals: 0, tileH: TILE_H_SHORT, tight: true, unlockRows: 1 },
]

function label(size: number, fill: number, weight: '500' | '800' = '800', family: string = FONT.mono): Text {
  return new Text({ text: '', style: { fontFamily: family, fontSize: size, fontWeight: weight, fill, lineHeight: Math.max(LINE, Math.round(size * 1.3)) } })
}

interface TileView {
  root: Container
  bg: Graphics
  label: Text
  value: Text
  sub: Text
}

interface GoalView {
  root: Container
  name: Text
  progress: Text
  bar: Graphics
  reward: Text
}

/**
 * The run recap (section 9.6): header, score with its count-up and best delta,
 * TIME / KILLS / PEAK tiles, the killer and bosses, the build, the rank line,
 * the unlock card, NEXT UP goals, the leaderboard opt-in card, and RETRY with
 * MENU, SHARE and LEADERS. A short screen drops parts in the 9.6 overflow
 * order; landscape puts the run on the left, the meta on the right and the
 * buttons in one row along the bottom.
 */
export class Recap {
  readonly view = new Container()
  onRetry: () => void = () => {}
  onMenu: () => void = () => {}
  onShare: () => void = () => {}
  onLeaderboard: () => void = () => {}
  readonly optIn = new OptInCard()
  /** Where a toast may show on this screen without covering its content. */
  toastSlot: ToastSlot | null = null

  private readonly scrim = new Graphics()
  private readonly content = new Container()
  private readonly header: Text
  private readonly sub: Text
  private readonly nearMiss: Text
  private readonly scoreLabel: Text
  private readonly score = new DigitStrip(12, SCORE_PX, T.textHi, 0.5)
  private readonly delta = new Container()
  private readonly deltaBg = new Graphics()
  private readonly deltaText: Text
  private readonly stamp = new Container()
  private readonly stampBg = new Graphics()
  private readonly stampText: Text
  private readonly tiles: TileView[] = []
  private readonly killer: Text
  private readonly bosses: Text
  private readonly grid = new BuildGrid(28, 12, 2)
  private readonly weapons: Text
  private readonly rank: Text
  private readonly unlockCard = new Container()
  private readonly unlockBg = new Graphics()
  private readonly unlockHead: Text
  private readonly unlockRows: Text[] = []
  private readonly unlockMore: Text
  private readonly goalHead: Text
  private readonly goalRows: GoalView[] = []
  private readonly buttons = new Container()
  private retry: Button | null = null
  private menu: Button | null = null
  private share: Button | null = null
  private board: Button | null = null
  private btnKey = ''
  private model: RecapModel | null = null
  private rankPending = false
  private rankText = ''
  /** The opt-in card showed on this recap: its area stays (a toast takes it after a choice). */
  private cardKept = false
  private cardKeptH = 0
  private readyAt = 0
  private downAt = 0
  private shownAt = 0
  private focus = -1
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    this.header = new Text({ text: '', style: { fontFamily: FONT.display, fontSize: HEADER_PX, fontWeight: '900', fill: T.accentDanger, letterSpacing: 2 } })
    this.header.anchor.set(0.5, 0)
    this.sub = label(12, T.textMuted)
    this.sub.anchor.set(0.5, 0)
    this.sub.style.align = 'center'
    this.sub.style.wordWrap = true
    this.nearMiss = label(13, T.textHi, '500')
    this.nearMiss.anchor.set(0.5, 0)
    this.nearMiss.style.align = 'center'
    this.nearMiss.style.wordWrap = true
    this.scoreLabel = label(12, T.textMuted)
    this.scoreLabel.text = 'SCORE'
    this.scoreLabel.style.letterSpacing = 2
    this.scoreLabel.anchor.set(0.5, 0)
    this.deltaText = label(12, INK)
    this.deltaText.anchor.set(0.5)
    this.delta.addChild(this.deltaBg, this.deltaText)
    this.stampText = new Text({ text: 'NEW BEST', style: { fontFamily: FONT.display, fontSize: 14, fontWeight: '900', fill: T.accentGold, letterSpacing: 2 } })
    this.stampText.anchor.set(0.5)
    const sw = Math.ceil(this.stampText.width) + 18
    this.stampBg.roundRect(-sw / 2, -14, sw, 28, 6).fill({ color: INK, alpha: 0.9 }).stroke({ width: 2, color: T.accentGold })
    this.stamp.addChild(this.stampBg, this.stampText)
    this.stamp.rotation = STAMP_ROT
    for (let i = 0; i < 3; i++) {
      const root = new Container()
      const t: TileView = { root, bg: new Graphics(), label: label(12, T.textMuted), value: label(TILE_VALUE_PX, T.textHi, '800'), sub: label(12, T.textMuted) }
      t.label.style.letterSpacing = 1
      t.label.style.lineHeight = 14
      t.sub.style.lineHeight = 14
      t.value.style.lineHeight = TILE_VALUE_PX + 2
      for (const x of [t.label, t.value, t.sub]) x.anchor.set(0.5, 0)
      root.addChild(t.bg, t.label, t.value, t.sub)
      this.tiles.push(t)
    }
    this.killer = label(13, T.textHi, '500')
    this.killer.anchor.set(0.5, 0)
    this.bosses = label(13, T.textHi, '500')
    this.bosses.anchor.set(0.5, 0)
    this.bosses.style.align = 'center'
    this.bosses.style.wordWrap = true
    this.weapons = label(12, T.textMuted)
    this.weapons.anchor.set(0.5, 0)
    this.weapons.style.align = 'center'
    this.weapons.style.wordWrap = true
    this.rank = label(13, T.accentXp)
    this.rank.anchor.set(0.5, 0)
    this.rank.style.align = 'center'
    this.rank.style.wordWrap = true
    this.unlockHead = label(12, T.accentGold)
    this.unlockHead.style.letterSpacing = 2
    this.unlockMore = label(12, T.textMuted)
    this.unlockCard.addChild(this.unlockBg, this.unlockHead, this.unlockMore)
    for (let i = 0; i < UNLOCK_ROWS; i++) {
      const t = label(13, T.textHi, '800')
      this.unlockRows.push(t)
      this.unlockCard.addChild(t)
    }
    this.goalHead = label(12, T.textMuted)
    this.goalHead.text = 'NEXT UP'
    this.goalHead.style.letterSpacing = 2
    this.content.addChild(
      this.header, this.sub, this.nearMiss, this.scoreLabel, this.score.view, this.delta, this.stamp, ...this.tiles.map((t) => t.root),
      this.killer, this.bosses, this.grid.view, this.weapons, this.rank, this.unlockCard, this.goalHead,
    )
    for (let i = 0; i < 3; i++) {
      const g: GoalView = { root: new Container(), name: label(13, T.textHi), progress: label(12, T.textMuted), bar: new Graphics(), reward: label(12, T.accentGold) }
      g.progress.anchor.set(1, 0)
      g.reward.anchor.set(1, 0)
      g.root.addChild(g.name, g.progress, g.bar, g.reward)
      this.goalRows.push(g)
      this.content.addChild(g.root)
    }
    this.scrim.eventMode = 'static'
    this.view.addChild(this.scrim, this.content, this.buttons, this.optIn.view)
    this.view.visible = false
  }

  acceptsInput(): boolean {
    return performance.now() >= this.readyAt
  }

  /** A tap counts only when its press started after the lock. */
  private acceptsPress(): boolean {
    return this.acceptsInput() && this.downAt >= this.readyAt
  }

  isOpen(): boolean {
    return this.view.visible
  }

  show(m: RecapModel): void {
    this.model = m
    this.rankPending = false
    this.rankText = ''
    this.rank.text = ''
    this.optIn.view.visible = false
    this.cardKept = false
    this.cardKeptH = 0
    this.focus = -1
    this.header.text = m.head
    this.header.style.fill = m.headColor
    this.sub.text = m.sub
    this.nearMiss.text = m.nearMiss
    this.delta.visible = m.delta !== null
    if (m.delta) {
      this.deltaText.text = m.delta.text
      this.deltaText.style.fill = m.delta.gold ? INK : T.textMuted
      const dw = Math.ceil(this.deltaText.width) + 16
      this.deltaBg.clear()
      if (m.delta.gold) this.deltaBg.roundRect(-dw / 2, -11, dw, 22, RADIUS.chip).fill(T.accentGold)
      else this.deltaBg.roundRect(-dw / 2, -11, dw, 22, RADIUS.chip).stroke({ width: 1.5, color: T.lineStrong })
    }
    this.stamp.visible = m.newBest
    for (let i = 0; i < 3; i++) {
      const t = this.tiles[i]!
      const d = m.tiles[i]!
      t.label.text = d.label
      t.value.text = d.value
      t.sub.text = d.sub
      t.sub.style.fill = d.subGold ? T.accentGold : T.textMuted
    }
    this.killer.text = m.killer
    this.bosses.text = m.bosses
    this.weapons.text = m.weapons
    this.unlockHead.text = m.unlockHead
    this.goalHead.visible = m.goals.length > 0
    this.score.setInt(0, true)
    this.shownAt = performance.now()
    this.readyAt = this.shownAt + INPUT_LOCK_MS
    this.downAt = 0
    this.view.visible = true
    this.view.alpha = 0
    tweens.to(this.view, Prop.Alpha, 1, MOTION.enterMs, Ease.OutCubic)
    this.relayout()
  }

  hide(): void {
    this.view.visible = false
  }

  /** Real clock: the score counts up over MOTION.countUpMs. */
  update(nowMs: number): void {
    const m = this.model
    if (!this.view.visible || !m) return
    const t = Math.min(1, (nowMs - this.shownAt) / MOTION.countUpMs)
    const u = 1 - t
    this.score.setInt(Math.round(m.score * (1 - u * u * u)), true)
  }

  /** The leaderboard line (A15): a rank once the async post returns, or why
   *  the score did not post. It has its own row above the unlock card. */
  setRankLine(text: string, tone: RankTone): void {
    this.rankPending = false
    this.rankText = text
    this.rank.style.fill = tone === 'rank' ? T.accentXp : T.textMuted
    this.relayout()
  }

  /** A post is under way: its row is kept, so the answer moves nothing. */
  expectRankLine(): void {
    this.rankPending = true
    this.relayout()
  }

  /** Whether the opt-in card fits this screen with the recap as it is now. */
  canShowOptIn(): boolean {
    const was = this.optIn.view.visible
    this.optIn.view.visible = true
    const fits = this.relayout()
    this.optIn.view.visible = was
    this.relayout()
    return fits
  }

  setOptInVisible(on: boolean): void {
    this.optIn.view.visible = on
    if (on) this.cardKept = true
    this.relayout()
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (this.view.visible) this.relayout()
  }

  /** Enter is RETRY and Escape is MENU, after the input lock. */
  pressKey(key: string): void {
    if (!this.acceptsInput()) return
    if (key === 'Enter') this.onRetry()
    else if (key === 'Escape') this.onMenu()
  }

  /** Pad: the d-pad moves the focus over the buttons (RETRY first), A presses
   *  it, B is MENU. */
  padPress(bits: number): void {
    if (!this.view.visible || bits === 0) return
    const list = this.focusList()
    if (this.focus < 0) this.focus = 0
    else if (bits & (PAD_RIGHT | PAD_DOWN)) this.focus = Math.min(list.length - 1, this.focus + 1)
    else if (bits & (PAD_LEFT | PAD_UP)) this.focus = Math.max(0, this.focus - 1)
    this.drawFocus()
    if (!this.acceptsInput()) return
    if (bits & PAD_A) {
      this.downAt = performance.now() // a pad press starts after the lock by construction
      list[this.focus]?.activate()
    } else if (bits & PAD_B) {
      this.onMenu()
    }
  }

  private focusList(): Button[] {
    return [this.retry, this.menu, this.share, this.board].filter((b): b is Button => !!b && b.view.visible)
  }

  private drawFocus(): void {
    const list = this.focusList()
    for (let i = 0; i < list.length; i++) list[i]!.setFocused(i === this.focus)
  }

  /** Buttons are fixed-width: a new width builds new ones. */
  private ensureButtons(primaryW: number, smallW: number, primary: string): void {
    const key = `${primaryW}|${smallW}|${primary}`
    if (key === this.btnKey) return
    this.btnKey = key
    for (const b of [this.retry, this.menu, this.share, this.board]) b?.view.destroy({ children: true })
    const make = (text: string, w: number, h: number, variant: 'primary' | 'secondary', size: number, fn: () => void): Button => {
      const b = new Button(text, w, h, variant, size)
      b.onClick = () => this.acceptsPress() && fn()
      b.view.on('pointerdown', () => (this.downAt = performance.now()))
      this.buttons.addChild(b.view)
      return b
    }
    this.retry = make(primary, primaryW, TARGET.primary, 'primary', 18, () => this.onRetry())
    this.menu = make('MENU', smallW, TARGET.secondary, 'secondary', 14, () => this.onMenu())
    this.share = make('SHARE', smallW, TARGET.secondary, 'secondary', 14, () => this.onShare())
    this.board = make('LEADERS', smallW, TARGET.secondary, 'secondary', 14, () => this.onLeaderboard())
  }

  /** Lays the screen out; false when the content overflows even at the
   *  tightest fit. */
  private relayout(): boolean {
    const m = this.model
    if (!m) return true
    const { w, h } = this
    this.scrim.clear()
    this.scrim.rect(0, 0, w, h).fill({ color: T.scrim, alpha: T.scrimAlpha })
    this.scrim.hitArea = new Rectangle(0, 0, w, h)
    if (w > h) return this.placeLandscape(m)
    for (const fit of FITS) if (this.placePortrait(m, fit)) return true
    return false
  }

  private gap(fit: Fit, n: number): number {
    return fit.tight ? Math.round(n * 0.5) : n
  }

  /** The run block (header to the build), from `y` in a column `colW` wide
   *  centered on `cx`. Returns its bottom. */
  private placeRun(m: RecapModel, fit: Fit, cx: number, colW: number, y: number, withBuild: boolean): number {
    this.header.scale.set(1)
    if (this.header.width > colW) this.header.scale.set(Math.max(12 / HEADER_PX, colW / this.header.width))
    this.header.position.set(cx, y)
    y += this.header.height + this.gap(fit, 6)
    setSeparated(this.sub, m.sub, colW)
    this.sub.position.set(cx, y)
    y += this.sub.height + this.gap(fit, 4)
    this.nearMiss.visible = m.nearMiss !== ''
    if (this.nearMiss.visible) {
      this.nearMiss.style.wordWrapWidth = colW
      this.nearMiss.position.set(cx, y)
      y += this.nearMiss.height + this.gap(fit, 4)
    }
    y += this.gap(fit, 8)
    this.scoreLabel.position.set(cx, y)
    y += 16
    this.score.view.position.set(cx, y + SCORE_PX / 2 + 2)
    y += SCORE_PX + 8
    if (m.delta || m.newBest) {
      // The delta chip and the NEW BEST stamp share a row, centered as a pair.
      const dw = m.delta ? this.deltaBg.width : 0
      const sw = m.newBest ? this.stampBg.width : 0
      const total = dw + sw + (dw > 0 && sw > 0 ? 14 : 0)
      let x = cx - total / 2
      this.delta.position.set(x + dw / 2, y + 14)
      if (dw > 0) x += dw + 14
      this.stamp.position.set(x + sw / 2, y + 14)
      y += 30
    }
    y += this.gap(fit, 12)
    // Tiles: 3 across the column.
    const tw = Math.floor((colW - TILE_GAP * 2) / 3)
    const tx = cx - (tw * 3 + TILE_GAP * 2) / 2
    // label 14, value 24, sub 14: one baseline for all three tiles, the slack split evenly.
    const anySub = this.tiles.some((t) => t.sub.text !== '')
    const body = 14 + TILE_VALUE_PX + 2 + (anySub ? 14 : 0)
    const pad = (fit.tileH - body) / (anySub ? 4 : 3)
    for (let i = 0; i < 3; i++) {
      const t = this.tiles[i]!
      t.root.position.set(tx + i * (tw + TILE_GAP), y)
      t.bg.clear()
      t.bg.roundRect(0, 0, tw, fit.tileH, RADIUS.card).fill(T.surfaceCard).stroke({ width: 1, color: T.lineFaint })
      t.sub.visible = t.sub.text !== ''
      t.label.position.set(tw / 2, pad)
      t.value.position.set(tw / 2, pad * 2 + 14)
      t.value.scale.set(1)
      if (t.value.width > tw - 8) t.value.scale.set(Math.max(12 / TILE_VALUE_PX, (tw - 8) / t.value.width))
      t.sub.position.set(tw / 2, pad * 3 + 14 + TILE_VALUE_PX + 2)
    }
    y += fit.tileH + this.gap(fit, 10)
    for (const t of [this.killer, this.bosses]) {
      t.visible = t.text !== ''
      if (!t.visible) continue
      setSeparated(t, t === this.killer ? m.killer : m.bosses, colW)
      t.style.align = 'center'
      t.position.set(cx, y)
      y += t.height
    }
    const showBuild = withBuild && fit.build && m.build.length > 0
    this.grid.view.visible = showBuild
    this.weapons.visible = showBuild && m.weapons !== ''
    if (showBuild) {
      y += this.gap(fit, 10)
      this.grid.set(m.build, colW)
      this.grid.view.position.set(cx - this.grid.width / 2, y)
      y += this.grid.height + 6
      if (this.weapons.visible) {
        setSeparated(this.weapons, m.weapons, colW)
        this.weapons.position.set(cx, y)
        y += this.weapons.height
      }
    }
    return y
  }

  /** The meta block (rank, unlocks, goals, opt-in card) from `y`. Returns its
   *  bottom and where the opt-in card sits. */
  private placeMeta(m: RecapModel, fit: Fit, cx: number, colW: number, y: number): { bottom: number; cardY: number; cardH: number } {
    const left = cx - colW / 2
    const rankRow = this.rankText !== '' || this.rankPending
    this.rank.visible = this.rankText !== ''
    if (rankRow) {
      if (this.rankText) setSeparated(this.rank, this.rankText, colW)
      this.rank.position.set(cx, y)
      y += Math.max(LINE + 2, this.rankText ? this.rank.height : 0) + this.gap(fit, 8)
    }
    const nUnlock = Math.min(m.unlocks.length, fit.unlockRows)
    this.unlockCard.visible = nUnlock > 0
    if (nUnlock > 0) {
      const pad = 10
      let cy = pad
      this.unlockHead.position.set(pad + 2, cy)
      cy += 18
      for (let i = 0; i < UNLOCK_ROWS; i++) {
        const r = this.unlockRows[i]!
        r.visible = i < nUnlock
        if (!r.visible) continue
        r.text = m.unlocks[i]!
        r.scale.set(1)
        if (r.width > colW - pad * 2 - 4) r.scale.set(Math.max(12 / 13, (colW - pad * 2 - 4) / r.width))
        r.position.set(pad + 2, cy)
        cy += LINE
      }
      const more = m.unlocks.length - nUnlock
      this.unlockMore.visible = more > 0
      if (more > 0) {
        this.unlockMore.text = `+${more} more in RECORDS`
        this.unlockMore.position.set(pad + 2, cy)
        cy += LINE
      }
      cy += pad - 2
      this.unlockBg.clear()
      this.unlockBg.roundRect(0, 0, colW, cy, RADIUS.card).fill(T.surfacePanel).stroke({ width: 1.5, color: T.accentGold, alpha: 0.7 })
      this.unlockCard.position.set(left, y)
      y += cy + this.gap(fit, 10)
    }
    const card = this.optIn.view.visible || this.cardKept
    const nGoal = card ? 0 : Math.min(m.goals.length, fit.goals)
    this.goalHead.visible = nGoal > 0
    if (nGoal > 0) {
      this.goalHead.position.set(left + 2, y)
      y += 18
    }
    for (let i = 0; i < this.goalRows.length; i++) {
      const g = this.goalRows[i]!
      g.root.visible = i < nGoal
      if (!g.root.visible) continue
      const d = m.goals[i]!
      g.root.position.set(left, y)
      g.name.text = d.name
      g.progress.text = d.progress
      g.progress.position.set(colW - 2, 1)
      g.name.position.set(2, 0)
      g.reward.text = d.reward
      g.reward.position.set(colW - 2, 17)
      const barW = Math.max(40, colW - 4 - g.reward.width - 12)
      g.bar.clear()
      g.bar.roundRect(2, 22, barW, 5, 2.5).fill(T.lineFaint)
      g.bar.roundRect(2, 22, Math.max(5, barW * d.frac), 5, 2.5).fill(T.accentPlayer)
      y += GOAL_ROW_H
    }
    const cardY = y
    let cardH = 0
    if (card) {
      if (this.optIn.view.visible) {
        cardH = this.optIn.layout(colW)
        if (this.cardKept) this.cardKeptH = cardH
      } else {
        cardH = this.cardKeptH
      }
      this.optIn.view.position.set(left, cardY)
      y = cardY + cardH + this.gap(fit, 10)
    }
    return { bottom: y, cardY, cardH }
  }

  private placePortrait(m: RecapModel, fit: Fit): boolean {
    const { w, h, insets } = this
    const availW = w - insets.left - insets.right
    const colW = Math.min(availW - GUTTER * 2, COL_MAX_W)
    const cx = insets.left + availW / 2
    const left = cx - colW / 2
    const top = insets.top + 24
    const bottom = h - insets.bottom
    const retryY = bottom - 132
    const rowY = bottom - 64
    let y = this.placeRun(m, fit, cx, colW, top, true)
    y += this.gap(fit, 12)
    const meta = this.placeMeta(m, fit, cx, colW, y)
    const fits = meta.bottom <= retryY - 12
    const showBoard = leaderboardEnabled()
    const small = showBoard ? Math.min(SMALL_W, Math.floor((colW - BTN_ROW_GAP * 2) / 3)) : Math.floor((colW - BTN_ROW_GAP) / 2)
    this.ensureButtons(colW, small, m.primary)
    this.retry!.position(left, retryY)
    this.placeRow(cx, rowY, small, showBoard)
    this.toastSlot = this.freeSlot(left, colW, meta, retryY)
    return fits
  }

  /** Landscape: the run on the left and the meta on the right, each column
   *  taking its own first fit, and the buttons in one row along the bottom. */
  private placeLandscape(m: RecapModel): boolean {
    const { w, h, insets } = this
    const availW = w - insets.left - insets.right
    const colW = Math.floor(Math.min(COL_MAX_W, (availW - GUTTER * 2 - 24) / 2))
    const cx = insets.left + availW / 2
    const lx = cx - 12 - colW / 2
    const rx = cx + 12 + colW / 2
    const bottom = h - insets.bottom
    const btnY = bottom - 12 - TARGET.primary
    const top = insets.top + 12
    let leftOk = false
    for (const fit of FITS) {
      if (this.placeRun(m, fit, lx, colW, top, true) <= btnY - 8) {
        leftOk = true
        break
      }
    }
    let rightOk = false
    let meta = { bottom: 0, cardY: 0, cardH: 0 }
    for (const fit of FITS) {
      meta = this.placeMeta(m, fit, rx, colW, top + 4)
      if (meta.bottom <= btnY - 4) {
        rightOk = true
        break
      }
    }
    const showBoard = leaderboardEnabled()
    const rowW = Math.min(availW - GUTTER * 2, L_ROW_MAX_W)
    const nSmall = showBoard ? 3 : 2
    const primaryW = rowW - nSmall * (SMALL_W + BTN_ROW_GAP)
    this.ensureButtons(primaryW, SMALL_W, m.primary)
    const x0 = cx - rowW / 2
    this.retry!.position(x0, btnY)
    const sy = btnY + (TARGET.primary - TARGET.secondary) / 2
    let x = x0 + primaryW + BTN_ROW_GAP
    for (const b of [this.menu!, this.share!, this.board!]) {
      b.view.visible = b !== this.board || showBoard
      if (!b.view.visible) continue
      b.position(x, sy)
      x += SMALL_W + BTN_ROW_GAP
    }
    this.toastSlot = this.freeSlot(rx - colW / 2, colW, meta, btnY)
    return leftOk && rightOk
  }

  private placeRow(cx: number, y: number, small: number, showBoard: boolean): void {
    const list = showBoard ? [this.menu!, this.share!, this.board!] : [this.menu!, this.share!]
    this.board!.view.visible = showBoard
    const total = list.length * small + (list.length - 1) * BTN_ROW_GAP
    let x = cx - total / 2
    for (const b of list) {
      b.view.visible = true
      b.position(x, y)
      x += small + BTN_ROW_GAP
    }
  }

  /** A toast takes the opt-in card's place (the toasts here follow a choice
   *  on that card), else free room above the buttons, else the top band. */
  private freeSlot(x: number, colW: number, meta: { bottom: number; cardY: number; cardH: number }, limit: number): ToastSlot {
    if (meta.cardH > 0) return { x, y: meta.cardY, w: colW, h: meta.cardH }
    if (limit - meta.bottom >= TOAST_ROOM) return { x, y: meta.bottom, w: colW, h: limit - meta.bottom - TOAST_GAP }
    return { x, y: this.insets.top + 8, w: colW }
  }
}

function clock(sec: number): string {
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function group(v: number): string {
  return Math.floor(v).toLocaleString('en-US')
}

/** What the recap compares the run with, read before `endRun` records it. */
export interface RecapBefore {
  /** The world's best score and best time (0 = none yet). */
  bestScore: number
  bestTime: number
  /** A practice Daily: the day's best before this run (the ranked score or a
   *  practice best), 0 when none. */
  dayBest: number
}

/**
 * The recap's content (section 9.6). A best is celebrated only against an
 * earlier one (a first run in a world beats nothing) and only for a run of
 * STATS_MIN_RUN_S or more with a kill; a ranked Daily shows no best delta (its
 * rank is the news).
 */
export function buildRecapModel(r: RunResult, before: RecapBefore, unlocks: readonly FeatUnlock[], goals: Goal[]): RecapModel {
  const text = WORLD_SCRIPTS[r.arena]!.text
  const world = arenaById(r.arena).name
  const [head, headColor]: [string, number] =
    r.end === 'clear'
      ? [text.win, T.accentGold]
      : r.end === 'stalemate'
        ? [text.stalemate, T.accentDanger]
        : r.end === 'death'
          ? ['OVERRUN', T.accentDanger]
          : ['RUN ENDED', T.textPrimary]
  const sub =
    r.mode === 'daily'
      ? `DAILY #${r.dailyNumber} · ${r.ranked ? 'RANKED' : 'PRACTICE'} · ${world} · LV ${r.level}`
      : `STANDARD · ${world} · ${characterById(r.character).name}${r.threat > 0 ? ' · T' + r.threat : ''} · LV ${r.level}`
  const nearMiss = r.end === 'death' && r.nextBeat ? `Died at ${clock(r.time)}. Next was: ${r.nextBeat}` : ''

  const counts = r.time >= STATS_MIN_RUN_S && r.kills > 0
  const prevScore = r.mode === 'daily' ? (r.ranked ? 0 : before.dayBest) : before.bestScore
  let delta: RecapModel['delta'] = null
  if (prevScore > 0) {
    const d = r.score - prevScore
    delta = d > 0 ? { text: `+${group(d)} OVER BEST`, gold: true } : d < 0 ? { text: `${group(-d)} TO BEST`, gold: false } : { text: 'TIED BEST', gold: false }
  }
  const newBest = counts && prevScore > 0 && r.score > prevScore

  let timeSub = ''
  let timeGold = false
  if (r.mode !== 'daily' && before.bestTime > 0 && r.time >= STATS_MIN_RUN_S) {
    const d = Math.floor(r.time) - Math.floor(before.bestTime)
    timeGold = d > 0 && counts
    timeSub = d > 0 ? `+${clock(d)} vs best` : d < 0 ? `${clock(-d)} short` : 'tied best'
  }

  let killer = ''
  if (r.end === 'death' && r.killer) {
    killer = r.killer === 'acid' ? 'Killed by acid' : r.killer === 'hazard' ? 'Killed by a hazard' : `Killed by ${ENEMIES[r.killer]?.displayName ?? r.killer.toUpperCase()}`
  }
  const slain: string[] = []
  for (const id in r.killsByEnemy) {
    const def = ENEMIES[id]
    if (!def || !def.boss) continue
    const n = r.killsByEnemy[id]!
    slain.push(n > 1 ? `${def.displayName} x${n}` : def.displayName)
  }
  const bosses = slain.length > 0 ? `Bosses slain: ${slain.join(' · ')}` : ''
  const names: string[] = []
  for (const id of r.weapons) names.push(WEAPONS[id]!.name.toUpperCase())
  for (const id of r.evolutions) names.push(WEAPONS[id]!.name.toUpperCase())
  const fresh = unlocks.some((u) => u.fresh)
  return {
    head,
    headColor,
    sub,
    nearMiss,
    score: r.score,
    delta,
    newBest,
    tiles: [
      { label: 'TIME', value: clock(r.time), sub: timeSub, subGold: timeGold },
      { label: 'KILLS', value: group(r.kills), sub: '', subGold: false },
      { label: 'PEAK', value: `x${r.peakTier}`, sub: `chain ${group(r.bestChain)}`, subGold: false },
    ],
    killer,
    bosses,
    build: buildTiles(r.perks),
    weapons: names.length > 0 ? `Weapons: ${names.join(' · ')}` : '',
    unlocks: unlocks.map((u) => (u.fresh ? u.line : `${u.feat.name} · ${u.line}`)),
    unlockHead: fresh ? 'UNLOCKED' : unlocks.length > 1 ? 'FEATS DONE' : 'FEAT DONE',
    goals,
    primary: r.mode === 'daily' ? (r.ranked ? 'PRACTICE' : 'PRACTICE AGAIN') : 'RETRY',
  }
}
