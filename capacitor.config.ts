import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor wraps the EXACT same web build (`dist/`) into native iOS/Android
 * shells, no native game code. The shell just loads the WebGL build, with a
 * few platform niceties (splash, status bar, landscape).
 */
const config: CapacitorConfig = {
  appId: 'dev.swarmgeddon.app', // house convention, same as dev.anota.app / dev.capi.app
  appName: 'SWARMGEDDON',
  webDir: 'dist',
  backgroundColor: '#05070d',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#05070d',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK', // dark content -> light icons on our dark UI
      backgroundColor: '#05070d',
    },
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#05070d',
  },
  android: {
    backgroundColor: '#05070d',
  },
}

export default config
