import { Container, Graphics, Text } from 'pixi.js'
import { COLORS, PLAYER_MAX_HP } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'
import type { World } from '../game/world.ts'

const HP_W = 260
const HP_H = 16

/** Minimal player-facing HUD: health bar (top-center), kills + survival time
 *  (top-right), current weapon (bottom-center). Phase 3 fleshes this out. */
export class Hud {
  readonly view = new Container()

  private hpBack = new Graphics()
  private hpFill = new Graphics()
  private stats: Text
  private weaponLabel: Text
  private w = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    const textStyle = {
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      fontSize: 14,
      fill: COLORS.hudText,
      dropShadow: { color: 0x000000, blur: 0, distance: 1, angle: Math.PI / 4, alpha: 0.8 },
    } as const
    this.stats = new Text({ text: '', style: textStyle })
    this.stats.anchor.set(1, 0) // right-aligned
    this.weaponLabel = new Text({ text: '', style: { ...textStyle, fontSize: 13, fill: COLORS.hudDim } })
    this.weaponLabel.anchor.set(0.5, 1)
    this.view.addChild(this.hpBack, this.hpFill, this.stats, this.weaponLabel)
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.insets = insets
    const cx = insets.left + (w - insets.left - insets.right) / 2

    // HP bar background (static — drawn once per layout).
    const hpX = cx - HP_W / 2
    const hpY = insets.top + 14
    this.hpBack.clear()
    this.hpBack.roundRect(hpX - 2, hpY - 2, HP_W + 4, HP_H + 4, 5).fill({ color: 0x000000, alpha: 0.35 })
    this.hpBack.roundRect(hpX, hpY, HP_W, HP_H, 4).fill(COLORS.hudHpBack)

    this.stats.position.set(w - insets.right - 14, insets.top + 12)
    this.weaponLabel.position.set(cx, h - insets.bottom - 12)
  }

  update(world: World): void {
    const cx = this.insets.left + (this.w - this.insets.left - this.insets.right) / 2
    const hpX = cx - HP_W / 2
    const hpY = this.insets.top + 14
    const frac = Math.max(0, Math.min(1, world.player.hp / PLAYER_MAX_HP))
    // Fill width tracks HP; color shifts toward red as it drains.
    const color = frac > 0.5 ? COLORS.hudHpFill : frac > 0.25 ? 0xe8c64a : 0xe8434a
    this.hpFill.clear()
    if (frac > 0) {
      this.hpFill.roundRect(hpX, hpY, HP_W * frac, HP_H, 4).fill(color)
    }

    const secs = Math.floor(world.time)
    const mm = Math.floor(secs / 60)
    const ss = secs % 60
    this.stats.text = `${mm}:${ss.toString().padStart(2, '0')}   kills ${world.kills}`
    this.weaponLabel.text = world.weapon.name
  }
}
