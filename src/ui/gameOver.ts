import { Container, Graphics, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { COLORS } from '../config.ts'
import { leaderboardEnabled } from '../net/leaderboard.ts'
import { characterById } from '../content/characters.ts'
import { arenaById } from '../content/arenas.ts'
import { WORLD_SCRIPTS } from '../content/runScripts.ts'
import type { WorldBestGains } from '../state/persistence.ts'
import type { RunResult } from '../state/runResult.ts'
import { Button } from './button.ts'
import { FONT, T } from './tokens.ts'

/** Taps are ignored this long after the screen appears, so a tap meant for the
 *  game cannot land on RETRY. */
const INPUT_LOCK_MS = 450

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/** Death screen: run stats + new-best flag + Retry / Menu / Share. */
export class GameOver {
  readonly view = new Container()
  onRetry: () => void = () => {}
  onMenu: () => void = () => {}
  onShare: () => void = () => {}
  onLeaderboard: () => void = () => {}

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

    this.view.addChild(this.backdrop, this.title, this.best, this.rank, this.stats, this.retry.view, this.menu.view, this.share.view, this.board.view)
    this.view.visible = false
  }

  private hasUnlockBanner = false
  private readonly glow: GlowFilter

  acceptsInput(): boolean {
    return performance.now() >= this.readyAt
  }

  /** Show the player's global rank once the async submit comes back. */
  setRank(rank: number): void {
    if (this.hasUnlockBanner) return // an unlock is the bigger news, keep it
    this.rank.text = `◆  GLOBAL RANK #${rank}  ◆`
    this.relayout() // the banner slot is sized to its content
  }

  /** Banner anything the run just unlocked (owns the rank line's slot). */
  setUnlocks(names: string[]): void {
    if (names.length === 0) return
    this.hasUnlockBanner = true
    this.rank.text = `★ UNLOCKED: ${names.join(' + ')} ★`
    this.rank.style.fill = 0xffe066
    this.relayout()
  }

  /** The score never reached the leaderboard; say so instead of silence. */
  setSubmitFailed(): void {
    if (this.hasUnlockBanner || !leaderboardEnabled()) return
    this.rank.text = 'score not submitted, check your connection'
    this.rank.style.fill = 0x5f8f83
    this.relayout()
  }

  layout(w: number, h: number): void {
    this.w = w
    this.h = h
    this.relayout()
  }

  private relayout(): void {
    const { w, h } = this
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.74 })
    const cx = w / 2
    this.rank.style.wordWrapWidth = Math.min(w - 32, 500)
    // Flow by REAL text heights: the stats block is 5 lines since the loadout
    // line was added, and the rank slot doubles as the unlock banner (which can
    // wrap). Fixed offsets let them print over each other (owner playtest bug).
    const short = h < 560
    // Long headers (THE QUEEN ESCAPED) shrink to the width instead of clipping.
    this.title.scale.set(1)
    const room = w - 32
    if (this.title.width > room) this.title.scale.set(room / this.title.width)
    // Never above the top edge (phone landscape is only 375 tall).
    let y = Math.max(h * 0.5 - (short ? 170 : 156), this.title.height / 2 + 4)
    this.title.position.set(cx, y)
    y += 34
    this.best.position.set(cx, y)
    y += 22
    this.rank.position.set(cx, y)
    y += Math.max(22, this.rank.height + 6)
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
    this.rank.text = '' // filled in async by setRank() once the submit returns
    this.hasUnlockBanner = false
    this.rank.style.fill = 0x57c8ff
    this.stats.text =
      `${result.mode === 'daily' ? 'DAILY CHALLENGE' : 'ENDLESS'}\n` +
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
