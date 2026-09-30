import { Container, Graphics, Text } from 'pixi.js'
import { COLORS, DASH_BTN, TOUCH_STICK_RADIUS, TOUCH_STICK_DEADZONE } from '../config.ts'
import { hypot, normalizeInto, type Vec2 } from '../core/vec.ts'
import type { Insets } from '../platform/safeArea.ts'

const KNOB_RADIUS = 30
const DASH_HIT_R2 = DASH_BTN.hitR * DASH_BTN.hitR
const DASH_EXCL_R2 = (DASH_BTN.hitR + DASH_BTN.aimExclusionPad) ** 2
const DASH_VIS_R = DASH_BTN.visualD / 2
/** Recharge sweep redraw resolution (steps per full circle). */
const SWEEP_STEPS = 32

/**
 * On-screen dual virtual joysticks for touch. Floating-origin style: each stick
 * spawns wherever the finger first lands within its half of the screen: left
 * half drives movement, right half drives aim (and, from Phase 1, autofire).
 * A touch that STARTS on the DASH button is a dash press and never a stick; a
 * ring just outside it spawns nothing. Lifting the aim thumb to tap DASH keeps
 * the gun firing along the last aim for a moment (the fire latch).
 *
 * Multi-touch is tracked by `pointerId` so both thumbs work independently.
 * Outputs are plain vectors read by the InputManager each tick; this class owns
 * only its own rendering.
 */
export class TouchControls {
  readonly view = new Container()

  /** Movement vector, magnitude in [0,1]. */
  readonly move: Vec2 = { x: 0, y: 0 }
  /** Aim unit direction, or (0,0) when the aim stick is within its deadzone. */
  readonly aim: Vec2 = { x: 0, y: 0 }
  /** True while the aim stick is pushed past its deadzone (drives autofire later). */
  aimActive = false

  private moveId = -1
  private aimId = -1
  private moveBaseX = 0
  private moveBaseY = 0
  private aimBaseX = 0
  private aimBaseY = 0

  private moveStick: Container
  private moveKnob: Graphics
  private aimStick: Container
  private aimKnob: Graphics

  /** DASH button center (canvas CSS px), set by layoutDash. */
  dashX = -1e4
  dashY = -1e4
  /** Fire latch: aim direction held for a moment after the aim thumb lifts. */
  latchX = 0
  latchY = 0
  private latchUntil = 0
  private aimActiveAt = -1e9
  private lastAimX = 0
  private lastAimY = 0

  // Placeholder DASH button (final art is P15). Redrawn only when its state changes.
  private dashView = new Container()
  private dashSweep = new Graphics()
  private dashPips = new Graphics()
  private dashLabel: Text
  private shownCharges = -1
  private shownMax = -1
  private shownSweep = -1
  private pressT = 0

