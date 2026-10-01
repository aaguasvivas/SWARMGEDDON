import { STICK_DEADZONE } from '../config.ts'
import { hypot, normalizeInto, type Vec2 } from '../core/vec.ts'
import { TouchControls } from './touchControls.ts'

export type InputType = 'kbm' | 'touch' | 'gamepad'

const DASH_CODES = new Set(['Space', 'ShiftLeft', 'ShiftRight'])
/** Gamepad LB, and LT past this travel, press dash on the rising edge. */
const GP_LB = 4
const GP_LT = 6
const GP_LT_PRESS = 0.5

/** Menu and modal pad buttons (standard mapping), as bits of `padPresses()`. */
export const PAD_A = 1
export const PAD_B = 2
export const PAD_X = 4
export const PAD_Y = 8
export const PAD_START = 16
export const PAD_UP = 32
export const PAD_DOWN = 64
export const PAD_LEFT = 128
export const PAD_RIGHT = 256
/** Standard-mapping button index per PAD_* bit, in bit order. */
const PAD_BUTTONS = [0, 1, 2, 3, 9, 12, 13, 14, 15] as const
/** The left stick past this reads as a d-pad direction in menus. */
const PAD_STICK_NAV = 0.6
/** A mouse that moved this many CSS px since the run start has aimed. */
const AIM_ENGAGE_PX = 6

/**
 * Unified input. Aggregates keyboard+mouse, touch dual-sticks, and gamepad into
 * one set of outputs the rest of the game reads each tick:
 *
 *   - `move`:     desired movement, magnitude in [0,1]
 *   - `aimDir`:   unit facing direction, or (0,0) to keep current facing
 *   - `firing`:   trigger held (wired to weapons from Phase 1)
 *   - `consumeDashPress()`: one queued dash press (Space/Shift, gamepad LB/LT,
 *                 the touch DASH button), read once per sim step
 *   - `lastType`: which device was used most recently (UI adapts to this)
 *
 * Active-source priority is touch > gamepad > keyboard/mouse, so picking up a
 * controller or touching the screen mid-session "just works" without a setting.
 * Outputs are reused objects: `update()` mutates them in place, no per-frame
 * allocation.
 */
export class InputManager {
  readonly touch = new TouchControls()
  lastType: InputType = 'kbm'
  /** When false (menus), gameplay inputs are ignored and sticks won't spawn. */
  enabled = true
  /** Fire whenever aiming, without holding the button (friendlier on trackpad). */
  autoFire = true

  readonly move: Vec2 = { x: 0, y: 0 }
  readonly aimDir: Vec2 = { x: 0, y: 0 }
  firing = false

  /** Pointer position in CSS px (canvas-local). Used for the desktop crosshair. */
  pointerX = 0
  pointerY = 0
  hasPointer = false

  private keys = new Set<string>()
  private mouseFiring = false
  private gamepadIndex = -1
  private padsConnected = 0
  /** A dash press waiting for the next sim step to read it. */
  private dashLatch = false
  private gpDashHeld = false
  /** The mouse moved or clicked since `armStartGate`, so its cursor counts as aim. */
  private mouseEngaged = false
  private armX = 0
  private armY = 0
  /** PAD_* bits held at the last `padPresses` poll. */
  private padHeld = 0

  // Reusable scratch for the gamepad poll (no per-frame allocation).
  private gp = { active: false, mx: 0, my: 0, ax: 0, ay: 0, aimActive: false, fire: false }

  // Cached canvas origin in CSS px. getBoundingClientRect() forces a synchronous
  // style/layout pass. Calling it per pointer EVENT (a 120Hz+ mouse fires
  // hundreds of moves/sec, and we called it twice per event) thrashes layout on
  // the main thread and shows up as input/movement jank. The canvas is a fixed,
  // full-window element, so its origin only changes on resize; refresh there
  // (plus once per pointerdown as a cheap safety net) and read the cache on move.
  private rectL = 0
  private rectT = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.refreshRect()
    window.addEventListener('resize', this.refreshRect)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    // If the browser yanks pointer capture (e.g. it decides a drag is a native
    // gesture), release that stick so it can't latch "on".
    canvas.addEventListener('lostpointercapture', this.onPointerUp)
    // Ground truth: native TouchEvents always report how many fingers are REALLY
    // on the glass, even when iOS drops a pointerup during a system gesture
    // (banner, Dynamic Island, edge swipe) and would otherwise leave a stick
    // stuck aiming/firing for the rest of the run. Reconcile on every change;
    // with zero real fingers, everything tracked is a zombie and hard-resets.
    const reconcile = (e: TouchEvent): void => this.touch.reconcile(e.touches.length)
    window.addEventListener('touchstart', reconcile, { passive: true })
    window.addEventListener('touchend', reconcile, { passive: true })
    window.addEventListener('touchcancel', reconcile, { passive: true })
    window.addEventListener('blur', this.onBlur)
    canvas.addEventListener('contextmenu', this.onContextMenu)

