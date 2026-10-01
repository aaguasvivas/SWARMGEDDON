import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { TIER_COLOR, XP } from '../config.ts'
import { BONUSES, BONUS_FREEZE, BONUS_OVERDRIVE, BONUS_SHIELD } from '../content/bonuses.ts'
import { BOSS_STAGES } from '../content/bosses.ts'
import { ENEMIES } from '../content/enemies.ts'
import { MARKER_BOSS, MARKER_EVENT, MARKER_FINAL } from '../content/runScripts.ts'
import { TIER_STEPS } from '../core/rules.ts'
import type { World } from '../game/world.ts'
import type { Insets } from '../platform/safeArea.ts'
import { SegRing } from '../render/segRing.ts'
import { Plate } from './button.ts'
import { CH_PLUS, DigitStrip } from './digits.ts'
import { makeIcon } from './icons.ts'
import { FONT, INK, RADIUS, T, ensureContrast, uiScale } from './tokens.ts'

const CH_X = 120
const CH_PCT = 37
/** Seconds the timeline spans (the 12:00 run arc). */
const TIMELINE_S = 720
const PLATE_H_P = 66
const PLATE_H_L = 52
/** Row A (pending chip left, tier badge right) and the boss plate row, below the plate. */
const ROW_A = 80
const ROW_A_H = 40
const ROW_BOSS_P = 124
const BOSS_H = 34
const BADGE_W = 84
const CHIP_H = 24
/** Widest the pending chip gets (`LEVEL UP x9`); the landscape boss plate keeps clear of it. */
const CHIP_MAX_W = 110
const PILL_MIN_W = 140
const PILL_H = 36
const DROP_FLASH_S = 0.9
const DROP_COLOR = 0xff6a6a
const OVERSHIELD = 0x57e0ff
/** The callout lane sits this far below the lowest HUD row in portrait (A15). */
const LANE_GAP = 48
/** Screen px from a callout's center to its title's top edge (stroke included). */
const LANE_HALF = 29
/** Landscape screens shorter than this take the callout at this scale (the 14 px sub stays at 12 px or more). */
const SHORT_LANDSCAPE = 360
const SHORT_LANE_SCALE = 0.86
/** Timer rings for the timed bonuses (9.2): diameter, gap, segments. Portrait
 *  puts them in row A right of the widest LEVEL UP chip; landscape, whose row A
 *  holds the boss plate, puts them under the chip. */
const RING_D = 28
const RING_GAP = 6
const RING_SEGS = 16
const TIMED_BONUSES = [BONUS_FREEZE, BONUS_OVERDRIVE, BONUS_SHIELD] as const

/** One timed bonus's ring: segments for the time left and its whole seconds. */
class BonusRing {
  readonly view = new Container()
  readonly ring = new SegRing(RING_SEGS, RING_D / 2 - 1, 3, 6)
  readonly secs: DigitStrip
  lit = -1

  constructor(
    readonly tint: number,
    readonly duration: number,
  ) {
    const back = new Graphics()
    back.circle(0, 0, RING_D / 2).fill({ color: INK, alpha: 0.6 })
    this.secs = new DigitStrip(2, 12, tint, 0.5)
    this.view.addChild(back, this.ring.view, this.secs.view)
    this.view.visible = false
  }
}

/**
 * The run HUD (section 9.2): one plate across the top (pause, level chip, HP,
 * XP, run timeline, time, score), a row under it (LEVEL UP chip left, tier
 * badge right), the boss plate, and the weapon pill at the bottom. Bars are
 * NineSlice plates whose width changes; numbers are DigitStrips that change
 * only when their integer does; Text changes only on events (a new boss, a new
 * weapon). Laid out in 375-wide design units and scaled by uiScale. Every row
 * keeps its place whether its neighbors show or not.
 */
export class Hud {
  readonly view = new Container()
  onPause: () => void = () => {}
  /** Screen px: the plate's bottom, row A's bottom (LEVEL UP chip, tier badge),
   *  the weapon pill's top, the callout lane center, and the pause button's hit
   *  rect grown by the input exclusion pad. */
  topBottom = 0
  rowBottom = 0
  pillTop = 0
  laneY = 0
  /** Callout scale: short landscape screens take a smaller line. */
  laneScale = 1
  readonly pauseRect = new Rectangle()

