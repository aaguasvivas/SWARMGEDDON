import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { GlowFilter } from 'pixi-filters'
import { COLORS } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'
import { Button, Segmented } from './button.ts'
import { Carousel, carouselWidth, type LockInfo } from './carousel.ts'
import { DailyCard, type DailyCardModel } from './dailyCard.ts'
import { GoalsPanel, clip, type Goal } from './goalsPanel.ts'
import type { ToastSlot } from './toast.ts'
import { FONT, RADIUS, T, ensureContrast, uiScale } from './tokens.ts'

/** Design units (375-wide), scaled by uiScale. */
const COL_W = 343
const CARD_W = 255
/** The pilot card's least height; a longer rule grows it. */
const PILOT_MIN_H = 92
const WORLD_H = 56
const PLAY_W = 311
const PLAY_H = 56
const BTN_W = 109
const BTN_H = 48
const SEG_H = 44
const RULE_H = 32
const PAINT_W = 120
const PAINT_H = 40
/** The hero ship's drawn radius and the band it keeps clear around it. */
export const HERO_R = 28
const HERO_PAD = 8
const PLATE_PAD = 10
const SEP = ' · '
/** The landscape title never shrinks under this height. */
const TITLE_MIN_H = 24
/** THREAT rule line: 2 = name and rule, 1 = name only, 0 = none. */
type RuleLevel = 0 | 1 | 2

export interface MenuPilot {
  name: string
  color: number
  /** `100 HP · 285 SPD`. */
  stats: string
  ruleName: string
  ruleDesc: string
  lock: LockInfo | null
}

export interface MenuWorld {
  name: string
  color: number
  /** `vs ACID HIVE · BEST 48,210`. */
  sub: string
  lock: LockInfo | null
}

export interface MenuThreat {
  unlocked: number
  selected: number
  name: string
  rule: string
}

/** Everything the menu shows; main.ts builds it from the save. */
export interface MenuModel {
  /** `stats.runs === 0 && !importedV1`: the title and one big TAP TO PLAY. */
  firstLaunch: boolean
  touch: boolean
  pilot: MenuPilot
  /** The player owns 2 or more pilots. */
  pilotArrows: boolean
  world: MenuWorld
  worldArrows: boolean
  /** Shown when the world's unlocked THREAT is 1 or more. */
  threat: MenuThreat | null
  /** The selected paint's name, when 2 or more paints are owned. */
  paint: string | null
  daily: DailyCardModel | null
  goals: Goal[]
  records: boolean
  leaders: boolean
}

/**
 * The main menu (section 9.7): title, the hero ship (the live arena's ship,
 * placed by the camera at `heroX, heroY`), the pilot and world carousels with
 * the THREAT row, PLAY, the Daily card, NEXT GOALS and SETTINGS / RECORDS /
 * LEADERS. Portrait is one column; landscape puts the Daily card, the goals and
 * the bottom row in a right column with the hero. Laid out in 375-wide design
 * units and scaled by uiScale.
 */
export class MainMenu {
  readonly view = new Container()
  onPlay: () => void = () => {}
  onDaily: () => void = () => {}
  /** The UTC day changed under an open menu: rebuild the model. */
  onNewDay: () => void = () => {}
  onSettings: () => void = () => {}
  onRecords: () => void = () => {}
  onLeaderboard: () => void = () => {}
  onPilot: (dir: -1 | 1) => void = () => {}
  onWorld: (dir: -1 | 1) => void = () => {}
  onPaint: () => void = () => {}
  onThreat: (t: number) => void = () => {}
  /** Where a toast may sit (screen px): the band over the title, which is
   *  decoration, so a toast never covers a control or a card. */
  toastSlot: ToastSlot | null = null
  /** The hero ship's screen center and drawn radius (px). */
  heroX = 0
  heroY = 0
  heroR = HERO_R