    window.addEventListener('gamepadconnected', this.onGamepadConnected)
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected)
    // A pad pressed during boot fired its one gamepadconnected before this
    // listener existed; pollGamepad only reads pads once one is counted.
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    for (const p of pads) if (p) this.padsConnected++
  }

  /**
   * Resolve all sources into the final outputs. `playerX/Y` are the player's
   * current position, needed to turn an absolute mouse position into a facing
   * direction.
   */
  /** Toggle gameplay input (off in menus). Drops any held touches. */
  setEnabled(on: boolean): void {
    this.enabled = on
    this.dashLatch = false
    if (!on) {
      this.touch.reset()
      this.mouseFiring = false
    }
  }

  /** Queue one dash press for the next sim step (ignored in menus). */
  pressDash(): void {
    if (this.enabled) this.dashLatch = true
  }

  /** Read and clear the queued dash press. Only stepSim calls this. */
  consumeDashPress(): boolean {
    const p = this.dashLatch
    this.dashLatch = false
    return p
  }

  /** Drop a press made while the sim was paused (a tap on a draft card). */
  cancelDashPress(): void {
    this.dashLatch = false
  }

  /** A run starts: until `engaged()`, a cursor resting on the arena is not aim. */
  armStartGate(): void {
    this.mouseEngaged = false
    this.armX = this.pointerX
    this.armY = this.pointerY
  }

  /** Whether the sample `update()` just took holds a deliberate input: a move,
   *  a thumb on the glass, pad aim or fire, a dash press, or a mouse that moved
   *  or clicked since `armStartGate`. */
  engaged(): boolean {
    return (
      this.move.x !== 0 || this.move.y !== 0 || this.dashLatch || this.touch.active || this.gp.aimActive || this.gp.fire || this.mouseEngaged
    )
  }

  /** PAD_* bits of the buttons pressed since the last call (rising edges); the
   *  left stick doubles as the d-pad. Menus and modals poll this once a frame.
   *  A press makes the pad the last input type. */
  padPresses(): number {
    if (this.padsConnected === 0 || !navigator.getGamepads) {
      this.padHeld = 0
      return 0
    }
    const pads = navigator.getGamepads()
    let pad: Gamepad | null = (this.gamepadIndex >= 0 ? pads[this.gamepadIndex] : null) ?? null
    for (let i = 0; !pad && i < pads.length; i++) pad = pads[i] ?? null
    let held = 0
    if (pad) {
      for (let i = 0; i < PAD_BUTTONS.length; i++) if (pad.buttons[PAD_BUTTONS[i]!]?.pressed) held |= 1 << i
      const lx = pad.axes[0] ?? 0
      const ly = pad.axes[1] ?? 0
      if (ly < -PAD_STICK_NAV) held |= PAD_UP
      if (ly > PAD_STICK_NAV) held |= PAD_DOWN
      if (lx < -PAD_STICK_NAV) held |= PAD_LEFT
      if (lx > PAD_STICK_NAV) held |= PAD_RIGHT
    }
    const pressed = held & ~this.padHeld
    this.padHeld = held
    if (pressed) this.lastType = 'gamepad'
    return pressed
  }

  update(playerX: number, playerY: number): void {
    if (!this.enabled) {
      this.move.x = this.move.y = 0
      this.aimDir.x = this.aimDir.y = 0
      this.firing = false
      return
    }
    this.pollGamepad()

    const t = this.touch
    const latched = t.fireLatched(performance.now())
    if (t.active || latched) {
      this.lastType = 'touch'
      this.move.x = t.move.x
      this.move.y = t.move.y
      if (latched) {
        this.aimDir.x = t.latchX
        this.aimDir.y = t.latchY
        this.firing = true
      } else {
        this.aimDir.x = t.aim.x
        this.aimDir.y = t.aim.y
        this.firing = t.aimActive
      }
      return
    }

    if (this.gp.active) {
      this.lastType = 'gamepad'
      this.move.x = this.gp.mx
      this.move.y = this.gp.my
      this.aimDir.x = this.gp.ax
      this.aimDir.y = this.gp.ay
      this.firing = this.autoFire ? this.gp.aimActive || this.gp.fire : this.gp.fire
      return
    }

    // Keyboard + mouse.
    this.readKeyboardMove()
    if (this.hasPointer) {
      normalizeInto(this.pointerX - playerX, this.pointerY - playerY, this.aimDir)
    } else {
      this.aimDir.x = 0
      this.aimDir.y = 0
    }
    // Auto-fire: shoot toward the cursor without holding the button.
    this.firing = this.autoFire ? this.hasPointer : this.mouseFiring
  }

  private readKeyboardMove(): void {
    const k = this.keys
    let x = 0
    let y = 0
    if (k.has('a') || k.has('arrowleft')) x -= 1
    if (k.has('d') || k.has('arrowright')) x += 1
    if (k.has('w') || k.has('arrowup')) y -= 1
    if (k.has('s') || k.has('arrowdown')) y += 1
    const l = hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    this.move.x = x
    this.move.y = y
  }

  // --- Gamepad ---------------------------------------------------------------

  private pollGamepad(): void {
    const g = this.gp
    g.active = false
    g.mx = g.my = g.ax = g.ay = 0
    g.aimActive = false
    g.fire = false
    // getGamepads() builds a new array per call; no pad has connected yet.
    if (this.padsConnected === 0) {
      this.gpDashHeld = false
      return
    }

    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    let pad: Gamepad | null = (this.gamepadIndex >= 0 ? pads[this.gamepadIndex] : null) ?? null
    if (!pad) {
      for (const p of pads) {
        if (p) {
          pad = p
          this.gamepadIndex = p.index
          break
        }
      }
    }
    if (!pad) {
      this.gpDashHeld = false
      return
    }

    const dashHeld = !!pad.buttons[GP_LB]?.pressed || (pad.buttons[GP_LT]?.value ?? 0) > GP_LT_PRESS
    if (dashHeld && !this.gpDashHeld) this.pressDash()
    this.gpDashHeld = dashHeld

    let lx = pad.axes[0] ?? 0
    let ly = pad.axes[1] ?? 0
    const rx = pad.axes[2] ?? 0
    const ry = pad.axes[3] ?? 0

    const lmag = hypot(lx, ly)
    if (lmag < STICK_DEADZONE) {
      lx = ly = 0
    } else if (lmag > 1) {
      lx /= lmag
      ly /= lmag
    }
    g.mx = lx
    g.my = ly

    const rmag = hypot(rx, ry)
    if (rmag >= STICK_DEADZONE) {
      g.ax = rx / rmag
      g.ay = ry / rmag
      g.aimActive = true
    }

    const trigger = pad.buttons[7]?.value ?? 0
    const fireBtn = pad.buttons[5]?.pressed || pad.buttons[0]?.pressed
    // fire = explicit inputs only. Aim-to-fire is added by update() when the
    // AUTO-FIRE setting is on; baking aimActive in here made the setting a no-op.
    g.fire = trigger > 0.4 || !!fireBtn

    let anyButton = false
    for (const b of pad.buttons) {
      if (b.pressed) {
        anyButton = true
        break
      }
    }
    g.active = lmag >= STICK_DEADZONE || rmag >= STICK_DEADZONE || anyButton
  }

  // --- Event handlers --------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key.toLowerCase())
    this.lastType = 'kbm'
    if (!e.repeat && DASH_CODES.has(e.code)) this.pressDash()
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase())
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.refreshRect() // once per gesture start: cheap, keeps the cache honest
    if (e.pointerType === 'touch') {
      // Touch takes over: forget the mouse cursor, or on hybrid devices (touch
      // laptops, iPad+trackpad) the kbm fallback aims/fires at a stale position
      // every time both thumbs lift.
      this.hasPointer = false
      if (!this.enabled) return // let menu buttons handle the tap
      // Capture this pointer to the canvas so its move/up/cancel are guaranteed to
      // reach us even if the finger leaves the element. This is the fix for sticks that
      // got "stuck" when a pointerup went missing.
      try {
        this.canvas.setPointerCapture(e.pointerId)
      } catch {
        /* pointer already released */
      }
      if (this.touch.onDown(e.pointerId, e.clientX - this.rectL, e.clientY - this.rectT, this.canvas.clientWidth, performance.now())) {
        this.pressDash()
      }
      this.lastType = 'touch'
    } else {
      this.pointerX = e.clientX - this.rectL
      this.pointerY = e.clientY - this.rectT
      this.hasPointer = true
      if (e.button === 0) this.mouseFiring = true
      if (this.enabled) this.mouseEngaged = true
      this.lastType = 'kbm'
    }
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.touch.onMove(e.pointerId, e.clientX - this.rectL, e.clientY - this.rectT)
      this.lastType = 'touch'
    } else {
      this.pointerX = e.clientX - this.rectL
      this.pointerY = e.clientY - this.rectT
      this.hasPointer = true
      if (this.enabled && !this.mouseEngaged && Math.abs(this.pointerX - this.armX) + Math.abs(this.pointerY - this.armY) > AIM_ENGAGE_PX) {
        this.mouseEngaged = true
      }
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.touch.onUp(e.pointerId)
    } else if (e.button === 0 || e.button === -1) {
      // button is -1 on pointercancel (pen leaving range, palm rejection).
      // Without this the weapon kept firing with nothing held.
      this.mouseFiring = false
    }
  }

  private onBlur = (): void => {
    // Window lost focus: drop all held inputs so nothing sticks "on".
    this.keys.clear()
    this.mouseFiring = false
    this.hasPointer = false
    this.touch.reset()
  }

  private onContextMenu = (e: Event): void => {
    e.preventDefault()
  }

  private onGamepadConnected = (e: GamepadEvent): void => {
    this.padsConnected++
    this.gamepadIndex = e.gamepad.index
    this.lastType = 'gamepad'
  }

  private onGamepadDisconnected = (e: GamepadEvent): void => {
    this.padsConnected = Math.max(0, this.padsConnected - 1)
    if (e.gamepad.index === this.gamepadIndex) this.gamepadIndex = -1
  }

  /** Re-read the canvas origin (forces layout; call sparingly, never per-move). */
  private refreshRect = (): void => {
    const r = this.canvas.getBoundingClientRect()
    this.rectL = r.left
    this.rectT = r.top
  }
}
