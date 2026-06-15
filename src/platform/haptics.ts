import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

/**
 * Haptics abstraction. Native (Capacitor) uses the Haptics plugin's impact
 * styles; web falls back to the Vibration API. No-ops where unsupported or
 * disabled. This is the only place that knows which backend is in play.
 */
let enabled = true
const native = Capacitor.isNativePlatform()

export function setHapticsEnabled(on: boolean): void {
  enabled = on
}

/** Buzz for roughly `ms` (mapped to an impact style on native). */
export function buzz(ms: number): void {
  if (!enabled) return
  if (native) {
    const style = ms >= 120 ? ImpactStyle.Heavy : ms >= 40 ? ImpactStyle.Medium : ImpactStyle.Light
    Haptics.impact({ style }).catch(() => {})
    return
  }
  const nav = navigator as Navigator & { vibrate?: (p: number) => boolean }
  if (nav.vibrate) {
    try {
      nav.vibrate(ms)
    } catch {
      // ignore
    }
  }
}