  private s = 1
  private plateX = 0
  private plateR = 0

  private readonly plate = new Plate(10, 10)
  private readonly pause = new Container()

  private readonly lvChip = new Plate(50, 20, T.levelChip, 1, RADIUS.chip)
  private readonly lvText: Text
  private readonly lvNum = new DigitStrip(3, 12, INK, 0)

  private readonly hpBack = new Plate(10, 18, 0x10231d, 1, 5)
  private readonly hpGhost = new Plate(10, 18, 0xffd2d2, 0.55, 5)
  private readonly hpFill = new Plate(10, 18, T.hpGreen, 1, 5)
  private readonly hpShield = new Plate(10, 5, OVERSHIELD, 1, 2)
  private readonly hpNum = new DigitStrip(5, 13, T.textHi, 0)
  private readonly shieldNum = new DigitStrip(5, 13, OVERSHIELD, 0)
  private hpX = 0
  private hpW = 100
  private hpDisplay = 1
  private hpGhostV = 1
  private hpColor = 0

  private readonly xpBack = new Plate(10, 6, 0x10243a, 1, 3)
  private readonly xpFill = new Plate(10, 6, T.accentXp, 1, 3)
  private readonly surge = new Graphics()
  private xpW = 100
  private xpDisplay = 0

  private readonly timeline = new Graphics()
  private readonly nowTick = new Plate(2, 10, T.textHi, 1, 1)
  private tlX = 0
  private tlY = 0
  private tlW = 100

  private readonly time = new DigitStrip(6, 18, T.textHi, 1)
  private readonly score = new DigitStrip(13, 13, T.textPrimary, 1)
  private readonly daily: Text

  private readonly chip = new Container()
  private readonly chipBg = new Plate(10, CHIP_H, T.accentGold, 1, RADIUS.chip)
  private readonly chipText: Text
  private readonly chipNum = new DigitStrip(3, 12, INK, 0)
  private shownPending = -1

  private readonly badge = new Container()
  private readonly badgeBg = new Plate(BADGE_W, ROW_A_H, T.plate, T.plateAlpha, RADIUS.chip)
  private readonly tierText: Text[] = []
  private readonly chainBack = new Plate(60, 3, T.decorDim, 1, 1)
  private readonly chainFill = new Plate(60, 3, T.textHi, 1, 1)
  private readonly drop = new Container()
  private readonly dropFrom = new DigitStrip(3, 18, DROP_COLOR, 0)
  private readonly dropTo = new DigitStrip(3, 18, DROP_COLOR, 0)
  private readonly dropArrow = makeIcon('chevronR', 14, DROP_COLOR)
  private dropT = 0
  private shownTier = -1

  private readonly boss = new Container()
  private readonly bossBg = new Plate(10, BOSS_H, T.plate, T.plateAlpha, RADIUS.chip)
  private readonly bossName: Text
  private readonly frenzy = new Container()
  private readonly frenzyBg = new Plate(62, 16, T.accentDanger, 1, 4)
  private readonly frenzyText: Text
  private readonly bossPct = new DigitStrip(4, 12, T.textHi, 1)
  private readonly bossBack = new Plate(10, 8, 0x2a0d1d, 1, 3)
  private readonly bossFill = new Plate(10, 8, T.bossFill, 1, 3)
  private readonly notches = new Graphics()
  private bossW = 100
  private bossTitle = ''
  private bossStage = ''

  private readonly pill = new Container()
  private readonly pillBg = new Plate(PILL_MIN_W, PILL_H, T.plate, T.plateAlpha, RADIUS.plate)
  private readonly weaponName: Text
  private readonly ammo = new DigitStrip(5, 14, T.textHi, 0)
  private readonly ammoBack = new Plate(10, 3, T.decorDim, 1, 1)
  private readonly ammoFill = new Plate(10, 3, 0xffffff, 1, 1)
  private weaponId = ''
  private ammoW = -1
  private pillW = PILL_MIN_W
  private pillX = 0

  private readonly bonusRings = TIMED_BONUSES.map((b) => new BonusRing(BONUSES[b]!.tint, BONUSES[b]!.duration))
  /** Bit i set: TIMED_BONUSES[i] runs (-1 forces a re-pack after layout). */
  private ringMask = -1
  private ringX = 0
  private ringY = 0
  private ringGap = RING_GAP

