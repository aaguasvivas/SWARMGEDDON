/**
 * Haptics abstraction. Web uses the Vibration API; the Capacitor Haptics plugin
 * swaps in behind this in Phase 4. No-ops where unsupported or disabled.
 */
let enabled = true

export function setHapticsEnabled(on: boolean): void {
  enabled = on
}

export function buzz(ms: number): void {
  if (!enabled) return
  const nav = navigator as Navigator & { vibrate?: (p: number) => boolean }
  if (nav.vibrate) {
    try {
      nav.vibrate(ms)
    } catch {
      // ignore
    }
  }
}
