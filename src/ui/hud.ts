import { Container, Graphics, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'
import type { World } from '../game/world.ts'

const BAR_W = 280
const HP_H = 16
const XP_H = 6

/** Player-facing HUD: HP bar + XP bar + level (top-center), kills/time
 *  (top-right), current weapon + ammo (bottom-center). */
export class Hud {
  readonly view = new Container()

  private back = new Graphics()
  private hpFill = new Graphics()
  private xpFill = new Graphics()
  private levelText: Text
  private stats: Text
  private weaponLabel: Text
  private bossBack = new Graphics()
  private bossFill = new Graphics()
  private bossLabel: Text

  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    const mono = 'ui-monospace, Menlo, Consolas, monospace'
    const shadow = { color: 0x000000, blur: 0, distance: 1, angle: Math.PI / 4, alpha: 0.8 } as const
    this.levelText = new Text({ text: '', style: { fontFamily: mono, fontSize: 13, fontWeight: 'bold', fill: COLORS.xpBar, dropShadow: shadow } })
    this.levelText.anchor.set(1, 0.5)
    this.stats = new Text({ text: '', style: { fontFamily: mono, fontSize: 14, fill: COLORS.hudText, dropShadow: shadow } })
    this.stats.anchor.set(1, 0)
    this.weaponLabel = new Text({ text: '', style: { fontFamily: mono, fontSize: 14, fontWeight: 'bold', fill: COLORS.hudText, dropShadow: shadow } })
    this.weaponLabel.anchor.set(0.5, 1)
    this.bossLabel = new Text({ text: '', style: { fontFamily: mono, fontSize: 12, fontWeight: 'bold', fill: 0xff6aa8, dropShadow: shadow } })
    this.bossLabel.anchor.set(0.5, 1)
    this.view.addChild(this.back, this.hpFill, this.xpFill, this.levelText, this.stats, this.weaponLabel, this.bossBack, this.bossFill, this.bossLabel)
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    const cx = insets.left + (w - insets.left - insets.right) / 2
    const x = cx - BAR_W / 2
    const hpY = insets.top + 14
    const xpY = hpY + HP_H + 3

    this.back.clear()
    this.back.roundRect(x - 2, hpY - 2, BAR_W + 4, HP_H + 4, 5).fill({ color: 0x000000, alpha: 0.35 })
    this.back.roundRect(x, hpY, BAR_W, HP_H, 4).fill(COLORS.hudHpBack)
    this.back.roundRect(x, xpY, BAR_W, XP_H, 3).fill(COLORS.xpBarBack)

    this.levelText.position.set(x - 10, hpY + HP_H / 2)
    this.stats.position.set(w - insets.right - 14, insets.top + 12)
    this.weaponLabel.position.set(cx, h - insets.bottom - 12)
  }

  update(world: World): void {
    const cx = this.insets.left + (this.w - this.insets.left - this.insets.right) / 2
    const x = cx - BAR_W / 2
    const hpY = this.insets.top + 14
    const xpY = hpY + HP_H + 3
    const pl = world.player

    const hpFrac = Math.max(0, Math.min(1, pl.hp / pl.maxHp))
    const hpColor = hpFrac > 0.5 ? COLORS.hudHpFill : hpFrac > 0.25 ? 0xe8c64a : 0xe8434a
    this.hpFill.clear()
    if (hpFrac > 0) this.hpFill.roundRect(x, hpY, BAR_W * hpFrac, HP_H, 4).fill(hpColor)

    const xpFrac = Math.max(0, Math.min(1, world.xp / world.xpToNext))
    this.xpFill.clear()
    if (xpFrac > 0) this.xpFill.roundRect(x, xpY, BAR_W * xpFrac, XP_H, 3).fill(COLORS.xpBar)

    this.levelText.text = `Lv ${world.level}`

    const secs = Math.floor(world.time)
    this.stats.text = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}   kills ${world.kills}`

    const ammo = world.ammo < 0 ? '∞' : String(world.ammo) // ∞ for the default
    this.weaponLabel.text = `${world.weapon.name}   ${ammo}`

    // Boss health bar (bottom-center, above the weapon label).
    this.bossBack.clear()
    this.bossFill.clear()
    if (world.bossAlive && world.boss) {
      const bw = Math.min(440, this.w - this.insets.left - this.insets.right - 60)
      const bx = cx - bw / 2
      const by = this.h - this.insets.bottom - 48
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
