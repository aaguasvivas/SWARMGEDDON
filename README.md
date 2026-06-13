# SWARMGEDDON

A modern, web-first reimagining of *Crimsonland*: a top-down twin-stick alien-hive
survival shooter. One TypeScript codebase ships to **Web (primary, incl. mobile
browsers)** and — via Capacitor — **iOS / iPad / Android**.

> Status: **Phase 0 complete** — engine scaffolding & core loop. No combat yet.

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
npm run build      # typecheck + production build -> dist/ (static, deploy anywhere)
npm run preview    # serve the production build locally
npm run typecheck  # tsc --noEmit
```

### Controls (Phase 0)

| Device         | Move              | Aim            | Fire (wired Phase 1) |
| -------------- | ----------------- | -------------- | -------------------- |
| Keyboard/Mouse | WASD / arrows     | mouse pointer  | left mouse button    |
| Touch          | left-half stick   | right-half stick | right stick held   |
| Gamepad        | left stick        | right stick    | RT / right stick     |

Press **`` ` ``** (backtick) to toggle the debug overlay.

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
  main.ts            bootstrap: Pixi app + game loop + wiring
  config.ts          engine tunables + alien-hive palette
  core/              vec (math), rng (seeded PRNG), time (fixed-step loop)
  render/            app (Pixi init + layer stack)
  game/              arena (bounded play-field), player
  input/             input (kbd+mouse+gamepad aggregator), touchControls (dual sticks)
  platform/          safeArea (notch insets; Capacitor-backed in Phase 4)
  ui/                debugOverlay
```

Layer draw order: `floor` → `entities` → `fx` → `ui`. The persistent ichor
render-texture (signature feature) lands just above `floor` in Phase 1.

## Roadmap

- **Phase 0** ✅ Scaffolding, fixed-step loop, seeded RNG, resize/DPR/safe-area,
  controllable player (KBM/touch/gamepad), debug overlay.
- **Phase 1** — Entity store + pools + spatial hash, sprite atlas pipeline, first
  enemy + weapon, circle collision, juice (shake/hit-stop/gibs), **persistent
  ichor-staining terrain**.
- **Phase 2** — Data-driven weapons/enemies/perks/waveDirector, pickups, XP +
  level-up perk draft, vertical slice of content.
- **Phase 3** — Full v1 content, elites + queen boss, Endless + Daily Challenge,
  HUD, persistence, settings, audio, share-card.
- **Phase 4** — Capacitor iOS/Android wrap, PWA, icons/splash, `STORE.md`.