  constructor() {
    this.lvText = label('LV', 12, INK)
    this.daily = label('', 12, T.accentGold)
    this.daily.anchor.set(1, 0.5)
    this.chipText = label('LEVEL UP', 12, INK)
    this.bossName = label('', 12, T.bossText)
    this.frenzyText = label('FRENZY', 12, INK)
    this.frenzyText.anchor.set(0.5)
    this.frenzyText.position.set(31, 8)
    this.weaponName = label('', 14, T.textHi)

    const frame = new Graphics()
    frame.roundRect(0.75, 0.75, 42.5, 42.5, 10).stroke({ width: 1.5, color: T.lineStrong, alpha: 0.9 })
    const pauseIcon = makeIcon('pause', 22, T.textHi)
    pauseIcon.position.set(22, 22)
    this.pause.addChild(frame, pauseIcon)
    this.pause.eventMode = 'static'
    this.pause.cursor = 'pointer'
    this.pause.hitArea = new Rectangle(-2, -2, 48, 48)
    this.pause.on('pointertap', () => this.onPause())

    this.chip.addChild(this.chipBg.view, this.chipText, this.chipNum.view)
    this.chip.visible = false
    this.badge.addChild(this.badgeBg.view)
    for (let t = 2; t < TIER_COLOR.length; t++) {
      const tt = new Text({ text: 'x' + t, style: { fontFamily: FONT.display, fontWeight: '900', fontSize: 20, fill: TIER_COLOR[t]! } })
      tt.anchor.set(0, 0.5)
      tt.position.set(12, 17)
      tt.visible = false
      this.tierText[t] = tt
      this.badge.addChild(tt)
    }
    this.chainBack.view.position.set(12, 31)
    this.chainFill.view.position.set(12, 31)
    this.dropFrom.view.position.set(10, ROW_A_H / 2)
    this.dropArrow.y = ROW_A_H / 2
    this.dropTo.view.y = ROW_A_H / 2
    this.drop.addChild(this.dropFrom.view, this.dropArrow, this.dropTo.view)
    this.drop.visible = false
    this.badge.addChild(this.chainBack.view, this.chainFill.view, this.drop)
    this.badge.visible = false

    this.frenzy.addChild(this.frenzyBg.view, this.frenzyText)
    this.frenzy.y = 2
    this.boss.addChild(this.bossBg.view, this.bossName, this.frenzy, this.bossPct.view, this.bossBack.view, this.bossFill.view, this.notches)
    this.boss.visible = false
    this.pill.addChild(this.pillBg.view, this.weaponName, this.ammo.view, this.ammoBack.view, this.ammoFill.view)

    this.view.addChild(
      this.plate.view, this.pause, this.lvChip.view, this.lvText, this.lvNum.view,
      this.hpBack.view, this.hpGhost.view, this.hpFill.view, this.hpShield.view, this.hpNum.view, this.shieldNum.view,
      this.xpBack.view, this.xpFill.view, this.surge, this.timeline, this.nowTick.view,
      this.time.view, this.score.view, this.daily, this.chip, this.badge, this.boss, this.pill,
    )
    for (const r of this.bonusRings) this.view.addChild(r.view)
  }

  /** Fresh run: bars start full or empty instead of sweeping from the last run,
   *  and the timeline shows this run's script. `dailyTag` is '' outside the Daily. */
  reset(world: World, dailyTag: string): void {
    this.hpDisplay = 1
    this.hpGhostV = 1
    this.xpDisplay = 0
    this.shownPending = -1
    this.shownTier = -1
    this.dropT = 0
    this.bossTitle = ''
    this.bossStage = ''
    this.weaponId = ''
    this.daily.text = dailyTag
    this.daily.visible = dailyTag !== ''
    // A practice Daily's tag reads muted, the PRACTICE chip's color on the pause
    // sheet: a longer tag would reach the timeline (W4 integration).
    this.daily.style.fill = world.run && world.run.mode === 'daily' && !world.run.ranked ? T.textMuted : T.accentGold
    this.drawTimeline(world)
  }

