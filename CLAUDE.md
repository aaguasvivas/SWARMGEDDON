# SWARMGEDDON

Swarm-survival arcade game. Mobile-first web (installable PWA) with a Capacitor iOS wrapper.

## Stack
TypeScript (strict) + Vite + PixiJS 8, Capacitor for native.

## Commands
- Dev: `npm run dev`
- Build: `npm run build` | Preview: `npm run preview`
- Capacitor: `npm run build:cap`, then `npm run cap:sync`, `npm run cap:ios` / `npm run cap:android`
- Asset pipeline: `npm run assets:generate`

## Deploy
No deploy config in the repo; web build is a PWA (dist/). If a hosting target exists, add it here.

## Languages
No i18n framework detected; strings in-source, EN.

## Rules
- No em dashes in user-facing text.
- 60fps target on mid-range phones; screenshot at 375x667 for HUD overlap before calling UI done.
