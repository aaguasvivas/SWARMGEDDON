# Three Worlds — Implementation Spec

Owner feedback driving this: *"The 3 arenas and enemies do not look that much
different — it feels like the same game reskinned. Ideally it feels like you
unlocked a NEW WORLD with NEW ENEMIES."*

This spec is the synthesis of a 3-design adversarial panel (composition-first /
mechanic-first / atmosphere-first), judged against the actual codebase. The
spine is composition (per-world rosters + rhythm + remixed elites/bosses +
hazard/music/decor identity) plus exactly TWO new gameplay verbs. Estimated
effort: ~3 focused days. Everything here was verified against the source by
the panel; re-verify line references before editing.

## The core move

**HIVE permanently loses five enemy types** — `stinger`, `wraith`, `burrower`,
`psychic`, `warper` NEVER spawn there. Depths and Wastes debut them as commons.
Unlocking a world = literally meeting enemies you have never seen, under a
spawn rhythm world 1 never taught you. This is the highest-value-per-line
"new world" signal available with zero new art beyond 5 grayscale draw fns.

## Engine plumbing (the only structural work)

1. **`ARENA_WAVES` registry** (src/content/waveDirector.ts): keyed by arena id;
   each entry `{ table: WaveEntry[], interval: {base, slope, floor}, batch:
   {base, period}, elite: {id, first, interval, packEvery}, boss: {id, first,
   interval, announce} }`. `world.beginRun` resolves it ONCE into a field;
   `spawnSystem`/`pickEnemy` read the resolved config (no module constants, no
   hot-loop lookups). Replaces hardcoded `'guardian'`/`'queen'` in
   src/systems/spawn.ts. `pickEnemy` fallback becomes `table[0].id` (the
   `'swarmer'` fallback at waveDirector.ts:60 is a landmine — swarmer won't
   exist everywhere). **M, ~80–100 lines of plumbing.**
2. **Aura strength honors `def.aura.speedMul`** (src/systems/ai.ts hardcodes
   `AURA_SPEED_MUL = 1.35` at ai.ts:9 while the def field already exists): stamp
   the source's mul onto the buffed enemy (new `e.buffedMul`), read it where the
   const is used today. Hivemind declares 1.35 → hive unchanged. **S.**
3. **Per-arena hazard palette** on `ArenaTheme`: `hazardTint` + the ichor stamp
   tint pair (`ichorA/B` move onto the theme). Read at SPAWN time by acid pools,
   `fireEnemyShot` glob tint, and the ichor stamp color pick. Presentation only —
   the sim never reads tints. **S.**
4. **Data-driven music theme** per arena: `MusicTheme { bassNotes, arpNotes,
   bassWave, arpWave, bpmBase, bpmRange, filterBase, filterRange }` on the theme;
   `AudioEngine.setTheme()` replaces the static BASS/ARP tables + bpm formula;
   call from `beginRun` (menu keeps hive default). Audio never touches the sim.
   **M, ~40–60 lines.**
5. **Per-arena decor style** in `Arena.draw()`: same normalized specks rendered
   as pods (hive) / trench ring-arcs + glow motes (depths) / cracked plates +
   ash streaks (wastes). Build-time only. **S.**