  layout(w: number, h: number, insets: Insets, world: World): void {
    const s = uiScale(w, h)
    this.s = s
    this.view.scale.set(s)
    const W = w / s
    const H = h / s
    const L = insets.left / s
    const R = insets.right / s
    const Tp = insets.top / s
    const B = insets.bottom / s
    const portrait = h >= w
    const availW = W - L - R

    const plateW = portrait ? availW - 16 : Math.min(availW - 16, 640)
    const plateH = portrait ? PLATE_H_P : PLATE_H_L
    const plateY = portrait ? Tp + 8 : Tp + 6
    this.plateX = L + 8
    this.plateR = this.plateX + plateW
    this.plate.resize(plateW, plateH)
    this.plate.view.position.set(this.plateX, plateY)

    const pauseY = portrait ? Tp + 12 : Tp + 10
    this.pause.position.set(L + 12, pauseY)
    this.pauseRect.x = (L + 12 - 2 - 8) * s
    this.pauseRect.y = (pauseY - 2 - 8) * s
    this.pauseRect.width = this.pauseRect.height = (48 + 16) * s

    const chipY = portrait ? Tp + 13 : Tp + 11
    this.lvChip.view.position.set(L + 64, chipY)
    this.lvText.position.set(L + 70, chipY + 10)
    this.lvNum.view.position.set(L + 70 + this.lvText.width + 4, chipY + 10)

    this.hpX = L + 120
    const hpY = portrait ? Tp + 14 : Tp + 12
    this.hpW = portrait ? availW - 198 : Math.round(0.4 * plateW)
    this.hpBack.resize(this.hpW, 18)
    this.hpBack.view.position.set(this.hpX, hpY)
    this.hpGhost.view.position.set(this.hpX, hpY)
    this.hpFill.view.position.set(this.hpX, hpY)
    this.hpShield.view.position.set(this.hpX, hpY + 13)
    this.hpNum.view.y = hpY + 9
    this.shieldNum.view.y = hpY + 9

    const xpX = L + 64
    this.xpW = portrait ? availW - 170 : 316
    const xpY = portrait ? Tp + 40 : Tp + 38
    this.xpBack.resize(this.xpW, 6)
    this.xpBack.view.position.set(xpX, xpY)
    this.xpFill.view.position.set(xpX, xpY)
    this.surge.clear()
    this.surge.roundRect(xpX - 1.5, xpY - 1.5, this.xpW + 3, 9, 4).stroke({ width: 1.5, color: T.accentGold })
    this.surge.visible = false

    this.tlX = xpX
    this.tlY = portrait ? Tp + 54 : Tp + 48
    this.tlW = this.xpW
    this.drawTimeline(world)

    const rightEdge = portrait ? W - R - 16 : this.plateR - 12
    this.time.view.position.set(rightEdge, (portrait ? Tp + 12 : Tp + 10) + 11)
    this.score.view.position.set(rightEdge, (portrait ? Tp + 38 : Tp + 34) + 8)
    if (portrait) this.daily.position.set(rightEdge, Tp + 62)
    else this.daily.position.set(rightEdge - 72, Tp + 21)

    const rowY = portrait ? Tp + ROW_A : plateY + plateH + 4
    this.chip.position.set(L + 8, rowY)
    this.chipText.position.set(10, CHIP_H / 2)
    this.chipNum.view.position.set(10 + this.chipText.width + 6, CHIP_H / 2)
    this.badge.position.set(portrait ? W - R - 100 : this.plateR - BADGE_W, rowY)
    this.ringX = L + 8 + (portrait ? CHIP_MAX_W + 8 : 0) + RING_D / 2
    this.ringY = portrait ? rowY + ROW_A_H / 2 : rowY + ROW_A_H + 4 + RING_D / 2
    // Portrait: the three rings close up on narrow phones so the last keeps 6 px from the badge.
    const room = portrait ? this.badge.x - 6 - (this.ringX - RING_D / 2) : Infinity
    this.ringGap = Math.max(0, Math.min(RING_GAP, (room - 3 * RING_D) / 2))
    this.ringMask = -1

    let bossX: number
    let bossY: number
    if (portrait) {
      this.bossW = availW - 16
      bossX = L + 8
      bossY = Tp + ROW_BOSS_P
    } else {
      this.bossW = Math.min(420, plateW - 2 * (CHIP_MAX_W + 12))
      bossX = this.plateX + (plateW - this.bossW) / 2
      bossY = rowY
    }
    this.boss.position.set(bossX, bossY)
    this.bossBg.resize(this.bossW, BOSS_H)
    this.bossName.position.set(10, 10)
    this.bossPct.view.position.set(this.bossW - 10, 10)
    this.bossBack.resize(this.bossW - 20, 8)
    this.bossBack.view.position.set(10, 20)
    this.bossFill.view.position.set(10, 20)
    this.drawNotches()

    const pillY = H - B - (portrait ? 48 : 44)
    this.pillTop = pillY * s
    this.pill.y = pillY
    this.pillX = L + availW / 2
    this.layoutPill()

    // Portrait: under the lowest HUD row. Landscape: 0.36H, or lower when the
    // line's top (LANE_HALF above its center) would reach the boss plate.
    this.laneScale = !portrait && h < SHORT_LANDSCAPE ? SHORT_LANE_SCALE : 1
    this.laneY = portrait
      ? Math.max(Tp + ROW_BOSS_P + BOSS_H + LANE_GAP, 0.3 * H) * s
      : Math.max(0.36 * H * s, (bossY + BOSS_H + 4) * s + LANE_HALF * this.laneScale)
    this.topBottom = (plateY + plateH) * s
    this.rowBottom = (rowY + ROW_A_H) * s
  }

