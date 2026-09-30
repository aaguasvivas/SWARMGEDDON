import { Container, Graphics, type Sprite } from 'pixi.js'
import type { World } from '../game/world.ts'
import type { Camera } from '../render/camera.ts'
import { setTint } from '../render/textures.ts'
import { makeIcon } from './icons.ts'
import { CORES } from '../config.ts'
import { BONUSES } from '../content/bonuses.ts'
import { WEAPONS } from '../content/weapons.ts'
import { INK, T, ensureContrast } from './tokens.ts'

const SLOTS = 8
/** Slot 0 is the alert-direction arrow; the rest follow the target priority. */
const ALERT_SLOT = 0
const ALERT_S = 3
const ARROW_PX = 20
const ALERT_PX = 30
/** Arrows keep this far inside the safe screen edge and from the HUD rows. */
const EDGE = 26
/** A target this far inside the screen edge already reads, so it gets no arrow. */
const ON_SCREEN_PAD = 8
const KIND_BOSS = 0
const KIND_ELITE = 1
const KIND_CHARGER = 2
const KIND_POD = 3
const KIND_BONUS = 4
const KIND_CORE = 5
const TINT_BOSS = T.bossFill
/** An arrow keeps this far (its radius plus a gap) outside the callout's box. */
const LANE_CLEAR = 24
/** Arrow centers keep this far from the DASH button's center (its radius, the arrow's, a gap). */
const DASH_CLEAR = 32 + 20 + 6
const TINT_CHARGER = 0xff5a3c

/**
 * Screen-edge arrows toward what matters off screen (section 6.5): boss >
 * elite > charger in windup > pod > bonus > Hive Core, plus a 3 s arrow toward the side a
 * run-arc alert names. Screen space, drawn under the HUD; 8 pooled slots.
 */
export class OffscreenArrows {
  readonly view = new Container()
  private readonly slots: Container[] = []
  private readonly icons: Sprite[] = []
  private alertT = 0
  private alertX = 0
  private alertY = 0
  private alertTint = 0xffffff
  private clock = 0
  private n = 0
  /** The safe screen edges (insets included), left and right. */
  private left = 0
  private right = 0
  private top = 0
  private bottom = 0
  private sx = 0
  private sy = 0
  private lane: Float32Array | null = null
  private dashX = -1e4
  private dashY = 0

  constructor() {
    for (let i = 0; i < SLOTS; i++) {
      const c = new Container()
      const back = new Graphics()
      const r = i === ALERT_SLOT ? 20 : 15
      back.circle(0, 0, r).fill({ color: INK, alpha: 0.6 })
      const icon = makeIcon('arrow', i === ALERT_SLOT ? ALERT_PX : ARROW_PX)
      c.addChild(back, icon)
      c.visible = false
      this.slots.push(c)
      this.icons.push(icon)
      this.view.addChild(c)
    }
    this.view.eventMode = 'none'
  }

  /** Screen width and the left and right safe-area insets (the notch side in landscape). */
  layout(w: number, insetLeft: number, insetRight: number): void {
    this.left = insetLeft
    this.right = w - insetRight
  }

  /** The DASH button's center (off screen when it is hidden): arrows step above it. */
  avoid(x: number, y: number): void {
    this.dashX = x
    this.dashY = y
  }

  /** A run-arc alert names a side: point there for ALERT_S seconds. */
  alert(dirX: number, dirY: number, tint: number): void {
    if (dirX === 0 && dirY === 0) return
    this.alertT = ALERT_S
    this.alertX = dirX
    this.alertY = dirY
    this.alertTint = ensureContrast(tint, INK)
  }

  clear(): void {
    this.alertT = 0
    for (const s of this.slots) s.visible = false
  }

