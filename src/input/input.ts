import { STICK_DEADZONE } from '../config.ts'
import { normalizeInto, type Vec2 } from '../core/vec.ts'
import { TouchControls } from './touchControls.ts'

export type InputType = 'kbm' | 'touch' | 'gamepad'

const LEFT_KEYS = new Set(['a', 'arrowleft'])
const RIGHT_KEYS = new Set(['d', 'arrowright'])
const UP_KEYS = new Set(['w', 'arrowup'])
const DOWN_KEYS = new Set(['s', 'arrowdown'])

/**
 * Unified input. Aggregates keyboard+mouse, touch dual-sticks, and gamepad into
 * one set of outputs the rest of the game reads each tick:
 *
 *   - `move`    — desired movement, magnitude in [0,1]
 *   - `aimDir`  — unit facing direction, or (0,0) to keep current facing
 *   - `firing`  — trigger held (wired to weapons from Phase 1)
 *   - `lastType`— which device was used most recently (UI adapts to this)
 *
 * Active-source priority is touch > gamepad > keyboard/mouse, so picking up a
 * controller or touching the screen mid-session "just works" without a setting.
 * Outputs are reused objects — `update()` mutates them in place, no per-frame
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

  // Reusable scratch for the gamepad poll (no per-frame allocation).
  private gp = { active: false, mx: 0, my: 0, ax: 0, ay: 0, aimActive: false, fire: false }

  // Cached canvas origin in CSS px. getBoundingClientRect() forces a synchronous
  // style/layout pass — calling it per pointer EVENT (a 120Hz+ mouse fires
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
    // on the glass — even when iOS drops a pointerup during a system gesture
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
  }

  /**
   * Resolve all sources into the final outputs. `playerX/Y` are the player's
   * current position, needed to turn an absolute mouse position into a facing
   * direction.
   */
  /** Rumble the active gamepad (dual-rumble), if it has a vibration actuator. */
  rumble(durationMs: number, strong: number, weak = strong * 0.6): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const pad = this.gamepadIndex >= 0 ? pads[this.gamepadIndex] : null
    const act = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (type: string, opts: object) => Promise<unknown> } }) | null)?.vibrationActuator
    if (act?.playEffect) {
      act.playEffect('dual-rumble', { duration: durationMs, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {})
    }
  }

  /** Toggle gameplay input (off in menus). Drops any held touches. */
  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) {
      this.touch.reset()
      this.mouseFiring = false
    }
  }

  update(playerX: number, playerY: number): void {
    if (!this.enabled) {
      this.move.x = this.move.y = 0
      this.aimDir.x = this.aimDir.y = 0
      this.firing = false
      return
    }
    this.pollGamepad()

    if (this.touch.active) {
      this.lastType = 'touch'
      this.move.x = this.touch.move.x
      this.move.y = this.touch.move.y
      this.aimDir.x = this.touch.aim.x
      this.aimDir.y = this.touch.aim.y
      this.firing = this.touch.aimActive
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
    let x = 0
    let y = 0
    if (this.has(LEFT_KEYS)) x -= 1
    if (this.has(RIGHT_KEYS)) x += 1
    if (this.has(UP_KEYS)) y -= 1
    if (this.has(DOWN_KEYS)) y += 1
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    this.move.x = x
    this.move.y = y
  }

  private has(set: Set<string>): boolean {
    for (const k of set) if (this.keys.has(k)) return true
    return false
  }

  // --- Gamepad ---------------------------------------------------------------

  private pollGamepad(): void {
    const g = this.gp
    g.active = false
    g.mx = g.my = g.ax = g.ay = 0
    g.aimActive = false
    g.fire = false

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
    if (!pad) return

    let lx = pad.axes[0] ?? 0
    let ly = pad.axes[1] ?? 0
    const rx = pad.axes[2] ?? 0
    const ry = pad.axes[3] ?? 0

    const lmag = Math.hypot(lx, ly)
    if (lmag < STICK_DEADZONE) {
      lx = ly = 0
    } else if (lmag > 1) {
      lx /= lmag
      ly /= lmag
    }
    g.mx = lx
    g.my = ly

    const rmag = Math.hypot(rx, ry)
    if (rmag >= STICK_DEADZONE) {
      g.ax = rx / rmag
      g.ay = ry / rmag
      g.aimActive = true
    }

    const trigger = pad.buttons[7]?.value ?? 0
    const fireBtn = pad.buttons[5]?.pressed || pad.buttons[0]?.pressed
    // fire = explicit inputs only. Aim-to-fire is added by update() when the
    // AUTO-FIRE setting is on — baking aimActive in here made the setting a no-op.
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
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase())
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.refreshRect() // once per gesture start — cheap, keeps the cache honest
    if (e.pointerType === 'touch') {
      // Touch takes over: forget the mouse cursor, or on hybrid devices (touch
      // laptops, iPad+trackpad) the kbm fallback aims/fires at a stale position
      // every time both thumbs lift.
      this.hasPointer = false
      if (!this.enabled) return // let menu buttons handle the tap
      // Capture this pointer to the canvas so its move/up/cancel are guaranteed to
      // reach us even if the finger leaves the element — the fix for sticks that
      // got "stuck" when a pointerup went missing.
      try {
        this.canvas.setPointerCapture(e.pointerId)
      } catch {
        /* pointer already released */
      }
      this.touch.onDown(e.pointerId, e.clientX - this.rectL, e.clientY - this.rectT, this.canvas.clientWidth)
      this.lastType = 'touch'
    } else {
      this.pointerX = e.clientX - this.rectL
      this.pointerY = e.clientY - this.rectT
      this.hasPointer = true
      if (e.button === 0) this.mouseFiring = true
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
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') {
      this.touch.onUp(e.pointerId)
    } else if (e.button === 0 || e.button === -1) {
      // button is -1 on pointercancel (pen leaving range, palm rejection) —
      // without this the weapon kept firing with nothing held.
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
    this.gamepadIndex = e.gamepad.index
    this.lastType = 'gamepad'
  }

  private onGamepadDisconnected = (e: GamepadEvent): void => {
    if (e.gamepad.index === this.gamepadIndex) this.gamepadIndex = -1
  }

  /** Re-read the canvas origin (forces layout — call sparingly, never per-move). */
  private refreshRect = (): void => {
    const r = this.canvas.getBoundingClientRect()
    this.rectL = r.left
    this.rectT = r.top
  }
}