  /** Screen y below every HUD row showing at the top now. */
  get stackBottom(): number {
    const b = this.boss.visible ? this.boss.y + BOSS_H : this.chip.visible || this.badge.visible ? this.chip.y + ROW_A_H : 0
    const r = this.ringMask > 0 ? this.ringY + RING_D / 2 : 0
    return Math.max(this.topBottom, Math.max(b, r) * this.s)
  }

  /** Once per render frame while a run shows. `pulse` is the low-HP heartbeat (0..1). */
  update(world: World, dt: number, pulse: number): void {
    const pl = world.player
    const hpFrac = clamp01(pl.hp / pl.maxHp)
    this.hpDisplay = approach(this.hpDisplay, hpFrac, dt * 16)
    if (this.hpDisplay >= this.hpGhostV) this.hpGhostV = this.hpDisplay
    else this.hpGhostV = approach(this.hpGhostV, this.hpDisplay, dt * 5)
    setBar(this.hpFill, this.hpW * this.hpDisplay, 18)
    setBar(this.hpGhost, this.hpGhostV > this.hpDisplay + 0.002 ? this.hpW * this.hpGhostV : 0, 18)
    const color = hpFrac > 0.5 ? T.hpGreen : hpFrac > 0.25 ? T.hpYellow : T.hpRed
    if (color !== this.hpColor) {
      this.hpColor = color
      this.hpFill.view.tint = color
    }
    this.hpFill.view.alpha = 1 - 0.4 * pulse
    const shield = world.overshield
    setBar(this.hpShield, shield > 0 ? Math.max(4, this.hpW * clamp01(shield / pl.maxHp)) : 0, 5)
    this.hpNum.setInt(Math.ceil(Math.max(0, pl.hp)))
    const sh = Math.ceil(shield)
    this.shieldNum.view.visible = sh > 0
    if (sh > 0) this.shieldNum.setInt(sh, false, CH_PLUS)
    const numW = this.hpNum.width + (sh > 0 ? this.shieldNum.width + 2 : 0)
    this.hpNum.view.x = this.hpX + (this.hpW - numW) / 2
    this.shieldNum.view.x = this.hpNum.view.x + this.hpNum.width + 2

    const xpFrac = clamp01(world.xp / world.xpToNext)
    if (xpFrac < this.xpDisplay - 0.05) this.xpDisplay = xpFrac
    else this.xpDisplay = approach(this.xpDisplay, xpFrac, dt * 11)
    setBar(this.xpFill, this.xpW * this.xpDisplay, 6)
    this.surge.visible = world.time - world.lastLevelAt >= XP.surgeAfter

    this.nowTick.view.x = this.tlX + this.tlW * Math.min(1, world.time / TIMELINE_S) - 1
    this.lvNum.setInt(world.level)
    this.time.setTime(world.time)
    this.score.setInt(world.score, true)

    const pending = world.pendingLevelUps
    if (pending !== this.shownPending) {
      this.shownPending = pending
      this.chip.visible = pending > 0
      if (pending > 0) {
        this.chipNum.setInt(pending, false, CH_X)
        this.chipBg.resize(10 + this.chipText.width + 6 + this.chipNum.width + 10, CHIP_H)
      }
    }

    this.updateBadge(world, dt)
    this.updateBoss(world)
    this.updatePill(world)
    this.updateRings(world)
  }

