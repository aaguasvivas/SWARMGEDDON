import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

/**
 * App lifecycle (section 9.4): one callback each time the app leaves the
 * foreground, whichever signal arrives first: the page turning hidden, the
 * native app's `pause`, or `appStateChange` to inactive (iOS reports that one
 * when the app switcher or a call banner covers the app, before any pause).
 */
export function onBackground(handler: () => void): void {
  let away = false
  const leave = (): void => {
    if (away) return
    away = true
    handler()
  }
  const back = (): void => {
    away = false
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? leave() : back()))
  if (!Capacitor.isNativePlatform()) return
  App.addListener('pause', leave).catch(() => {})
  App.addListener('resume', back).catch(() => {})
  App.addListener('appStateChange', (s) => (s.isActive ? back() : leave())).catch(() => {})
}
