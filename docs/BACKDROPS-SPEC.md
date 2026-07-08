# SWARMGEDDON — Per-World Backdrops (build spec)

Status: approved 2026-07-08. Goal: kill the "same room, recolored" feeling. The
enemies already differentiate the worlds; the **environment** does not. Every
arena shares one visual skeleton — the same 80px square grid, a flat floor rect,
the same border, sparse specks — recolored three ways. This replaces that
skeleton with a distinct per-world backdrop so each world reads as a different
*place* in the first half-second.

Render-side only. Nothing here touches the sim, the sim RNG, or the sim
accumulator. Daily determinism stays bit-identical; 60fps @ 500+ enemies holds.

## Hard invariants (any violation = reject)

1. **Determinism**: no `world.rng` draws for cosmetics, and cosmetics never feed
   the sim. Structure randomness comes from a per-world constant seed
   (`seedFromString('swarmgeddon:structure:' + id)`), so it is device-identical
   and stable across theme swaps.
2. **Zero per-frame heap alloc** in the render loop. Motes/atmosphere are fixed
   pools mutated in place. All textures baked once at boot.
3. **Interpolation-safe**: all motion driven by a render clock advanced by the
   clamped render delta (`loop.frameMs/1000`), decoupled from the fixed step.
4. **Render-stack order**: screen-space effects (grade, vignette, atmosphere)
   outside the camera translate; world-space (structure, motes) inside it.
   Filters stay at `resolution = 1` (a sub-1 filter downgrades the whole scene
   capture / bloom).
5. **No new deps.** Pixi 8 built-ins only. DEV tooling still tree-shakes.

## Architecture

Two owners, no parallel registry:

- **`Arena` owns the world-space STRUCTURE** (replaces the grid). Drawn once per
  theme swap with `Graphics` (static geometry — Pixi caches it, cheap per frame),
  in `layers.floor`, so it scrolls with the camera and warps for free. Selected
  by the existing `decorStyle` tag (`pods`→hive membrane, `trench`→depths
  contours, `plates`→wastes basalt+seams). Deterministic per-world local RNG.
  Border kept.
- **`BackdropSystem` (`src/render/backdrop.ts`) owns the ANIMATED + SCREEN-SPACE
  parts**: the mote pool (world-space, `layers.backdrop`), the atmosphere sprites
  (screen-space, `layers.atmosphere`, bloomed with the scene), and it applies the
  per-world color grade + tinted vignette. It bakes its **generic** textures ONCE
  at construction (a soft blob for motes, a radial bloom, a vertical ramp for
  rays/haze) and only **tints/repositions/re-counts** them per world. **Nothing
  re-bakes on `setTheme`** → the leak/`destroy` problem never arises.

### Render-stack insertion (two new containers, nothing reordered)

```
stage
├─ scene            filters:[grade, bloom]  (screen-space, identity)
│  ├─ world         camera + shake translate
│  │  └─ warpHost   warp pivot
│  │     ├─ floor        arena.view: floor rect + STRUCTURE + border
│  │     ├─ ichor
│  │     ├─ backdrop     NEW — world-space ambient motes (above gore, below swarm)
│  │     ├─ (player)
│  │     ├─ entities
│  │     └─ fx
│  └─ atmosphere    NEW — screen-space overlay (god-rays / blooms / haze), bloomed
└─ ui               vignette (tinted, unbloomed) · hurt · hud · sticks
```

`warpHost.addChild(floor, ichor, backdrop, player?, entities, fx)` — note `player.view`
is added to warpHost in main; keep motes below it. `scene.addChild(world, atmosphere)`.

### Data — extend `ArenaTheme` (no separate registry)

Add to each of the 3 themes in `src/content/arenas.ts`:

```ts
grade: { tint: number; tintStrength: number; saturation: number; contrast: number; brightness: number }
vignette: { color: number; strength: number }
motes: { kind: 'spores' | 'marineSnow' | 'emberAsh'; count: number }
atmosphere: { kind: 'breathingBlooms' | 'godRays' | 'emberHaze' | 'none'; color: number; color2: number; alpha: number }
```