  /** `top`/`bottom` bound the band arrows may use (below the HUD rows, above the
   *  pill); `lane` is the callout showing now (x0, y0, x1, y1), which arrows step
   *  below, or null. */
  update(world: World, cam: Camera, top: number, bottom: number, lane: Float32Array | null, dt: number): void {
    this.lane = lane
    this.clock += dt
    this.top = top + EDGE
    this.bottom = bottom - EDGE
    const pl = world.player
    this.sx = cam.worldToScreenX(pl.view.x)
    this.sy = cam.worldToScreenY(pl.view.y)
    this.n = 1
    if (this.alertT > 0) {
      this.alertT = Math.max(0, this.alertT - dt)
      this.place(ALERT_SLOT, this.sx + this.alertX * 1e4, this.sy + this.alertY * 1e4, this.alertTint, 1)
      this.slots[ALERT_SLOT]!.alpha = Math.min(1, this.alertT / 0.4) * (0.75 + 0.25 * Math.sin(this.clock * 12))
    } else {
      this.slots[ALERT_SLOT]!.visible = false
    }

    const b = world.bossAlive ? world.boss : null
    if (b) this.target(cam, b.x, b.y, TINT_BOSS, KIND_BOSS)
    const es = world.enemies.active
    for (let i = 0; i < es.length && this.n < SLOTS; i++) {
      const e = es[i]!
      if (e.alive && e.def.elite && !e.def.boss) this.target(cam, e.x, e.y, T.accentGold, KIND_ELITE)
    }
    for (let i = 0; i < es.length && this.n < SLOTS; i++) {
      const e = es[i]!
      if (e.alive && e.phase === 1 && e.def.behavior === 'charger') this.target(cam, e.x, e.y, TINT_CHARGER, KIND_CHARGER)
    }
    const ps = world.pickups.active
    for (let i = 0; i < ps.length && this.n < SLOTS; i++) {
      const p = ps[i]!
      if (p.alive && p.kind === 'weapon') this.target(cam, p.x, p.y, WEAPONS[p.weaponId]!.tint, KIND_POD)
    }
    for (let i = 0; i < ps.length && this.n < SLOTS; i++) {
      const p = ps[i]!
      if (p.alive && p.kind === 'bonus') this.target(cam, p.x, p.y, BONUSES[p.sub]!.tint, KIND_BONUS)
    }
    for (let i = 0; i < ps.length && this.n < SLOTS; i++) {
      const p = ps[i]!
      if (p.alive && p.kind === 'core') this.target(cam, p.x, p.y, CORES.coreTint, KIND_CORE)
    }
    for (let i = this.n; i < SLOTS; i++) this.slots[i]!.visible = false
  }

  private target(cam: Camera, wx: number, wy: number, tint: number, kind: number): void {
    const x = cam.worldToScreenX(wx)
    const y = cam.worldToScreenY(wy)
    if (x > this.left + ON_SCREEN_PAD && x < this.right - ON_SCREEN_PAD && y > this.top - EDGE + ON_SCREEN_PAD && y < this.bottom + EDGE - ON_SCREEN_PAD) return
    const i = this.n++
    this.place(i, x, y, kind >= KIND_POD ? ensureContrast(tint, INK) : tint, kind === KIND_BOSS ? 1.15 : 1)
    this.slots[i]!.alpha = kind === KIND_CHARGER ? 0.7 + 0.3 * Math.sin(this.clock * 16) : 1
  }

  /** Put slot `i` where the ray from the ship toward (x, y) leaves the arrow band. */
  private place(i: number, x: number, y: number, tint: number, scale: number): void {
    const dx = x - this.sx
    const dy = y - this.sy
    let k = 1
    if (dx > 0) k = Math.min(k, (this.right - EDGE - this.sx) / dx)
    else if (dx < 0) k = Math.min(k, (this.left + EDGE - this.sx) / dx)
    if (dy > 0) k = Math.min(k, (this.bottom - this.sy) / dy)
    else if (dy < 0) k = Math.min(k, (this.top - this.sy) / dy)
    k = Math.max(0, k)
    const s = this.slots[i]!
    s.visible = true
    const px = this.sx + dx * k
    let py = this.sy + dy * k
    const l = this.lane
    if (l && px > l[0]! - LANE_CLEAR && px < l[2]! + LANE_CLEAR && py > l[1]! - LANE_CLEAR && py < l[3]! + LANE_CLEAR) py = l[3]! + LANE_CLEAR
    const ddx = px - this.dashX
    const ddy = py - this.dashY
    if (ddx * ddx + ddy * ddy < DASH_CLEAR * DASH_CLEAR) py = this.dashY - DASH_CLEAR
    s.position.set(px, py)
    s.scale.set(scale)
    const icon = this.icons[i]!
    icon.rotation = Math.atan2(dy, dx)
    setTint(icon, tint)
  }
}
