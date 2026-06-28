import { Container, Graphics, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'
import type { World } from '../game/world.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'

/**
 * Player-facing HUD: HP bar (with the number on it) + XP bar + level
 * (top-center), time/kills (top-right), weapon + ammo pill (bottom-center), and
 * the boss bar. Everything scales with the screen so it stays readable and out
 * of the way on a phone without looking oversized on a desktop.
 */
export class Hud {
  readonly view = new Container()

  private back = new Graphics()
  private hpGhostFill = new Graphics()
  private hpFill = new Graphics()
  private xpFill = new Graphics()
  private hpText: Text

  // Animated bar state (lerped toward the real values each frame for juice).
  private hpDisplay = 1 // solid fill, follows HP fairly promptly
  private hpGhost = 1 // trailing value -> the bright "damage" sliver
  private xpDisplay = 0 // smooth XP fill
  private clock = 0
  private levelText: Text
  private stats: Text
  private weaponPill = new Graphics()
  private weaponLabel: Text
  private bossBack = new Graphics()
  private bossFill = new Graphics()
  private bossLabel: Text

  // Geometry computed in layout(), reused in update() so the two never drift.
  private g = { cx: 0, x: 0, hpY: 0, xpY: 0, barW: 280, hpH: 16, xpH: 6, weaponY: 0, s: 1 }
  private w = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    const shadow = { color: 0x000000, blur: 0, distance: 1, angle: Math.PI / 4, alpha: 0.85 } as const
    this.hpText = new Text({ text: '', style: { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: 0xffffff, dropShadow: shadow } })
    this.hpText.anchor.set(0.5)
    this.levelText = new Text({ text: '', style: { fontFamily: MONO, fontSize: 13, fontWeight: 'bold', fill: COLORS.xpBar, dropShadow: shadow } })
    this.levelText.anchor.set(1, 0.5)
    this.stats = new Text({ text: '', style: { fontFamily: MONO, fontSize: 14, fill: COLORS.hudText, dropShadow: shadow } })
    this.stats.anchor.set(1, 0)
    this.weaponLabel = new Text({ text: '', style: { fontFamily: MONO, fontSize: 14, fontWeight: 'bold', fill: COLORS.hudText, dropShadow: shadow } })
    this.weaponLabel.anchor.set(0.5, 0.5)
    this.bossLabel = new Text({ text: '', style: { fontFamily: MONO, fontSize: 12, fontWeight: 'bold', fill: 0xff6aa8, dropShadow: shadow } })
    this.bossLabel.anchor.set(0.5, 1)
    this.view.addChild(this.back, this.hpGhostFill, this.hpFill, this.xpFill, this.hpText, this.levelText, this.stats, this.weaponPill, this.weaponLabel, this.bossBack, this.bossFill, this.bossLabel)
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.insets = insets
    const availW = w - insets.left - insets.right
    // Gentle scale: shrinks on small phones, grows a touch on big screens.
    const s = Math.max(0.82, Math.min(1.1, Math.min(w, h) / 780))
    const barW = Math.max(168, Math.min(300, availW * 0.3))
    const hpH = Math.round(15 * s)
    const xpH = Math.max(4, Math.round(6 * s))
    const cx = insets.left + availW / 2
    const x = cx - barW / 2
    const hpY = insets.top + Math.round(12 * s)
    const xpY = hpY + hpH + 3
    const weaponY = h - insets.bottom - Math.round(18 * s)
    this.g = { cx, x, hpY, xpY, barW, hpH, xpH, weaponY, s }

    this.hpText.style.fontSize = Math.round(12 * s)
    this.levelText.style.fontSize = Math.round(13 * s)
    this.stats.style.fontSize = Math.round(14 * s)
    this.weaponLabel.style.fontSize = Math.round(14 * s)

    this.back.clear()
    this.back.roundRect(x - 2, hpY - 2, barW + 4, hpH + 4, 5).fill({ color: 0x000000, alpha: 0.35 })
    this.back.roundRect(x, hpY, barW, hpH, 4).fill(COLORS.hudHpBack)
    this.back.roundRect(x, xpY, barW, xpH, 3).fill(COLORS.xpBarBack)

    this.hpText.position.set(cx, hpY + hpH / 2)
    this.levelText.position.set(x - 10, hpY + hpH / 2)
    this.stats.position.set(w - insets.right - 14, insets.top + Math.round(10 * s))
    this.weaponLabel.position.set(cx, weaponY)
  }

  update(world: World, dt = 1 / 60): void {
    const { cx, x, hpY, xpY, barW, hpH, xpH, weaponY } = this.g
    const pl = world.player
    this.clock += dt

    const hpFrac = Math.max(0, Math.min(1, pl.hp / pl.maxHp))
    // The solid bar chases HP fairly quickly; the ghost trails behind on damage
    // (revealing a bright sliver that drains a beat later) but snaps up on heal.
    this.hpDisplay += (hpFrac - this.hpDisplay) * (1 - Math.exp(-dt * 16))
    if (this.hpDisplay >= this.hpGhost) this.hpGhost = this.hpDisplay
    else this.hpGhost += (this.hpDisplay - this.hpGhost) * (1 - Math.exp(-dt * 5))

    const hpColor = hpFrac > 0.5 ? COLORS.hudHpFill : hpFrac > 0.25 ? 0xe8c64a : 0xe8434a
    // Critical-HP heartbeat: the bar + number pulse when you're in the red.
    const crit = hpFrac > 0 && hpFrac <= 0.3
    const pulse = crit ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.clock * 9)) : 1

    this.hpGhostFill.clear()
    if (this.hpGhost > this.hpDisplay + 0.001) {
      this.hpGhostFill.roundRect(x, hpY, barW * this.hpGhost, hpH, 4).fill({ color: 0xffd2d2, alpha: 0.6 })
    }
    this.hpFill.clear()
    if (this.hpDisplay > 0) this.hpFill.roundRect(x, hpY, barW * this.hpDisplay, hpH, 4).fill({ color: hpColor, alpha: crit ? pulse : 1 })
    this.hpText.text = `${Math.ceil(Math.max(0, pl.hp))}`
    this.hpText.scale.set(crit ? 1 + 0.12 * (pulse - 0.6) / 0.4 : 1)

    const xpFrac = Math.max(0, Math.min(1, world.xp / world.xpToNext))
    // Smoothly fill; on level-up xp drops, so snap back down to start the next bar.
    if (xpFrac < this.xpDisplay - 0.05) this.xpDisplay = xpFrac
    else this.xpDisplay += (xpFrac - this.xpDisplay) * (1 - Math.exp(-dt * 11))
    this.xpFill.clear()
    if (this.xpDisplay > 0) this.xpFill.roundRect(x, xpY, barW * this.xpDisplay, xpH, 3).fill(COLORS.xpBar)

    this.levelText.text = `Lv ${world.level}`

    const secs = Math.floor(world.time)
    this.stats.text = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}   kills ${world.kills}`

    // Weapon + ammo on a subtle pill so it reads as one tidy badge.
    const ammo = world.ammo < 0 ? '∞' : String(world.ammo)
    this.weaponLabel.text = `${world.weapon.name}   ${ammo}`
    const tw = this.weaponLabel.width
    const th = this.weaponLabel.height
    this.weaponPill.clear()
    this.weaponPill.roundRect(cx - tw / 2 - 12, weaponY - th / 2 - 5, tw + 24, th + 10, 9).fill({ color: 0x000000, alpha: 0.3 })

    // Boss health bar, stacked just above the weapon pill.
    this.bossBack.clear()
    this.bossFill.clear()
    if (world.bossAlive && world.boss) {
      const bw = Math.min(440, this.w - this.insets.left - this.insets.right - 60)
      const bx = cx - bw / 2
      const by = weaponY - th / 2 - 24
      const frac = Math.max(0, Math.min(1, world.boss.hp / world.boss.maxHp))
      this.bossBack.roundRect(bx - 2, by - 2, bw + 4, 14, 5).fill({ color: 0x000000, alpha: 0.4 })
      this.bossBack.roundRect(bx, by, bw, 10, 4).fill(0x2a0d1d)
      if (frac > 0) this.bossFill.roundRect(bx, by, bw * frac, 10, 4).fill(0xff3a8a)
      this.bossLabel.text = '⬢ THE QUEEN'
      this.bossLabel.position.set(cx, by - 4)
      this.bossLabel.visible = true
    } else {
      this.bossLabel.visible = false
    }
  }
}
