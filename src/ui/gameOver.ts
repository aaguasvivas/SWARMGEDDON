import { Container, Graphics, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { COLORS } from '../config.ts'
import { leaderboardEnabled } from '../net/leaderboard.ts'
import type { Insets } from '../platform/safeArea.ts'
import { characterById } from '../content/characters.ts'
import { arenaById } from '../content/arenas.ts'
import { WORLD_SCRIPTS } from '../content/runScripts.ts'
import type { WorldBestGains } from '../state/persistence.ts'
import type { FeatUnlock } from '../state/feats.ts'
import type { RunResult } from '../state/runResult.ts'
import { Button } from './button.ts'
import { OptInCard } from './optInCard.ts'
import type { ToastSlot } from './toast.ts'
import { FONT, T } from './tokens.ts'

/** Taps are ignored this long after the screen appears, so a tap meant for the
 *  game cannot land on RETRY. */
const INPUT_LOCK_MS = 450
/** Width of the RETRY/MENU column. */
const COL_W = 336
const CARD_MAX_W = 343
const CARD_MIN_W = 260

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/** The tone of the leaderboard line under the title. */
export type RankTone = 'rank' | 'muted'

/** Death screen: run stats + new-best flag + Retry / Menu / Share. */
export class GameOver {
  readonly view = new Container()
  onRetry: () => void = () => {}
  onMenu: () => void = () => {}
  onShare: () => void = () => {}
  onLeaderboard: () => void = () => {}
  readonly optIn = new OptInCard()
  /** Where a toast may show on this screen without covering its content. */
  toastSlot: ToastSlot | null = null

  private backdrop = new Graphics()
  private title: Text
  private best: Text
  private rank: Text
  private stats: Text
  private retry: Button
  private menu: Button
  private share: Button
  private board: Button
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  private readyAt = 0

  constructor() {
    this.title = new Text({ text: 'OVERRUN', style: { fontFamily: FONT.display, fontSize: 40, fontWeight: '900', fill: COLORS.hurtFlash, letterSpacing: 3 } })
    this.title.anchor.set(0.5)
    this.glow = new GlowFilter({ color: COLORS.hurtFlash, distance: 14, outerStrength: 2, innerStrength: 0, quality: 0.3 })
    this.title.filters = [this.glow]
    this.best = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 15, fontWeight: 'bold', fill: 0xffe066 } })
    this.best.anchor.set(0.5)
    this.rank = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 14, fontWeight: 'bold', fill: 0x57c8ff, align: 'center', wordWrap: true, wordWrapWidth: 500, lineHeight: 19 } })
    // Top-anchored: a long unlock banner (multiple items) wraps DOWNWARD into
    // space the layout reserves for it, never up into the title.
    this.rank.anchor.set(0.5, 0)
    this.stats = new Text({ text: '', style: { fontFamily: FONT.mono, fontSize: 16, fill: COLORS.hudText, align: 'center', lineHeight: 24 } })
    this.stats.anchor.set(0.5)

    this.retry = new Button('RETRY', 160, 52, 'primary', 18)
    this.menu = new Button('MENU', 160, 52, 'secondary', 18)
    this.share = new Button('SHARE RUN', 136, 46, 'secondary', 14)
    this.board = new Button('LEADERS', 136, 46, 'secondary', 14)
    this.retry.onClick = () => this.acceptsInput() && this.onRetry()
    this.menu.onClick = () => this.acceptsInput() && this.onMenu()
    this.share.onClick = () => this.acceptsInput() && this.onShare()
    this.board.onClick = () => this.acceptsInput() && this.onLeaderboard()

    this.view.addChild(this.backdrop, this.title, this.best, this.rank, this.stats, this.retry.view, this.menu.view, this.share.view, this.board.view, this.optIn.view)
    this.view.visible = false
  }

  private hasUnlockBanner = false
  /** The unlock banner on one line, and split before the `+N MORE` count. */
  private unlockText: [string, string] | null = null
  private readonly glow: GlowFilter

  acceptsInput(): boolean {
    return performance.now() >= this.readyAt
  }

  /** The leaderboard line (A15): a rank once the async post returns, or why
   *  the score did not post. An unlock banner owns the slot. */
  setRankLine(text: string, tone: RankTone): void {
    if (this.hasUnlockBanner) return
    this.rank.text = text
    this.rank.style.fill = tone === 'rank' ? T.accentXp : T.textMuted
    this.relayout()
  }

  /** Banner the feats the run finished (owns the rank line's slot): at most two
   *  names, then a count of the rest. When the run unlocked new items, the
   *  banner names and counts only those, not the feats whose reward was
   *  already owned. */
  setUnlocks(unlocks: FeatUnlock[]): void {
    if (unlocks.length === 0) return
    this.hasUnlockBanner = true
    const fresh = unlocks.filter((u) => u.fresh)
    const names = fresh.length > 0 ? fresh.map((u) => u.name) : unlocks.map((u) => u.feat.name)
    const more = names.length - Math.min(2, names.length)
    const head = `★ ${fresh.length > 0 ? 'UNLOCKED' : unlocks.length > 1 ? 'FEATS DONE' : 'FEAT DONE'}: ${names.slice(0, 2).join(' + ')}`
    this.unlockText = more > 0 ? [`${head} +${more} MORE ★`, `${head} ★\n+${more} MORE`] : [`${head} ★`, `${head} ★`]
    this.rank.style.fill = 0xffe066
    this.relayout()
  }

  /** Whether the opt-in card fits this screen with the recap as it is now
   *  (a long unlock banner takes more room). */
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
    this.relayout()
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    this.relayout()
  }

  /** Lays the screen out; false when the content overflows it. */
  private relayout(): boolean {
    const { w, h, insets } = this
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.74 })
    const short = h < 560
    const card = this.optIn.view.visible
    // Short screens put the opt-in card in a column right of the recap.
    const side = card && short
    const left = insets.left + 16
    const right = w - insets.right - 16
    const cx = side ? left + COL_W / 2 : w / 2
    const colW = side ? COL_W : Math.min(right - left, 500)
    this.rank.style.wordWrapWidth = colW
    if (this.unlockText) {
      // The count wraps as one piece: on its own line when the banner is too wide.
      this.rank.style.wordWrap = false
      this.rank.text = this.unlockText[0]
      if (this.rank.width > colW) this.rank.text = this.unlockText[1]
      this.rank.style.wordWrap = true
    }
    // Long headers (THE QUEEN ESCAPED) shrink to the width instead of clipping.
    this.title.scale.set(1)
    if (this.title.width > colW) this.title.scale.set(colW / this.title.width)

    // Flow by REAL text heights, from the title center down.
    const rankH = Math.max(22, this.rank.height + 6)
    const bodyH = 34 + 22 + rankH + this.stats.height + 22 + 64 + 46
    const cardW = Math.min(CARD_MAX_W, side ? right - (left + COL_W + 16) : right - left)
    const cardH = card ? this.optIn.layout(cardW) : 0
    const colH = this.title.height / 2 + bodyH + (card && !side ? 16 + cardH : 0)
    const top = insets.top + 8
    const room = h - insets.top - insets.bottom - 16
    const fits = colH <= room && (!card || (cardW >= CARD_MIN_W && cardH <= room))
    let y = Math.max(top, top + (room - colH) / 2) + this.title.height / 2
    this.title.position.set(cx, y)
    y += 34
    this.best.position.set(cx, y)
    y += 22
    this.rank.position.set(cx, y)
    y += rankH
    this.stats.position.set(cx, y + this.stats.height / 2)
    y += this.stats.height + 22
    this.retry.position(cx - 168, y)
    this.menu.position(cx + 8, y)
    y += 64
    // SHARE + LEADERS share a row; SHARE centers alone with no leaderboard backend.
    const showBoard = leaderboardEnabled()
    this.board.view.visible = showBoard
    if (showBoard) {
      this.share.position(cx - 140, y)
      this.board.position(cx + 4, y)
    } else {
      this.share.position(cx - 68, y)
    }
    y += 46

    // The card sits under the buttons, or in the side column; a toast takes its place.
    if (side) {
      const x = left + COL_W + 16
      this.optIn.view.position.set(x, Math.max(top, top + (room - cardH) / 2))
      this.toastSlot = { x, y: top, w: right - x }
    } else {
      const x = (w - cardW) / 2
      this.optIn.view.position.set(x, y + 16)
      this.toastSlot = { x: left, y: y + 12, w: right - left }
    }
    return fits
  }

  show(result: RunResult, gains: WorldBestGains): void {
    const text = WORLD_SCRIPTS[result.arena]!.text
    const [head, color]: [string, number] =
      result.end === 'clear'
        ? [text.win, T.accentGold]
        : result.end === 'stalemate'
          ? [text.stalemate, T.accentDanger]
          : result.end === 'death'
            ? ['OVERRUN', COLORS.hurtFlash]
            : ['RUN ENDED', T.textPrimary]
    this.title.text = head
    this.title.style.fill = color
    this.glow.color = color
    // The world best score leads; time and kills records follow.
    this.best.text = gains.score
      ? '★ NEW BEST SCORE ★'
      : gains.time && gains.kills
        ? '★ BEST TIME + MOST KILLS ★'
        : gains.time
          ? '★ NEW BEST TIME ★'
          : gains.kills
            ? '★ MOST KILLS ★'
            : ''
    this.rank.text = '' // filled in async by setRankLine() once the post returns
    this.hasUnlockBanner = false
    this.unlockText = null
    this.optIn.view.visible = false
    this.stats.text =
      `${result.mode === 'daily' ? `DAILY #${result.dailyNumber} · ${result.ranked ? 'RANKED' : 'PRACTICE'}` : 'ENDLESS'}\n` +
      `${characterById(result.character).name} · ${arenaById(result.arena).name}\n` +
      `survived  ${fmtTime(result.time)}\n` +
      `kills  ${result.kills}     level  ${result.level}\n` +
      `score  ${result.score.toLocaleString('en-US')}     peak  x${result.peakTier}`
    this.relayout()
    this.view.visible = true
    this.readyAt = performance.now() + INPUT_LOCK_MS
  }

  hide(): void {
    this.view.visible = false
  }
}