  constructor() {
    this.moveStick = this.buildStick()
    this.moveKnob = this.moveStick.getChildAt(1) as Graphics
    this.aimStick = this.buildStick()
    this.aimKnob = this.aimStick.getChildAt(1) as Graphics
    const base = new Graphics()
    base.circle(0, 0, DASH_VIS_R).fill({ color: COLORS.void, alpha: 0.6 })
    base.circle(0, 0, DASH_VIS_R).stroke({ width: 2, color: COLORS.hudText, alpha: 0.55 })
    this.dashLabel = new Text({ text: 'DASH', style: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, fontWeight: 'bold', fill: 0xeafff6 } })
    this.dashLabel.anchor.set(0.5)
    this.dashLabel.y = -5
    this.dashView.addChild(base, this.dashSweep, this.dashPips, this.dashLabel)
    this.view.addChild(this.dashView, this.moveStick, this.aimStick)
    this.view.eventMode = 'none' // sticks are drawn-only; input comes from window pointer events
  }

  /** Place the DASH button for this screen (A1.2): bottom-right, inside the safe area. */
  layoutDash(w: number, h: number, insets: Insets): void {
    const o = w > h ? DASH_BTN.landscape : DASH_BTN.portrait
    this.dashX = w - insets.right - o.offX
    this.dashY = h - insets.bottom - o.offY
    this.dashView.position.set(this.dashX, this.dashY)
  }

  /** Redraw the button's charge pips and recharge sweep when they change.
   *  `recharge` is the next charge's progress in [0, 1]. */
  updateDash(charges: number, max: number, recharge: number, dt: number): void {
    const sweep = charges < max ? Math.floor(recharge * SWEEP_STEPS) : SWEEP_STEPS
    if (charges !== this.shownCharges || max !== this.shownMax) {
      this.shownCharges = charges
      this.shownMax = max
      const g = this.dashPips
      g.clear()
      const gap = 10
      const x0 = -((max - 1) * gap) / 2
      for (let i = 0; i < max; i++) {
        if (i < charges) g.circle(x0 + i * gap, 12, 3.5).fill(COLORS.xpBar)
        else g.circle(x0 + i * gap, 12, 3).stroke({ width: 1.5, color: COLORS.xpBar, alpha: 0.7 })
      }
      this.dashLabel.alpha = charges > 0 ? 1 : 0.7
    }
    if (sweep !== this.shownSweep) {
      this.shownSweep = sweep
      const g = this.dashSweep
      g.clear()
      if (sweep < SWEEP_STEPS && sweep > 0) {
        const a0 = -Math.PI / 2
        g.arc(0, 0, DASH_VIS_R - 2, a0, a0 + (sweep / SWEEP_STEPS) * Math.PI * 2).stroke({ width: 3, color: COLORS.xpBar, alpha: 0.9 })
      } else if (sweep === SWEEP_STEPS && charges > 0) {
        g.circle(0, 0, DASH_VIS_R - 2).stroke({ width: 2, color: COLORS.xpBar, alpha: 0.6 })
      }
    }
    if (this.pressT > 0) this.pressT = Math.max(0, this.pressT - dt)
    this.dashView.scale.set(this.pressT > 0 ? 0.9 : 1)
  }

  /** Whether a lifted aim thumb still fires along latchX/latchY at `now` (ms). */
  fireLatched(now: number): boolean {
    return !this.aimActive && now < this.latchUntil
  }

  /** Any thumb currently down. */
  get active(): boolean {
    return this.moveId !== -1 || this.aimId !== -1
  }

  /** Whether the move / aim stick is currently held (for the onboarding hint). */
  get moving(): boolean {
    return this.moveId !== -1
  }
  get aiming(): boolean {
    return this.aimId !== -1
  }

  private buildStick(): Container {
    const c = new Container()
    const base = new Graphics()
    base.circle(0, 0, TOUCH_STICK_RADIUS).stroke({ width: 3, color: COLORS.touchStickBase, alpha: 0.9 })
    base.circle(0, 0, TOUCH_STICK_RADIUS).fill({ color: COLORS.touchStickBase, alpha: 0.12 })
    const knob = new Graphics()
    knob.circle(0, 0, KNOB_RADIUS).fill({ color: COLORS.touchStickKnob, alpha: 0.35 })
    knob.circle(0, 0, KNOB_RADIUS).stroke({ width: 2, color: COLORS.touchStickKnob, alpha: 0.8 })
    c.addChild(base, knob)
    c.visible = false
    return c
  }

  /** Live contacts (id -> last position + which half it landed on). Lets us
   *  tell a GHOST owner (id we no longer track: missed up / browser id reuse)
   *  from a LIVE one, and fall back to a surviving touch when the owner lifts.
   *  `stick` is false for touches that began on or around the DASH button. */
  private contacts = new Map<number, { x: number; y: number; left: boolean; seen: number; stick: boolean }>()

  /** A new touch at canvas (x, y). Returns true when it is a dash press. */
  onDown(id: number, x: number, y: number, screenW: number, now: number): boolean {
    // A pointerdown means this id begins a NEW contact. If it still "owns" a
    // stick, that ownership is a stale ghost (pointer-id reuse after a missed
    // up). Release it before anything else so it can't keep firing/steering.
    if (id === this.moveId) this.releaseMove()
    if (id === this.aimId) this.releaseAim()

    const left = x < screenW / 2
    const ddx = x - this.dashX
    const ddy = y - this.dashY
    const dd2 = ddx * ddx + ddy * ddy
    if (dd2 <= DASH_EXCL_R2) {
      this.contacts.set(id, { x, y, left, seen: now, stick: false })
      if (dd2 > DASH_HIT_R2) return false
      if (now - this.aimActiveAt <= DASH_BTN.fireLatchWindow * 1000) {
        this.latchUntil = now + DASH_BTN.fireLatch * 1000
        this.latchX = this.lastAimX
        this.latchY = this.lastAimY
      }
      this.pressT = 0.1
      return true
    }
    this.contacts.set(id, { x, y, left, seen: now, stick: true })

    // Claim the half's stick only if it's free or its owner is a ghost. A
    // second LIVE touch on the same half (palm graze beside a held thumb) must
    // NOT steal the stick; it just becomes the fallback if the owner lifts.
    if (left) {
      if (this.moveId === -1 || !this.contacts.has(this.moveId)) this.claimMove(id, x, y)
    } else {
      if (this.aimId === -1 || !this.contacts.has(this.aimId)) this.claimAim(id, x, y)
    }
    return false
  }

  onMove(id: number, x: number, y: number): void {
    const c = this.contacts.get(id)
    if (c) {
      c.x = x
      c.y = y
      c.seen = performance.now()
    }
    if (id === this.moveId) {
      const { kx, ky } = this.clampKnob(x - this.moveBaseX, y - this.moveBaseY)
      this.moveKnob.position.set(kx, ky)
      let mx = kx / TOUCH_STICK_RADIUS
      let my = ky / TOUCH_STICK_RADIUS
      const m = hypot(mx, my)
      if (m < TOUCH_STICK_DEADZONE) {
        mx = 0
        my = 0
      }
      this.move.x = mx
      this.move.y = my
    } else if (id === this.aimId) {
      const { kx, ky } = this.clampKnob(x - this.aimBaseX, y - this.aimBaseY)
      this.aimKnob.position.set(kx, ky)
      const mag = hypot(kx, ky) / TOUCH_STICK_RADIUS
      if (mag < TOUCH_STICK_DEADZONE) {
        this.aim.x = 0
        this.aim.y = 0
        this.aimActive = false
      } else {
        normalizeInto(kx, ky, this.aim)
        this.aimActive = true
        this.aimActiveAt = performance.now()
        this.lastAimX = this.aim.x
        this.lastAimY = this.aim.y
      }
    }
  }

  onUp(id: number): void {
    this.contacts.delete(id)
    if (id === this.moveId) {
      this.releaseMove()
      this.fallbackClaim(true)
    } else if (id === this.aimId) {
      this.releaseAim()
      this.fallbackClaim(false)
    }
  }

  /**
   * Reconcile our tracked contacts against the browser's REAL finger count
   * (TouchEvent.touches.length, the ground truth). iOS Safari sometimes never
   * delivers pointerup/pointercancel when a system gesture interrupts (banner,
   * Dynamic Island, edge swipe), leaving a ZOMBIE contact that owns a stick
   * forever: stuck aiming/firing, and (because it looks "live") immune to the
   * anti-graze takeover rules. Called from native touchstart/end/cancel.
   */
  reconcile(realCount: number): void {
    if (realCount === 0) {
      // No fingers on the glass: everything we still track is a zombie.
      if (this.contacts.size > 0 || this.moveId !== -1 || this.aimId !== -1) this.reset()
      return
    }
    // More tracked contacts than real fingers -> evict the stalest extras.
    while (this.contacts.size > realCount) {
      let oldest = -1
      let oldestSeen = Infinity
      for (const [id, c] of this.contacts) {
        if (c.seen < oldestSeen) {
          oldestSeen = c.seen
          oldest = id
        }
      }
      if (oldest === -1) return
      this.onUp(oldest) // releases + falls back to a real surviving finger
    }
  }

  /** Owner lifted: hand the stick to any surviving touch on the same half, so
   *  a transient graze can never leave the planted thumb without its stick. */
  private fallbackClaim(left: boolean): void {
    for (const [id, c] of this.contacts) {
      if (c.left !== left || !c.stick) continue
      if (left) this.claimMove(id, c.x, c.y)
      else this.claimAim(id, c.x, c.y)
      return
    }
  }

  private claimMove(id: number, x: number, y: number): void {
    this.moveId = id
    this.moveBaseX = x
    this.moveBaseY = y
    this.moveStick.position.set(x, y)
    this.moveStick.visible = true
    this.moveKnob.position.set(0, 0)
    this.move.x = 0
    this.move.y = 0
  }

  private releaseMove(): void {
    this.moveId = -1
    this.moveStick.visible = false
    this.move.x = 0
    this.move.y = 0
  }

  private claimAim(id: number, x: number, y: number): void {
    this.latchUntil = 0
    this.aimId = id
    this.aimBaseX = x
    this.aimBaseY = y
    this.aimStick.position.set(x, y)
    this.aimStick.visible = true
    this.aimKnob.position.set(0, 0)
    this.aim.x = 0
    this.aim.y = 0
    this.aimActive = false
  }

  private releaseAim(): void {
    if (this.aimActive) this.aimActiveAt = performance.now()
    this.aimId = -1
    this.aimStick.visible = false
    this.aim.x = 0
    this.aim.y = 0
    this.aimActive = false
  }

  /** Drop all touches (call on resize / window blur to avoid stuck sticks). */
  reset(): void {
    this.contacts.clear()
    this.releaseMove()
    this.releaseAim()
    this.latchUntil = 0
    this.aimActiveAt = -1e9
  }

  /** Clamp a knob offset to the stick's travel radius. */
  private clampKnob(dx: number, dy: number): { kx: number; ky: number } {
    const l = hypot(dx, dy)
    if (l > TOUCH_STICK_RADIUS) {
      const s = TOUCH_STICK_RADIUS / l
      return { kx: dx * s, ky: dy * s }
    }
    return { kx: dx, ky: dy }
  }
}
