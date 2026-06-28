import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the exact same static build runs from any sub-path,
// from a file:// Capacitor shell, and from CDN/static hosting (Cloudflare Pages).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    VitePWA({
      // We register the SW ourselves (src/pwa/updatePrompt.ts) so we can show a
      // "new version — tap to update" toast instead of silently auto-updating
      // (which left stale tabs serving the old build until they happened to reload).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      // Capacitor loads from a native scheme where a service worker can't
      // register — disable PWA for the native build (`vite build --mode capacitor`).
      disable: mode === 'capacitor',
      manifest: {
        name: 'SWARMGEDDON',
        short_name: 'SWARMGEDDON',
        description: 'A top-down twin-stick alien-hive survival shooter.',
        theme_color: '#05070d',
        background_color: '#05070d',
        display: 'fullscreen',
        orientation: 'landscape',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // the PixiJS chunk is ~510KB
      },
    }),
  ],
  server: {
    host: true, // expose on LAN so phone browsers can hit the dev server
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    // PixiJS is large; keep it in its own chunk so app code stays tiny and
    // the engine can be cached independently across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
        },
      },
    },
  },
}))