6. **NEW generic component: `charge` state machine** (Wastes' new verb). New
   `Enemy.phase` int field (reusable by future state-machine behaviors), a
   `charger` case in the ai.ts behavior switch (like burrower), renderer
   telegraph via the phase field (same pattern as the `submerged` read at
   entityRenderer.ts:24). Params in def: `{ triggerRange, windup: 0.7,
   dashSpeed: ~460, dashTime: 0.55, recover: 0.6+ }`. Heading LOCKED at windup
   start; aims at the player's exact position — **zero RNG draws**. ~35 lines.
7. **NEW generic component: `wellPull`** (Depths' new verb). ~15 lines in the
   existing aura/warper first pass (ai.ts:33-40): accumulate `world.pullX/pullY`
   from mawed enemies, TOTAL clamped to 160 units/s, applied in `player.update`
   before the bounds clamp. Zero RNG. Phone-fairness cap: pull must never exceed
   ~55% of the slowest pilot's speed.

## The worlds

### HIVE MEADOW — "the endless tide" (default; the classic game, now exclusive)
- **Roster** (loses 5 types): swarmer 0s w10 · biter 8s w7 · flyer 20s w4 ·
  spitter 30s w4 · splitter 45s w4 · beetle 60s w2 · hivemind 90s w2 ·
  **broodmother 150s w2 (signature)** · brute 170s w2.
- **Rhythm**: current curves (interval `max(0.08, 0.95−0.0072t)`, batch
  `1+floor(t/20)`) — the fastest sustained flood in the game.
- **Signature: BROODMOTHER** — splitter-line capstone, existing components only:
  behavior splitter, hp 44, speed 46, radius 22, scale 1.7, xp 8, hpRamp 1/10,
  `splitInto 'splitter', splitCount 2` → one kill cascades 2 splitters → 6
  swarmers via the existing killEnemy splitInto path. Sprite: three swollen
  abdomen circles shrinking rearward, 6 translucent egg pods (alpha-0.5 circles
  w/ embryo dots), stubby legs, forward mandibles.
- **Elite/boss**: guardian (now hive-exclusive) 55s/48s; classic queen 175s/165s,
  brood [swarmer, splitter, flyer]. Announce: `THE QUEEN AWAKENS`.
- **Ambience**: pod-cluster decor; classic acid-green pools/globs; green+violet
  ichor; current A-Phrygian saw bass 96–144bpm becomes hive-exclusive.

### VIOLET DEPTHS — "the abyssal trench" (riptide surges + displacement)
- **Roster** (debuts wraith/psychic/warper): biter 0s w8 · flyer 10s w6 ·
  wraith 25s w8 (dominant common) · psychic 45s w4 · **abyssalMaw ~50s w2
  (wellPull, signature verb)** · **deepCaller 70s w2 (signature)** · warper 90s
  w3 · brute 120s w2. Absent: swarmer, spitter, beetle, stinger, burrower,
  splitter, hivemind.
- **Rhythm — RIPTIDE**: crashes with real lulls. TUNING FLAG from the judge: the
  panel's floor (0.6s) decays into a stream — use a LARGER interval floor
  (~2.5s late) with bigger batches (`batch 3+floor(t/14)` as the start point)
  so surges read as waves. Lulls are the resource (collect, reposition).
- **Signature: DEEP CALLER** — aura remix at shoal scale: behavior aura, hp 40,
  speed 36, radius 20, scale 1.4, xp 8, `aura { radius 230, speedMul 1.55 }`
  (needs plumbing #2). Called wraith shoals hit ~180 speed — kiting stops
  working inside the bubble; break line, focus the caller through gaps.
  Sprite: jellyfish bell w/ glow crescent + scalloped rim, five wavy tendrils
  with bead dots, one bright lure core, no eyes.
- **Signature verb: ABYSSAL MAW** — slow drifting creature exerting `wellPull`
  drag toward itself (component #7). Depths then displaces you three ways:
  psychic blinks, caller-surged shoals, maw drag. New maw sprite (design:
  a dark ring-mouth with inward-curving teeth strokes + faint spiral).
- **Elite**: abyssalWarden — psychic remix (sprite psychic scale 2.0, elite,
  hp 260, damage 40, preferRange 320, projectileDamage 26 @ speed 340,
  fireCooldown 2.0, teleport cd 2.8 range 300, hpRamp 1/4) 60s/52s. (The
  teleporter behavior already fires shots — pure data.)
- **Boss**: voidMatron — queen remix (sprite queen scale 2.5, hp 1500, speed 40,
  `warps: true` → the reality-warp fx runs for the whole fight, brood [wraith,
  psychic, biter] ×4/3.8s, enrage 60%) 170s/160s. Announce:
  `THE VOID MATRON STIRS`.
- **Ambience**: NO acid pools at all (itself a differentiator); blasts/gibs/ichor
  in cold violet-white; trench ring-arc decor; slow low D-minor-pentatonic sine
  sub-bass 2 octaves down, sparse triangle arp, bpm 72+intensity·36, dark
  lowpass.

### EMBER WASTES — "the scorched siege" (artillery + armor + the charger)
- **Roster** (role inversion: hive's rare tank = basic grunt): biter 0s w6 ·
  beetle 6s w7 · **cinderCharger ~15s w5 (signature verb)** · stinger 35s w4
  (flak wasp — judge tuning flag: start w4/35s, tune up) · burrower 40s w5 ·
  **cinderMortarch 60s w3 (signature)** · brute 90s w3. Absent: swarmer, flyer,
  wraith, spitter, splitter, hivemind, psychic, warper.
- **Rhythm — SIEGE**: `interval max(0.35, 1.4−0.005t)`, `batch 1+floor(t/26)` —
  fewer, tougher, higher-xp bodies; projectile hail supplies the pressure
  (~100 live globs late, bounded by MAX_ENEMY_PROJECTILES 300 / MAX_ACID 64).
- **Signature verb: CINDER CHARGER** — the new `charge` component (#6). Wedge
  ram-bug: walks ~78; in range it stops, locks heading, telegraphs 0.7s (squash
  + brighten via phase), dashes ~460 u/s for ~0.55s past you, 0.6s+ recover.
  Contact ~26–30 only along the locked line. Perpendicular flick always dodges;
  recover is the punish window. Sprite: triangular head plate w/ twin forward
  horns (+x), ember-crack strokes, tapered abdomen, low splayed legs. NOTE: do
  NOT add ember trails to the dash (cut — magma ground comes from mortarch).
- **Signature: CINDER MORTARCH** — spitter remix turned artillery: hp 30, speed
  34, preferRange 380, fireCooldown 2.8, projectileSpeed 170 (biggest slowest
  brightest glob in the game — phone-fair), projectileDamage 20,
  `leavesAcid true` → pools read as MAGMA via hazardTint. Zones where you WERE.
  Sprite: hunched armored dome w/ crack strokes, thick forward mortar tube w/
  white muzzle ring, tucked head, heavy legs.
- **Elite**: duneLeviathan — burrower remix (sprite burrower scale 2.3, elite,
  hp 320, damage 64, speed 96, burrow 2.5s under/2.5s surfaced @2.2× under-speed,
  hpRamp 1/4) 50s/46s — track the mound, unload in surface windows.
- **Boss**: emberTyrant — queen remix (sprite queen scale 2.8, hp 2000, speed 30,
  brood [beetle, stinger] ×3/4.5s → surrounds itself with flak turrets, enrage
  35%) 180s/170s. Announce: `THE EMBER TYRANT RISES`.
- **Ambience**: cracked-plate + ash-streak decor; magma-orange pools/globs;
  ember-orange + charcoal ichor (scorched earth, not hue-shifted slime); driving
  E-Phrygian-dominant square bass, denser arp, bpm 108+intensity·48, brighter
  filter sweep.

## CUT LIST (judged out — do NOT build in this sprint)
- Zone/hazard-emitter systems, rift-tide director, land-zone generalization
  (Design 2) — both consumers replaced by mortarch pools + wellPull.
- deathSpores / splitter_bloom / spitter_ember (world 1 needs novelty least).
- Per-world arena GEOMETRY (sizes/shapes) — best idea that doesn't fit the box:
  arena rebuild + ichor RenderTexture re-create per run is the highest
  invariant-risk plumbing proposed. **Queue for the art sprint.**
- Ambient particle layers, 8 decor painters, per-world grid params, egg/hiveEgg
  behaviors, rift_matriarch/archon (redundant with abyssalWarden).

## Determinism & perf (house rules apply)
Arena id is already run identity (daily rotates it by date). All spawn decisions
flow through existing `world.rng` call sites in unchanged order; curves are pure
functions of sim time with per-arena constants. Charge + wellPull draw ZERO rng.
Music/decor/tints never read or advance `world.rng` (cosmetic Rng / audio clock /
pure lookups). Resolve wave config + music theme to object refs ONCE in beginRun
— nothing new in the hot loop; `pickEnemy` gets cheaper (6–9 entries vs 13).
Capacity-before-RNG and RETRY_AT_CAP patterns stay untouched.

## Verification gate (all headless, scripts/measure.mjs)
1. Per-arena determinism: same (seed, pilot, arena) → identical state hash,
   run TWICE per arena and at TWO viewport sizes (extend `det` mode to hash
   time/kills/level/xp/hp + enemy XOR as needed).
2. Perf: `perf` mode ≥ baseline (60fps, 0 frames >20ms at ~450 enemies) in the
   worst world (wastes, projectile-heavy).
3. Screenshots per arena at t=60 and t=180 (shot mode + step) — the three MUST
   read as different games at a glance; include the 5 new silhouettes.
4. A 5-minute hive run sanity check (it lost 5 types — watch late-game monotony;
   broodmother is the mitigation).
5. tsc + prod build + DCE greps; per-arena announce text on boss spawns.