  /** FREEZE, OVERDRIVE and SHIELD rings: running ones pack left to right. */
  private updateRings(world: World): void {
    let mask = 0
    for (let i = 0; i < this.bonusRings.length; i++) {
      const t = i === 0 ? world.freezeT : i === 1 ? world.overdriveT : world.shieldT
      if (t <= 0) continue
      mask |= 1 << i
      const r = this.bonusRings[i]!
      const lit = Math.ceil((RING_SEGS * t) / r.duration)
      if (lit !== r.lit) {
        r.lit = lit
        r.ring.fill(lit, r.tint, 1, 0.18)
      }
      r.secs.setInt(Math.ceil(t))
    }
    if (mask === this.ringMask) return
    this.ringMask = mask
    let k = 0
    for (let i = 0; i < this.bonusRings.length; i++) {
      const r = this.bonusRings[i]!
      r.view.visible = (mask & (1 << i)) !== 0
      if (r.view.visible) r.view.position.set(this.ringX + k++ * (RING_D + this.ringGap), this.ringY)
    }
  }

  /** A hit dropped the multiplier: the badge flashes `x6 > x5`. */
  tierDrop(from: number, to: number): void {
    this.dropFrom.setInt(from, false, CH_X)
    this.dropTo.setInt(to, false, CH_X)
    this.dropArrow.x = 10 + this.dropFrom.width + 10
    this.dropTo.view.x = this.dropArrow.x + 10
    this.dropT = DROP_FLASH_S
  }

  private updateBadge(world: World, dt: number): void {
    const t = world.tier
    if (this.dropT > 0) this.dropT = Math.max(0, this.dropT - dt)
    const dropping = this.dropT > 0
    const tierShown = !dropping && t >= 2
    const key = tierShown ? t : 0
    if (key !== this.shownTier) {
      this.shownTier = key
      for (let i = 2; i < this.tierText.length; i++) this.tierText[i]!.visible = i === key
      this.chainFill.view.tint = TIER_COLOR[t]!
    }
    this.drop.visible = dropping
    this.badge.visible = t >= 2 || dropping
    this.chainBack.view.visible = tierShown
    if (tierShown) {
      const lo = TIER_STEPS[t - 1]!
      const hi = t < TIER_STEPS.length ? TIER_STEPS[t]! : lo
      setBar(this.chainFill, 60 * (hi > lo ? clamp01((world.chain - lo) / (hi - lo)) : 1), 3)
    } else {
      this.chainFill.view.visible = false
    }
    if (dropping) this.drop.alpha = Math.min(1, this.dropT / 0.25)
  }

  private updateBoss(world: World): void {
    const b = world.boss
    const alive = world.bossAlive && b !== null
    this.boss.visible = alive
    if (!alive || !b) return
    const d = world.director
    if (d.bossTitle !== this.bossTitle || world.bossFight.stage !== this.bossStage) {
      this.bossTitle = d.bossTitle
      this.bossStage = world.bossFight.stage
      this.bossName.text = d.bossTitle
      this.bossName.style.fill = ensureContrast(world.broodTint(ENEMIES[world.script.boss.midId]!.tint), INK)
      this.frenzy.x = 10 + this.bossName.width + 8
      this.drawNotches()
    }
    const frac = clamp01(b.hp / b.maxHp)
    setBar(this.bossFill, (this.bossW - 20) * frac, 8)
    this.bossPct.setInt(Math.ceil(frac * 100), false, 0, CH_PCT)
    this.frenzy.visible = d.frenzy > 0
  }