Per-kind fine detail (drift speed, sway, blend mode, sub-streams like ember-up +
ash-down) lives in `backdrop.ts` keyed by `kind`. Data holds the knobs worth
tuning by hand (counts, colors, alpha, strengths).

## Per-world looks

- **hive** — honeycomb membrane: dim hex lattice + glowing capillary veins +
  pod clusters. Motes: spores rising (green, additive). Atmosphere: 2–3 slow
  breathing blooms. Grade: green-teal, sat+, slight bright+. Vignette teal-black.
- **depths** — abyssal trench: bathymetric contour rings + a rim-lit crevasse,
  NO grid. Motes: marine snow falling (pale/violet, mostly normal blend so it
  doesn't blow out under bloom). Atmosphere: 3–4 god-ray shafts from the top,
  swaying. Grade: cold/violet, bright−. Vignette violet-black, strong.
- **wastes** — cracked basalt: dark plate shards + a branching delta of glowing
  magma seams (halo/body/hot-core stack; core above the 0.42 bloom threshold).
  Motes: embers rising (additive) + ash falling (dark, normal). Atmosphere:
  ember-haze quad along the bottom. Grade: warm, contrast+. Vignette charcoal-red.

## Must-fixes folded in (from the adversarial pass)

1. **No per-swap bake** (supersedes the leak fix): generic textures baked once at
   boot; `setTheme` only tints/repositions. `BackdropSystem.setTheme` still
   early-outs on unchanged id.
2. **Grade math**: compose via the accumulating helpers only — `reset()` →
   `saturate(0.16+s, true)` → `contrast(0.05+c, true)` → `brightness(1+b, true)`
   → `tint(effTint, true)` where `effTint = lerp(0xffffff, tint, tintStrength)`.
   NEVER assign `.matrix = [...]` (it discards the accumulated saturate/contrast).
3. **Fill-rate, not draw calls**: do NOT claim "cheaper." Atmosphere alpha, mote
   count, and (wastes) heat-shimmer are gated by the Glow tier; low-end fallback
   is structure + grade-off + vignette + reduced motes. Profile wastes at 500
   enemies on a phone before shipping shimmer.
4. **Structure has no tiling seam**: drawn directly across the arena as one
   `Graphics` (not a repeated tile), so there is no seam lattice to reintroduce a
   grid.
5. **Fresh camera**: `backdrop.update(clock, fd)` is called AFTER
   `applyCamera` + `layers.world.position.set(...)` in the render loop, so
   camera-bounded mote recycling uses this frame's camera.
6. **Open-area motion reference**: structure spans the whole arena (hex lattice
   is uniform; depths/wastes get a faint sparse micro-texture between hero
   features) so parallax always reads.

## Build order (one verifiable commit each)

1. Scaffold: `BackdropSystem` shell (bakes generic textures, `setTheme` no-op-ish,
   `update` no-op); add `layers.backdrop`/`layers.atmosphere`; wire `renderClock`
   + the single `update` call after `applyCamera`. Builds, no visual change.
2. Structure replaces the grid: delete grid in `arena.ts`; draw hex/contour/
   basalt per `decorStyle` with a per-world constant-seed RNG. Determinism harness
   still green; each world reads distinct and scrolls.
3. Color grade + tinted vignette: `PostFX.setGrade`, rebuild `Vignette` as a white
   ramp + `setTheme(color, strength)`, apply per-world values.
4. Ambient motes: pooled sprites + camera-bounded recycling; spores / marine-snow
   / ember-ash streams. Profile zero-alloc; swarm stays readable.
5. Atmosphere overlay: breathing blooms / god-rays / ember-haze in
   `layers.atmosphere` (bloomed, low alpha, entities read through).
6. Wastes heat-shimmer (gated, default off until phone-profiled).
7. Ship-audit: 60fps @ 500+ phone-size, determinism green, `setIntensity(0)` still
   a clean off-switch. Deploy live + verify fingerprint. STOP for owner playtest.
