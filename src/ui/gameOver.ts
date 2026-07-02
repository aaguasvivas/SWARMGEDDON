import { Container, Graphics, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { COLORS } from '../config.ts'
import { leaderboardEnabled } from '../net/leaderboard.ts'
import { characterById } from '../content/characters.ts'
import { arenaById } from '../content/arenas.ts'
import type { RunResult } from '../state/persistence.ts'
import { Button } from './button.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'

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

  constructor() {
    this.title = new Text({ text: 'OVERRUN', style: { fontFamily: MONO, fontSize: 40, fontWeight: 'bold', fill: COLORS.hurtFlash, letterSpacing: 3 } })
    this.title.anchor.set(0.5)
    this.title.filters = [new GlowFilter({ color: COLORS.hurtFlash, distance: 14, outerStrength: 2, innerStrength: 0, quality: 0.3 })]
    this.best = new Text({ text: '', style: { fontFamily: MONO, fontSize: 15, fontWeight: 'bold', fill: 0xffe066 } })
    this.best.anchor.set(0.5)
    this.rank = new Text({ text: '', style: { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: 0x57c8ff } })
    this.rank.anchor.set(0.5)
    this.stats = new Text({ text: '', style: { fontFamily: MONO, fontSize: 16, fill: COLORS.hudText, align: 'center', lineHeight: 24 } })
    this.stats.anchor.set(0.5)

    this.retry = new Button('RETRY', 180, 52, COLORS.player)
    this.menu = new Button('MENU', 180, 52, COLORS.hudDim)
    this.share = new Button('SHARE RUN', 136, 46, 0x57c8ff, 14)
    this.board = new Button('LEADERS', 136, 46, 0xffc24a, 14)
    this.retry.onClick = () => this.onRetry()
    this.menu.onClick = () => this.onMenu()
    this.share.onClick = () => this.onShare()
    this.board.onClick = () => this.onLeaderboard()

    this.view.addChild(this.backdrop, this.title, this.best, this.rank, this.stats, this.retry.view, this.menu.view, this.share.view, this.board.view)
    this.view.visible = false
  }

  private hasUnlockBanner = false

  /** Show the player's global rank once the async submit comes back. */
  setRank(rank: number): void {
    if (this.hasUnlockBanner) return // an unlock is the bigger news — keep it
    this.rank.text = `◆  GLOBAL RANK #${rank}  ◆`
  }

  /** Banner anything the run just unlocked (owns the rank line's slot). */
  setUnlocks(names: string[]): void {
    if (names.length === 0) return
    this.hasUnlockBanner = true
    this.rank.text = `★ UNLOCKED: ${names.join(' + ')} ★`
    this.rank.style.fill = 0xffe066
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
    let y = h * 0.5 - 156
    this.title.position.set(cx, y)
    y += 34
    this.best.position.set(cx, y)
    y += 22
    this.rank.position.set(cx, y)
    y += 20
    this.stats.position.set(cx, y + 24)
    y += 118
    this.retry.position(cx - 188, y)
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

  show(result: RunResult, isHigh: boolean): void {
    this.best.text = isHigh ? '★ NEW BEST ★' : ''
    this.rank.text = '' // filled in async by setRank() once the submit returns
    this.hasUnlockBanner = false
    this.rank.style.fill = 0x57c8ff
    this.stats.text =
      `${result.mode === 'daily' ? 'DAILY CHALLENGE' : 'ENDLESS'}\n` +
      `${characterById(result.character).name} · ${arenaById(result.arena).name}\n` +
      `survived  ${fmtTime(result.time)}\n` +
      `kills  ${result.kills}     level  ${result.level}\n` +
      `score  ${result.score}`
    this.relayout()
    this.view.visible = true
  }

  hide(): void {
    this.view.visible = false
  }
}
