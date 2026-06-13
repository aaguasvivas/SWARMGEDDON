import { defineConfig } from 'vite'

// Relative base so the exact same static build runs from any sub-path,
// from a file:// Capacitor shell, and from CDN/static hosting (Cloudflare Pages).
export default defineConfig({
  base: './',
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
})
