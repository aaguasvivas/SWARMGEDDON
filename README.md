# SWARMGEDDON

![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PixiJS 8](https://img.shields.io/badge/PixiJS-8_(WebGL)-e91e63?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?style=flat-square&logo=pwa&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-iOS_%2F_Android-119EFF?style=flat-square&logo=capacitor&logoColor=white)

**Play now:** [swarmgeddon.adelsonaguasvivas.workers.dev](https://swarmgeddon.adelsonaguasvivas.workers.dev)

A modern, web-first reimagining of *Crimsonland*: a top-down twin-stick alien-hive
survival shooter. One TypeScript codebase ships to **Web (primary, incl. mobile
browsers)** and, via Capacitor, **iOS / iPad / Android**.

> **v1 complete and live.** 10 weapons, 15 enemies, 25 perks, elites and a queen boss,
> Endless plus a seeded Daily Challenge, synthesized audio, persistent gore terrain,
> and an installable offline PWA. All on a hand-rolled engine: 60 Hz fixed-timestep
> simulation decoupled from render, spatial-hash collisions, fully deterministic
> seeded runs.

## Stack

- **Vite 6** + **TypeScript** (strict) — instant dev, tiny app bundle.
- **PixiJS 8** (WebGL) — GPU-batched sprite rendering.
- **Capacitor** (Phase 4) — wraps the exact same web build into native shells.
- No physics engine: collisions are circle-overlap via a spatial hash (Phase 1).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (also exposed on your LAN for phones)
```

Other scripts:

```bash
npm run build           # typecheck + production build -> dist/ (static, installable PWA)
npm run preview         # serve the production build locally
npm run typecheck       # tsc --noEmit
npm run assets:generate # regenerate native icons + splash from assets/*.svg

# native shells (load the same dist/ build, see docs/RELEASE.md for the ship path)
npm run cap:ios         # build (capacitor mode) + sync + open Xcode
npm run cap:android     # build (capacitor mode) + sync + open Android Studio
npm run cap:sync        # build + copy web assets into both native projects
```

## Cross-platform

One codebase → **Web** (primary, incl. mobile browsers + installable PWA) and,
via **Capacitor**, **iOS / iPad / Android** native shells that load the exact same
web build. Platform differences (haptics, safe-area, status bar, splash, Android
back button) live behind `src/platform/`; everything no-ops on web. Building +
submitting the native apps is a manual, account-gated process — see
**[docs/RELEASE.md](docs/RELEASE.md)** (listing copy in [docs/store-listing.md](docs/store-listing.md)).

Web deploys as static files (`dist/`) to any host (Cloudflare Pages / Netlify /
GitHub Pages); the PWA installs and runs offline after first load.

### Controls

| Device         | Move              | Aim              | Fire             | Menus      |
| -------------- | ----------------- | ---------------- | ---------------- | ---------- |
| Keyboard/Mouse | WASD / arrows     | mouse pointer    | hold left button | click      |
| Touch          | left-half stick   | right-half stick | right stick held | tap        |
| Gamepad        | left stick        | right stick      | RT / right stick | —          |

On level-up, pick a perk by clicking a card or pressing **1 / 2 / 3**.
In-run: **Esc** → menu, **R** → restart. Press **`` ` ``** to toggle the debug overlay.

### Modes

- **Endless** — random seed, survive as long as you can.
- **Daily Challenge** — everyone gets the same seeded run for the day.

On death the run is scored (time + kills + level), your best is saved locally, and
you can generate a shareable PNG run-card.

### Seeds & determinism

All randomness flows through one seeded PRNG (mulberry32), so a seed reproduces a
run exactly — the basis for the upcoming Daily Challenge. The floor specks are
generated from the seed as a visible determinism check.

- `/?seed=12345` — fixed numeric seed
- `/?seed=foo` — hashed string seed
- `/?seed=random` — fresh non-deterministic seed each load
- no param — **today's date** becomes the seed (daily-style)

## Architecture

Fixed-timestep simulation (60 Hz) decoupled from render, with interpolation:

```
src/
  main.ts            bootstrap + game state machine (menu/playing/gameover)
  config.ts          engine tunables + alien-hive palette
  core/              vec, rng (seeded PRNG), time (fixed-step loop), pool, spatialHash
  audio/             synthesized WebAudio engine (SFX + adaptive music)
  content/           weapons, enemies, perks, waveDirector, assets — pure data
  systems/           spawn, ai, weapons, projectiles, collision, pickups, acid, particles
  effects/           juice (shake/hit-stop), fx (particles/gibs/numbers)
  game/              world (run state), arena, player, enemy/projectile/particle/pickup/acid
  render/            app (layers), textures (atlas bake), ichorLayer (RT), entityRenderer
  input/             input aggregator (kbd+mouse+gamepad), touchControls (dual sticks)
  state/             settings, persistence (best scores, daily completion)
  platform/          storage, haptics, safeArea (Capacitor-backed in Phase 4)
  share/             shareCard (canvas → PNG)
  ui/                hud, menus, level-up modal, settings, button/slider, debug
```

Layer draw order: `floor` → `ichor` (persistent gore RT) → `entities` → `fx`,
all inside a shakeable/warpable `world` container, with `ui` rock-steady on top.

## Roadmap

- **Phase 0** ✅ Scaffolding, fixed-step loop, seeded RNG, resize/DPR/safe-area, input.
- **Phase 1** ✅ Pools + spatial hash, sprite pipeline, combat core, juice, **ichor terrain**.
- **Phase 2** ✅ Data-driven weapons/enemies/perks/waveDirector, pickups, level-up draft.
- **Phase 3** ✅ v1 content (10 weapons · 15 enemies · 25 perks), elites + **queen boss**,
  Endless + Daily Challenge, menu/game-over, persistence, settings, synth audio, share-card.
- **Phase 4** ✅ Capacitor iOS + Android shells, platform wiring (haptics/safe-area/status
  bar/splash/back), installable+offline PWA, icon/splash pipeline, release runbook in `docs/RELEASE.md`.

**v1 complete.** Reskinning the fiction = swap the sprite atlas + content data, zero engine change.
