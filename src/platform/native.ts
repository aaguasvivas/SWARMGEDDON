import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'

/**
 * Native shell glue (Capacitor). Everything here is a no-op on web, so the same
 * `main.ts` boot path runs unchanged across all four targets. This is the single
 * place native platform differences live.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/** Configure status bar + dismiss the splash once the game is up. */
export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: true })
    }
  } catch {
    // status bar not available — ignore
  }
  // Hide the splash shortly after first paint.
  setTimeout(() => {
    SplashScreen.hide().catch(() => {})
  }, 250)
}

/**
 * Wire the Android hardware back button. `handler` returns true if it consumed
 * the press (e.g. closed a menu); if it returns false we exit the app. No-op
 * off-Android.
 */
export function registerBackButton(handler: () => boolean): void {
  if (!Capacitor.isNativePlatform()) return
  App.addListener('backButton', () => {
    if (!handler()) App.exitApp()
  }).catch(() => {})
}
