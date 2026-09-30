import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/**
 * The haptic vocabulary (A17). Native (Capacitor) uses impact, notification and
 * selection feedback; web falls back to the Vibration API; a connected gamepad
 * rumbles on heavy, success and error. No-ops where unsupported or disabled.
 * This is the only place that knows which backend is in play.
 */
export type HapticKind = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'

/** Impacts closer together than this collapse into one; notifications bypass it. */
const GLOBAL_GAP_MS = 80

const WEB_PATTERN: Record<HapticKind, number | number[]> = {
  selection: 8, light: 12, medium: 20, heavy: 35,
  success: [12, 40, 12], warning: [20, 60, 20], error: [40, 50, 40],
}

/** Gamepad dual-rumble per kind: duration ms, strong magnitude (weak = 0.6 x strong). */
const RUMBLE_MS: Partial<Record<HapticKind, number>> = { heavy: 120, success: 90, error: 320 }
const RUMBLE_STRONG: Partial<Record<HapticKind, number>> = { heavy: 0.5, success: 0.4, error: 0.9 }

const IMPACT = {
  light: { style: ImpactStyle.Light },
  medium: { style: ImpactStyle.Medium },
  heavy: { style: ImpactStyle.Heavy },
} as const
const NOTIFY = {
  success: { type: NotificationType.Success },
  warning: { type: NotificationType.Warning },
  error: { type: NotificationType.Error },
} as const

let enabled = true
let lastAt = -Infinity
const native = Capacitor.isNativePlatform()

export function setHapticsEnabled(on: boolean): void {
  enabled = on
}

export function haptic(kind: HapticKind): void {
  if (!enabled) return
  const notify = kind === 'success' || kind === 'warning' || kind === 'error'
  const now = performance.now()
  if (!notify && now - lastAt < GLOBAL_GAP_MS) return
  lastAt = now
  if (native) {
    if (kind === 'selection') {
      void Haptics.selectionStart().catch(noop)
      void Haptics.selectionChanged().catch(noop)
      void Haptics.selectionEnd().catch(noop)
    } else if (kind === 'success' || kind === 'warning' || kind === 'error') {
      void Haptics.notification(NOTIFY[kind]).catch(noop)
    } else {
      void Haptics.impact(IMPACT[kind]).catch(noop)
    }
  } else {
    vibrate(WEB_PATTERN[kind])
  }
  const ms = RUMBLE_MS[kind]
  if (ms !== undefined) rumble(ms, RUMBLE_STRONG[kind]!)
}

function vibrate(pattern: number | number[]): void {
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean; userActivation?: { hasBeenActive: boolean } }
  // Chrome blocks (and logs) vibrate calls before the first user gesture.
  if (!nav.vibrate || nav.userActivation?.hasBeenActive === false) return
  try {
    nav.vibrate(pattern)
  } catch {
    // ignore
  }
}

type RumblePad = Gamepad & { vibrationActuator?: { playEffect?: (type: string, opts: object) => Promise<unknown> } }

function rumble(durationMs: number, strong: number): void {
  if (!navigator.getGamepads) return
  for (const pad of navigator.getGamepads() as (RumblePad | null)[]) {
    const act = pad?.vibrationActuator
    if (act?.playEffect) {
      act.playEffect('dual-rumble', { duration: durationMs, strongMagnitude: strong, weakMagnitude: strong * 0.6 }).catch(noop)
    }
  }
}

function noop(): void {}