  private updatePill(world: World): void {
    const wd = world.weapon
    const finite = world.ammo >= 0
    if (wd.id !== this.weaponId) {
      this.weaponId = wd.id
      this.weaponName.text = wd.name
      const tint = ensureContrast(wd.tint, INK)
      this.weaponName.style.fill = tint
      this.ammoFill.view.tint = tint
      this.ammoW = -1
    }
    this.ammo.view.visible = finite
    this.ammoBack.view.visible = finite
    if (finite) {
      this.ammo.setInt(Math.ceil(world.ammo))
      setBar(this.ammoFill, (this.pillW - 24) * clamp01(world.ammo / Math.max(1, world.ammoMax)), 3)
    } else {
      this.ammoFill.view.visible = false
    }
    const aw = finite ? this.ammo.width : 0
    if (aw !== this.ammoW) {
      this.ammoW = aw
      this.layoutPill()
    }
  }

  private layoutPill(): void {
    const nameW = this.weaponName.width
    const aw = this.ammoW > 0 ? this.ammoW : 0
    const content = nameW + (aw > 0 ? 12 + aw : 0)
    this.pillW = Math.max(PILL_MIN_W, Math.ceil(content + 32))
    this.pill.x = this.pillX - this.pillW / 2
    this.pillBg.resize(this.pillW, PILL_H)
    const x0 = (this.pillW - content) / 2
    const y = aw > 0 ? 16 : PILL_H / 2
    this.weaponName.position.set(x0, y)
    this.ammo.view.position.set(x0 + nameW + 12, y)
    this.ammoBack.resize(this.pillW - 24, 3)
    this.ammoBack.view.position.set(12, PILL_H - 8)
    this.ammoFill.view.position.set(12, PILL_H - 8)
  }

  /** 0 to 12:00 from the script's markers: boss diamonds, event ticks, the PRIME flag. */
  private drawTimeline(world: World): void {
    const g = this.timeline
    const x = this.tlX
    const y = this.tlY
    const w = this.tlW
    g.clear()
    g.roundRect(x, y, w, 4, 2).fill({ color: T.decorDim, alpha: 0.9 })
    const m = world.script.markers
    const finalTitle = world.script.text.final.title
    for (let i = 0; i < m.at.length; i++) {
      const mx = x + (w * Math.min(TIMELINE_S, m.at[i]!)) / TIMELINE_S
      const k = m.kind[i]!
      if (k === MARKER_FINAL && m.label[i] === finalTitle) {
        g.moveTo(mx, y + 6).lineTo(mx, y - 7).stroke({ width: 1.5, color: T.accentGold })
        g.poly([mx, y - 7, mx + 7, y - 5, mx, y - 3]).fill(T.accentGold)
      } else if (k === MARKER_BOSS) {
        g.poly([mx, y - 2, mx + 4, y + 2, mx, y + 6, mx - 4, y + 2]).fill(T.bossFill)
      } else if (k === MARKER_EVENT || k === MARKER_FINAL) {
        g.rect(mx - 1, y - 1, 2, 6).fill(T.accentDanger)
      }
    }
    this.nowTick.view.y = y - 3
  }

  private drawNotches(): void {
    const g = this.notches
    g.clear()
    const stage = this.bossStage ? BOSS_STAGES[this.bossStage as keyof typeof BOSS_STAGES] : undefined
    if (!stage) return
    const bw = this.bossW - 20
    for (let i = 0; i < stage.phases.length; i++) g.rect(10 + bw * stage.phases[i]! - 1, 19, 2, 10).fill(INK)
  }
}

function label(text: string, size: number, fill: number): Text {
  const t = new Text({ text, style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: size, fill } })
  t.anchor.set(0, 0.5)
  return t
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Ease `v` toward `to` at `rate` (per frame, rate = dt x speed), landing
 *  exactly once close, so a bar at rest stops changing. */
function approach(v: number, to: number, rate: number): number {
  const n = v + (to - v) * (1 - Math.exp(-rate))
  return Math.abs(to - n) < 0.0005 ? to : n
}

/** A bar fill `w` wide (hidden under half a px); unchanged widths skip the resize. */
function setBar(p: Plate, w: number, h: number): void {
  const on = w >= 0.5
  p.view.visible = on
  if (on && (p.view.width !== w || p.view.height !== h)) p.resize(w, h)
}
