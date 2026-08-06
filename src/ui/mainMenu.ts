import { Container, Graphics, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { COLORS } from '../config.ts'
import { dailyCompletedToday, loadBest } from '../state/persistence.ts'
import type { WorldBest } from '../state/persistence.ts'
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
  onCyclePilot: () => void = () => {}
  onCycleArena: () => void = () => {}

  private backdrop = new Graphics()
  private title: Text
  private tagline: Text
  private info: Text
  private loadoutHint: Text
  private controlsHint: Text
  private endless: Button
  private daily: Button
  private settings: Button
  private leaderboard: Button
  private pilot: Button
  private arena: Button
  private pilotSwatch = new Graphics()
  // The info readout is two lines composed from independently-updated sources:
  // the selected world's personal best (set on arena cycle) and the daily status.
  private worldBestLine = ''
  private dailyLine = ''

  constructor() {
    this.title = new Text({ text: 'SWARMGEDDON', style: { fontFamily: MONO, fontSize: 46, fontWeight: 'bold', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0.5)
    this.title.filters = [new GlowFilter({ color: COLORS.player, distance: 16, outerStrength: 2.2, innerStrength: 0, quality: 0.3 })]
    this.tagline = new Text({ text: 'hold the line · drown the hive in ichor', style: { fontFamily: MONO, fontSize: 14, fill: COLORS.hudDim } })
    this.tagline.anchor.set(0.5)
    this.info = new Text({ text: '', style: { fontFamily: MONO, fontSize: 13, fill: COLORS.hudText, align: 'center', lineHeight: 19 } })
    this.info.anchor.set(0.5)
    this.controlsHint = new Text({
      text: 'Hold to fire. Prefer not to? Turn on Auto-fire in Settings',
      // Wrap instead of running off the edge on a phone; width set in layout().
      style: { fontFamily: MONO, fontSize: 12, fill: COLORS.hudDim, align: 'center', wordWrap: true, wordWrapWidth: 460, lineHeight: 17 },
    })
    this.controlsHint.anchor.set(0.5)

    this.loadoutHint = new Text({ text: '', style: { fontFamily: MONO, fontSize: 11, fill: COLORS.hudDim, align: 'center', wordWrap: true, wordWrapWidth: 500, lineHeight: 15 } })
    // Top-anchored: the hint grows DOWN into its reserved slot, never up into
    // the selector buttons (it doubles to two lines when items are locked).
    this.loadoutHint.anchor.set(0.5, 0)

    this.endless = new Button('ENDLESS', 280, 58, COLORS.player)
    this.daily = new Button('DAILY CHALLENGE', 280, 58, 0xffc24a)
    this.settings = new Button('SETTINGS', 136, 46, COLORS.hudDim, 14)
    this.leaderboard = new Button('LEADERS', 136, 46, 0x57c8ff, 14)
    // Loadout selectors — tap to cycle pilot / arena (labels set via setLoadout).
    this.pilot = new Button('', 136, 40, COLORS.player, 13)
    this.arena = new Button('', 136, 40, 0xffc24a, 13)
    this.endless.onClick = () => this.onPlay('endless')
    this.daily.onClick = () => this.onPlay('daily')
    this.settings.onClick = () => this.onSettings()
    this.leaderboard.onClick = () => this.onLeaderboard()
    this.pilot.onClick = () => this.onCyclePilot()
    this.arena.onClick = () => this.onCycleArena()

    this.view.addChild(
      this.backdrop, this.title, this.tagline, this.endless.view, this.daily.view,
      this.settings.view, this.leaderboard.view, this.pilot.view, this.arena.view,
      this.pilotSwatch, this.loadoutHint, this.info, this.controlsHint,
    )
  }

  /** Update the selector labels + the one-line hint under them. `swatch` paints
   *  the little pilot color chip; pass the pilot's body color. */
  setLoadout(pilotLabel: string, arenaLabel: string, hint: string, swatch: number): void {
    this.pilot.setText(pilotLabel)
    this.arena.setText(arenaLabel)
    this.loadoutHint.text = hint
    this.pilotSwatch.clear()
    this.pilotSwatch.circle(0, 0, 6).fill(swatch)
    this.pilotSwatch.circle(0, 0, 6).stroke({ width: 1.5, color: 0x05070d })
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
    this.loadoutHint.style.wordWrapWidth = Math.min(w - 24, 500)
    // Short screens (phone landscape): drop the tagline AND the hold-to-fire
    // hint (touch aims-and-fires by drag, so it's the least useful line there),
    // and tighten every gap — otherwise the stack overflows 375px-tall screens,
    // clipping the title and squeezing the loadout hint into the score lines.
    const short = h < 560
    this.tagline.visible = !short
    this.controlsHint.visible = !short
    const titleH = short ? 32 : 44
    const bigRow = short ? 64 : 68
    const smallRow = short ? 50 : 54
    let y = h * 0.5 - (short ? 148 : 178)
    this.title.position.set(cx, y)
    y += titleH
    if (!short) {
      this.tagline.position.set(cx, y)
      y += 42
    }
    this.endless.position(cx - 140, y)
    y += bigRow
    this.daily.position(cx - 140, y)
    y += bigRow
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
    y += smallRow
    // Loadout row: PILOT + ARENA cyclers, then the hint in a RESERVED two-line
    // slot (top-anchored) so it can never collide with the buttons or scores.
    this.pilot.position(cx - 140, y)
    this.arena.position(cx + 4, y)
    this.pilotSwatch.position.set(cx - 140 + 14, y + 20)
    y += 46
    this.loadoutHint.position.set(cx, y)
    y += 36
    this.info.position.set(cx, y + 19)
    y += 44
    if (!short) this.controlsHint.position.set(cx, y + 14)
  }

  /** Show the selected world's personal best (best survival time + most kills).
   *  Updates as the player cycles the arena selector. */
  setWorldBest(worldName: string, best: WorldBest): void {
    const played = best.time > 0 || best.kills > 0
    this.worldBestLine = played
      ? `${worldName} best: ${fmtTime(best.time)} · ${best.kills} kills`
      : `${worldName}: no runs yet`
    this.renderInfo()
  }

  refresh(today: string): void {
    const bd = loadBest('daily')
    const done = dailyCompletedToday(today)
    this.dailyLine = `today's daily (${today}): ${done ? `done · score ${bd.score}` : 'not yet played'}`
    this.renderInfo()
  }

  private renderInfo(): void {
    this.info.text = `${this.worldBestLine}\n${this.dailyLine}`
  }

  show(): void {
    this.view.visible = true
  }

  hide(): void {
    this.view.visible = false
  }
}
