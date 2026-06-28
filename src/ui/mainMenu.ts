import { Container, Graphics, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { COLORS } from '../config.ts'
import { dailyCompletedToday, loadBest } from '../state/persistence.ts'
import { leaderboardEnabled } from '../net/leaderboard.ts'
import type { RunMode } from '../game/world.ts'
import { Button } from './button.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/** Title screen: ENDLESS / DAILY CHALLENGE / SETTINGS + best-score readout. */
export class MainMenu {
  readonly view = new Container()
  onPlay: (mode: RunMode) => void = () => {}
  onSettings: () => void = () => {}
  onLeaderboard: () => void = () => {}

  private backdrop = new Graphics()
  private title: Text
  private tagline: Text
  private info: Text
  private controlsHint: Text
  private endless: Button
  private daily: Button
  private settings: Button
  private leaderboard: Button

  constructor() {
    this.title = new Text({ text: 'SWARMGEDDON', style: { fontFamily: MONO, fontSize: 46, fontWeight: 'bold', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0.5)
    this.title.filters = [new GlowFilter({ color: COLORS.player, distance: 16, outerStrength: 2.2, innerStrength: 0, quality: 0.3 })]
    this.tagline = new Text({ text: 'hold the line · drown the hive in ichor', style: { fontFamily: MONO, fontSize: 14, fill: COLORS.hudDim } })
    this.tagline.anchor.set(0.5)
    this.info = new Text({ text: '', style: { fontFamily: MONO, fontSize: 13, fill: COLORS.hudText, align: 'center', lineHeight: 19 } })
    this.info.anchor.set(0.5)
    this.controlsHint = new Text({
      text: 'Hold to fire — prefer not to? Turn on Auto-fire in Settings',
      // Wrap instead of running off the edge on a phone; width set in layout().
      style: { fontFamily: MONO, fontSize: 12, fill: COLORS.hudDim, align: 'center', wordWrap: true, wordWrapWidth: 460, lineHeight: 17 },
    })
    this.controlsHint.anchor.set(0.5)

    this.endless = new Button('ENDLESS', 280, 58, COLORS.player)
    this.daily = new Button('DAILY CHALLENGE', 280, 58, 0xffc24a)
    this.settings = new Button('SETTINGS', 136, 46, COLORS.hudDim, 14)
    this.leaderboard = new Button('LEADERS', 136, 46, 0x57c8ff, 14)
    this.endless.onClick = () => this.onPlay('endless')
    this.daily.onClick = () => this.onPlay('daily')
    this.settings.onClick = () => this.onSettings()
    this.leaderboard.onClick = () => this.onLeaderboard()

    this.view.addChild(this.backdrop, this.title, this.tagline, this.endless.view, this.daily.view, this.settings.view, this.leaderboard.view, this.info, this.controlsHint)
  }

  layout(w: number, h: number): void {
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.62 })
    const cx = w / 2
    // Keep everything inside narrow phone screens: shrink the title to fit and
    // wrap the controls hint to the available width.
    this.title.scale.set(Math.min(1, (w - 40) / 360))
    this.controlsHint.style.wordWrapWidth = Math.min(w - 32, 460)
    this.controlsHint.style.fontSize = w < 520 ? 11 : 12
    let y = h * 0.5 - 150
    this.title.position.set(cx, y)
    y += 44
    this.tagline.position.set(cx, y)
    y += 46
    this.endless.position(cx - 140, y)
    y += 70
    this.daily.position(cx - 140, y)
    y += 70
    // SETTINGS + LEADERS share a row (keeps the menu short on phone-landscape).
    // When no leaderboard backend is configured, center SETTINGS alone.
    const showBoard = leaderboardEnabled()
    this.leaderboard.view.visible = showBoard
    if (showBoard) {
      this.settings.position(cx - 140, y)
      this.leaderboard.position(cx + 4, y)
    } else {
      this.settings.position(cx - 68, y)
    }
    y += 64
    this.info.position.set(cx, y + 8)
    this.controlsHint.position.set(cx, y + 48)
  }

  refresh(today: string): void {
    const be = loadBest('endless')
    const bd = loadBest('daily')
    const done = dailyCompletedToday(today)
    this.info.text =
      `best endless — score ${be.score}   time ${fmtTime(be.time)}   lv ${be.level}\n` +
      `today's daily (${today}) — ${done ? `done · score ${bd.score}` : 'not yet played'}`
  }

  show(): void {
    this.view.visible = true
  }

  hide(): void {
    this.view.visible = false
  }
}