  private readonly root = new Container()
  private readonly scrim = new Graphics()
  private readonly title: Text
  private readonly tagline: Text
  private readonly tapToPlay: Text
  private readonly tapCatcher = new Graphics()
  private readonly pilot = new Carousel(CARD_W)
  private readonly pilotName: Text
  private readonly pilotStats: Text
  private readonly pilotRule: Text
  private readonly world = new Carousel(CARD_W)
  private readonly worldName: Text
  private readonly worldSub: Text
  private readonly threatPlate = new Graphics()
  private threatSeg: Segmented | null = null
  private threatLevels = -1
  private readonly threatRule: Text
  private readonly play: Button
  private readonly locked: Button
  private readonly daily = new DailyCard()
  private readonly goalsPlate = new Graphics()
  private readonly goals = new GoalsPanel()
  private readonly paintCaption: Text
  private readonly paint: Button
  private bottom: Button[] = []
  private bottomW = 0
  private pilotH = PILOT_MIN_H
  private model: MenuModel | null = null
  private w = 0
  private h = 0
  private s = 1
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  private pulse = 0

  constructor() {
    this.title = new Text({ text: 'SWARMGEDDON', style: { fontFamily: FONT.display, fontSize: 40, fontWeight: '900', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0.5, 0)
    this.title.filters = [new GlowFilter({ color: COLORS.player, distance: 14, outerStrength: 1.8, innerStrength: 0, quality: 0.3 })]
    this.tagline = new Text({ text: 'hold the line · drown the hive in ichor', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 13, fill: T.textMuted } })
    this.tagline.anchor.set(0.5, 0)
    this.tapToPlay = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '700', fontSize: 20, lineHeight: 28, letterSpacing: 2, fill: T.textHi, align: 'center' } })
    this.tapToPlay.anchor.set(0.5)
    this.tapCatcher.eventMode = 'static'
    this.tapCatcher.cursor = 'pointer'
    this.tapCatcher.on('pointertap', () => this.onPlay())

    this.pilotName = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '700', fontSize: 18, fill: T.textHi } })
    this.pilotName.position.set(12, 9)
    this.pilotStats = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, fill: T.textMuted } })
    this.pilotStats.anchor.set(1, 0)
    this.pilotStats.position.set(CARD_W - 12, 13)
    this.pilotRule = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, lineHeight: 16, fill: T.textHi, wordWrap: true, wordWrapWidth: CARD_W - 24 } })
    this.pilotRule.position.set(12, 36)
    this.pilot.body.addChild(this.pilotName, this.pilotStats, this.pilotRule)
    this.pilot.onStep = (d) => this.onPilot(d)

    this.worldName = new Text({ text: '', style: { fontFamily: FONT.display, fontWeight: '700', fontSize: 16, fill: T.textHi } })
    this.worldName.position.set(12, 8)
    this.worldSub = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, fill: T.textMuted } })
    this.worldSub.position.set(12, 32)
    this.world.body.addChild(this.worldName, this.worldSub)
    this.world.onStep = (d) => this.onWorld(d)

    this.threatRule = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, lineHeight: 16, fill: T.textHi, align: 'center', wordWrap: true, wordWrapWidth: PLAY_W - 2 * PLATE_PAD } })
    this.threatRule.anchor.set(0.5, 0)

    this.play = new Button('PLAY', PLAY_W, PLAY_H, 'primary', 22)
    this.play.onClick = () => this.onPlay()
    // A locked pick reads LOCKED at full contrast and does nothing.
    this.locked = new Button('LOCKED', PLAY_W, PLAY_H, 'secondary', 20)
    this.daily.onPlay = () => this.onDaily()
    this.daily.onNewDay = () => this.onNewDay()

    this.paintCaption = new Text({ text: 'PAINT', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 12, letterSpacing: 1, fill: T.textMuted } })
    this.paintCaption.anchor.set(0.5, 1)
    this.paint = new Button('', PAINT_W, PAINT_H, 'secondary', 13)
    this.paint.onClick = () => this.onPaint()

    this.root.addChild(
      this.scrim, this.tapCatcher, this.title, this.tagline, this.tapToPlay, this.pilot.view, this.world.view, this.threatPlate,
      this.threatRule, this.play.view, this.locked.view, this.daily.view, this.goalsPlate, this.goals.view, this.paintCaption, this.paint.view,
    )
    this.view.addChild(this.root)
  }

  setModel(m: MenuModel): void {
    this.model = m
    this.pilotName.text = m.pilot.name
    this.pilotName.style.fill = ensureContrast(m.pilot.color, T.surfaceCard)
    this.pilotStats.text = m.pilot.stats
    this.pilotRule.text = `${m.pilot.ruleName}: ${m.pilot.ruleDesc}`
    this.pilotH = Math.max(PILOT_MIN_H, Math.ceil(this.pilotRule.y + this.pilotRule.height + 8))
    this.pilot.set(this.pilotH, m.pilotArrows, m.pilot.lock, m.pilot.name)
    this.worldName.text = m.world.name
    this.worldName.style.fill = ensureContrast(m.world.color, T.surfaceCard)
    this.worldSub.text = m.world.sub
    clip(this.worldSub, CARD_W - 24)
    this.world.set(WORLD_H, m.worldArrows, m.world.lock, m.world.name)
    if (m.threat) {
      if (m.threat.unlocked !== this.threatLevels) this.buildThreat(m.threat.unlocked)
      this.threatSeg!.set(m.threat.selected)
    }
    if (m.paint !== null) this.paint.setText(m.paint)
    this.tapToPlay.text = m.touch ? 'TAP TO PLAY' : 'CLICK OR PRESS ENTER\nTO PLAY'
    if (this.w > 0) this.layout(this.w, this.h, this.insets)
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    const m = this.model
    if (!m) return
    const s = uiScale(w, h)
    this.s = s
    this.root.scale.set(s)
    const W = w / s
    const H = h / s
    const ins = { top: insets.top / s, right: insets.right / s, bottom: insets.bottom / s, left: insets.left / s }
    const first = m.firstLaunch
    this.tapToPlay.visible = this.tapCatcher.visible = first
    const full = [this.pilot.view, this.world.view, this.play.view, this.locked.view, this.daily.view, this.goals.view, this.goalsPlate, this.threatPlate, this.threatRule, this.paint.view, this.paintCaption]
    if (this.threatSeg) full.push(this.threatSeg.view)
    for (const c of full) c.visible = false
    for (const b of this.bottom) b.view.visible = false
    let hx: number
    let hy: number
    if (first) {
      ;[hx, hy] = this.layoutFirst(W, H, ins)
    } else {
      this.pilot.view.visible = this.world.view.visible = true
      const locked = m.pilot.lock !== null || m.world.lock !== null
      this.play.view.visible = !locked
      this.locked.view.visible = locked
      ;[hx, hy] = W > H ? this.layoutLandscape(W, H, ins, m) : this.layoutPortrait(W, H, ins, m)
    }
    this.heroX = hx * s
    this.heroY = hy * s
    this.heroR = HERO_R * s
    this.drawScrim(W, H, hx, hy)
  }

  /** Pulse TAP TO PLAY and tick the Daily countdown (real clock). */
  tick(nowMs: number, fd: number): void {
    if (!this.view.visible || !this.model) return
    if (this.tapToPlay.visible) {
      this.pulse += fd
      this.tapToPlay.scale.set(1 + 0.04 * Math.sin(this.pulse * 3.2))
    }
    if (this.daily.view.visible) this.daily.tick(nowMs)
  }

  show(): void {
    this.view.visible = true
  }

  hide(): void {
    this.view.visible = false
  }

  /** A toast slot from design units. */
  private slot(x: number, y: number, w: number): ToastSlot {
    return { x: x * this.s, y: y * this.s, w: w * this.s }
  }

  private layoutFirst(W: number, H: number, ins: Insets): [number, number] {
    const cx = ins.left + (W - ins.left - ins.right) / 2
    const top = ins.top
    const avail = H - ins.top - ins.bottom
    this.fitTitle(Math.min(COL_W, W - ins.left - ins.right - 32))
    this.title.position.set(cx, top + avail * 0.16)
    this.tagline.visible = true
    this.tagline.position.set(cx, this.title.y + this.title.height + 6)
    const hy = top + avail * 0.48
    this.tapToPlay.position.set(cx, top + avail * 0.74)
    this.tapCatcher.clear()
    this.tapCatcher.rect(0, 0, W, H).fill({ color: 0, alpha: 0.001 })
    this.tapCatcher.hitArea = new Rectangle(0, 0, W, H)
    this.toastSlot = this.slot(ins.left + 16, top + 8, W - ins.left - ins.right - 32)
    return [cx, hy]
  }

  private layoutPortrait(W: number, H: number, ins: Insets, m: MenuModel): [number, number] {
    const cw = Math.min(COL_W, W - ins.left - ins.right - 32)
    const cx = ins.left + (W - ins.left - ins.right) / 2
    const top = ins.top
    const barY = H - ins.bottom - 16 - BTN_H
    this.fitTitle(cw)
    const titleH = this.title.height
    const dailyH = m.daily ? this.daily.set(m.daily, cw) : 0
    // Sections top to bottom; the optional ones drop out until the hero band fits.
    let tagline = true
    let goalRows = Math.min(2, m.goals.length)
    let rule: RuleLevel = 2
    const heroMin = 2 * (HERO_R + HERO_PAD)
    const fixed = (): number =>
      20 + titleH + (tagline ? 22 : 0) + 8 + 6 + this.pilotH + 8 + WORLD_H + this.threatH(m, rule) + 12 + PLAY_H +
      (m.daily ? 12 + dailyH : 0) + (goalRows > 0 ? 12 + GoalsPanel.height(goalRows) + 2 * PLATE_PAD - 6 : 0)
    const avail = barY - 12 - top
    if (avail - fixed() < heroMin) tagline = false
    if (avail - fixed() < heroMin && goalRows > 1) goalRows = 1
    if (avail - fixed() < heroMin) goalRows = 0
    while (avail - fixed() < heroMin && rule > 0) rule = (rule - 1) as RuleLevel
    const room = avail - fixed()
    const heroH = Math.max(heroMin, Math.min(room, heroMin + 24))
    // Leftover height centers the stack between the top inset and the bottom row.
    let y = top + Math.max(0, (room - heroH) / 2) + 20
    this.title.position.set(cx, y)
    y += titleH
    this.tagline.visible = tagline
    if (tagline) {
      this.tagline.position.set(cx, y + 6)
      y += 22
    }
    y += 8
    const hx = this.placePaint(m, cx, y + heroH / 2, cx - cw / 2, cx + cw / 2, y + heroH + 6)
    const hy = y + heroH / 2
    y += heroH + 6
    y = this.placeCarousels(m, cx, y, rule)
    y += 12
    this.play.position(cx - PLAY_W / 2, y)
    this.locked.position(cx - PLAY_W / 2, y)
    y += PLAY_H
    this.daily.view.visible = m.daily !== null
    if (m.daily) {
      y += 12
      this.daily.view.position.set(cx - cw / 2, y)
      y += dailyH
    }
    this.placeGoals(m, cx - cw / 2, y + 12, cw, goalRows)
    this.placeBottom(m, cx, barY, cw)
    this.toastSlot = this.slot(ins.left + 16, top + 8, W - ins.left - ins.right - 32)
    return [hx, hy]
  }

  private layoutLandscape(W: number, H: number, ins: Insets, m: MenuModel): [number, number] {
    const availW = W - ins.left - ins.right - 32
    const leftW = Math.min(COL_W, carouselWidth(CARD_W))
    const rightW = Math.min(COL_W, availW - leftW - 24)
    const x0 = ins.left + 16 + Math.max(0, (availW - leftW - 24 - rightW) / 2)
    const lcx = x0 + leftW / 2
    const rx = x0 + leftW + 24
    const rcx = rx + rightW / 2
    const top = ins.top + 12
    const bottom = H - ins.bottom - 12

    // Left column: title, the carousels with THREAT, PLAY; centered vertically.
    // The title (decoration) shrinks to the height left over, down to TITLE_MIN_H.
    this.tagline.visible = false
    this.fitTitle(leftW)
    let rule: RuleLevel = 2
    const rest = (): number => 8 + this.pilotH + 8 + WORLD_H + this.threatH(m, rule) + 12 + PLAY_H
    while (rule > 0 && bottom - top - rest() < TITLE_MIN_H) rule = (rule - 1) as RuleLevel
    const titleRoom = bottom - top - rest()
    if (this.title.height > titleRoom) this.title.scale.set((this.title.scale.x * Math.max(TITLE_MIN_H, titleRoom)) / this.title.height)
    let y = top + Math.max(0, (bottom - top - rest() - this.title.height) / 2)
    const colTop = y
    this.title.position.set(lcx, y)
    y += this.title.height + 8
    y = this.placeCarousels(m, lcx, y, rule)
    y += 12
    this.play.position(lcx - PLAY_W / 2, y)
    this.locked.position(lcx - PLAY_W / 2, y)

    // Right column: the Daily card and the goals on top, the bottom row at the
    // bottom, and the hero ship in the band between them. On a tall screen the
    // column spans the left column's height (title top to PLAY bottom).
    const band = 2 * (HERO_R + HERO_PAD)
    const dailyH = m.daily ? this.daily.set(m.daily, rightW) + 12 : 0
    let ry = Math.max(ins.top + 16, colTop)
    let barY = Math.min(H - ins.bottom - 16 - BTN_H, y + PLAY_H - BTN_H)
    if (barY - ry - dailyH < band) {
      ry = ins.top + 16
      barY = H - ins.bottom - 16 - BTN_H
    }
    this.daily.view.visible = m.daily !== null
    this.daily.view.position.set(rx, ry)
    ry += dailyH
    let goalRows = Math.min(3, m.goals.length)
    while (goalRows > 0 && barY - (ry + GoalsPanel.height(goalRows) + 2 * PLATE_PAD - 6) < band) goalRows--
    const goalsEnd = this.placeGoals(m, rx, ry, rightW, goalRows)
    const lo = goalsEnd + HERO_R + HERO_PAD
    const hi = barY - HERO_R - HERO_PAD
    const hy = Math.max(lo, Math.min(hi, H * 0.62))
    const hx = this.placePaint(m, Math.max(rx + HERO_R + HERO_PAD, Math.min(rx + rightW - HERO_R - HERO_PAD, W * 0.75)), hy, rx, rx + rightW, barY - 12)
    this.placeBottom(m, rcx, barY, rightW)
    this.toastSlot = this.slot(x0, ins.top + 8, leftW)
    return [hx, hy]
  }

  /** Height of the THREAT block at a rule level (0 when no row shows). */
  private threatH(m: MenuModel, rule: RuleLevel): number {
    return m.threat ? 8 + SEG_H + (rule === 2 ? 6 + RULE_H : rule === 1 ? 6 + RULE_H / 2 : 0) + 8 : 0
  }

  /** The pilot and world carousels and the THREAT row from `y`; returns the bottom. */
  private placeCarousels(m: MenuModel, cx: number, y: number, rule: RuleLevel): number {
    this.pilot.view.position.set(cx - this.pilot.width / 2, y)
    y += this.pilotH + 8
    this.world.view.position.set(cx - this.world.width / 2, y)
    y += WORLD_H
    const seg = this.threatSeg
    const show = m.threat !== null && seg !== null
    this.threatPlate.visible = show
    this.threatRule.visible = show && rule > 0
    if (seg) seg.view.visible = show
    if (!show) return y
    // Level 2 shows the name and rule, level 1 the name alone.
    this.threatRule.text = rule === 2 ? `${m.threat!.name}${SEP}${m.threat!.rule}` : m.threat!.name
    y += 8
    const h = this.threatH(m, rule) - 8
    this.threatPlate.clear()
    this.threatPlate.roundRect(cx - PLAY_W / 2, y, PLAY_W, h, RADIUS.card).fill({ color: T.surfaceCard, alpha: 0.92 })
    seg.view.position.set(cx - seg.view.width / 2, y + 4)
    this.threatRule.position.set(cx, y + 4 + SEG_H + 6)
    return y + h
  }

  /** NEXT GOALS on its plate at (x, y); returns the bottom (y when hidden). */
  private placeGoals(m: MenuModel, x: number, y: number, w: number, rows: number): number {
    const show = rows > 0
    this.goals.view.visible = this.goalsPlate.visible = show
    if (!show) return y
    const ph = GoalsPanel.height(rows) + 2 * PLATE_PAD - 6
    this.goalsPlate.clear()
    this.goalsPlate.roundRect(x, y, w, ph, RADIUS.card).fill({ color: T.surfaceCard, alpha: 0.92 })
    this.goals.set(m.goals.slice(0, rows), w - 2 * PLATE_PAD)
    this.goals.view.position.set(x + PLATE_PAD, y + PLATE_PAD)
    return y + ph
  }

  /** The paint picker beside the hero, inside [x0, x1]: right of the ship, else
   *  left of it, else the ship moves over so both fit; never below `maxY`.
   *  Returns the hero's x. */
  private placePaint(m: MenuModel, hx: number, hy: number, x0: number, x1: number, maxY: number): number {
    const show = m.paint !== null
    this.paint.view.visible = this.paintCaption.visible = show
    if (!show) return hx
    const gap = HERO_R + HERO_PAD + 4
    let px = hx + gap
    if (px + PAINT_W > x1) {
      px = hx - gap - PAINT_W
      if (px < x0) {
        hx = (x0 + x1 - PAINT_W - gap) / 2
        px = hx + gap
      }
    }
    // The hit rect (6 px past the visual) stays clear of the controls below maxY.
    const py = Math.min(hy - PAINT_H / 2 + 8, maxY - 6 - PAINT_H)
    this.paint.position(px, py)
    this.paintCaption.position.set(px + PAINT_W / 2, py - 4)
    return hx
  }

  /** SETTINGS, RECORDS and LEADERS (the ones shown), centered on `cx`. */
  private placeBottom(m: MenuModel, cx: number, y: number, colW: number): void {
    const bw = Math.min(BTN_W, Math.floor((colW - 16) / 3))
    if (bw !== this.bottomW) this.buildBottom(bw)
    const [settings, records, leaders] = this.bottom as [Button, Button, Button]
    settings.view.visible = true
    records.view.visible = m.records
    leaders.view.visible = m.leaders
    const shown = this.bottom.filter((b) => b.view.visible)
    const total = shown.length * bw + (shown.length - 1) * 8
    let x = cx - total / 2
    for (const b of shown) {
      b.position(x, y)
      x += bw + 8
    }
  }

  private buildBottom(bw: number): void {
    for (const b of this.bottom) b.view.destroy({ children: true })
    this.bottomW = bw
    const make = (label: string, f: () => void): Button => {
      const b = new Button(label, bw, BTN_H, 'secondary', 14)
      b.onClick = f
      this.root.addChild(b.view)
      return b
    }
    this.bottom = [make('SETTINGS', () => this.onSettings()), make('RECORDS', () => this.onRecords()), make('LEADERS', () => this.onLeaderboard())]
  }

  private buildThreat(unlocked: number): void {
    this.threatSeg?.view.destroy({ children: true })
    const labels: string[] = []
    for (let t = 0; t <= unlocked; t++) labels.push('T' + t)
    const seg = new Segmented(labels, Math.min(PLAY_W - 2 * PLATE_PAD, 72 * labels.length), 14)
    seg.onChange = (i) => this.onThreat(i)
    this.threatSeg = seg
    this.threatLevels = unlocked
    this.root.addChildAt(seg.view, this.root.getChildIndex(this.threatPlate) + 1)
  }

  private fitTitle(maxW: number): void {
    this.title.scale.set(1)
    if (this.title.width > maxW) this.title.scale.set(maxW / this.title.width)
  }

  /** Dim the arena under the menu, clear around the hero ship. */
  private drawScrim(W: number, H: number, hx: number, hy: number): void {
    const g = this.scrim
    const r = HERO_R + HERO_PAD
    g.clear()
    g.rect(0, 0, W, H).fill({ color: T.bgVoid, alpha: 0.6 })
    g.circle(hx, hy, r + 24).cut()
    g.circle(hx, hy, r + 24).fill({ color: T.bgVoid, alpha: 0.4 })
    g.circle(hx, hy, r + 12).cut()
    g.circle(hx, hy, r + 12).fill({ color: T.bgVoid, alpha: 0.2 })
    g.circle(hx, hy, r).cut()
  }
}
