import { Container, Graphics, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { COLORS } from '../config.ts'
import { dailyCompletedToday, loadBest } from '../state/persistence.ts'
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

  private backdrop = new Graphics()
  private title: Text
  private tagline: Text
  private info: Text
  private endless: Button
  private daily: Button
  private settings: Button

  constructor() {
    this.title = new Text({ text: 'SWARMGEDDON', style: { fontFamily: MONO, fontSize: 46, fontWeight: 'bold', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0.5)
    this.title.filters = [new GlowFilter({ color: COLORS.player, distance: 16, outerStrength: 2.2, innerStrength: 0, quality: 0.3 })]
    this.tagline = new Text({ text: 'hold the line · drown the hive in ichor', style: { fontFamily: MONO, fontSize: 14, fill: COLORS.hudDim } })
    this.tagline.anchor.set(0.5)
    this.info = new Text({ text: '', style: { fontFamily: MONO, fontSize: 13, fill: COLORS.hudText, align: 'center', lineHeight: 19 } })
    this.info.anchor.set(0.5)

    this.endless = new Button('ENDLESS', 280, 58, COLORS.player)
    this.daily = new Button('DAILY CHALLENGE', 280, 58, 0xffc24a)
    this.settings = new Button('SETTINGS', 280, 46, COLORS.hudDim, 15)
    this.endless.onClick = () => this.onPlay('endless')
    this.daily.onClick = () => this.onPlay('daily')
    this.settings.onClick = () => this.onSettings()

    this.view.addChild(this.backdrop, this.title, this.tagline, this.endless.view, this.daily.view, this.settings.view, this.info)
  }

  layout(w: number, h: number): void {
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.62 })
    const cx = w / 2
    let y = h * 0.5 - 150
    this.title.position.set(cx, y)
    y += 44
    this.tagline.position.set(cx, y)
    y += 46
    this.endless.position(cx - 140, y)
    y += 70
    this.daily.position(cx - 140, y)
    y += 70
    this.settings.position(cx - 140, y)
    y += 64
    this.info.position.set(cx, y + 8)
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
