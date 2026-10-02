# SWARMGEDDON v2: Next Level

Integrated design and build spec. It merges four domain specs: run arc, build crafting, meta and score, and feel and UI. The evidence comes from `.work/audit/discover.json` and `.work/audit/summary_table.txt` (local, git-excluded research data; the playtest runs are in `.work/audit/playtest/`), and the baseline is commit `cc34fc1`.

This is the single source of truth for v2. Where it differs from a domain spec, this document wins.

---

## 0. How to read this document

- **Section 1** is the v2 pitch: what the player gets, and what waits for later.
- **Section 2** resolves every conflict between the domain specs.
- **Section 3** checks each hard constraint.
- **Sections 4 to 9** define the systems.
- **Section 10** is the build plan: ordered phases, files, tasks, acceptance and parallel tracks.
- **Section 11** is the verification matrix.
- **Section 12** is the Later list.
- **Appendix A** holds every number and every line of content.

The appendix is authoritative. Engineers should not invent numbers. If a number is missing, add it to the appendix in the same change.

Terms used below:
- **Sim**: `src/systems/**`, `src/game/**`, `src/content/**`.
- **Presentation**: everything else.
- **"det"**: `scripts/measure.mjs` determinism mode.

**Owner decisions still open.** No new durable identifiers are introduced.
1. `DAILY_EPOCH` = the v2 release day (UTC). Set it in the release PR.
2. Review `server/src/blocklist.ts`.
3. Run `wrangler secret put IP_SALT` at deploy.
4. Publish the store and privacy copy (section 8.6) before uploading the store build.
5. Calibrate on iPhone (A17 in section 11).
6. Spawn rings and the camera (C27), decided below. `RING_NEAR` and `RING_STD` stay off screen only on the centered 560 x 996 view. `node scripts/measure.mjs <W> <H> ringview all 300` tests every ring spawn of the first 300 s (seed 777, 1414 in Hive) against the P14 camera. Measured in W1:
   - 375x667: 29 spawns inside the view with no aim, 84 with the aim look-ahead, 111 with the touch portrait bias; the deepest is 141 u inside.
   - 390x844 (view 560 x 1212): 95, 230 and 177; the deepest is 311 u inside.
   - 844x390: 76 with the aim look-ahead, up to 70 u inside. 667x375: none.
   - Causes: `LONG_MAX_RATIO` 2.2 gives a 1212 u long side on 19.5:9 phones; the look-ahead (78 u), the touch bias (0.06 x view height), the boss pull (140 u) and the 0.92 fight zoom; and the arena clamp, which moves the view away from a wall, toward the side `ringSpawnPoint` spawns on.
   - Larger rings alone cannot fix it: the arena is 1900 u tall, so a ring taller than 950 u leaves no top or bottom side open while the ship is near the middle row.
   - Options: (a) limit the camera: `LONG_MAX_RATIO` near 1.78, offsets that stay inside the ring, and an arena clamp that never shows past the ring; (b) a render-side fog past the ring distance, so arrivals come out of it; (c) keep the pop-in behind the 0.45 s emerge fade. `ringview` is the acceptance check for the option chosen.
   - **Decided (2026-09-30): option (c), made readable.** An arrival inside the view is allowed, as in Brotato, but it never pops. P15 adds a render-side, world-themed emerge effect (Hive: a membrane tear, Depths: a bubble plume, Wastes: an ember burst) at every spawn that lands inside the current view, timed to the 0.45 s emerge fade, and the enemy cannot bite during the fade. The camera keeps its full horizontal view in portrait (no `LONG_MAX_RATIO` cut), because enemies approach from the sides. Acceptance: `ringview` at 375x667 and 390x844 reports every in-view spawn with an emerge effect, and no spawn lands within 120 u of the ship.

---

## 1. v2 in one page

A run is now a 12-minute song with a win.

1. **Opening.** The run opens hot: a pack arrives at 0.3 s, the first kill comes within 2 s, and the first draft is a Keystone draft at 6 to 12 s.
2. **Peaks and fights.** Authored swarm events at 2:30, 5:30 and 8:45 give the run its peaks, with lulls after them. A midboss arrives in a cage at 4:00, returns at 7:30, and a PRIME boss arrives at 10:30. **Killing the PRIME wins the run.**
3. **After the win.** In Standard mode the player can EXTRACT or push into OVERTIME.
4. **Stalemate.** If the PRIME is still alive at 14:00, the run ends as a stalemate, never a forced death.

Inside the run:
- **Dash.** The player has a dash with i-frames and a Close Call reward.
- **Draft.** A draft offers perks from 5 families, with reroll, banish and skip.
- **Builds.** 10 fusion perks unlock when their two parents meet. 9 weapon evolutions trigger at a Hive Core.
- **Rewards.** Elites drop core shards, bosses drop Hive Cores, and 6 timed bonus pickups (NUKE, FREEZE and others) create spikes.
- **Score.** Score is kills x a chain multiplier from x1 to x8. A hit halves the chain.

Between runs:
- **Feats.** 48 feats unlock pilots, worlds, perks, weapons and paints.
- **Daily.** The Daily is fair: world, pilot, threat and content pool come from the date, and the first attempt of the day is ranked.
- **Leaderboard.** Posting is opt-in. The server recomputes every score.
- **Threat.** THREAT 0 to 4 per world adds one rule per level.

Presentation:
- The camera normalizes zoom, so every phone sees the same world area.
- Real fonts, a token palette and 44 pt targets.
- A pause sheet, a real recap screen, a level-up ceremony, audio priority buses and a haptic vocabulary.

**Deferred to Later** (section 12):
- BASTION and ORACLE pilots.
- THREAT 5 (twin PRIMEs).
- The WARPING affix.
- SINGULARITY and BLIZZARD evolutions.
- CODEX, live feat toasts, offline submit queue, share-card upgrade, assist mode.

---

## 2. Conflict resolutions

| # | Conflict | Decision |
|---|---|---|
| C1 | RNG derivation. Run arc: `deriveSeed(seedFromString)` with spawn, script and boss streams. Build: `hash32` salts for spawn, loot, draft, combat and fx. Feel: `fxRng = seed ^ 0x2545f491`. | One `RunRngs` object in `src/core/rng.ts` holds 7 streams, each seeded by `hash32(seed, SALT)`. `boss` is reseeded per fight and `draft` per draft. `fx` is non-sim. `world.rng` is deleted. Section 3.1. |
| C2 | Damage model. Run arc: bites every 0.4 s from the top 3 overlapping enemies. Build: sum contact and cap it at 40% max HP/s. Meta: continuous damage counted as hits per 10 HP. | Use run-arc bites, then cap each bite at `0.08 x maxHp` (the build cap applied per bite window; 0.16 until the P19 deaths pass). All player damage goes through one function, `hurtPlayer()` (section 4.2). For score, a bite is continuous damage: every 10 HP after reduction counts as one hit. |
| C3 | Grace. Draft grace 0.75 s (run arc) vs 1.0 s (build). Hit i-frames 0.5 s vs 0.4 s. | Draft and core-close grace **0.75 s**, plus a 300 ms render slow ramp. Hit i-frames **0.5 s** (0.8 s since the P19 deaths pass, A1.1). Revive 1.5 s. Win 3.0 s. |
| C4 | XP knobs. Run arc: `row.xpScale` per minute. Build: `xpMul` per world plus a new curve. | Keep the build curve (`xpForLevel`), no gem expiry, the bank gem, homing and SURGE. Supply is `row.xpScale` per world per minute, and per-world `xpMul` is dropped. Starting values in A7 already include the x0.85 no-expiry factor. |
| C5 | Chained drafts. Feel re-deals chained level-ups with "+2 MORE". Build keeps a 12 s minimum gap with a pending chip. | Build wins: drafts are at least 12 s apart, and the HUD shows a `LEVEL UP x2` pending chip. Feel's chain re-deal is cut. |
| C6 | Draft input lock: 350 ms vs 450 ms. | 450 ms for the full ceremony (first 3 drafts), 300 ms after that. |
| C7 | Boss rewards. Run arc keeps boss XP 200 plus 6 gems of 20. Build replaces them with Hive Cores and lower XP. | Build wins. Mid bosses give 120 to 130 XP, PRIMEs 240 to 260, the extra gems are removed, and every boss drops a Hive Core. |
| C8 | Hive Core table: by boss index vs by stage. | By stage: mid1, mid2, then OT bosses. The PRIME core is fixed at 5 levels plus an evolution offer and is auto-granted when OVERTIME starts. |
| C9 | First pod: at 300-400 u (run arc) vs 250-450 u (build). | Build: 250 to 450 u. While the cage is up, pods clamp inside `cage.r - 40`. |
| C10 | Gem lifetime frozen in cage (run arc) vs no expiry (build). | No expiry for XP gems. Medkits keep 10 s. |
| C11 | Score. Run arc: win bonus 5000 + 20/s. Meta: chain multiplier. | Meta's chain multiplier, plus a clear bonus of `50,000 + 100 x max(0, 840 - clearSec)`, x`(10 + 2T)/10` for threat. The clear time is sent and validated. |
| C12 | Threat range and Daily threat. Run arc 0-5 with Daily 0-2 by hash. Meta 0-8 with Daily 0. | **MAX_THREAT = 4 in v2** (T5 is Later). Daily threat comes from a fixed weekly cycle `[0,0,1,0,1,0,2][d % 7]`. Daily never unlocks threat. |
| C13 | Threat keys. Run arc: `threat:cleared`, `clears`, `best:clear`. Meta: `threat`, `sel:threat`. | Keys `threat` (highest unlocked per world) and `sel:threat`. Clear data lives in `stats` (perWorld, perPilot). `clears` and `best:clear` are not created. |
| C14 | RunResult. Run arc `outcome` vs meta `end`. | One type (section 7.2): `end: 'death' \| 'quit' \| 'clear' \| 'stalemate' \| 'interrupted'` plus `cleared: boolean`, `clearMs`, `overtimeSec` and `nextBeat`. |
| C15 | Mode naming. | Id `'endless'` is unchanged, so saves and server keys still match. The UI label is **STANDARD**. |
| C16 | Three sim-to-presentation channels: run-arc alert ring, meta SimEvents, feel FeelQueue. | **One channel: FeelQueue.** Alert strings live in a preallocated `RunAlert` ring, which a FeelQueue `Alert` event points into. Meta's `Ev` codes become FeelKinds. SimEvents is not built. |
| C17 | Three banner systems: meta announcer, feel callout lane, run-arc alert banner. | The feel callout lane (`src/ui/callouts.ts`) with one merged priority table (A15). Run-arc alerts also drive an edge arrow for 3 s. |
| C18 | Tier name `FRENZY` (x3) clashes with the boss FRENZY state. | Tier names: x3 RAMPAGE, x4 CARNAGE, x5 MAYHEM, x6 HAVOC, x7 EXTINCTION, x8 SWARMGEDDON. Feats renamed to match. |
| C19 | Feel's presentation kill streak and milestones vs meta's sim chain. | Only the sim chain. The combo plate shows tier and chain. The kill pitch ladder uses the tier. Streak milestones are cut. |
| C20 | Dash input: button (build) vs "flick the left stick" hint (feel). | Button. The hint copy says `Tap DASH to dodge through danger`. |
| C21 | Meta's locked perks include removed ids (`dodge`, `velocity`, `steady_aim`) and keystones (`ricochet`, `thorns`, `executioner`), which breaks the Keystone draft. | Keystones are never locked. New locked set of 10: giant_slayer, berserker, overpressure, hollow_point, second_wind, glass_cannon, incendiary, adrenal_wake, slipstream, quartermaster (A12 maps each to its feat). |
| C22 | New pilots (build) vs 2 pilot rewards (meta). | NOVA, EMBER and VESPER get rule-based passives. BASTION and ORACLE are Later. |
| C23 | Hint keys: `hints` record (meta) vs `seen:hint:*` keys (feel). | One key: `hints: Record<string, number>` (show counts). Existing `seenTouchControls` and `seenGemHint` keep their behavior. |
| C24 | Recap tiles: TIME/KILLS/LEVEL (feel) vs TIME/KILLS/PEAK (meta). | TIME, KILLS, PEAK. The level goes in the subtitle line. |
| C25 | HUD kills counter vs score. | The HUD shows SCORE. Kills move to the pause sheet and the recap. |
| C26 | Boss enrage feedback (feel) vs phases and frenzy (run arc). | Enrage is deleted. FeelKinds `BossPhase` and `BossFrenzy` replace `BossEnrage`. |
| C27 | Run-arc near ring (600 x 440) vs the camera, which shows 560 x 996 in portrait, so spawns would be visible. | `RING_NEAR = { halfW: 640, halfH: 560 }`. This is a device-independent constant, off screen on every normalized view. |
| C28 | Timeline data: feel `RunTimeline` vs run-arc `script.markers`. | `script.markers`. The PRIME flag sits at 10:30. |
| C29 | Close Call slow-mo: 0.35 for 0.30 s (build) vs 0.4 for 250 ms (feel). | Feel: 0.4 for 250 ms, back to 1.0 over 150 ms. Render only. |
| C30 | `hitPlayer` (run arc) vs `hurtPlayer` (build). | `hurtPlayer(world, amount, kind, srcIdx)` only. |
| C31 | Boss death text source. | Run-arc script texts (A7). The hard-coded `QUEEN SLAIN` is deleted in Phase 1. |
| C32 | Sim version vs rules version. | One `SIM_VERSION = 2` in `src/core/rules.ts`. It is submitted as `v`, and the server filters boards by `v`. |
| C33 | Server plausibility (run-arc bounds vs meta bounds). | Merged in section 8.4. |
| C34 | 11 evolutions. | 9 ship. SINGULARITY (per-orb pull query) and BLIZZARD (freeze counters) are Later. Vortex Cannon and Hailstorm keep the pair tag but have no evolution. |
| C35 | WARPING affix and THREAT 5 twin PRIMEs. | Later. Depths affix pool: HASTED, VOLATILE, SHIELDED, BROOD. `MAX_BOSS_TELEGRAPHS = 1`. |
| C36 | Death sequence: feel runs only AI after death. Run arc has no rule. | Feel's rule: after `pendingGameOver`, the sim runs hash, AI and sweeps only, and time, kills and level stay frozen. |
| C37 | RECORDS and REMOVE MY SCORES are M2 in meta. | RECORDS ships with the FEATS and RECORDS tabs (CODEX is Later). REMOVE MY SCORES ships, because the privacy copy promises it. |
| C38 | Gem hint saves to localStorage from inside the sim (`pickups.ts:44`). | Moved to presentation in Phase 1. |
| C39 | Feel's first-3-card layout at 112 px vs the build's 5-line card content. | Card height 128 portrait, with the anatomy in section 9.3. |
| C40 | NUKE kills: scored (build) vs NoScore (meta). | NUKE kills give kills and XP but no points or chain (`KillSource.NoScore`). FIREBLAST kills score normally. The PURGE despawns enemies and gives no credit at all. |

---

## 3. Hard constraint check

### 3.1 Determinism: every sim randomness source

`src/core/rng.ts` adds:

```ts
export function hash32(a: number, b: number, c = 0, d = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 16) ^ c, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13) ^ d, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
export const SALT = {
  spawn: 0x51a7e001, script: 0x5c417006, boss: 0xb055e007, loot: 0x10c7a002,
  draft: 0xd4af7003, combat: 0xc0b7a004, fx: 0xf00dfe05,
} as const
export interface RunRngs { spawn: Rng; script: Rng; boss: Rng; loot: Rng; draft: Rng; combat: Rng; fx: Rng }
```

- The `Rng` objects are allocated once in the `World` constructor.
- `beginRun(seed)` reseeds each one with `hash32(seed, SALT.x)`.
- `Rng.reseed(n)` is added if it is missing.

| Stream | Reseed | Owns (complete list) |
|---|---|---|
| `spawn` | run start | pulse and top-up mix picks; ring points; `spawnEnemy` init (`fireTimer` jitter); event-unit lateral offsets and shoal wobble phase; splitter and broodmother offspring offsets; BROOD affix and egg hatch positions; teleports (psychic, abyssal warden); acid pool size; any AI random choice in `ai.ts` |
| `script` | run start | beat rolls only, with a fixed draw count per beat (A7.1): pack radii, pack arc center, event side S or gap G, elite side, elite affixes, boss spawn angle, mortar barrage offsets (36) |
| `boss` | each boss arrival: `hash32(seed, SALT.boss, fightIndex)` | attack jitter, egg ring rotation, magma mortar rotation, flak turret angle, cinderfall angle |
| `loot` | run start | gem and medkit scatter velocity; medkit rolls; weapon pod type and position; elite pod chance; boss pod pick; bonus drop and type rolls; core-shard target perk; Hive Core tier roll and level allocation |
| `draft` | every roll: `hash32(seed, SALT.draft, index * 64 + rerollIndex, banishSeq)` | draft card selection only |
| `combat` | run start | bullet spread; crit rolls; Arc Rounds proc chance |
| `fx` (non-sim) | run start (reproducible cosmetics, no sim effect) | particles, gibs, sparks, ichor stamps, muzzle sparks, `Enemy.animPhase`, `Pickup.phase`, damage number jitter |

`animPhase` goes to `fx` only if nothing in the sim reads it. Phase 1 checks this with grep. If `ai.ts` reads it, it stays on `spawn`.

**Rules**
1. **Capacity before RNG.** Check pool counts before drawing. A cosmetic cap never gates a sim draw.
2. **Sim inputs.** The sim reads only: sim state, the per-tick input sample (move, aim, fire, dash press), and run identity, which is seed, mode, pilot, arena, threat, perk pool and weapon pool.
3. **Forbidden in the sim.** Camera, viewport, DPR, settings, save state, wall clock and `Math.random`. `npm run check:sim` enforces this (Phase 2).
4. **Draft caching.** A draft's cards are computed once per open and cached in `DraftState.cards`. Resize, pause and ceremony replays never re-roll.
5. **Time manipulation.** Hit-stop and slow motion are render-side only: `GameLoop.timeScale` scales how fast the accumulator fills. The sim always steps `FIXED_DT`.
6. **Daily pools.** The Daily uses canonical content pools, never the save's unlock state.
7. **Stream stability.** Phase 1 moves the Daily stream once by creating all 7 streams. After that, a phase changes only the draws of the streams it owns. Det checks compare viewports and reruns within a build, not hashes across phases. The public Daily board opens only at release, under `v = 2`.

### 3.2 Zero per-frame allocation

- **Prewarmed pools:**
  - projectiles 512
  - enemy shots 300 (`MAX_ENEMY_PROJECTILES`, PB)
  - particles 1500 (`MAX_PARTICLES`, PB)
  - pickups 256 of MAX 400
  - hazards 48
  - blast queue `Float32Array(64 * 6)`
  - FeelQueue 1024 slots (typed arrays)
  - RunAlert ring 6
  - tween pool 96
  - damage numbers 64 x 6 glyph quads
  - off-screen arrows 8
  - charger lanes 6
  - ichor stamps 64 (PB)
- **Render side (PB):** pooled entities, particles, emerge parts, backdrop motes, damage-number glyphs and ichor stamps draw as quads in ParticleContainers (`src/render/quads.ts`), one texture source per layer. A dead pool entry keeps its quad at zero size instead of toggling `visible`, which rebuilt the whole draw list.
- **Per-entity typed memory:** `Projectile.hitUids = new Int32Array(8)` (factory); `world.chainSeen = new Int32Array(16)`; `Director` typed arrays (A7.3).
- **Banned in per-tick paths** (director, events, bossAI, hazards, collision, dash, draft tick, scoring, blasts): `new`, array or object literals, closures, template strings.
- **Allowed exceptions, at event rate:** alert and callout titles (at most about 40 per run), draft open, core reveal, `endRun`, `resolveScript` (in `beginRun`).
- **HUD:** DigitStrip for numbers, NineSlice for bars, no `Graphics.clear()` per frame.
- **Proof:** a 10 s `perf-final` trace shows no GC pause over 2 ms, and a 60 s `flood(500)` heap sample shows no growth. (Open after PB: 0.10 to 0.15 MB per 60 s remain after an 80 s warm-up, section 11 PB note.)

### 3.3 Save compatibility

- Every v1 key keeps working: `best:*`, `best:world:*`, `unlocks`, `sel:char`, `sel:arena`, `settings`, `seenGemHint`, `seenTouchControls`, `player:name`, `daily:last`.
- `migrate.ts` runs once (`meta:v < 2`). It grandfathers every owned item and never deletes a key.
- Native storage hydrates from Preferences and copies localStorage once. The full key table is in section 7.6.

### 3.4 Leaderboard abuse resistance

- The server recomputes the score with integer clamps.
- Plausibility bounds reject impossible summaries.
- Rate limits apply per IP (salted, daily-rotating hash) and per install id.
- One ranked Daily per install id per day, and at most 3 per IP.
- Names go through the sanitizer plus a blocklist.
- The daily spec is validated server-side with the shared `rules.ts`.
- Details in section 8.4.

### 3.5 UI

- Everything is Pixi-drawn (the name prompt stays DOM).
- 375x667 and 667x375 are the primary layouts.
- Targets at least 44 pt, text at least 12 px effective, text contrast at least 4.5:1 (tokens in A18).
- `uiScale` never goes below 1.

### 3.6 Copy, monetization, scope

- No em dashes anywhere. `grep -rn $'\u2014' src docs public` must be empty.
- No energy, no loot boxes, no streak punishment, no pay-to-win.
- Paints carry an optional `sku` field, so cosmetic IAP can be added later without code changes.
- Scope is in section 10: 20 phases of 300 to 900 lines. With 4 engineers on the parallel tracks, the calendar length is about 6 to 7 focused days.

---

## 4. Run systems (sim)

### 4.1 Run arc and director

`src/systems/director.ts` replaces `spawnSystem`. `src/content/runScripts.ts` holds the 3 world scripts. `src/content/waveDirector.ts` is deleted, and so are `waveCfg`, `spawnTimer`, `eliteTimer`, `bossTimer`, `RETRY_AT_CAP` and `SPAWN_HALF_W/H`.

**Timeline** (A7.1). Every world uses the same beat skeleton, and only the rows, events and bosses differ:
- packs at 0.3 s and 6 s
- teaching elite at 1:30
- EVENT 1 at 2:30, lull at 3:00, elite at 3:15
- midboss at 4:00, elite at 5:10, EVENT 2 at 5:30, elites at 6:15
- midboss returns at 7:30, elites at 8:15, EVENT 3 at 8:45, elites at 9:10
- lull and alert at 9:40, FINAL SWARM at 10:00, PRIME at 10:30

**Director tick** (zero allocation). Each tick runs these steps:
1. **Warnings.** Warnings roll the beat's `script` draws.
2. **Beats.** Fire due beats, or defer them.
3. **Events.** Tick the active event runs.
4. **Boss fight.** Tick the fight: cage, frenzy, stalemate.
5. **Spawning:**
   - The row is `rows[min(11, floor(t / 60))]`.
   - `minA` depends on state: inside a cage it is `CAGE_OUTSIDE_MIN[arena]`; during a lull it is `lullMin`; otherwise `row.minAlive x aliveMul`.
   - `maxA = min(PRACTICAL_CAP, row.maxAlive x aliveMul)`.
   - Top-up runs at `TOPUP_RATE` while `size < minA`. The accumulator is capped at 10.
   - Pulses fire every `row.every` seconds with `min(batch, maxA - size)` units, but only when neither a lull nor a cage is active.
   - Events and brood ignore `maxA`. They check only `size < MAX_ENEMIES - 20`.
   - Spawning stops when `runState` is `won` or `stalemate`.

**Enemy stat ramps** (`spawnEnemy`):
- `hp = round((def.hp + min(t, 720) x def.hpRamp) x world.hpMul)`
- `speed = def.speed x (1 + 0.0012 x min(t, 360))`
- In `aiSystem`, after all modifiers, speed is clamped to 240 u/s. The charger dash, boss lunge and stream units are exempt.
- `world.dmgMul` is recomputed once per tick: `(1 + 0.04 x min(t / 60, 12)) x threat.dmgMul x otDmgMul`. It scales bites, enemy shots and acid. Authored boss and hazard damage uses only `threat.dmgMul x otDmgMul`.

**Rings:**
- `ringSpawnPoint(world, half)` uses `RING_NEAR` before 60 s and `RING_STD` after.
- While the cage is active, a point inside `cage.r + 80` is projected outward along the ray from the cage center. This uses no extra draw.

**Deferral:**
- Event and elite beats that come due during a cage, purge or win are queued and fire at `cageEnd + 10 s`, then 12 s apart.
- An event more than 60 s late is dropped. Elite beats are never dropped. A lull inside a cage is skipped.
- Boss arrival is `max(at, lastBossKillAt + 20)`. mid2 is skipped if it cannot arrive by 9:30.
- If the final beat fires while the midboss lives, the midboss ascends: it despawns, and the PRIME spawns in its place at full HP with a fresh `boss` seed.

**Win (Standard and Daily):**
1. **Kill.** The PRIME dies:
   - `runState = 'won'`, `clearTime = t`, `world.cleared = true`
   - `player.invuln = 3.0`
   - the cage drops, and pulses and top-up stop.
2. **Purge.** For 1.2 s, every tick despawns each non-boss enemy within `1500 x elapsed / 1.2` of the kill point. Purged enemies give no credit, XP, drops or score. Enemy shots and hazards are cleared at once.
3. **Hand-off.** At kill + 2.0 s, `world.pendingWin = true`, and `main.ts` pauses the sim with `pauseReason = 'win'`. Pending level-ups resolve first, without the 12 s draft gap (section 4.4).
4. **Daily:** `endRun('clear')`.
5. **Standard:** the WIN panel opens (section 9.5):
   - EXTRACT gives `endRun('clear')`.
   - OVERTIME calls `world.startOvertime()` and grants the PRIME Hive Core.
6. **Leaving after the kill.** `main.ts` derives the end reason from world state, never from `pauseReason`: a death under way ends as `'death'`, and while `runState === 'won'` (the purge, the pending drafts and the WIN panel, until OVERTIME starts) every other exit ends as `'clear'`. That covers Escape, R and Android back before the panel opens, and a page closed at any point. At the panel itself, Escape and back do nothing. (W2 integration fix: an Escape in the 2 s purge window recorded `'quit'` with `cleared: true`, and a page closed during a pending-win draft recorded `'interrupted'`.)

**FRENZY and STALEMATE:**
- **FRENZY** starts 90 s after any boss arrives and steps every 15 s: cadence x1.1 per step (compounding, max x1.6), cage radius -25 per step (min 340), and a `FRENZY` alert. A step past both caps changes nothing and is not announced.
- **STALEMATE** comes 210 s after the PRIME arrives. The PRIME retreats, the cage drops, `pendingEnd = true`, and `endRun('stalemate')` runs.

**OVERTIME** (Standard only). Cycles last 180 s.

| Item | Value in cycle c |
|---|---|
| Minute rows | world rows 8, 9, 10 |
| Enemy HP mul | `1.5^c` |
| Damage mul | `1.2^c` |
| minAlive and maxAlive | `x1.1^c`, maxAlive capped at PRACTICAL_CAP |
| xpScale | `x0.8^c` |
| Bonus drop chance per XP (A5.3) | `x0.6^c` (W4 integration fix) |
| Non-boss spawn speed and the 240 u/s ceiling | `x1.3^(c-1)`: cycle 1 unchanged, cycle 2 x1.3, cycle 3 x1.69 (P11 review) |

Beats per cycle:
- +20 s: EVENT 1, plus a mirror copy at +28 s when c >= 2.
- +70 s: `2 + c` elites with 2 affixes each.
- +105 s: EVENT 3.
- +160 s: OT boss (mid2 kit, `hpBase 2600 x 1.35^c`; since the P19 bosshp pass the OT boss has its own `hpBase`, apart from mid2's 3380).

Death is the only end.

Built in P11 (constants `OVERTIME` in `src/config.ts`):
- `startOvertime()` sets `runState = 'overtime'`, `otCycle = 1` and `otStart = t`, so the first cycle already runs at `c = 1` (HP x1.5, damage x1.2), and opens a 10 s lull at the row's minAlive x0.5. Cycle minute 0, 1 and 2 use world rows 8, 9 and 10. Beats still held at the win are dropped.
- Every spawn takes `world.hpMul` (THREAT x `1.5^c`). The OT boss grows by its own `1.35^c` instead (A10.2): `2600 x 1.35^c x worldMul x buildScale^0.75 x THREAT hpMul`, so at THREAT 0 it has 3510, 4739 and 6397 base HP in cycles 1 to 3 (the PRIME has 9800 since the P19 bosshp pass, 4200 before). (P11 review: the first build also multiplied in `1.5^c`, which gave `2.025^c`: 18,885 HP at cycle 2 on T0 and 25,908 at cycle 3 on T2.) It fights with mid2's phases, cadence and rotations, and its alert reuses mid2's lines (`THE QUEEN / RETURNS`).
- **Speed (P11 review).** From cycle 2, every non-boss spawn moves `x1.3^(c-1)` faster, and the 240 u/s ceiling (A11) rises by the same factor (`world.speedMul`, `OVERTIME.speedMul`). Stream units keep their authored speed. Without it a kiting ship outlives OVERTIME: NOVA runs at 285 u/s (308 with one Fleet Footed stack), faster than the capped swarm, and a Hive smart+P bot held 450 enemies at full HP through cycles 3 to 5. The term leaves cycle 1 as designed and passes the kiter's speed in cycle 2 (flyers 312 u/s). Measurements in the A12 and A13 note (section 11).
- **Retreat (P11 decision, bound set in the P11 review).** An OT boss still alive `OVERTIME.bossStay` (90 s) after it arrives retreats: it leaves with no credit, the cage drops, the held beats are scheduled as after a kill (no lull), and the alert `THE QUEEN ESCAPED / THE SWARM RETURNS` (the script's stalemate title) plays. The next OT boss comes on time. Inside the cage the swarm is held outside and pulses stop, so the cage is the safest place in OVERTIME: with a stay of up to 180 s (the first rule: retreat when the next OT boss is due) the default bot, which shoots the swarm at the fence, spent up to 64% of its OVERTIME caged, and the runs that lived past 20:00 were the caged ones.
- The elite beat brings `2 + c` elites (plus HUNTERS' +1 from THREAT 1), at most 8, with 2 affixes each. The count is fixed when the beat warns (`Director.eliteN`), so a beat held by a cage into the next cycle brings the elites its draws were rolled for. (P11 review: the count read at fire time added one elite with no side draw and no affixes.)
- The EVENT 1 mirror plays from cycle 2 (every cycle at THREAT 2 and up), and at THREAT 2 and up EVENT 3 mirrors too (A11).
- `RunResult.overtimeSec = time - clearTime` for a run that went on into OVERTIME.
- **Bonus rate (W4 integration fix).** A kill's bonus drop chance takes `OVERTIME.bonusMul^c` (0.6^c, A5.3). P9's chance is per unscaled XP, so OVERTIME's kill volume, which `xpScale x0.8^c` offsets for gems only, raised the drops above P9's band of 1.5 to 3 per minute. Measurements in the W4 integration fix note (section 11).

**`runState`:** `'running' | 'won' | 'overtime' | 'stalemate'`. `pendingWin` and `pendingEnd` are the only hand-offs to `main.ts`.

**Final `stepSim` order.** Every phase inserts at its slot:

```
time → input sample → directorTick → buildEnemyHash → aiSystem (+bossAI) → dashSystem → weaponSystem
→ projectileSystem → pickupSystem → bonusSystem → collisionSystem (drainBlasts at its end) → hazardsTick
→ acidSystem → scoreStep → particleSystem (fx stream) → player.update (+dash motion, cage clamp) → sweeps
→ hand-offs: death > pendingWin/pendingEnd > core reveal > draft (gap rule)
```

During the death sequence only `buildEnemyHash`, `aiSystem` and sweeps run, and `world.time` stops.

The systems from `directorTick` to the sweeps live in one function, `runSystems` in `src/game/step.ts` (PB). `stepSim` advances the time, samples the input and calls it, and so does the boot warm-up (section 11, PB note), so the order exists in one place.

### 4.2 Damage model and grace

Player fields:
- `invuln` blocks everything.
- `invulnSrc: 0 | 1 | 2`: none, dash, or grace.
- `hitCd` blocks discrete hits.
- `biteCd` sets the contact cadence.

All of them decrement at the start of `collisionSystem`.

```ts
// src/systems/damage.ts
export type HurtKind = 'bite' | 'discrete' | 'zone'
/** Returns HP removed. Callers consume an enemy projectile only when the result is > 0. */
export function hurtPlayer(w: World, amount: number, kind: HurtKind, srcIdx: number): number
// 1 invuln > 0 → 0
// 2 w.shieldT > 0 (SHIELD bonus) → 0
// 3 kind 'discrete' && hitCd > 0 → 0
// 4 amount *= (1 - mods.damageReduction)
// 5 overshield (LIVING ARMOR) absorbs first; a hit it takes whole emits feel ShieldHit (no PlayerHurt, no registerHit) and returns
// 6 hp -= rest; w.damageTaken += rest; w.lastHitBy = srcIdx (-2 = acid, -3 = hazard)
// 7 discrete: hitCd = GRACE.hit (0.8), registerHit(w), feel Hit event; bite/zone: addContinuousDamage(w, rest)
```

**Contact pass** (replaces `pl.hp -= e.damage * dt`):
- Take the top 3 overlapping bite values `e.damage x 0.4`, skipping frozen, submerged or emerging enemies. Weight them 1 + 0.5 + 0.25.
- Every 0.4 s, when `invuln <= 0`, compute `bite = min(weighted x dmgMul, 0.08 x maxHp)` and call `hurtPlayer(bite, 'bite')`.
- A charger in phase 2 is a discrete hit, once per dash.
- Thorns keep ticking per enemy.

**Call sites:** `collision.ts:75` (ram, discrete), `:82` (contact, bite), `:100` (enemy projectile, discrete), `acid.ts:43` (zone; this also fixes acid ignoring Bulwark; at most `ACID.maxStack` = 1 overlapping pool hurts per tick, the first in pool order), and every hazard (discrete).

**Grace:**
- `world.resumeFromDraft()` sets `invuln = max(invuln, 0.75)` with `invulnSrc = 2`. `main.ts` calls it after a draft or core reveal, and so does the harness.
- A revive gives 1.5 s, the win 3.0 s.
- The ship blinks at 15 Hz (render) while `invuln > 0`.

**Worst case at 12:00:**
- 30 swarmers engulfing the player deal about 52 dps before the cap.
- Bites are capped at 20 dps for NOVA (0.08 x 100 / 0.4 s), so neither a brute nor a full engulf deals more.
- A full engulf therefore takes at least 5 s from full HP and 2.5 s from half. Discrete hits (shots, rams, hazards) add at most one hit per `GRACE.hit` (0.8 s), and acid adds one pool's dps (section 11, A10 note).

### 4.3 Dash and Close Call

Parameters are in A1. `src/systems/dash.ts`, `dashSystem(world, input, dt)` runs after `aiSystem`:

1. **Timers.** Tick them. Charges recharge one at a time, `DASH.cooldown x mods.dashCooldownMul` each.
2. **Buffer.** `if (input.consumeDashPress()) dashBufferT = 0.15`.
3. **Start.** If `dashBufferT > 0 && dashCharges > 0 && dashTicks === 0`:
   - Direction is the normalized move if `|move| >= 0.2`, otherwise the facing.
   - `dashCharges--`. If the recharge timer is idle, start it.
   - `dashTicks = 9`, `invuln = max(invuln, mods.dashIframes)`, `invulnSrc = 1`, `dashSeq++`, `dashes++`.
   - Run the start hooks: SALVO STEP, EMBER Afterburner, Adrenal Wake.
   - Emit FeelKind `Dash`.
4. **Motion.** `Player.update` moves `dir x 18.89` u per tick while `dashTicks > 0`. It ignores the stick and the gravity-well pull, and clamps to the arena and to the cage.
5. **End.** When the dash ends: `endLagT = 0.10` at 50% speed, and the Shock Step blast runs. A new dash may cancel the end-lag.
6. **Firing.** Firing continues during the dash.

**Close Call.** It fires at most once per dash while `invuln > 0 && invulnSrc === 1`. It triggers in the existing collision passes, where damage would have been applied, when one of these overlaps the player:
- an enemy projectile
- a charger in phase 2
- an elite or boss body
- a burrower or dune leviathan that surfaced within 0.25 s and lies within 60 u
- a live boss hazard

**Reward:**
- `dashRecharge = max(0, dashRecharge - 0.8)`
- `closeCalls++`
- `addChain(w, 15)`
- Adrenal Wake's timer doubles to 4 s for that dash.
- Emit FeelKind `CloseCall`.

**Input:**
- **Touch.** A dedicated DASH button (A1.2).
  - A touch that starts inside its 44 pt hit radius is a dash press and never claims the aim stick. A touch that slides onto the button does nothing.
  - Fire latch: if the aim stick was active in the last 0.25 s, firing continues in the last aim direction for 0.45 s, or until a new aim touch starts.
- **Keyboard.** Space, ShiftLeft or ShiftRight.
- **Gamepad.** LB or LT (value > 0.5), rising edge.
- **Sampling.** `consumeDashPress()` is read only inside `stepSim`.

The Phase Step dodge roll at `collision.ts:96` and `Modifiers.dodge` are deleted.

### 4.4 Perks, families, draft

Content is in A2 (31 perks), A3 (10 fusions) and A2.4 (3 fallbacks). `src/content/perks.ts` holds `PerkDef`, `Modifiers` and `FAMILY_OF_PILOT` (nova hunter, ember mobility, vesper survival). `src/systems/draft.ts` holds `rollDraft`, reroll, banish and skip.

**Open rule.** A draft opens only when all of these hold:
- `pendingLevelUps > 0`
- `!pendingGameOver`
- `pauseReason === 'none'`
- `world.time - draft.lastOpenAt >= 12`, except while `pendingWin` is set: the fight is over, so pending levels resolve at once and the win panel opens after the last pick (W2 integration)

Otherwise the level waits, and the HUD shows a `LEVEL UP x2` chip. Picks never chain-open. `main.ts:315` and `main.ts:481-491` both go through one `openDraft()`. Guard: if `cardCount === 0`, set `pendingLevelUps = 0` and unpause.

**`rollDraft`:**
1. **Reseed.** Reseed the `draft` stream (section 3.1).
2. **Exclusions.** Exclude banished ids. On a reroll, also exclude the 3 ids shown before, but only if at least 3 other eligible entries remain.
3. **Keystone draft** (`index === 1`, including its rerolls):
   - one keystone from the pilot family
   - one keystone from each of 2 other families, picked uniformly
   - one keystone chosen uniformly from each family's 2
   - shuffle the 3 cards and tag them `KEYSTONE`
4. **Eligible set.** `E` = perks in `world.perkPool` with `stacks < max`, minus exclusions. A fusion whose two parents are owned moves from state 0 (locked) to 1 (eligible, not offered).
5. **Slot 1 (BUILD):**
   - an eligible unoffered fusion (the first in A3 order), which moves to state 2 and is tagged `FUSION_FIRST`
   - else, an offered fusion with probability 0.35
   - else, an owned non-maxed perk with probability 0.55
   - else, use the slot 2 rule
6. **Slot 2 (FAMILY).** Rarity roll: `pRare = min(0.55, 0.15 + 0.06 x sinceRare)`. Weight each candidate by `min(2.5, 1 + 0.5 x ownedDistinct(family))`.
7. **Slot 3 (WILD).** Rarity roll, then a uniform pick. If one rarity is empty, use the other.
8. **Fill.** Empty slots take fallbacks in order SHARPEN, FIELD REPAIR, SPARE PARTS, with no duplicates.
9. **Tags:** `NEW`, `COMPLETES_FUSION`, `PAIRS_WEAPON`, `EVOLVES_HELD`.

**Reroll, banish, skip:**
- Start with 2 rerolls and 1 banish in every mode.
- Each Hive Core adds +1 reroll and +1 banish. Caps are 5 rerolls and 3 banishes.
- REROLL re-rolls the whole draft.
- BANISH (tap BANISH, then a card) bans that id for the run and re-rolls only that slot.
- SKIP heals 20% of max HP.
- Keys: 1 to 3 pick, R reroll, B banish, Backspace skip.
- Gamepad: A pick, Y reroll, X banish, B skip.
- No meta state ever changes these counts.

### 4.5 Weapons, pods, evolutions

**Phase 1 fixes:**
1. **Pierce hit memory.** `Projectile.hitUids` (Int32Array 8) plus `hitN`, and `Enemy.uid = world.enemyUidSeq++`. A projectile hits each enemy at most once.
2. **Chain uniqueness.** Each chain seeds `world.chainSeen` with the origin uid and excludes every uid already in that chain.
3. **Rocket AoE.** Damage is `explodeDamage x damageMul`.
4. **AoE multipliers.** Explosions, chain hops, burn and blasts apply `eliteDamageMul` and inherit the triggering hit's crit (no new crit roll).

**Phase 8 changes:**
- **Ricochet.** Wall bounces are deleted. When pierce is spent and `seekBounces > 0`:
  - query 280 u around the hit point
  - re-aim at the nearest enemy not in hit memory
  - `life = max(life, 0.35)`
- **Ammo is time-based.** `world.ammo` is a float. Each trigger pull costs `w.fireRate / effectiveFireRate`, so a magazine lasts `ammo / fireRate` seconds whatever the fire-rate perks. OVERDRIVE costs 0. On pickup, `ammo = def.ammo x mods.ammoMul`.
- **Rebalance.** SMG damage 7 to 8.5. Vortex fire rate 2.2 to 2.6 and damage 22 to 32. Stiletto damage 11 to 12.

**Pods** (constants in A5.1):
- One timer pod at a time. The first appears at 20 s, then every 15 s.
- Distance is 250 to 450 u from the player (loot stream). Rotate by +90 degrees up to 3 times to stay inside the arena inset of 60 u. While the cage is active, clamp inside `cage.r - 40`.
- Type: with probability 0.5, pick from affinity weapons (pickup weapons whose paired perk is owned, excluding the held weapon). Otherwise pick uniformly from `world.weaponPool` minus the held weapon.
- **Hold to take:** stand on the pod for `0.4 - 0.1 x quartermaster` s. The fill decays at 2/s. NOVA takes pods instantly, and her pods home in like gems.
- Lifetime is 20 s + 5 s per Quartermaster stack. The pod blinks in its last 3 s.
- Elites drop a pod with probability 0.35.
- Every boss drops one pod 60 u from its Hive Core. The pick prefers paired weapons whose perk has 2+ stacks, then 1+ stacks, then random.

**Evolution.**
- Trigger: open a **Hive Core** (not a shard) while holding a pickup weapon whose paired perk has 2+ stacks.
- The core then offers a choice: `EVOLVE: <NAME>`, or its rolled levels.
- The evolved weapon has infinite ammo and becomes `baseWeaponId` for the rest of the run. Later pods are temporary. A second evolution replaces the first.
- Table in A4.

### 4.6 Hive Cores, shards, bonuses

Numbers are in A5.

- **Core shard:**
  - An elite kill drops a shard when `time >= eliteCoreReadyAt`, then `eliteCoreReadyAt += 60`.
  - Contact pickup gives +1 level to a random owned non-maxed perk (loot stream). If there is none, SHARPEN.
  - No pause. The HUD shows a toast.
- **Hive Core:**
  - Every boss drops one at the corpse, and it never expires.
  - On contact: roll 1, 3 or 5 levels from the stage table (loot stream). Each level goes uniformly to an owned non-maxed perk, and overflow becomes SHARPEN. Also +1 reroll and +1 banish.
  - Evolution choice when eligible.
  - `pauseReason = 'core'`: the reveal plays, then 0.75 s grace.
- **Bonuses:**
  - Drop chance per kill is `0.0015 x def.xp`. After 40 s with no drop, the next kill with `xp >= 2` drops one.
  - The first elite kill of a run always drops one.
  - Minimum gap 8 s, at most 2 on the field.
  - Type roll excludes: types on the field, active timed types, the last type, and VACUUM under 25 gems.
  - No bonus drops from NUKE, FIREBLAST or `BLAST_NO_BONUS` kills.
  - Contact pickup, no magnet.

### 4.7 Bosses, elites, events, hazards

**Arrival** (fixes the boss that walks slowly on from off screen):
1. **t - 3.0:** the alert plays, plus 1 `script` draw for the spawn angle φ.
2. **t - 1.5:** a marker hazard (r 90, no damage) follows `player + 300·dir(φ)`.
3. **At arrival:**
   - Cage center `C = clamp(player, arena shrunk by R + 30)`, with `R = max(520, |player - C| + 80)`.
   - Boss spawn point `P = player + 300·dir(φ')`: the marker's spot, so the marker never lies. `φ'` is the first of φ, φ + 180 degrees, then 30 degree steps either side (±30, 180 ∓ 30, ±60, 180 ∓ 60, ±90) that keeps `P` inside the arena (inset by the PRIME radius + 24) and inside the ring (inset by the PRIME radius + 20). No extra draw. (Decided in P6a: `C + 300·dir(φ)` puts the boss up to 750 u from a player near a wall, which breaks A5. Near a wall or a corner the ring reaches past the walls, so the P6a review added the arena test.)
   - During the fight the boss body stays inside both the ring and the arena walls, lunges included.
   - A shockwave pushes non-boss enemies to `R + 40 + radius` and removes enemy shots, acid and hazards inside R.
   - The boss spends 1.0 s in `EMERGE`: untargetable, no bite, no attack.
   - The `boss` stream is reseeded.
4. **During the fight:**
   - Pulses are off. Top-up runs outside the cage only.
   - A fence pushes non-brood enemies back out.
   - Enemies outside the cage do not fire.
   - The player is clamped inside R.
5. **Kill:**
   - Slain text from the script.
   - The cage drops, a 15 s post-boss lull (minAlive x0.5) starts, and `lastBossKillAt = t`.
   - Hive Core and pod drop.

**HP** (fights of 20 to 40 s, PRIME 40 to 75 s):

```ts
estimateBaseDps(w) = wd.fireRate * m.fireRateMul * wd.damage * m.damageMul * (wd.projectilesPerShot + m.extraProjectiles) // wd = WEAPONS[w.baseWeaponId]
buildScale = clamp(estimateBaseDps(w) / 88, 1, 12)
bossHp = round(stage.hpBase * script.boss.worldMul * (stage === 'final' ? script.boss.primeHpMul : 1) * buildScale ** 0.75 * w.hpMul)
eliteHp = round((def.hp + t*def.hpRamp) * beat.hpMul * 1.5 * buildScale ** 0.75 * (1 + 0.25*affixes) * w.hpMul)
```

Crit, Giant Slayer, AoE and pickup weapons stay out of the estimate. The evolved base weapon counts, because it becomes `baseWeaponId`.

**Boss AI** (`src/systems/bossAI.ts`):
- States: `EMERGE → IDLE → TELE → ACTIVE → RECOVER`, plus `ROAR` (0.8 s at each phase change, damageable).
- Every attack has one decal shape, and telegraphs are never shorter than 0.6 s.
- Only one boss telegraph is live at a time.
- Kits, rotations and numbers are in A10.
- New defs: the 3 PRIMEs, `egg` and `flakTurret` (A10.1).
- `queen`, `voidMatron` and `emberTyrant` get behavior `'boss'`. `brood`, `enrageAt` and the `'queen'` branch are deleted.

**Elites:**
- 10 per T0 run, on the beat skeleton.
- Affixes are drawn without replacement at warn time (script stream) and stored as a bitmask (A9).
- Name tag: if `affixNames + ' ' + displayName` is 18 characters or fewer, it is the title. Otherwise the title is `displayName` and the sub lists the affixes, for example `HASTED · VOLATILE`.
  - (P7) The tag floats above every live elite (`src/render/eliteTags.ts`, 8 slots): title 13 px, sub 12 px, JetBrains Mono 800 with a 4 px ink stroke, a fixed screen distance above the outline ring. Its color and the ring's are the lowest affix bit's color (A9); an elite with no affix gets a gold title and no ring.
  - (P7) The elite alert's title is the name tag title when the beat brings one elite, and `GUARDIAN x2` (display name and count) when it brings more; the sub names the first elite's side.
- `onEliteKilled` drives shards, pods and bonuses. `onBossKilled(stage)` drives cores.

**Events** (`src/systems/events.ts`; table in A8):
- Units are normal defs with `eventUnit = true`.
- **STREAM mode** (`stream = true`) means a locked heading, authored speed, a TTL, and no seek or separation. At TTL, or 40 u past the arena wall it heads through, the unit despawns with no credit (a unit that starts outside the arena and heads in stays).
- Emission is spread over `spawnDur` through a preallocated `EventRun` (3 slots).
- Geometry is relative to the player's sim position, never the view.
- (P7) Each part of an event (a FINAL SWARM has 3) takes one `EventRun` slot and fixes its geometry when it begins (after its delay). Only cryo slows a stream unit; aura buffs and the 240 u/s ceiling do not apply to it.
- (P7) S and G are one of the 4 sides (the drawn angle snapped to N, E, S or W), so the alert's direction word is exact. At warn time the side is fitted to the arena with no extra draw: the first of the side, its opposite, then each quarter turn that puts the point `fit` u out along it (the stream or wall distance, or the ring radius) at least 24 u inside the arena wall (with none, the side with the most room). A held event is fitted again when its late alert plays.
- (P7 review) Arena edges, decided when each part begins (the player moves up to 855 u during the 3 s alert). Part directions are exact axis vectors (S plus the part's turn), so a wall's slots share one coordinate.
  - A stream keeps its authored distance. When the side (S plus its turn) has no room for its origin, the part is fitted again from that side, as at warn time. An event that names its side (STAMPEDE, SHOAL RUN) plays its alert again with the new side; the FINAL SWARM streams turn with no alert. Lateral offsets are clamped 24 u inside.
  - A wall keeps its side and its distance, so the Wastes pair still closes from both sides. A wall center past the arena wall starts outside, and its units walk in. The wall slides along its own line until both ends are 24 u inside, so every slot spawns.
  - Ring slots outside the arena are skipped. Every other spawn or drop point is clamped 24 u inside.
  - Measured by `scripts/probe-events.mjs` with the ship near each wall and in the corners: every stream and wall unit spawns at its authored distance or farther, every wall unit enters the arena, and the last alert names the side the units come from. Before the fix, HIVE WALL spawned 11 of 22 units with the ship 200 or 400 u from the wall and 0 of 22 at 20 u (the float32 `cos(PI/2)` of -4.4e-8 put half the slots 2e-5 u outside the inset line), and a STAMPEDE turned toward a ship 120 u from the wall spawned 93 u from it.
- (P7) A held event or elite beat plays its alert its warn lead (3 s, elites 2 s) before its deferred fire time, so a late beat is announced like an on-time one. A held event that the drop rule will discard gets no alert.
- (P7 review) Holding or rescheduling a beat clears its alert flag (`Director.warned`), so a beat held again by a later cage is announced again for its new fire time. A held beat's alert waits while the next boss arrives before its fire time (that cage holds it again). A beat that fires with no alert played (its warn fell inside a cage that dropped before it came due) plays its alert, refitted, when it fires.

**Hazards** (`src/game/hazard.ts`, `src/systems/hazards.ts`, `src/render/hazardRenderer.ts`):
- The pool holds 48.
- Shapes: 0 circle, 1 lane, 2 sweep.
- Fields: `tele/teleMax` for the telegraph, `live` for the damage window, `damage` (0 = marker), one hit per cast, and `onEnd`: none, magma pool or spawn unit.
- Player tests use squared distance for circles and point-to-segment distance for lanes and sweeps.
- Textures (disc, lane, 120 degree sector, cage ring) are baked once.

### 4.8 THREAT (0 to 4 in v2)

Table in A11. Effects are cumulative.

- **Unlock:** winning world W at threat T in Standard, where `T === threat[W]`, sets `threat[W] = min(4, T + 1)`.
- **Selection:** stored per world in `sel:threat` and clamped to the unlocked level.
- **Run identity:** the threat is read once in `beginRun`.
- **Daily:** threat comes from `DAILY_THREAT_CYCLE[d % 7]` (A11) and never unlocks threat.
- **Built in P11:** `src/content/threat.ts` (the A11 table), `src/state/threatLadder.ts` (keys `threat` and `sel:threat`, both `Record<worldId, number>`; `selectedThreat`, `selectThreat`, `recordThreatClear` from `endRun`). `main.startRun` passes the selected level to `World.beginRun(seed, mode, char, theme, threat)`. The menu's THREAT row (P17) selects a level, and the Daily runs at 0 until P13 passes `dailySpec(date).threat`.

### 4.9 XP flow

Constants in A6. Rules:
- **Curve:** `xpForLevel(1) = 6`, and `floor(5 + 6L + 1.2L²)` for L >= 2.
- **Gem value:** `def.xp x row.xpScale` for non-elite, non-boss kills. Elite and boss XP is not scaled.
- **SURGE:** after 40 s with no level-up, collected XP counts x2 until the next level-up.
- **No XP gem expiry.**
- **Bank gem:** at `XP.gemSoftCap` (150; 200 before the P19 density pass) gems on the field, the uncaptured gem farthest from the player merges into one crimson bank gem and is reused for the new drop, so new XP still lands at the kill. With no uncaptured gem, or while the bank gem is homing in, the new XP merges into the bank gem. Until it is captured, the bank gem stays within `XP.bankLeash` (150 u) of the player: when the player moves farther away, it is pulled along the line to the player.
- **Homing:** a gem that enters `125 x magnetMul` is captured and homes at 260 to 900 u/s. It never releases.
- **VACUUM** captures every gem and medkit.
- **Pickup pool reservation:** XP 200 + 1 bank gem, medkits 40, pods 4, cores 4, bonuses 2. MAX 400.

### 4.10 Pilot rules

`CharacterDef.rules: PilotRules`. `applyPassive` is deleted.

| Pilot | Stats | Rule (UI copy) | Mechanics |
|---|---|---|---|
| NOVA | 100 HP, 285 speed, Sidearm | SALVAGER: Takes pods instantly. Every emptied pickup gun makes her Sidearm stronger. | family hunter; pod hold 0; pods home in like gems; +5% base weapon damage per emptied pickup magazine, max +50% |
| EMBER | 85 HP, 305 speed, Scorcher | AFTERBURNER: Two dash charges. Every dash reloads her gun and boosts damage. | family mobility; dashCharges 2; each dash sets `fireCooldown = 0` and grants x1.3 damage for 1.5 s |
| VESPER | 120 HP, 265 speed, Stiletto | REAPER: No medkits. Kills heal her. Elites and bosses make her bigger. | family survival; medkit rolls still happen but drops are skipped; kill heal 1 HP with a cap of 8 HP/s; elite kill +8 max HP; boss kill +25 max HP (heals the same) |

Resolved in P9 (`PilotRules` in `src/content/characters.ts`): the v1 passives (NOVA +35% pickup range, EMBER +15% damage, VESPER +1 HP per kill) are gone. The rule sets the base values perks build on: EMBER's 2 charges before Phase Step, VESPER's 8 HP/s kill-heal cap before Vampiric. NOVA's pod hold of 0 goes through the one hold expression, so Quartermaster cannot make it negative; her pods inside the capture radius (125 x magnetMul) are captured and home in like gems. Her salvage counts every pickup magazine that runs dry (not one replaced by another pod) and multiplies the base weapon, the evolved one after an evolution. EMBER's x1.3 scales the hit and the weapon's own explosion. VESPER's growth is added after hpMul (Glass Cannon does not shrink it) and survives every perk recompute. The main menu shows the rule name and the sentences of its copy that fit one 12 px line at 375 px; P17's pilot card shows the whole rule.

---

## 5. Score and multiplier (sim)

`src/core/rules.ts` is shared by the client and the worker, and imports nothing browser-only:

```ts
export const SIM_VERSION = 2
export const KILL_PTS_PER_XP = 10
export const MAX_TIER = 8
export const TIER_STEPS = [0, 10, 30, 70, 150, 300, 550, 900] as const
export const CHAIN_DECAY_S = 2.0
export const CONTACT_HIT_HP = 10
export const CONTACT_ACC_RESET_S = 1.0
export const CLEAR_BONUS = 50_000
export const CLEAR_SPEED_PTS = 100          // per second the clear beats 14:00
export const STALEMATE_S = 840
export const MAX_THREAT = 4
export const CLOSE_CALL_CHAIN = 15
export const PRIME_AT_S = 630, PRIME_DELAY_MAX_S = 20, PRIME_STALEMATE_S = 210   // A7.1 beat, BOSS_MIN_GAP, STALEMATE_AFTER
export const CLEAR_MIN_MS = PRIME_AT_S * 1000                                     // 630_000
export const UNCLEARED_MAX_MS = (PRIME_AT_S + PRIME_DELAY_MAX_S + PRIME_STALEMATE_S) * 1000 + 5000   // 865_000
export function clearBonus(clearMs: number): number {
  return CLEAR_BONUS + CLEAR_SPEED_PTS * Math.max(0, STALEMATE_S - Math.floor(clearMs / 1000))
}
export function scoreOf(killPts: number, xpSum: number, clearMs: number, threat: number): number {
  const kp = Math.min(Math.max(0, Math.floor(killPts)), MAX_TIER * KILL_PTS_PER_XP * xpSum)
  const cb = clearMs > 0 ? clearBonus(clearMs) : 0
  return Math.floor(((kp + cb) * (10 + 2 * threat)) / 10)
}
```

`seedFromString` moves into `rules.ts`, and every import is updated (no re-export from `rng.ts`). `rules.ts` also holds `DAILY_EPOCH`, `ROTATIONS`, `DAILY_THREAT_CYCLE`, `KNOWN_WORLDS`, `KNOWN_PILOTS`, `dailySpec()`, `dayIndex()`, `isoWeek()` and `implausible()`.

**Clear bounds (P13).** The first draft had `CLEAR_MIN_MS = 633_000`, but a PRIME killed as it becomes targetable clears at 631.02 s, so the server would have refused real wins. The bounds now come from the run script:
- A PRIME never arrives before its 10:30 beat, and it spends `BOSS_EMERGE` (1.0 s) untargetable, so the earliest kill is 631 s plus a tick. `CLEAR_MIN_MS` is the arrival itself, 630,000 ms, and the emerge second is the margin.
- A mid boss killed just before 10:30 delays the PRIME by up to `BOSS_MIN_GAP` (20 s), and its stalemate comes 210 s after it arrives, so an uncleared run can last to 860 s. `UNCLEARED_MAX_MS` is 865,000 ms (the first draft's 845,000 would have refused that stalemate).
- A mid boss still alive at the PRIME beat ascends with no credit, so a clear can have one boss kill.
- `node scripts/test-rules.mjs` checks the three constants against every world script and `config.ts`, and `scripts/attack.mjs` posts a clear at 631.017 s (accepted) and at 629.999 s (422). `scripts/probe-lb.mjs clear` kills the PRIME at its first targetable tick in the real build and posts it: `clearMs` 631,017, accepted as a Standard EXTRACT and as the ranked Daily.

**`src/game/scoring.ts`** (no RNG, integer points, zero allocation):
- `scoreKill(w, def, src)`:
  - `xpSum += def.xp`, and update the kill, elite and boss counters.
  - If `src === Weapon`: `chain++`, reset the timer, `pts = 10 x def.xp x tier`, `killPts += pts`, then refresh `score`.
- `registerHit(w)`:
  - `hits++`, `noHitTime = 0`, `chain >>= 1`, set the tier, emit `ChainHit`.
- `addContinuousDamage(w, hp)`: accumulates HP and calls `registerHit` per 10 HP. The accumulator resets after 1 s with no continuous damage.
- `addChain(w, n)`: Close Call adds +15.
- `scoreStep(w, dt)`: after 2.0 s with no kill, halve the chain, and keep halving every 2.0 s.
- `spawnBoss` sets `hitsAtBossSpawn = hits`. A boss fight with no new hits counts as flawless.
- `KillSource.NoScore` is used by NUKE. The PURGE despawns and never calls `scoreKill`.
- **The sim never reads `score`, `tier` or `chain`.**

**Hit rules.** Discrete hits (projectile, ram, boss attack, hazard) call `registerHit` once, and only when `hurtPlayer` removed HP. Bites and acid go through the accumulator. Hits blocked by i-frames or the SHIELD bonus never count.

**Boards:**
- One Standard board per world, with views THIS WEEK (Monday 00:00 UTC reset) and ALL TIME.
- One Daily board per day.
- Every board is filtered by `v = SIM_VERSION`.
- Threat is not a separate board. It multiplies the score, and the row shows a `T3` chip.
- There is no region tab and no clear-time board.

**Tier table and names:** A14.

---

## 6. Presentation boundary, time, camera, feel

### 6.1 FeelQueue (the one channel from the sim to presentation)

`src/effects/feelQueue.ts`:
- Typed arrays: `kind` (Uint8), `flags` (Uint8), `x`, `y`, `a`, `b` (Float32), plus `ref: (object | null)[]`.
- CAP 1024. The last 64 slots refuse `Hit`, `Shot`, `EnemyShot` and `GemCollect`.
- The sim only calls `emit`. `FeelDirector.drain()` runs once per render frame, then `clear()` runs.

```ts
export const enum FeelKind {
  Shot = 1, Hit, Kill, Explosion, PlayerHurt, PlayerDeath, Revive, LevelUp, GemCollect, HealCollect,
  WeaponPickup, WeaponEmpty, LowAmmo, PodSpawn, EliteSpawn, BossSpawn, BossPhase, BossFrenzy, BossKill,
  ChargerWindup, EnemyShot, Teleport, Dash, CloseCall, Alert /* b = RunAlert ring index */,
  MultUp /* a = tier */, MultDown, ChainHit, Fusion /* b = fusion index */, Evolve /* b = weapon index */,
  CoreOpen /* a = levels */, Shard, BonusPickup /* b = bonus index */, BonusEnd, HazardDetonate, Win, Stalemate,
  BossTele /* a = attack kind, b = telegraph seconds */, ShieldHit /* a = damage the overshield absorbed */,
}
export const FF_CRIT = 1, FF_ELITE = 2, FF_BOSS = 4, FF_AOE = 8, FF_DISCRETE = 16, FF_CONTACT = 32, FF_ACID = 64, FF_RAM = 128
```

**RunAlert ring:** `world.alerts` holds 6 preallocated `RunAlert { kind, title, sub, dirX, dirY, t, seq }`.

**World cleanup:**
- Removed from `World`: `juice`, `audio`, `hurtFlash`, `showGemHint`, `viewW`, `viewH`, `camX`, `camY` and the `loadJSON` import.
- `audio.setTheme` moves to `main.startRun`.

**Call-site migration.** Every `audio.play`, `addTrauma`, `announce`, `hurtFlash` write and `spawnDamageNumber` call in the sim becomes an `emit`:

| Sim event | Emit | Notes |
|---|---|---|
| Weapon fire | `Shot`, a = angle, b = weapon index | `spawnMuzzle` stays and uses the fx stream |
| Enemy hit | `Hit`, with flags and `ref` | |
| Kill | `Kill` | a, b = the killing projectile's vx, vy, stored in `world.lastHitVx/Vy`; 0, 0 for a thorns kill, which has no shot |
| Explosion | `Explosion` | |
| Player damage | `PlayerHurt` | emitted from inside `hurtPlayer` |
| Boss spawn / phase / frenzy / kill | `BossSpawn` / `BossPhase` / `BossFrenzy` / `BossKill` | |
| Elite spawn | `EliteSpawn` | |
| Charger enters windup | `ChargerWindup` | |
| Enemy shot / teleport | `EnemyShot` / `Teleport` | |
| Pickups | `GemCollect`, `HealCollect`, `WeaponPickup` | |
| Pod spawn | `PodSpawn` | includes elite and boss pods |
| Weapon runs dry | `WeaponEmpty` | |
| Ammo crosses below 20% | `LowAmmo` | once per magazine |
| Level gained | `LevelUp` | once per level |

**`npm run check:sim`** (`scripts/check-sim-purity.mjs`, chained into `build` and `build:cap`):
- It fails if `src/systems`, `src/game` or `src/content` contains any of: `Math.random`, `performance.now`, `Date.now`, `loadJSON`, `saveJSON`, `localStorage`, `window.`, `document.`, `devicePixelRatio`, `viewW`, `viewH`, `camX`, `camY`, `camera`, `settings`, `audio.play`, `juice`.

### 6.2 Time

**`GameLoop.timeScale`** (`src/core/time.ts`):
- `accumulator += frame x timeScale`.
- `frameMs` stays unscaled, so the UI, tweens and shake run in real time.
- When the scale is 0, alpha freezes, so entities do not jitter at 120 Hz.

**`TimeDirector`** (`src/effects/timeDirector.ts`):
- The render loop computes `scale = paused ? 0 : min(hitstop ? 0 : 1, active presets)` and writes it to `loop.timeScale`.
- A 250 ms cooldown follows each hit-stop.
- Hit-stop never triggers on chaff, combos or off-screen kills.
- The sim has no hit-stop.

| Trigger | Shape (real time) |
|---|---|
| On-screen elite kill | hit-stop 50 ms |
| Discrete hit of 15+ | hit-stop 40 ms |
| Revive | hit-stop 120 ms (forced), then 0.4 to 1.0 over 400 ms |
| bossIntro | to 0.35 in 60 ms, hold 450 ms, back to 1.0 over 300 ms |
| bossKill and win | to 0.15 in 40 ms, hold 300 ms, back to 1.0 over 450 ms |
| death | 0 for 90 ms, 0.3 until 1150 ms, then the recap |
| levelResume / pauseResume | 0.3 to 1.0 over 300 ms |
| closeCall | 0.4 for 250 ms, back to 1.0 over 150 ms |

Reduce motion: hit-stop is off and every preset is floored at 0.5, except death and pause.

**Death sequence:**

| t (ms) | Beat |
|---|---|
| 0 | death SFX, haptic `error`, trauma 0.9 |
| 90 | camera punch +0.25 on the wreck; saturation to -0.6; vignette 0.85 |
| 300 | a fresh pointerdown skips to the recap |
| 1150 | `endRun` |
| 1150 | recap enters |
| 1600 | RETRY accepts input |

If the app goes to the background during the sequence, the game jumps straight to the recap.

### 6.3 Camera (render only; `src/render/camera.ts`)

- `baseZoom = clamp(max(min(W,H) / 560, max(W,H) / 1232), 0.5, 3.0)`. Every device then shows 0.50 to 0.56 M world units².
- Hard follow on the player. Only the look-ahead offset is smoothed: `0.14 x 560` toward the aim, approaching at rate 5/s and returning at 3/s.
- Touch portrait: the camera center sits `0.06 x viewH` below the ship.
- Boss pull: `clamp(0.2 x (boss - player), ±140)`, plus a fight zoom of 0.92.
- Punches drive zoom.
- The view is clamped to the arena.
- `apply` copies the transform to `layers.overlay`, a world-space layer for damage numbers that is not bloomed.
- Aim input comes from `input.update(camera.worldToScreenX(player.x), camera.worldToScreenY(player.y))`.
- Textures bake at resolution 3.
- Reduce motion: no punches or boss zoom, and look-ahead is halved.
- `SHORT_TARGET` (560) is an owner feel check at 375x667.

### 6.4 Shake, hit reaction, FX

- **Shake** (`src/effects/shake.ts` replaces `juice.ts`):
  - trauma² value noise, two octaves at 12 Hz and 27 Hz
  - `MAX_OFFSET = clamp(0.045 x min(W,H), 14, 24)` px, `MAX_ROT = 0.021` rad
  - decay 1.6/s
  - screen kicks decay by `exp(-25 fd)`, capped at 12 px
  - per-event table in A16.3
- **Particle tint fix:** `fx.ts begin(p, x, y, tint)` sets both `p.tint` and `sprite.tint`.
- **Hit flash:** baked `key@white` silhouettes plus a 1.12 scale pulse.
- **Directional gibs:** 60% of gibs spread within ±0.6 rad of the killing shot's direction. A Kill with a zero vector (thorns) spreads its gibs radially.
- **Tracers:** rail and beam stretch by `1 + speed / 1800`.
- **Muzzle:** 2 sparks plus one additive flash quad.
- **Damage numbers** (`src/effects/damageNumbers.ts`; `FloatingText`, `world.floaters`, `announce` and `MAX_FLOATERS` are deleted):
  - pooled glyph sprites from an installed BitmapFont atlas (`numMono`)
  - 64 numbers x 6 glyphs
  - modes `big` (default), `all`, `off`
  - tint and size tiers in A18
  - a pop from 1.4 to 1.0 over 90 ms, a 26 px rise over 0.45 s
  - hits on the same enemy within 150 ms merge into one number

### 6.5 Feedback catalog

`src/effects/feelDirector.ts` drains the FeelQueue. It owns the hurt flash, pitch ladders, haptic throttles, arrows, charger lanes and hint triggers. The events and their outputs are in A16 (shake), A16.2 (audio) and A17 (haptics). Key moments:

- **Level-up ceremony.** The full version plays for the first 3 drafts of a run:
  - `levelup` SFX and haptic `success`
  - a scrim to 0.88 over 200 ms
  - a ring from the ship, 0 to 180 px over 300 ms
  - a `LEVEL 7` stamp
  - a white flash above the scrim (peak 0.22)
  - camera punch +0.04
  - cards deal at 160, 230 and 300 ms with pitch-rising ticks
  - input unlocks at 450 ms (only pointerdowns that start after the unlock count)

  After the first 3 drafts: SFX, haptic `light` and the deal only, with a 300 ms lock. On pick, the card scales to 1.06, then `levelResume` plays.
- **Hurt.** A red edge vignette (`hurtFlash`: +0.3 per discrete hit, +0.28 per ram, capped at 0.6, decaying 2.2/s). A directional edge sprite on the side of the damage source. A ship tint flash. The full-screen red rect is removed.
- **Low HP** (below 25%, clears at 30%): one heartbeat clock with a 0.8 s period drives the HP pulse, the vignette and the `heartbeat` SFX. Music gets a 900 Hz lowpass.
- **Boss.** Intro, phase ROAR, FRENZY tint and kill, per A15, A16 and A17. The kill gets rings, 40 gibs (fx stream) and a bloom pulse when flashes are on.
- **Threat cues.** The charger windup lane decal (6 sprites, 253 x 2r, hazard tint, 8 Hz pulse). Off-screen arrows (8 sprites) with priority boss > elite > charger in windup > pod > bonus > core, plus a 3 s alert-direction arrow.
- **Hazards and cage.** The telegraph fill alpha ramps from 0.25 to 0.55 over `tele/teleMax`. A white flash on detonation. The cage ring is formed by a 1.5 s scale-in.
  - Markers (no damage of their own) take the boss color 15% toward white and ramp from 0.45 to 0.85 (0.45 while live), because a boss color sits close to its own world's floor and glow (P6b screenshots: violet lance lanes on the Depths floor, ember turret spots on the Wastes floor). A marker circle wider than 200 u (mothersCall) keeps the 0.25 to 0.55 ramp, so the cage-wide wash does not hide the swarm.
  - A burning sweep dims its sector to 0.2 and draws its flame line at 0.8. While the sweep warns, its flame line waits on the start edge on the marker ramp (0.45 to 0.85), so the side it sweeps from shows before it burns (P6b review: the direction flips every cast).
- **Kill pitch ladder:** `semis = min(12, 2 x (tier - 1))`.
- **Gem ladder:** each gem within 350 ms of the last steps up the ratios `[1, 9/8, 5/4, 3/2, 5/3, 2, 9/4, 5/2, 3, 10/3, 4]` over 659 Hz.

Built in P15:
- **Emerge** (decision 6, `src/render/emergeFx.ts`): every non-boss spawn whose body touches the view (24 u pad) gets a 0.45 s effect on sim time, from a 64-slot pool with per-effect variety from a hash of the uid (no sim stream). Hive: a violet membrane disc, an acid slit that opens, 4 shards. Depths: a glow disc and 5 bubbles rising. Wastes: a hot ring and 5 embers. The sim skips an enemy's bite until it is `ENEMY_EMERGE` (0.45 s) old.
- **Hit flash:** the struck enemy draws its `@white` silhouette at 1.12 scale while `flash > 0`.
- **Hurt** (`src/effects/screenFx.ts`): the red vignette uses the vignette ramp tinted #ff2d4a at `min(1, 1.1 x hurtFlash + low HP)`, where low HP adds 0.3 plus 0.4 x the heartbeat envelope (two thumps 0.14 s apart, each decaying at 10/s). A discrete hit or ram lights a red glow on the screen edge toward its source (0.9, bites 0.45, decaying 2.5/s) and tints the ship #ff6a6a for 0.12 s.
- **LIVING ARMOR:** a whole-hit absorb draws a cyan (#57e0ff) ring that grows from the ship over 0.3 s.
- **Boss kill:** 40 gibs (fx stream) and a second, white ring. The bloom pulse (P17) scales the bloom by up to x2.5 and fades at 2.5/s, only with the `flashes` setting on. FRENZY pulses the boss tint 5 to 55% toward #ff5a6e (sin 8t). The telegraph cue (the charger windup sound) is pitched per boss: Queen -7, Matron -2, Tyrant -12 semitones.
- **Hazards:** a damaging hazard flashes white for its first 0.08 s live. An event's arrival markers (BLINK STORM, not cast by the boss) take the event color #ff5a6e 15% toward white; boss markers keep the boss color.
- **Charger lanes:** a charger in windup shows its dash lane (dashSpeed x dashTime long, 2r wide) in the world's hazard tint, alpha 0.22 to 0.5 at 8 Hz; 6 pooled decals. Under FREEZE the lane holds at 0.22 (A5.3, W4 integration fix).
- **Off-screen arrows** (`src/ui/offscreenArrows.ts`): slot 0 is the 3 s alert arrow (boss #ff6aa8, event #ff5a6e, elite gold); the other 7 go to the boss, elites, chargers in windup, pods, bonuses and Hive Cores in that order. Arrows ride a band 26 px inside the safe screen edges (the left and right insets count, so a landscape arrow never sits under the notch), below the HUD rows and above the weapon pill, and step below the showing callout and above the DASH button. A target under an inset counts as off screen. A bonus arrow takes the bonus tint and a Hive Core arrow gold #ffc24a (W4 integration, after P9).
- **Pods:** the pod blinks at 6 Hz (alpha 0.3) through its last 3 s, and a 16-segment ring in the weapon tint fills with the hold.

---

## 7. Meta, persistence, Daily

### 7.1 Native storage (`src/platform/storage.ts`, rewrite; callers unchanged)

```ts
initStorage(): Promise<void>                       // awaited once at the top of boot(), before any loadJSON
loadJSON<T>(key: string, fallback: T): T           // sync, reads the in-memory Map
saveJSON(key: string, value: unknown): void        // sync Map write + write-through
removeKey(key: string): void
keysWithPrefix(prefix: string): string[]
flushStorage(): Promise<void>
```

- **Web:** hydrate the Map from localStorage and write through to it.
- **Native:**
  - Hydrate from `Preferences.keys()` and `Preferences.get`.
  - On the first native launch (no `storage:native` key), copy every `swarmgeddon:*` localStorage key into the Map and into Preferences, then set the marker. localStorage is never deleted.
  - Writes are chained per key.
- **Flush:** app `pause` and `visibilitychange` to hidden call `flushStorage()` after the Daily checkpoint write.
- **Errors:** every backend call is wrapped in try/catch.

### 7.2 RunResult v2 (`src/state/runResult.ts`)

```ts
export interface RunResult {
  v: 2; mode: 'endless' | 'daily'; ranked: boolean
  end: 'death' | 'quit' | 'clear' | 'stalemate' | 'interrupted'
  cleared: boolean; clearMs: number; overtimeSec: number; nextBeat: string | null
  date: string                    // UTC day at START
  dailyNumber: number; seed: number; character: string; arena: string; threat: number; paint: string
  time: number; kills: number; level: number; score: number; killPts: number; xpSum: number
  bossesSlain: number; bossesFlawless: number; elitesSlain: number
  bestChain: number; peakTier: number; hits: number; longestNoHit: number; damageTaken: number
  revivesUsed: number; podsEquipped: number; weapons: string[]
  dashes: number; closeCalls: number; fusions: string[]; evolutions: string[]
  perks: [string, number][]; killsByEnemy: Record<string, number>
  killer: string | null           // EnemyDef id, 'acid', 'hazard', or null
}
```

`persistence.ts` keeps only the world bests. `computeScore`, `recordRun`, `dailyCompletedToday` and `loadBest` are deleted.

### 7.3 Lifetime stats (key `stats`)

- The shape follows `LifetimeStats`: runs, seconds, kills, xp, damage, hits, elites, bosses, bossesFlawless, clears, dailyRanked, dailyPractice, bestChain, peakTier, longestNoHit, **closeCalls, fusionsTaken, evolutions**, perWorld, perPilot, killsByEnemy, perkPicks, weaponUses, firstRun, lastRun, importedV1.
- `WorldStats` has runs, seconds, kills, bosses, clears, bestTime and `maxThreatCleared` (-1 = none). `PilotStats` has runs, seconds, kills, bosses, clears, bestLevel and bestTime.
- Stats are written once per run and must stay under 8 KB after 100 runs.
- A run under 10 s does not add to `runs` and is not evaluated for run feats. It still adds seconds, kills and damage.

### 7.4 Feats, paints, pools, migration

- **Feats:** 48 in `src/content/feats.ts` (A12), evaluated in `endRun` (`src/state/feats.ts`). The state is `feats: { done: Record<id, date>, prog: Record<id, number> }`.
- **Unlocks:**
  - `unlocks` stays the single owned set, and `grant(id)` is the only writer.
  - Pilots and worlds use bare ids. Perks, weapons and paints use the prefixes `perk:`, `weapon:` and `paint:`.
  - An item is locked if and only if a feat rewards it.
  - `evaluateUnlocks`, `earned` and `earnDesc` are deleted.
  - `UnlockMeta = { how: 'default' | 'earn' | 'premium'; feat?: string; sku?: string }`.
- **Pools:** `resolvePools(mode)`:
  - Daily returns the canonical `PERKS` and `PICKUP_WEAPON_IDS`.
  - Standard filters the canonical order by ownership. The start pool is 21 perks and 6 weapons (A2, A4).
  - Pools resolve at run start. A grant mid-run never changes the current run.
- **Paints** (`src/content/paints.ts`, A13):
  - Presentation only. `player.paint()` takes the paint colors, and `baseBulletTint` changes only the base weapon's projectile tint.
  - `sel:paint` defaults to `factory`.
  - Dark paints get a 2 px minimum outline.
- **Migration** (`src/state/migrate.ts`, `meta:v < 2`):
  1. Read the legacy keys. Mark `veteran` if the save has any unlock or any time > 0.
  2. Seed `stats` from `best:world:*`, with `importedV1: true`.
  3. Retro-credit run feats from the legacy maxima: level to #2 and #4, max time to #21, Hive time to #10, max kills to #6, worlds with 300+ s through `perWorld.bestTime`.
  4. Map legacy unlocks: `ember` marks #4, `vesper` #9, `depths` #10, `wastes` #20.
  5. Veterans are granted every `perk:` and `weapon:` reward. Those feats stay open and show `Already yours` when completed.
  6. If `daily:last.date` is today, write `daily:<today>` with `rankedStarted: true` and `ranked.legacy = true`.
  7. Set `meta:v = 2` and show one toast: `Welcome to v2. Your records earned N feats. See RECORDS.`
  8. v1 `best:endless` and `best:daily` are read-only from then on (RECORDS legacy line `v1 best score: 5,234 (old formula)`).
- **Built in P12b:**
  - The legacy maxima read `best:endless` and `best:daily` (`{ score, time, kills, level }`) and every `best:world:<id>` of a known world (`{ time, kills }`). A malformed or missing value reads as 0.
  - Seeding merges: each world's `bestTime` becomes the larger of the stored and the legacy value, and nothing else in an existing `stats` changes. `importedV1` is set only for a veteran, so a fresh save still gets the first-launch screen.
  - After the seed, the total feats are evaluated against the seeded stats. So FIVE EVERYWHERE (#40) and WORLD TOUR (#15, a world with a best time counts as played) can be credited at migration.
  - The toast shows only when N >= 1. The v1 Daily record is `{ rankedStarted: true, ranked: { legacy: true } }`; P13 owns the full `DailyDayRecord`.
  - `main.startRun` resolves the pools after `World.beginRun`, which resets them to the canonical ones (the harness path). The PAIR tag of a draft card names a weapon only when this run's pods can drop it.
  - Acceptance: `node scripts/test-meta.mjs` (the saves, in Node) and `node scripts/probe-meta.mjs` (the real boot, drafts and pods in the DEV build). `node scripts/feats-pacing.mjs` is the S1 to S10 check.

### 7.5 Daily v2

```ts
export const DAILY_EPOCH = '<release day>'   // Daily #1 (owner sets in the release PR)
export const ROTATIONS = [{ from: DAILY_EPOCH, worlds: ['hive', 'depths', 'wastes'], pilots: ['nova', 'ember', 'vesper'] }]
export const DAILY_THREAT_CYCLE = [0, 0, 1, 0, 1, 0, 2] as const
export function dailySpec(date: string): DailySpec {
  // d = dayIndex(date); rot = last ROTATIONS entry with from <= date
  // { date, number: d + 1, seed: seedFromString('swarmgeddon:' + date),
  //   world: rot.worlds[mod(d, 3)], pilot: rot.pilots[mod(d + floor(d / 3), 3)],
  //   threat: DAILY_THREAT_CYCLE[mod(d, 7)] }
}
```

- **RunConfig.** `startRun` builds a `RunConfig` with mode, ranked, seed, date, dailyNumber, character, theme, threat, perkPool, weaponPool, paint and baseBulletTint.
  - Daily ignores locks and uses canonical pools.
  - `World.beginRun(cfg)` is the only entry point.
- **Ranked lifecycle:**
  - The first Daily start of a UTC day is ranked. `daily:<date>.rankedStarted` is written before the first sim step.
  - Every exit records the run, whether by death, pause QUIT, Android back, R or Escape. R and Escape open the pause sheet.
  - Later starts that day are PRACTICE: they never post, and they track `practiceBest`.
  - A confirm sheet appears before the ranked start.
  - A run belongs to its start date.
- **Checkpoint:**
  - `daily:ckpt` is written every 10 s of sim time, on app pause and on `visibilitychange`.
  - At boot, a leftover checkpoint becomes the ranked result with `end: 'interrupted'`, and a toast appears.
  - `endRun` deletes the checkpoint.
- **Records:**
  - `daily:<date>` (DailyDayRecord) is pruned after 14 days.
  - `daily:streak` gives a display-only `3 IN A ROW`.
  - `12 DAILIES PLAYED` never decreases.
  - No reward depends on the streak.
- **Card and countdown copy:** A15.
- **Built in P13:**
  - `DAILY_EPOCH` is `'2026-09-30'` in `src/core/rules.ts`, marked as the owner's release-day decision. The seed does not depend on it; the number, world, pilot and threat do.
  - `RunConfig` (in `src/game/world.ts`) is the only input of `World.beginRun(cfg)`, which stores it as `world.run`. `main.buildRunConfig(mode, date)` builds it: the Daily takes the date's spec (locks ignored, canonical pools), Standard the owned selection. The paint is the player's in both modes (cosmetic).
  - The Daily plays its date's seed even under the DEV `?seed=` override, and `__SWARM.startDaily(date)` starts any day's Daily for tests. `__SWARM.beginSeed(seed, over)` restarts the current config on a seed with the canonical pools (the harness path that called `beginRun(seed, 'endless')`).
  - `src/state/daily.ts` holds `DailyDayRecord` (`rankedStarted`, `ranked` as the post fields of the run, or `{ legacy: true }` from migration, `practiceBest`, `practiceRuns`), `daily:streak` (`last`, `run`, `played`), the 14-day prune (at boot) and the checkpoint. The checkpoint is a full RunResult written every 10 s of sim time from the render loop, on `visibilitychange` to hidden and on app `pause`, for the ranked run only. A leftover one becomes that day's ranked result at boot (stats, bests, feats, streak, post), with the A15 toast.
  - (P13 review) The page whose ranked run is live holds the Web Lock `swarmgeddon:ranked-run` from `startRun` to `endRun`, and the browser drops it with the page. Boot recovers a checkpoint only while no page on the origin holds that lock, so a second tab or window (a browser tab beside the installed PWA) never files a live run as interrupted and posts it. Without Web Locks (WebViews before iOS 15.4, which run one page) a leftover checkpoint always counts as lost. `node scripts/probe-lb.mjs ckpt` checks both cases.
  - The menu's Daily button reads `DAILY #12` while today's ranked attempt is open (it opens the ranked confirm sheet, `src/ui/confirmSheet.ts`) and `DAILY #12 PRACTICE` after it. A Daily retry goes through the same check, and R on a Daily shows the recap instead of a quick retry.
  - Parity: `measure.mjs det --mode=daily --date=2026-10-02` at 375x667 with a fresh save and factory paint, and at 667x375 with an unlocked save, the MAGMA paint and the extreme settings, give the same hash, score and draft-offer hash; so does `det-death` at 390x844 and 844x390 (its RunResult hash leaves out date, ranked and paint).
 (all prefixed `swarmgeddon:`)

| Key | Status |
|---|---|
| `settings` | unchanged; new fields spread over the defaults |
| `unlocks` | kept; also holds `perk:`, `weapon:`, `paint:` ids |
| `best:endless`, `best:daily`, `daily:last` | read by migration and RECORDS; no longer written |
| `best:world:<id>` | extended to `{ time, kills, score, chain, level, scoreDate }` |
| `sel:char`, `sel:arena`, `seenGemHint`, `seenTouchControls`, `player:name` | unchanged |
| `meta:v`, `stats`, `feats`, `sel:paint`, `threat`, `sel:threat`, `hints` | new |
| `daily:<date>`, `daily:streak`, `daily:ckpt` | new |
| `lb:optIn`, `lb:id`, `lb:asked`, `lb:sent` | new |
| `storage:native` | new, native only |

---

## 8. Leaderboard (server and client)

### 8.1 Client opt-in (`src/net/leaderboard.ts`)

**`submitRun()` makes no request when:**
- the leaderboard is disabled
- `lb:optIn !== true`
- it is a dev build without `VITE_LEADERBOARD_DEV_SUBMIT`

**Opt-in card** (inside the recap, never a modal):
- Shown after `stats.runs >= 2` and while `lb:asked < 3`.
- `CHOOSE A NAME`: the name prompt opens. SAVE sets `lb:optIn`, creates `lb:id` (16 random bytes, base64url, 22 chars), and posts the current run plus today's ranked Daily.
- `NO THANKS`: `lb:optIn = false` and a toast.

**What posts:**
- the ranked Daily, once
- a Standard run only when its score beats `lb:sent['endless:<world>:<week>']`
- never practice runs, and never runs under 10 s

### 8.2 Name prompt fix (`src/ui/namePrompt.ts`)

- The backdrop closes the prompt only when the pointerdown also started on the backdrop, and only 350 ms or more after open.
- Width `min(340px, calc(100vw - 32px))`, `box-sizing: border-box`, buttons at least 44 px tall.
- The card is anchored to the top third. `max-height` follows `visualViewport.height - 32`.
- Font JetBrains Mono. Copy is in A15.

### 8.3 Settings rows

- `POST SCORES` toggle.
- `NAME` with an EDIT button.
- `REMOVE MY SCORES` calls `DELETE /api/v2/player/<lb:id>`, then sets `lb:optIn = false`. It needs a confirmation step.

### 8.4 Server v2 (`server/src/index.ts`, `schema.sql`, `blocklist.ts`)

**Schema.** `DROP TABLE scores`, then create `runs` with:
- id, v, board, world, pilot, paint, threat
- player_id, name, score, time_ms, kills, level, xp_sum, kill_pts
- bosses, best_chain, hits, cleared, clear_ms
- seed, day, week, country, client, ts, ip_hash

Indexes: `(board, world, week, score DESC)`, `(board, world, score DESC)`, `(board, day, score DESC)`, `(ip_hash, ts)`, `(player_id, ts)`, and the unique `(player_id, day) WHERE board = 'daily'`.

**`POST /api/v2/run`**, processed in order:
1. **Parse.** Bad JSON returns 400. `v !== SIM_VERSION` returns 426 `update the game`.
2. **Player.** `player` must match `/^[A-Za-z0-9_-]{22}$/`.
3. **Name.** Sanitize, NFKC fold, then the blocklist with leet folding. A failing name becomes `PILOT` + the first 4 characters of the id, uppercased.
4. **`implausible(s)`** returns 422 `rejected` when any rule fails:
   - `world ∈ KNOWN_WORLDS`, `pilot ∈ KNOWN_PILOTS` (nova, ember, vesper), `0 <= threat <= 4`, all integers
   - `1_000 <= timeMs <= 3_600_000`
   - `kills <= 250 x timeMs / 1000 + 100`
   - `kills <= xpSum <= 30 x kills + 450 x bosses`
   - `killPts >= 0`. A larger killPts is not refused: it is clamped to `80 x xpSum` and stored clamped, as `scoreOf` does (P13 kept the A-LB behavior; an honest client never exceeds the clamp)
   - `0 <= closeCalls <= 7 x timeMs / 1000` (a Close Call pays at most once per dash, and a dash lasts 9 ticks)
   - `bestChain <= kills + CLOSE_CALL_CHAIN x closeCalls` (the chain grows by 1 per scored kill and by 15 per Close Call, so an honest run can have `bestChain > kills`). `closeCalls` is sent for this check and is not stored.
   - `hits <= 20 x timeMs / 1000 + 10`
   - `1 <= level <= 500`
   - `cleared` implies `CLEAR_MIN_MS <= clearMs <= timeMs`, and `bosses >= 1` (a mid boss alive at the PRIME beat ascends with no credit; section 5, clear bounds)
   - `!cleared` implies `clearMs = 0` and `timeMs <= UNCLEARED_MAX_MS` (865,000; section 5)
   - `bosses <= 3 + ceil(max(0, timeMs - clearMs) / 180_000)`
5. **Daily only:**
   - the day is today or yesterday UTC
   - seed, world, pilot and threat equal `dailySpec(day)`, else 400
   - `(player_id, day)` already present returns 409
   - daily runs require `timeMs <= clearMs + 3000` when cleared
6. **Score.** `score = scoreOf(killPts, xpSum, cleared ? clearMs : 0, threat)`. If it is 0 or less, return 400.
7. **Guarded insert.**
   - Limits: at most 8 per 10 min per IP hash, 40 per 24 h per player, 3 Daily rows per IP per day.
   - `changes === 0`: return 409 if it is a Daily duplicate, else 429.
   - `ip_hash` = the first 16 hex characters of `HMAC-SHA256(IP_SALT, ip + '|' + day)`.
8. **Ranks.** Standard returns the weekly and all-time rank. Daily returns the day rank.

**Other routes:**
- `GET /api/v2/board`:
  - Parameters: `board`, `world`, `period`, `day`, `limit`, `player`. Filtered by `v`.
  - One row per player (their best).
  - A `me` row with `pct`.
  - It never returns `player_id` or `ip_hash`.
- `DELETE /api/v2/player/:id` deletes every row for that id.
- v1 `/api/score` and `/api/leaderboard` return 410.
- **Retention**, on 1% of submits: delete Daily rows older than 45 days. Per world, delete Standard rows older than last week that are outside the all-time top 2000.

**Deploy (owner):**
1. `wrangler secret put IP_SALT`
2. `npm run db:migrate`
3. `npm run deploy`, in the same release as the clients.

**Built in P13:**
- Response shapes. `POST /api/v2/run` 200: `{ ok, score, name, renamed, ranks }` with `ranks.day` (Daily) or `ranks.week` and `ranks.all` (Standard), each `{ rank, of }`; a rank is where the score places among the other players' bests. `GET /api/v2/board`: `{ rows: [{ rank, name, country, pilot, paint, threat, score, timeMs, kills, level, cleared }], total, me: { rank, of, pct, score } | null }`.
- The client posts `v, player, name, mode, day, world, pilot, paint, threat, seed, timeMs, kills, level, xpSum, killPts, bosses, bestChain, hits, closeCalls, cleared, clearMs, client` (`closeCalls` feeds the chain rule and is not stored). `day` is the run's start day; the server files a Standard run under today and this ISO week.
- Without `IP_SALT` the worker answers 503 and stores nothing. A cleared Daily must end within 3 s of the clear. The board orders ties by the earlier post.
- The client makes at most one request per run and never retries. 404 or 410 (a server without the v2 routes) and 426 switch it off for the session; network errors, timeouts, 429 and 5xx show `Score not posted. Check your connection.`. A run that scored nothing never posts. Production builds post to the committed worker URL; `VITE_LEADERBOARD_URL` overrides it; dev builds post only with `VITE_LEADERBOARD_DEV_SUBMIT`.
- The name prompt closes from the backdrop only for a pointerdown that started there 350 ms or more after open, and it keeps the field focused through the mouse events a touch browser sends after the tap that opened it.
- Acceptance: `scripts/attack.mjs` (27 cases, every A-LB row), `scripts/test-rules.mjs` (400-date `dailySpec` parity with the worker), `scripts/probe-lb.mjs` (fresh save 0 requests over 5 runs, the prompt under touch emulation, the earliest clear, 404/410/426/abort/500 handling). How to run them: `server/README.md`.

### 8.5 Leaderboard screen

- Segments `DAILY`, `THIS WEEK`, `ALL TIME`. World chips (`HIVE`, `DEPTHS`, `WASTES`) under the two Standard views.
- Rows: rank chip, name + country, pilot glyph in the row's paint, TIME, KILLS (hidden below 360 px), SCORE, and a `T3` chip.
- A pinned `YOU #347 OF 2,118 · TOP 17%` row.
- A not-opted-in bar with a JOIN button.
- Row height at least 28 px, with scrolling. Layout in section 9.6.

### 8.6 Store and privacy copy (ships with v2; owner publishes)

`docs/store-listing.md` (EN):
- `DAILY CHALLENGE: one run per day with the same seed, world and pilot for every player on any device. Your first attempt is ranked. Practice as much as you like after it.`
- `Optional global leaderboard, off until you turn it on. When you opt in, your nickname, score, run stats, pilot, world and country appear on the public board.`
- `48 feats unlock pilots, worlds, weapons, perks and ship paints, all earned by playing.`
- App Review note: `The optional global leaderboard is off by default. After the player opts in with a nickname, a finished run submits the nickname, a random install id, run stats (score, time, kills, level), the pilot, the world and the country Cloudflare derives from the connection. Everything else stays on the device.`

ES (es-MX):
- `RETO DIARIO: una partida al día con la misma semilla, mundo y piloto para todos, en cualquier dispositivo. Tu primer intento cuenta para el ranking. Después practica cuanto quieras.`
- `Tabla global opcional, apagada hasta que la actives. Si la activas, tu apodo, puntaje, estadísticas de la partida, piloto, mundo y país aparecen en la tabla pública.`
- `48 logros desbloquean pilotos, mundos, armas, mejoras y pinturas para tu nave, todo ganado jugando.`

`public/privacy.html`, section "The optional global leaderboard":
- `The leaderboard is off until you turn it on in the game. When you opt in and finish a run, the game sends: the nickname you chose, a random id created on your device when you opted in (it identifies the device's entries, not you), your score and run stats (time, kills, level, multiplier chain, hits, close calls), the pilot, the world, your ship paint, and the day. Our host derives your country from the connection; we store only the country code. Your IP address is not stored; we keep a salted, daily-changing hash of it for rate limiting. You can remove every entry from Settings with REMOVE MY SCORES.`
- Short version: `The only data that can ever leave your device is an optional leaderboard entry, sent only after you opt in.`
- Update "Last updated".

App Store privacy answers to re-check: Name, Gameplay Content, User ID. All are "not linked to you" and used for App Functionality.

---

## 9. UI system and screens

### 9.1 Design system

- **Tokens:** `src/ui/tokens.ts` (A18). `hudDim #3a5a52` is decor only and never used for text. `ensureContrast(fg, bg, 4.5)` handles dynamic colors. Accent fills always take `#05070d` ink.
- **Fonts:** Orbitron 700 and 900 (display) and JetBrains Mono 500 and 800 (body and numbers).
  - Static instances, subset to `U+0020-007E, U+00B7, U+2192`, as woff2 in `src/assets/fonts/`, with the OFL texts beside them.
  - At most 16 KB per file and 64 KB in total. The build fails above 90 KB.
  - `src/render/fonts.ts` `loadFonts()` runs at boot, before any `Text`, with a 2500 ms race timeout.
- **Type scale:**
  - display.xl 40, display.l 26 to 28, display.m 18 to 20, display.s 13 to 16
  - body 14/20
  - label 12 in caps (the minimum)
  - num.xl 44, num.m 18, num.s 13
- **`uiScale`:** `clamp(min(W,H) / 375, 1, 1.4)`.
- **Spacing:** 4, 8, 12, 16, 24, 32. Side gutters 16 on phones. Radii: chip 6, button, card and plate 12.
- **Targets:** primary 56, secondary 48, compact 44. The hit area extends 6 px past the visual.
- **Motion** (`src/ui/tween.ts`, a 96-slot typed pool on the real clock):
  - enter 220 ms, exit 130 ms, press 60/100 ms at scale 0.96, count-up 600 ms, stamp 140 ms with ease-out-back
  - reduce motion: fades only, 120 ms
- **Components:** `Button` (primary, secondary, danger, ghost), `Toggle`, `Segmented`, `Slider` (44 px hit band), `Plate` (NineSlice), `DigitStrip` (`src/ui/digits.ts`), and baked icons (`src/ui/icons.ts`, 18 icons) that replace every emoji and dingbat.
- **Perk glyphs:** 20, mapped in A2.

### 9.2 HUD (`src/ui/hud.ts` rewrite)

Portrait 375x667 (L/T/R/B = safe insets):

| Element | x | y | w x h | Content |
|---|---|---|---|---|
| Plate | L+8 | T+8 | (W-16-L-R) x 66 | plate token, r12 |
| Pause | L+12 | T+12 | 44 x 44 | pause icon, hit 48 |
| Level chip | L+64 | T+13 | 50 x 20 | `LV 7`, 12 px, ink #05070d on accent.xp |
| HP bar | L+120 | T+14 | (W-198) x 18 | fill by state; 13 px DigitStrip inside |
| XP bar | L+64 | T+40 | (W-170) x 6 | accent.xp; SURGE shows a gold edge |
| Timeline | L+64 | T+54 | (W-170) x 4 | 0 to 12:00 from `script.markers`: boss diamonds 8 px #ff3a8a, event ticks, PRIME flag gold, now tick |
| Time | right edge W-R-16 | T+12 | 22 high | DigitStrip 18 px `12:34` |
| Score | right edge W-R-16 | T+38 | 16 high | DigitStrip 13 px text.primary, grouped |
| Daily tag | right edge | T+56 | 12 px | `DAILY #12` (Daily only) |
| Pending chip | L+8 | T+80 | auto x 24 | `LEVEL UP x2` gold (only while pending) |
| Boss plate | L+8 | T+80 (T+108 with chip) | (W-16) x 34 | name from the script in `ensureContrast`; `%`; bar with phase notches; `FRENZY` tag |
| Tier badge | W-R-100 | under the boss plate or T+80 | 84 x 40 | `x5` Orbitron 900 20 in the tier color + 3 px chain bar; shown when tier >= 2; flashes #ff6a6a with `x6 > x5` on a hit drop |
| Bonus rings | L+8 | under the stack | 28 each | timer rings for FREEZE, OVERDRIVE, SHIELD |
| Weapon pill | centered | H-B-48 | min 140 x 36 | weapon name + ammo DigitStrip + 3 px bar in the weapon tint |
| DASH button | center (W-R-58, H-B-200) | | visual 64, hit radius 44 | charge pips + recharge sweep |

Landscape 667x375:
- Plate at L+8, y 6, `min(W-L-R-16, 640) x 52`.
- HP bar at `0.40 x plateW`. XP bar and timeline at y 38 and 48, w 316.
- Time and score at the right plate edge -12, y 10 and 34.
- Boss plate centered at y 62, `min(420, plateW) x 34`. Tier badge right at y 62.
- Weapon pill at H-B-44.
- DASH center `(W-R-64, H-B-150)`.

**Rules:**
- **Input exclusion:** `input.setExclusionRects` holds the pause button + 8 and the DASH hit circle + 8. A touch that starts inside never spawns a stick.
- **Numbers:** they update only when the integer value changes. No template strings per frame.
- **Touch hint:** `LEFT THUMB MOVES · RIGHT THUMB AIMS AND FIRES`, wrapped at `min(W-32, 340)`.

**Built in P15** (where it differs from the table above, or the table is silent):
- The HUD is laid out in 375-wide design units and scaled by `uiScale`.
- **Row A** (portrait T+80, 40 high; landscape the plate bottom + 4) holds the `LEVEL UP x2` chip at the left and the tier badge at the right. In portrait the **boss plate** sits at T+124 whenever a boss lives, so no row moves when a neighbor shows or hides; the top stack ends at T+158 in a fight, as in the table's chip-plus-badge case. In landscape the boss plate is centered on the plate, `min(420, plateW - 244)` wide, so it clears the chip and the badge.
- **Callout lane** center: portrait `max(T + 158 + 48, 0.30H)` (below the lowest HUD row); landscape `0.36H`, or lower so the title's top stays 4 px under the boss plate. Landscape screens under 360 px tall draw the callout at 0.86 (the 14 px sub stays at 12 px).
- **HP bar:** the overshield is a cyan (#57e0ff) strip along the bar's bottom, as wide as `overshield / maxHp`, and the number reads `62+18`. Below 25% HP the heartbeat clock pulses the fill.
- **Tier badge:** one Orbitron 900 20 px Text per tier, created once and shown by tier (no Text re-render on a tier change). The hit-drop flash shows `x6 > x5` as DigitStrips around a chevron icon for 0.9 s.
- **Weapon pill:** the base weapon shows its name only (no ammo number or bar).
- **Pause button:** until the pause sheet (P16), a tap on it or P pauses, `PAUSED / TAP OR PRESS P TO RESUME` shows in the callout lane, and a tap on it or elsewhere, or P, resumes. The stage is `eventMode 'static'`, so Pixi hit-tests every node under it, and a drawn node that contains the tap ends the search even when it takes no input. So every node in the UI layer above the HUD that takes no input (the level-up flash, the crosshair, the callout lane, the toast, the debug overlay) is `eventMode 'none'` (P15 review: the full-screen level-up flash swallowed every tap on the pause button).
- **Touch hint:** the banner sits 20 px below row A in portrait and 28 px below the plate in landscape; the guides rise until their labels keep 16 px above the weapon pill. It hides while the sim is paused.
- **Bonus rings** (W4 integration, after P9): one 28 px ring per running FREEZE, OVERDRIVE or SHIELD, 16 segments lit for the time left and its whole seconds as a 12 px DigitStrip, both in the bonus tint on an INK disc at 0.6. Running rings pack left to right in that order, 6 px apart. Portrait puts them in row A from `L + 8 + 110 + 8` (right of the widest LEVEL UP chip), closing the gaps on narrow phones so the last ring keeps 6 px from the tier badge (2 px gaps at 320 wide); landscape, whose row A holds the boss plate, puts them 4 px under row A at L+8. While a ring shows, the top stack (off-screen arrows, elite tags) ends below it.
- **Daily tag:** `DAILY #12` from the run config (W4 integration, after P13); the dailyIntro callout title reads the same, and its sub marks a practice run (A15).

### 9.3 Level-up draft (`src/ui/levelupModal.ts` rewrite; consumes `DraftCard`)

Portrait:
- Scrim 0.88.
- `LEVEL UP` 26 px #57c8ff at T+72, and `LV 7` at T+100.
- Cards at x 16, w W-32, **h 128**, gap 12, starting at T+128.

Card anatomy:

| Element | Position | Spec |
|---|---|---|
| Rarity stripe | left edge | 6 px |
| Border | outline | 2 px in the rarity color (common uses line.strong), plus a 4 px halo at 0.25 for rare and above |
| Icon tile | (18, 16) | 40 x 40 with a 24 px glyph |
| Name | (70, 14) | Orbitron 700 16 |
| Rarity label | right, (w-12, 16) | 12 px |
| Stack and family chip | (70, 38) | `LV 2 → 3` or a gold `NEW` chip, then the family chip (fill = family color, ink #05070d, 12 px) |
| Stat line | (70, 58) | 13 px text.hi: `fire rate x1.28 → x1.42` |
| Tag line | (70, 78) | 12 px gold, one of: `EVOLVES RAIL SPIKE AT THE NEXT HIVE CORE`, `+ CRYO ROUNDS = SHATTER`, `PAIR: RAIL SPIKE` |
| Desc | (70, 96) if tagged, else (70, 78) | 13 px #bfeee0; 1 line if tagged, 2 if not |

- Controls row at T+548: `REROLL (2)`, `BANISH (1)`, `SKIP`, each 109 x 48, gap 8.
- Banish mode draws red card outlines and shows `Tap a card to banish`.
- The hint `Tap a card to choose` (touch) or `Click a card or press 1, 2, 3` (kbm) shows for the first 3 drafts per install.
- Overflow: cards shrink to 112, then 96, dropping the desc to 1 line and then 0 lines.

Landscape:
- Title at T+22.
- 3 cards of `(min(W-L-R-32, 760) - 24) / 3` x `min(210, H-T-B-132)` at T+60.
- Vertical anatomy: icon 48 at the top center, name, stack and chip, stat line, tag, desc with up to 3 lines.
- Controls 3 x 140 x 48 centered below.

### 9.4 Pause sheet and lifecycle (`src/ui/pauseSheet.ts`, `src/platform/lifecycle.ts`)

- **Triggers:** the pause button, Esc, P, Android back, `visibilitychange` to hidden, and Capacitor `pause` / `appStateChange(false)`. Nothing opens while a draft, core reveal or win panel is up.
- **Behavior:**
  - `time.paused = true`, `pauseIn` SFX, music lowpass 600 Hz.
  - RESUME runs a `3 2 1` countdown (450 ms each). Input is enabled at the start of the countdown.
- **Content:**
  - `PAUSED`
  - a run line, `HIVE MEADOW · NOVA · T1 · 4:12 · 1,287 KILLS`
  - a labeled timeline: `BOSS 4:00`, `BOSS 7:30`, `PRIME 10:30`
  - a build grid of 32 px glyph tiles, 8 per row, at most 3 rows
  - Daily runs add a `RANKED` or `PRACTICE` label
- **Buttons:** `RESUME` 56, `SETTINGS` 48, `QUIT AND SCORE` (danger) 48. QUIT needs an inline confirm (`TAP AGAIN TO END RUN`, 3 s), then `endRun('quit')`.
- **Landscape:** two columns, 55% info and 45% buttons.

### 9.5 Win panel (`src/ui/winPanel.ts`, Standard only)

- Scrim.
- Title: the script win text, for example `HIVE PURGED`, Orbitron 900 28 gold.
- Sub: `CLEARED IN 11:02`.
- Body: `Extract to bank the win, or push into Overtime for more score.`
- Buttons:
  - `EXTRACT` primary 56 gives `endRun('clear')`.
  - `OVERTIME` secondary 48 calls `startOvertime()`, which opens the PRIME core reveal, then `levelResume`.
- No timer. Input lock 450 ms.
- Keys (W2): Enter is EXTRACT and O is OVERTIME, after the same 450 ms lock. When the last input was keyboard and mouse, the line `Press Enter to extract or O for Overtime` (13 px, text.muted) shows under the buttons.
- Gamepad: no screen reads the pad yet (only gameplay polls it), so the draft's pad keys (section 4.4) are not built either. P16 adds pad input to the draft, the WIN panel and the recap.

### 9.6 Recap (`src/ui/recap.ts` replaces `gameOver.ts`, which is deleted)

`RecapModel` is built in `endRun`. Portrait, content column x 16 to W-16:

| y | Element |
|---|---|
| T+24 | Header: `OVERRUN` #ff5a6e (death), the win text in gold (cleared), `RUN ENDED` (quit), or `THE QUEEN ESCAPED` (stalemate) |
| T+60 | Sub, 12 px muted: `STANDARD · HIVE MEADOW · NOVA · T1 · LV 18`, or `DAILY #12 · RANKED` |
| T+80 | Near-miss line, death only: `Died at 9:40. Next was: FINAL SWARM` (from `nextBeat`) |
| T+100 | `SCORE`, then DigitStrip 44 with a 600 ms count-up; delta chip `+12,400 OVER BEST` gold or `12,400 TO BEST` muted; none for a ranked Daily |
| T+112 | `NEW BEST` stamp, rotated -6 degrees |
| T+180 | Tiles, 3 x 109 x 64: `TIME 4:31` (sub `+0:23 vs best` / `0:41 short` / `NEW BEST`), `KILLS 1,287`, `PEAK x6` (sub `chain 842`) |
| T+256 | `Killed by CINDER CHARGER`, or `Killed by acid`; `Bosses slain: THE QUEEN x2` |
| T+290 | Build strip: 28 px glyph tiles with stack digits, at most 2 rows; weapons line |
| T+356 | Rank line (async), then the unlock card (`UNLOCKED`, up to 3 rows, `+2 more in RECORDS`), then `NEXT UP` goals (2 to 3), then the opt-in card |
| H-B-132 | Primary, full width 56: `RETRY`, `PRACTICE` or `PRACTICE AGAIN` |
| H-B-64 | `MENU`, `SHARE`, `LEADERS`, 109 x 48 each |

- **Overflow order:** drop the build strip, then cut the goals to 1, then shrink the tiles to 56.
- **Landscape:** two columns. The left holds the header (top-anchored), score, tiles and killer. The right holds rank, unlocks, goals and buttons.
- **Timing:** enter 220 ms after the death sequence. Buttons accept input after 450 ms.
- **RETRY** keeps pilot, world, threat and paint, uses a new seed, and skips the title card. Target: death to control in 1.6 s or less.
- **Goals** (`nearestGoals`): only unfinished feats this run advanced. A run feat must be at 50% or more. At most one total feat, and include the best content reward when one exists.

### 9.7 Main menu (`src/ui/mainMenu.ts` rewrite; `carousel.ts`, `dailyCard.ts`, `goalsPanel.ts` new)

**First launch** (`stats.runs === 0 && !importedV1`):
- The title over the live arena, plus one full-screen `TAP TO PLAY` (touch) or `CLICK OR PRESS ENTER TO PLAY`.
- It starts Standard, HIVE, NOVA, factory paint, T0.

**Portrait layout:**

| y | Element |
|---|---|
| T+24 | Title display.xl, fitted to W-32 |
| | Tagline `hold the line · drown the hive in ichor` |
| 100-170 | Hero ship via `heroOffset` |
| 176-268 | Pilot carousel: arrows 44, card 240 x 92, lock bar with feat desc and progress |
| 276-332 | World carousel: card 240 x 56, plus a THREAT segmented row `T0 T1 T2` showing unlocked levels, with the name and rule underneath (only when `threat[w] >= 1`) |
| 344-404 | `PLAY` primary, 311 x 60. Disabled `LOCKED` when the shown item is locked |
| 416-488 | Daily card 343 x 72 |
| 498-582 | `NEXT GOALS`: 2 rows |
| H-B-64 | `SETTINGS`, `RECORDS`, `LEADERS`: 109 x 48 each |

**Progressive disclosure:**
- The Daily card and RECORDS appear after the first counted run.
- A selector appears only when the player owns 2 or more options of that type.
- On menu entry, a locked saved selection resets to the default.

**Landscape:** two columns.
- Left: title, pilot card, world card, PLAY.
- Right: Daily card, goals (3 rows), bottom row.
- The hero ship sits at (0.75W, 0.62H).

### 9.8 Settings (`src/ui/settingsPanel.ts` rewrite)

- Opaque panel, with an X button (44) at the top right. Esc and Android back also close it.
- Tabs `AUDIO | VISUALS | CONTROLS | ACCOUNT`, each 44 high.

| Tab | Rows |
|---|---|
| AUDIO | Master, SFX, Music |
| VISUALS | Screen Shake, Ichor, Glow, Damage Numbers `ALL / BIG HITS / OFF`, Flashes, Reduce Motion |
| CONTROLS | Auto-fire, Haptics, the line `Keyboard: WASD move, mouse aim, Space dash, Esc pause`, `SHOW TIPS AGAIN` (clears `hints`, `seenTouchControls`, `seenGemHint`) |
| ACCOUNT | POST SCORES, NAME, REMOVE MY SCORES |

- Row heights: sliders 56, toggles 52, segmented 74.
- Values show relative to the default (`100%`).
- Landscape: two content columns, no BACK button.
- Opened from pause, Settings returns to pause.
- `Settings` adds `damageNumbers: 'all' | 'big' | 'off'` (default `big`), `flashes` (default true) and `reduceMotion` (default from `prefers-reduced-motion`).
- Flash limiter: at most 3 full-screen flash starts per second.

### 9.9 RECORDS (`src/ui/records.ts`)

**FEATS tab:**
- Header `FEATS 23 / 48`.
- Category groups.
- Rows: name, desc, progress text, bar, reward, and the done date.
- Rewards are never hidden.

**RECORDS tab:**
- 3 world cards: best time, most kills, best score, best chain, runs, clears, highest threat cleared.
- Pilot rows.
- Career block.
- The legacy v1 line.

### 9.10 Hints (`src/ui/hints.ts`, key `hints`)

| id | Trigger | Copy |
|---|---|---|
| `controls_kbm` | first 2 kbm runs | `WASD MOVE · MOUSE AIM · HOLD CLICK TO FIRE · SPACE DASH · ESC PAUSE` |
| `dash` | first touch run, 8 s in | `Tap DASH to dodge through danger` |
| `gem` (existing key) | first gem | `COLLECT FOR XP` |
| `draft` | first 2 drafts, as the modal subtitle | `Pick one. Perks last the whole run.` |
| `pod` | first PodSpawn | `HOLD STILL ON A POD TO TAKE IT. LIMITED AMMO.` (NOVA: `WALK OVER A POD TO TAKE IT. LIMITED AMMO.`) |
| `elite` | first EliteSpawn | `ELITE INCOMING. ELITES DROP CORE SHARDS.` |
| `boss` | first BossSpawn | `BOSS FIGHT. THE CAGE HOLDS THE SWARM OUT.` |
| `mult` | first tier x2 | `MULTIPLIER x2. KEEP KILLING. HITS HALVE IT.` |
| `mult_hit` | first tier drop from a hit | `HIT. MULTIPLIER HALVED.` |
| `closecall` | first Close Call | `CLOSE CALL. DASH THROUGH DANGER TO RECHARGE FASTER.` |
| `daily` | first Daily card view | `Same seed, world and pilot for everyone today. Your first run counts.` |
| `feats` | first recap with an unlock | `Feats unlock pilots, worlds, weapons and paints. See RECORDS.` |
| `pause` | first touch run, 20 s in | chip beside the pause button: `Pause` |

- Hints are screen-space banners: one at a time, a queue of 2, never during a draft or a boss intro, 3.5 s each.
- Hints never touch the sim.

---

## 10. Build plan

### 10.1 Standard acceptance for every phase

Run each phase's acceptance plus this standard block:

1. **Determinism.**
   - `node scripts/measure.mjs 375 667 det`, `node scripts/measure.mjs 667 375 det` and `node scripts/measure.mjs 375 667 det` again (rerun) give three identical hashes for hive, depths and wastes.
   - From Phase 4 on, also `det-long`.
   - From Phase 10 on, also `det-death`: real HP, the det bot until death or 600 s, one hash over the RunResult (all fields but the date) and the 7 streams, so the damage, death and `endRun` paths are hashed too.
   - From Phase 2 on, also with the settings injection `{"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}`.
   - From Phase 13 on, also Daily mode with a fresh save and a fully unlocked save.
2. **Perf.**
   - `node scripts/measure.mjs 390 844 perf` run alone. Never run perf while a workflow, a harness batch or another heavy process is active.
   - Pass: 60 fps, 0 frames over 20 ms. From Phase 4 on, also `perf-final` with p95 of 16.7 ms or less and 0 frames over 33.4 ms.
3. **Screens.**
   - `scripts/ui-shots.mjs` at 375x667 and 667x375 (if missing, port it from the audit's ui-phone lane in Phase 1).
   - No overlap, no clipped text, text at least 12 px, targets at least 44 pt.
4. **Checks.** `npm run build` (includes `check:sim` from Phase 2 on), and `grep -rn $'\u2014' src docs public` is empty.
5. **Playable.** The game runs end to end, and the phase leaves nothing broken.

### 10.2 Parallel tracks and shared-file protocol

- **Shared files:** `src/game/world.ts`, `src/main.ts`, `src/config.ts`.
- **Field blocks.** Each phase adds its `World` fields in one block headed `// P<n>: <name>`.
- **Config blocks.** Each phase appends one `config.ts` block.
- **`stepSim`.** Phases insert only at their slot in the order from section 4.1. From PB on, the systems are in `runSystems` (`src/game/step.ts`), not in `main.ts`.
- **Rebase.** Phases in the same wave rebase on each other in phase-number order.

| Wave | Phases (parallel inside a wave) | Blocking dependency |
|---|---|---|
| 0 | P1, then P2 | none |
| 1 | P3 (damage + dash), P4 (director), P14 (UI foundation), P18 (audio + haptics), P12a (native storage) | P2 |
| 2 | P5 (draft/perks/XP), P6a (hazards + boss framework + Queen), P10 (score + RunResult + stats) | P3 → P5, P10; P4 → P6a |
| 3 | P6b (Matron + Tyrant + signatures), P7 (events + affixes), P8 (fusions/evolutions/pods), P12b (feats/paints/pools/migration) | P6a → P6b, P7; P5 → P8; P10 + P12a → P12b |
| 4 | P9 (cores/bonuses/pilots), P11 (threat + overtime), P13 (Daily + server + LB client), P15 (HUD + callouts + arrows) | P6a + P8 → P9; P6b + P7 → P11; P10 + P12b + P11 → P13; P14 + P6a + P10 → P15 |
| 5 | P16 (draft UI, pause, win panel, recap), P17 (menu, settings, leaderboard, records, hints) | P15 + P5 + P12b → P16; P14 + P13 → P17 |
| 6 | P19 (tuning), then P20 (release audit) | all |

### 10.3 Phases

**P1: Foundation, determinism and correctness** (about 750 lines)
- Goal: move the Daily stream once, make the sim pure of saves and viewport, and fix correctness bugs.
- Files:
  - `src/core/rng.ts`, `src/core/rules.ts` (new, only `SIM_VERSION`)
  - `src/game/world.ts`, `game/projectile.ts`, `game/enemy.ts`
  - `src/systems/spawn.ts`, `ai.ts`, `collision.ts`, `weapons.ts`, `projectiles.ts`, `pickups.ts`, `acid.ts`
  - `src/effects/fx.ts`, ichor stamp call sites
  - `src/content/arenas.ts` (boss slain name), `src/main.ts`
  - `scripts/measure.mjs`, `scripts/playtest/**` (commit; the folder is untracked now), `scripts/ui-shots.mjs`
- Tasks:
  1. Add `hash32`, `SALT`, `RunRngs` and `Rng.reseed`. Replace `world.rng` with `world.rngs` and route every call site per the table in section 3.1. Delete `world.rng`.
  2. Move every cosmetic draw to `rngs.fx`: fx emitters, ichor, `animPhase` (after the grep check), pickup phase, and the damage-number `Math.random`.
  3. Fix the particle tint: `begin(p, x, y, tint)`.
  4. Remove the sim's save I/O: `world.ts:196` `loadJSON` and `pickups.ts:44` `saveJSON`. Presentation now reads `seenGemHint` and watches `GemCollect`, so the Phase 1 stub is a `world.firstGemAt` counter that `main.ts` reads.
  5. Remove the `camX/viewW` read in `collision.ts:219-223`. The sim no longer gates hit-stop, and `main.ts` decides from the kill position.
  6. Move the Phase Step dodge roll to `rngs.combat` (P3 deletes it).
  7. Add projectile hit memory (`hitUids`, `hitN`, `Enemy.uid`).
  8. Add chain uniqueness (`world.chainSeen`).
  9. Rocket AoE: `x damageMul`. AoE and chain hops: `x eliteDamageMul` and inherit the crit.
  10. Acid applies `1 - damageReduction`.
  11. Add `openDraft()` as the single path, the empty-draft guard, and draft cards cached per open (no `draftPerks()` call from the render loop).
  12. Add the pickup kind reservation (A6) and prewarm projectiles to 512 and pickups to 256.
  13. Replace `QUEEN SLAIN` with the per-arena slain text (`arenas.ts`: QUEEN SLAIN, MATRON SLAIN, TYRANT SLAIN).
  14. `measure.mjs det`: add view arguments, the settings-injection argument, and the hash of all 7 stream states. Commit `scripts/playtest/`.
- Acceptance:
  - Standard block.
  - Sidearm with Piercing 4 hits a stationary queen once per bullet (it was 5), and Vortex hits it once (it was 13).
  - A chain on 2 isolated enemies deals at most 2 hops.
  - A forced exhaustion test (every perk maxed, 6 level-ups) shows no freeze.
  - Det hashes match with the extreme settings injected.

**P2: Presentation boundary and time** (about 800 lines)
- Files:
  - `src/effects/feelQueue.ts`, `feelDirector.ts` (skeleton), `timeDirector.ts`, `shake.ts` (new); delete `juice.ts`
  - `src/core/time.ts`
  - `src/game/world.ts`
  - every sim emit site from section 6.1
  - `src/main.ts`
  - `scripts/check-sim-purity.mjs`, `package.json`
- Tasks:
  1. FeelQueue plus the RunAlert ring.
  2. Migrate every `audio.play`, `addTrauma`, `announce`, `hurtFlash` and `spawnDamageNumber` in the sim to `emit`.
  3. Move the existing feedback into a minimal `FeelDirector` drain (same sounds, same flash) so nothing is lost.
  4. `GameLoop.timeScale`, TimeDirector with hit-stop presets, and the death sequence (sim runs AI only, `time` frozen).
  5. Shake rebuild with the A16.3 table. `WeaponDef.shake` becomes `kickPx`.
  6. Add `check:sim` and chain it into `build` and `build:cap`.
- Acceptance:
  - Standard block.
  - `check:sim` passes.
  - Contact with 5 enemies never raises trauma above 0.30.
  - Shake at 60 Hz and 120 Hz has the same visual frequency.
  - The death-to-recap skip works after 300 ms.

**P3: Damage model and dash** (about 700 lines)
- Files:
  - `src/systems/damage.ts`, `dash.ts` (new)
  - `src/game/player.ts`, `systems/collision.ts` (contact and player-hit sections only), `acid.ts`
  - `src/input/input.ts`, `input/touchControls.ts`
  - `config.ts` (DASH, damage block), `world.ts`, `main.ts`
- Tasks:
  1. `hurtPlayer` and all call sites.
  2. Bite pass with the per-bite cap.
  3. `invuln`, `hitCd`, `biteCd`; `resumeFromDraft()`; revive grace.
  4. Delete `Modifiers.dodge` and its roll.
  5. `dashSystem`, the dash override in `Player.update`, end-lag, buffer and charges.
  6. Close Call detection and the counters.
  7. Input: `consumeDashPress`, the touch DASH region with aim exclusion and fire latch, keys and gamepad.
  8. A placeholder DASH button (P15 does the final art).
  9. Harness: `resumeFromDraft`, the `dash` policy, and a scripted det track with dashes at ticks 60, 200, 330 and 331.
- Acceptance:
  - Standard block with the scripted dash track.
  - A dash covers 170 ±1 u in 9 ticks, with no damage in ticks 0 to 11.
  - The buffer fires within 0.15 s.
  - Close Call fires once per dash for each trigger type and never on grace i-frames.
  - A10 death readability: median at least 3.0 s, minimum at least 1.2 s on the current director.

**P4: Director core** (about 850 lines)
- Files:
  - `src/content/runScripts.ts`, `systems/director.ts` (new); delete `content/waveDirector.ts`
  - `src/systems/spawn.ts`, `systems/ai.ts` (speed ceiling), `content/enemies.ts` (`displayName`)
  - `world.ts`, `main.ts`, `config.ts`
  - `scripts/measure.mjs` (`det-long`, `perf-final`, `jumpTo`), `scripts/playtest/*` (the §17 harness changes of run arc: alerts log, chunk metrics, config grammar `mode:seed:minutes[:char[:perkPolicy[:threat[:ot]]]]`)
- Tasks:
  1. `WorldScript` and `MinuteRow` types, the 3 world scripts with rows and beats (A7), `resolveScript`, `markers`, `nextBeatLabel`.
  2. `Director` and its tick (section 4.1): packs, lulls, top-up, pulses, `RING_NEAR/STD`, deferral.
  3. Stat ramps and `dmgMul`. Speed ceiling at 240.
  4. Elites without affixes at their beats.
  5. Bosses spawned by beats 300 u from the player, using the old behavior, with `BOSS_MIN_GAP` and no cage yet.
  6. Alerts through the RunAlert ring.
  7. `row.xpScale` on gem value.
- Acceptance:
  - Standard block, plus `det-long` and `perf-final`.
  - A1 opening: first enemy in view within 1.0 s, first kill within 2.5 s, empty view 2.0 s or less in the first 60 s, at both viewports.
  - A3 beat fidelity and alive bounds.
  - A11: no enemy over 240 u/s outside the exempt cases.

**P5: Draft, perks, XP flow** (about 900 lines)
- Files:
  - `src/content/perks.ts` (rewrite), `systems/draft.ts` (new)
  - `src/systems/pickups.ts` (no expiry, bank gem, homing, VACUUM hook)
  - `src/ui/levelupModal.ts` (data only: shows `DraftCard` text with the existing visuals)
  - `world.ts` (`xpForLevel`, `DraftState`), `main.ts` (gap rule, pending count)
- Tasks:
  1. 31 perks with `stat()` (A2) and the new `Modifiers`.
  2. `rollDraft`, keystone draft, reroll, banish, skip, fallbacks.
  3. XP curve, SURGE, 12 s gap.
  4. Gems never expire; bank gem; homing.
  5. Harness policies `first`, `priority`, `random`, `evolve`.
- Acceptance:
  - Standard block.
  - 10,000 harness drafts: no duplicates, never empty, the keystone draft includes the pilot family.
  - A run with 2 rerolls and a run with 0 rerolls, with the same forced picks, have identical `spawn` and `loot` states at 180 s.
  - The roam bot collects at least 90% of dropped XP.
  - First draft at 6 to 12 s.

**P6a: Hazards, cage, boss framework, QUEEN** (about 900 lines)
- Files:
  - `src/game/hazard.ts`, `systems/hazards.ts`, `systems/bossAI.ts`, `content/bosses.ts`, `render/hazardRenderer.ts` (new)
  - `render/textures.ts`, `content/enemies.ts` (`'boss'` behavior, `queenPrime`, `egg`)
  - `systems/ai.ts` (dispatch, egg, fence, no fire outside the cage), `systems/director.ts` (cage, frenzy, stalemate, win, purge)
  - `world.ts`, `main.ts` (`pendingWin`/`pendingEnd`, `pauseReason 'win'`, stub win panel = two buttons)
- Tasks:
  1. Hazard pool and tests.
  2. Arrival sequence and cage.
  3. Boss state machine with phases, ROAR and cadence.
  4. The QUEEN kit (A10): sporeNova, royalLunge, eggClutch, mothersCall.
  5. HP formula.
  6. FRENZY, STALEMATE, win, purge, and the ascend rule.
  7. Boss XP changes (A10.1).
- Acceptance:
  - Standard block.
  - A5: boss spawns 250 to 340 u from the player, and the cage is active the same tick.
  - A6 on Hive: mid1 median fight 20 to 40 s, final 40 to 75 s, kill-to-next-arrival at least 20 s (on the boss-focus bot; A6 note in section 11).
  - A Hive smart+P bot can reach the win screen.

**P6b: VOID MATRON and EMBER TYRANT kits, signatures** (about 600 lines)
- Files: `src/systems/bossAI.ts`, `content/bosses.ts`, `content/enemies.ts` (`voidMatronPrime`, `emberTyrantPrime`, `flakTurret`).
- Tasks:
  1. The Matron and Tyrant attacks.
  2. The 3 PRIME signatures. They are the last task and cuttable: without them, the PRIME uses the mid2 kit with tele x0.75 in phase 3.
- Acceptance: standard block, and A6 in Depths and Wastes.

**P7: Swarm events and affixes** (about 800 lines)
- Files:
  - `src/systems/events.ts`, `content/affixes.ts` (new)
  - `systems/ai.ts` (stream mode, affix behaviors), `systems/collision.ts` (affix death hooks), `systems/director.ts` (event slots)
  - harness bot (hazard and stream dodging)
- Tasks:
  1. STREAM mode.
  2. `EventRun` emission.
  3. The 9 events plus 3 FINAL SWARMs (A8).
  4. Affixes MOLTEN, HASTED, BROOD, VOLATILE, SHIELDED (A9).
  5. Elite name tags.
- Acceptance:
  - Standard block.
  - `perf-final` (Hive FINAL SWARM, 113 bodies) passes.
  - A3: every beat fires on time or per the deferral rules.

**P8: Fusions, evolutions, pods** (about 900 lines)
- Files:
  - `src/systems/blasts.ts` (new)
  - `content/perks.ts` (FUSIONS), `content/weapons.ts` (rebalance, `pair`, `evolvesTo`, 9 evolved defs, `kickPx`)
  - `systems/weapons.ts` (time ammo, `fireRing`, behaviors), `systems/projectiles.ts` (`age`, seek bounce, walls removed), `systems/collision.ts` (fusion hooks, burn, stagger)
  - `systems/pickups.ts` (pods: placement, hold-to-take, bias), `systems/ai.ts` (stagger)
- Tasks:
  1. The A3 and A4 content.
  2. The blast queue.
  3. `healPlayer` with the kill-heal bucket and overshield.
  4. Pods per section 4.5. The evolution itself is triggered in P9.
- W2 hand-off: the merged W2 build drafts these perks and fusions, but part or all of their effect waits for P8. The draft keeps offering them until P8 lands, and every W2 measurement (the P5 A18 numbers, the A6 note in section 11) ran with these picks inert.
  - No effect at all: Shock Step (`shockRadius`, `shockDamage`), one of the 2 MOBILITY keystones, so EMBER's Keystone draft offers it half the time; and Incendiary (`burnDps`).
  - Partial: Overpressure has its knockback but no stagger (`staggerT`). Quartermaster has its ammo but no pod life or hold cut (`podLifeBonus`, `podHoldCut`). Vampiric heals per kill with no cap, although its card shows `max N HP/s` (`killHealCap`, the kill-heal bucket of task 3). Ricochet still bounces off walls (v1), not toward the nearest enemy as its card says.
  - All 10 fusions: offered, taken and recorded, but `applyBuild` has no effect code for them.
  - P8 landed every item above; the A6 note in section 11 has the re-measured Hive fights.
- Acceptance:
  - Standard block.
  - Every `Modifiers` field has a reader outside `content/perks.ts`, and every FUSIONS id has effect code (grep).
  - One harness test per fusion and per evolution behavior, asserting the A3 and A4 numbers.
  - SMG magazine lasts 20.0 ±0.1 s with and without Adrenaline 5.
  - Crossing a pod at full speed does not take it.
  - `flood(500)` with SHATTER: p95 within baseline +2 ms.

**P9: Hive Cores, shards, bonuses, pilot rules** (about 800 lines)
- Files:
  - `src/systems/cores.ts`, `systems/bonuses.ts`, `content/bonuses.ts` (new)
  - `content/characters.ts` (`PilotRules`)
  - `systems/collision.ts` (drops, NUKE and FREEZE hooks), `systems/pickups.ts`, `systems/weapons.ts` (OVERDRIVE, Afterburner, salvage)
  - `main.ts` (core reveal pause), minimal `src/ui/coreReveal.ts`
- Tasks:
  1. The A5 cores, shards and bonuses.
  2. The evolution choice at a Hive Core.
  3. NOVA, EMBER and VESPER rules.
- Acceptance:
  - Standard block.
  - 1,000 boss-1 cores split 60/35/5 ±3%.
  - Shards drop at least 60 s apart.
  - 1.5 to 3 bonuses per minute after 2:00, never 2 of the same type in a row.
  - VESPER sees no medkit in 20 runs.
  - One evolution in a run completes EVOLVED (#37) and adds 1 to `stats.evolutions`.
- W3 hand-off: `buildRunResult` sets `evolutions: []` (`src/state/runResult.ts`), and feat #37 EVOLVED (`r.evolutions.length`) and `stats.evolutions` read that list. P9 records each evolution when the player takes it, in a `World` list of evolved weapon ids reset in `beginRun` (the P9 field block), and `buildRunResult` fills `RunResult.evolutions` from it. Without this, evolutions ship but never count: `paint:ultraviolet` stays locked and the lifetime evolutions stat stays 0.
- Measured on the P9 branch (`node scripts/probe-p9.mjs`, 20 checks, 23 after the P9 review, and the harness, which now answers a core reveal through `S.takeCore` and logs bonus, shard, core and medkit drops):
  - Cores: 1,000 mid1 rolls on one loot stream split 58.2 / 36.7 / 5.1%, and the first roll of 1,000 seeds 59.1 / 36.0 / 4.9% (mid2 and overtime within 2% of their rows too).
  - EVOLVED: RAIL SPIKE with Deadeye 2 at a core evolves to SKEWER; `RunResult.evolutions` is `['skewer']`, feat #37 completes and `stats.evolutions` goes from 0 to 1.
  - Shards: 265 shards over 72 harness runs, the closest two 60.66 s apart.
  - Bonuses, smart bot, NOVA priority, seeds 1001 x 1 to 10 per world: 2.02 per minute after 2:00 over 177 minutes (Hive 1.95, Depths 2.22, Wastes 1.87). Per run 1.10 to 2.77; the one run under 1.5 died at 3:49 (2 drops in 1.8 minutes). No type twice in a row in 357 drops. Type shares: OVERDRIVE 162, FIREBLAST 156, SHIELD 139, FREEZE 138, NUKE 136, VACUUM 102.
  - VESPER: 0 medkits in 21 runs (20 Hive smart runs of 5:31 to 12:52, 1 Wastes random run); NOVA on the same seeds: 14 to 250 per run.
  - A18 evolve: 3 of the 4 `nova:evolve` Hive runs that reached mid2 evolved (41 offers over all runs, 41 taken).
  - A18 XP, roam bot, seeds 777, 1001, 2002: XP collected by 30 s before the end 0.90 to 1.00 in all 9 runs (Hive 0.964 to 1.0, Depths 0.901 to 1.0, Wastes 0.921 to 1.0). The whole-run share is 0.951 to 0.988 in Hive (P11 lane on the W3 base, 3 Hive roam runs: 0.918 to 0.963) but 0.779 to 0.918 in Depths and 0.800 to 0.946 in Wastes: those 6 runs end in a win 2 s after the PRIME kill, so the PRIME fight's gems are never collected. At 10:00 Depths seed 1001 stands at 0.892. NOVA lost her v1 +35% pickup range (section 4.10), which VACUUM does not fully replace off Hive; P19 owns the margin.
  - The evolutions raise the kill rate: Hive seed 1001 (smart, priority) evolved ION SPEAR at 4:56, had 4,148 kills at 6:30 and 9,804 when it died at 9:06. In the P11 lane (the W3 base plus P11, T0, no cores) the same seed had 2,969 kills at 6:30 and 5,967 when it died at 9:06. P19 retunes with evolutions live.
  - After the P9 review fixes (smart bot, priority, seeds 1001, 2002 and 3003 per world with NOVA, plus Hive seed 1001 with VESPER): 2.10 bonuses per minute after 2:00 over 62.3 minutes, no type twice in a row, shards at least 64.62 s apart, no perk above its max, VESPER 0 medkits, 2 wins (Hive and Wastes seed 3003). The new probe checks fail on the pre-review code: a shard in the core's tick took Adrenaline to 6 of 5, a NUKE that finished a guardian and a queen scored 0 instead of 1,400 points, a burning guardian under INFERNO lost 37.5% to the NUKE instead of 30%, and FIREBLAST burn kills dropped a bonus.

**P10: Score, RunResult v2, stats** (about 700 lines)
- Files:
  - `src/core/rules.ts` (constants, `scoreOf`, move `seedFromString`), `src/game/scoring.ts`, `src/state/runResult.ts`, `src/state/stats.ts` (new)
  - `state/persistence.ts`, `systems/damage.ts` (`registerHit` hooks), `systems/collision.ts` (`scoreKill`), `systems/acid.ts`, `systems/pickups.ts` (pod counters)
  - `content/enemies.ts` (`idx`, `ENEMY_IDS`), `game/projectile.ts` (`ownerIdx`), `world.ts`, `main.ts` (`endRun` pipeline, every exit path through `endRun`)
- Tasks:
  1. Section 5 in full.
  2. `buildRunResult`, `updateLifetime`, `recordWorldBest`.
  3. The HUD score readout on the old HUD, as a text stub.
- Acceptance:
  - Standard block.
  - A probe shows the chain halving on a projectile hit, a ram, 10 HP of contact, and 2.0 s idle.
  - A dev script checks 1,000 random sequences give the same score from the client path and from `scoreOf`.

**P11: THREAT and OVERTIME** (about 500 lines)
- Files: `src/content/threat.ts` (new), `content/runScripts.ts` (`resolveScript(threat)` applies mirrors and extra elites), `systems/director.ts` (overtime), `world.ts` (`hpMul`, `threat`), `main.ts` (`startOvertime`).
- Tasks: A11 levels 0 to 4, the section 4.1 overtime, and the harness `threat` and `ot` flags.
- Acceptance: standard block, A12 ladder headroom (T4 win rate below T0), A13 overtime end.

**P12a: Native storage** (about 350 lines)
- Files: `src/platform/storage.ts` (rewrite), `src/main.ts` (boot await).
- Tasks: section 7.1.
- Acceptance:
  - On the iOS simulator: set a name, kill the app, relaunch, and the name persists.
  - Installing v2 over v1 keeps all 13 v1 keys.
  - `initStorage` takes under 150 ms with 40 keys.
  - Web private mode does not throw.

**P12b: Feats, paints, pools, migration** (about 900 lines)
- Files:
  - `src/content/feats.ts`, `content/paints.ts`, `state/feats.ts`, `state/migrate.ts` (new)
  - `state/unlocks.ts` (rewrite, `resolvePools`), `content/characters.ts`, `content/arenas.ts` (`UnlockMeta`)
  - `game/player.ts` (paint colors), `world.ts` (pools), `systems/pickups.ts` and `systems/collision.ts` (weaponPool)
  - `scripts/feats-pacing.mjs`
- Tasks: A12, A13, section 7.4, and a boot assertion that every reward id exists.
- Acceptance:
  - A fresh save unlocks FIRST CONTACT on its first 10 s run.
  - A save with `unlocks=["ember","depths"]` and `best:world:hive={time:200,kills:900}` boots with EMBER and DEPTHS, feats #4 #6 #10 done, and every perk and weapon owned.
  - Standard mode never drafts a locked perk.
  - `feats-pacing.mjs`: every session from S1 to S10 has at least one unlock.

**P13: Daily v2, server v2, leaderboard client** (about 900 lines)
- Files:
  - `src/core/rules.ts` (daily), `src/state/daily.ts` (new), `src/main.ts` (`RunConfig`, ranked lifecycle, checkpoint)
  - `src/net/leaderboard.ts`, `src/ui/namePrompt.ts`
  - `server/src/index.ts`, `server/schema.sql`, `server/src/blocklist.ts`, `server/README.md`, `scripts/attack.mjs`
- Tasks: sections 7.5, 8.1, 8.2 and 8.4.
- Acceptance:
  - Two browsers with different saves, paints, settings and viewports play Daily #N with the same scripted input and get the same hash, score and draft offers.
  - The attack suite passes every case in A-LB.
  - A fresh save makes 0 leaderboard requests over 5 runs.
  - A tap on the name field keeps the prompt open under touch emulation.
  - A client parity script matches the worker on `dailySpec` over 400 dates.
- P13 hand-offs:
  - P11: Standard threat goes into `RunConfig.threat` in `main.buildRunConfig` (it is 0 there today; the Daily takes its spec's threat), and `World.beginRun` sets `world.threat` from the config. The harness sets a threat with `S.beginSeed(seed, { threat })`.
  - P15: the `dailyIntro` callout and the HUD Daily tag read `world.run.dailyNumber` and `world.run.ranked`. (W4 integration fix: both show `DAILY #N`; the callout's sub says `PRACTICE RUN` in place of `SAME RUN FOR EVERYONE` when the run is not ranked (A15). The HUD tag stays `DAILY #N`, because a longer tag reaches the timeline in portrait; the pause sheet's `RANKED` or `PRACTICE` label (section 9.4) carries the mark during the run.)
  - P16: the recap keeps `GameOver.setRankLine(text, tone)`, `GameOver.expectRankLine()`, the opt-in card (`src/ui/optInCard.ts`, shown by `gameOver.setOptInVisible`) and `GameOver.toastSlot` (recap toasts: `NO THANKS` and the server rename). The rank line has its own row above the unlock banner (P13 review: the first ranked Daily always completes DAYBREAK, so a shared slot hid its rank). The row is kept while a post is under way, so the answer moves nothing, and a short screen tightens the recap's spacing to fit both. `scripts/ui-shots.mjs` steps 18 and 18b fail when the rank line is missing beside an unlock banner (on a dev server with both leaderboard variables; without them the leaderboard steps are skipped, W4 integration fix). On a short screen with no room under the buttons, a recap toast shows at the top over the header for its 5 s (before the review it sat below the screen edge; step 23 checks it is on screen); the P16 recap should keep a toast slot free. R and Escape on a Daily should open the pause sheet (section 7.5).
  - P17: ACCOUNT rows use `optInState`, `optIn`, `optOut`, `getPlayerName`, `setPlayerName` and `deleteMyScores` (`src/net/leaderboard.ts`), with `ConfirmSheet` for REMOVE MY SCORES. Until those rows exist the `NO THANKS` toast reads `You can join later from LEADERS.` (`gameOver.optIn.onDecline` in `src/main.ts`); P17 restores the A15 line `You can turn this on in Settings.` in the same change as the rows. `Leaderboard.onJoin` resolves with the posts JOIN started, and the board loads after they land, so it shows the ranked Daily just posted (P13 review). The Daily card reads `dailySpec`, `rankedAvailable`, `loadDay`, `loadStreak` and `rankedRun` (`src/state/daily.ts`). The leaderboard screen (section 8.5) builds on `fetchBoard`, which returns an offline reason instead of throwing. A fresh save makes no leaderboard request until the player opens LEADERS, so the menu must not fetch a board on its own.

**P14: UI foundation and camera** (about 900 lines)
- Files:
  - `src/render/fonts.ts`, `render/camera.ts`, `ui/tokens.ts`, `ui/tween.ts`, `ui/digits.ts`, `ui/icons.ts`, `effects/damageNumbers.ts` (new)
  - `ui/button.ts` (rewrite)
  - `src/assets/fonts/*`
  - `render/app.ts` (overlay layer), `render/textures.ts` (resolution 3, white silhouettes), `main.ts` (camera, warm-up)
- Tasks: sections 6.3, 6.4 and 9.1.
- Acceptance:
  - Standard block.
  - At 375x667 a biter is at least 14 CSS px and the ship at least 22 px.
  - Fonts render offline in the PWA and in the iOS build.
  - Fonts total 64 KB or less.

**P15: HUD, callouts, arrows, in-world visuals** (about 900 lines)
- Files:
  - `src/ui/hud.ts` (rewrite), `ui/callouts.ts`, `ui/offscreenArrows.ts` (new)
  - `effects/feelDirector.ts` (full catalog), `render/hazardRenderer.ts` (polish), `render/entityRenderer.ts` (hit flash, pod blink)
- Tasks: section 9.2, A15 callouts, the section 6.5 catalog, and the dash button art.
- Acceptance:
  - Standard block, screenshots with a boss alive, a pending chip and tier x5.
  - The DASH hit circle overlaps neither the pill, the boss plate nor the stick rest point.
- P8 hand-off: the LIVING ARMOR overshield (`world.overshield`, up to 25% of max HP) has no HUD readout. P15 draws it on the HP bar. An absorbed hit already has its cue (FeelKind `ShieldHit`, A3).
- Built in P15 (details in sections 6.5, 9.2 and A15): `node scripts/hud-shots.mjs p320,l568,p375,l667,p390,l844 --world=<id>` captures the HUD with a boss alive in FRENZY, `LEVEL UP x2`, tier x5, an overshield and a callout, and checks HUD box overlaps (DigitStrips included), text size, and the DASH hit circle against the pill, the boss plate, the pause button and the stick rest points. It passes for hive and wastes at all six sizes and for depths at the four phone sizes from 375 up. After the P15 review it also checks, per size: the Daily intro line with the longest world name keeps 12 px text inside the safe width; the 3 s alert arrows toward the west and the east stay 26 px inside the safe edges; a real hit (`scoring.registerHit`, MultDown then ChainHit) flashes `x5 > x4` and a chain decay drop does not; and real input on the pause button (touch taps, mouse clicks, one with the crosshair over the button) pauses and resumes the run. (W4 integration) The scene also holds FREEZE, OVERDRIVE and SHIELD so the three bonus timer rings show and are checked against every other HUD box and the arrows, and a SHIELD bonus and a Hive Core dropped off screen on opposite sides must each get an edge arrow in its tint on its side. At the first size it plays a mid boss kill (slain, FLAWLESS) and a PRIME kill (one slain line with FLAWLESS in its sub since P16) through the feel queue and checks the lane shows every line in order, and that a Close Call queued behind a 3 s boss alert is dropped.
- Decision 6 acceptance, `node scripts/measure.mjs <W> <H> ringview all 300` (P15 build): every non-boss spawn inside any camera variant got its emerge effect (375x667: 259, 146 and 88 in hive, depths and wastes; 390x844: 357, 264 and 139; none missed, none dropped for a full pool). No director spawn (ring, pack, event) lands within 120 u of the ship (closest 245 u, Pack A). Spawns within 120 u come from their source standing there: 38 splitter offspring in Hive and 2 flak turrets (the Tyrant's kit, telegraphed by a marker) in Wastes; neither bites during the emerge.

**P16: Draft UI, pause, win panel, recap** (about 900 lines)
- Files: `src/ui/levelupModal.ts` (rewrite), `ui/pauseSheet.ts`, `ui/winPanel.ts`, `ui/recap.ts`, `platform/lifecycle.ts` (new); delete `ui/gameOver.ts`; `main.ts`.
- Tasks: sections 9.3 to 9.6 and the ceremony from section 6.5.
- Acceptance:
  - Recaps fit at 375x667 and 667x375 for: a first run, a run with 4 unlocks and a rank, and a ranked Daily with the opt-in card.
  - Taps are rejected for 450 ms.
  - Backgrounding the app pauses the run.
- Built in P16 (where it differs from sections 9.3 to 9.6, or they are silent):
  - **Start gate** (W1 carry-over). A run's sim holds at t = 0 until the first input sample with a move, a thumb on the glass, pad aim or fire, a dash press, or a mouse that moved or clicked since the run started (`InputManager.engaged`). The sample that opens it drives that same first step, so the run from there on is the one an immediate input plays. The harness hooks `step`, `jumpTo` and `beginSeed` open the gate. `node scripts/probe-p16.mjs gate gatedet`: 10 s with no input stays at 0:00 with full HP and unmoved streams; a key, a mouse move and a touch each open it; a seeded bot run after 2 s of held gate hashes the same as one with input from the first step.
  - **Input lock.** A tap counts only when its press started after the lock (draft 450 ms full ceremony, 300 ms after; WIN panel and recap 450 ms), so a finger that lands during the lock and lifts after it does nothing. Keys and pad presses count from the lock's end.
  - **Draft cards.** Fallback cards (no chip row) start their stat line at the chip row. The description takes the lines left after the stat and tag lines, at 13 px, then 12 px, then only its first sentence, and is left out rather than cut; a rotation lays it out again from the whole text (`probe-p16.mjs rotate`). Landscape puts the rarity label at the card's top center over a 40 px icon (48 px left too little room for a 4-line body at 204 px wide). Tag lines are colored by kind: EVOLVES #ff9a4a, fusion parents and completers #ff5ad1, PAIR gold. A draft that opens while the last pick still fades (pending levels after the PRIME resolve back to back) stops that fade and the picked card's pop, so it shows at full alpha (`probe-p16.mjs chain`, P16 review).
  - **PRIME kill lane** (W4 carry-over). The WIN panel opens 2 s of sim after the kill, so the PRIME gets one callout: the slain line with `FLAWLESS · +48,210` as its sub when the fight took no hit. The win text is the panel's title (Standard) or the recap header (Daily); the panel shows a FLAWLESS tag, and opening it clears the lane so nothing stale plays after OVERTIME. A mid boss still shows slain, then FLAWLESS.
  - **Pause sheet.** Esc, P, back and the pad's Start open it in every mode; R stays a quick retry in Standard and opens the sheet on a Daily. Settings opened from it return to it. A pause during the 3 2 1 countdown brings the sheet back.
  - **Recap.** Landscape puts the buttons in one row along the bottom (RETRY, MENU, SHARE, LEADERS) under the two columns, and each column takes its own overflow step: a ranked Daily with an unlock and the opt-in card does not fit 375 px of height with the buttons in the right column. A best is celebrated only against an earlier one in that world (a first run beats nothing) and only for a run of 10 s or more with a kill. A practice Daily compares with the day's best (its ranked score or a practice best). Once the opt-in card shows, its area stays for the rest of that recap and a recap toast (NO THANKS, the server rename) takes it.
  - **Pad** (section 9.5): draft A picks the focused card (the d-pad moves the focus), Y rerolls, X arms banish, B skips; WIN panel A on the focused button (EXTRACT first), Y OVERTIME; Hive Core A evolves or continues, X takes the levels; pause sheet d-pad and A, B or Start resumes; SETTINGS opened from the sheet goes back to it on B or Start; recap d-pad and A, B is MENU. `probe-p16.mjs pad` drives each with a fake standard pad.
  - World-space text (labels, damage numbers, elite tags) is hidden under every scrim. A boss whose center sits in the strip beside or behind the weapon pill gets no off-screen arrow. A practice Daily's HUD tag reads in text.muted.

**P17: Menu, settings, leaderboard screen, records, hints** (about 900 lines)
- Files: `src/ui/mainMenu.ts`, `ui/carousel.ts`, `ui/dailyCard.ts`, `ui/goalsPanel.ts`, `ui/settingsPanel.ts`, `ui/leaderboard.ts`, `ui/records.ts`, `ui/hints.ts`, `share/shareCard.ts` (token colors, grouping, `DAILY #N`, no seed footer).
- Tasks: sections 9.7 to 9.10 and section 8.5.
- Acceptance:
  - Scene-graph audit at 375x667, 667x375, 390x844 (insets 47/34), 844x390 (insets 47/21) and 1440x900: text at least 12 px, hit rects at least 44x44, nothing outside the safe area, no text overlap, no text over the hero ship.
  - Contrast pixel sampling: worst case at least 4.5:1.
- Built in P17 (new files `ui/iconButton.ts` and `ui/scroll.ts`; `ui/callouts.ts`, `ui/confirmSheet.ts`, `ui/hud.ts`, `effects/feelDirector.ts`, `render/postfx.ts`, `state/settings.ts` and `main.ts` changed):
  - **Menu.** Every screen is laid out in 375-wide design units and scaled by `uiScale`. The hero ship is the arena's own ship: on the menu `main.followCamera` offsets the camera so the ship lands on `mainMenu.heroX, heroY` and scales `player.view` so its barrel tip fits `heroR` (28 design px) at any zoom; a scrim (`#05070d` at 0.6) dims the arena with a clear disc around the ship. The carousel cards are 255 wide with 40 px arrows (52 px hit rects), so the pilot card shows the whole rule in 3 lines at 12 px (it grows past 92 when a rule needs a 4th line). The world card's sub is `vs ACID HIVE · BEST 182,345`. The THREAT row is a segmented `T0..Tn` on a plate with `HUNTERS · <rule>` under it. A portrait screen that cannot fit every section drops, in order, the tagline, the second goal row, the goals, the rule line (name only), then the rule; 375x667 with THREAT and the Daily card shows no goals. Landscape shrinks the title (down to 24 px high) before it drops the rule. The landscape right column stacks the Daily card, NEXT GOALS and the bottom row and keeps a 72 px band (the ship and 8 px around it) for the hero between the goals and the bottom row, so the goals drop rows from 3 until that band fits: 1440x900 shows 3 rows, 844x390 2 and 667x375 1 (its 268 px column stacks the Daily card's button, so the card is 144 high). The hero aims at (0.75W, 0.62H), clamped into that band, and the paint picker takes the room right of it first; 844x390 and 1440x900 keep (0.75W, 0.62H), and 667x375 with 2 or more paints puts the hero at about (0.65W, 0.71H) (P17 review: section 9.7 asks for 3 goal rows and that position in landscape; the left column has no room under PLAY when the THREAT row shows). PLAY is the 56 primary target; a locked pick shows `LOCKED` at full contrast and does nothing (Enter too). The paint picker (2 or more paints) sits beside the hero, never over it. The toast slot is the band over the title in both orientations, and the toast plate is opaque. A one-message toast covers only the title; the rare two-message boot toast (a recovered Daily and the v2 welcome, 4 lines) also covers the hero in portrait and the top of the pilot card in landscape for its 6 s (`menu-shots` step 04b reports it).
  - **Daily card** (`ui/dailyCard.ts`): 86 high with `PLAY RANKED` or `PRACTICE` on the right; under 320 wide (the landscape column at 667x375) the button goes full width under the text and the countdown takes its own row. The bottom line takes the A15 parts in order (THREAT, PRACTICE BEST, free pilot, dailies played and streak) while they fit. The menu reads only the save: no board request (P13 hand-off). The model carries its UTC date; when the UTC day passes it under an open menu, `MainMenu.onNewDay` rebuilds the menu, so the card shows the new number, ranked state and streak (P17 review: it kept yesterday's card with a 23H countdown).
  - **Goals** (`ui/goalsPanel.ts`): `nextGoals(n)` takes the unfinished feats closest to done (run feats by their best run) and swaps the last for the nearest pilot or world reward when none is in the list. A row keeps 12 px text: a long row shows a percentage, then cuts the task with `...`.
  - **Settings.** Rows: sliders 56, toggles 52, the damage-number segmented 74; landscape splits the tab's rows into two columns (667x375 fits every tab with no scroll); the content scrolls when a screen is shorter. The panel hides the menu while open. `Flashes` gates the level-up flash and the boss-kill bloom pulse (`FeelDirector.tryFlash`, at most 3 starts per second; `PostFX.setPulse`). SHOW TIPS AGAIN clears `hints`, `seenGemHint` and `seenTouchControls` and relabels itself `TIPS RESET`. ACCOUNT: POST SCORES asks for a name first (the toggle follows the answer), NAME has EDIT, REMOVE MY SCORES asks in a danger-colored confirm sheet and toasts the result (`Your scores are removed.` or the A15 offline lines). The recap's NO THANKS toast is the A15 line again.
  - **Leaderboard.** Up to 50 rows in a scrolling list of 36 px rows on two lines: the name takes the whole width left of TIME, and the THREAT chip and the country sit under it (P17 review: on one 30 px line a 375 px row cut a 9-character name with a chip to `PILOT...` and dropped the country). KILLS hides when the design width is under 360; a name longer than its column (13 or 14 characters at 375) is cut with `...`. No network shows `Could not reach the leaderboard.` with a TRY AGAIN button; a v1 server (404, 410) and 426 show their A15 lines (the client stays off for the session, so no button). The column header and the YOU bar hide while there is no board.
  - **RECORDS.** FEATS groups by reward (pilots and worlds, weapons, perks, paints); an owned reward of an open feat (a veteran's grant) reads `<reward line> · Already yours`. RECORDS shows a card per world, per pilot and the career block, and the v1 line when `best:endless` or `best:daily` holds a score.
  - **Hints** (`ui/hints.ts`). An in-run hint is a callout line with no title (A15 `hint` row; `Callouts.idle()` added), released only when the lane and its queue are empty, not while the sim is paused, and not for 3.5 s after a BossSpawn. A queued hint waits up to 12 s and counts in `hints` only when it shows; a line over 30 characters splits in two at the separator nearest the middle. The gem hint (`seenGemHint`) moved from a world label at the gem into the lane, which fixes its overlap with the touch-guide labels. `pause` is a gold chip for 3.5 s under the pause button, in the LEVEL UP chip's place at the left end of the row under the plate (`hud.hintSlot`), not beside it: the plate right of the button holds the level chip and the XP bar (P17 review). Its 3.5 s count down only while it can show (a draft, the pause or a LEVEL UP chip in its slot holds them), and while it shows the top stack (arrows, elite tags) ends below that row (`hud.hintHeld`); `daily` and `feats` are toasts (the menu and the recap). The `draft` line is `hints.draftLine()` (counts itself); the W5 integration shows it in the draft modal (section 11, W5 integration note).
  - **Share card:** token colors, the world's ichor colors, grouped numbers, `DAILY #N · RANKED` or `PRACTICE`, `CLEARED IN m:ss` on a clear, TIME, KILLS and PEAK tiles, the tagline as the footer (no seed).
  - **Acceptance:** `node scripts/menu-shots.mjs p375,l667,p390,l844,d1440` on a dev server with both leaderboard variables (fresh save; a returning save built through the game's own end-of-run path (`__SWARM.fileRun`, the function `endRun` files a run with), so its stats, feats, unlocks, bests, THREAT and streak agree: a migrated v1 veteran with 9 v2 runs, two Hive clears as NOVA, THREAT 2, several paints (8 when run on 2026-10-01; the Daily specs follow the date), VESPER locked at 797 / 1,000 damage, and posting on; a locked pilot, the Daily before and after the ranked run and a card built for yesterday (step 04c: the next tick rebuilds it for today), every settings tab and the REMOVE sheet, the leaderboard online, scrolled, not posting, empty, offline, v1 server and outdated, both RECORDS tabs scrolled to the end, the in-run gem hint with the touch guides, and the `Pause` chip 20 s into a touch run, checked against every HUD node, the touch banner and the callout lane, hidden under a LEVEL UP chip and back after it). It checks text px, hit rects, the safe area, text overlap (boxes clipped by their masks; under an open confirm sheet only the sheet counts), text over the hero ship, and contrast against screenshot pixels in a ring 1 to 2 px outside each unstroked text box (the 10th percentile per text).
- P17 hand-offs:
  - P16: Settings opened from the pause sheet: `settingsPanel.open(settings, accountState())` and an `onClose` that returns to the sheet (main's `closeSettings` shows the menu only when `screen === 'menu'`). The draft modal's subtitle for the first 2 drafts is `hints.draftLine()` (returns `''` after its limit). The feats hint is a toast on the recap through `showToast`, so the recap keeps its `toastSlot`: on the W4 recap at 375x667 with the opt-in card it falls back to the top band over the header for 5 s (ui-shots step 09), the same slot problem as the NO THANKS toast (W4 carry-over).
  - Done in the W5 integration (section 11): settings from the pause sheet return to it; the `draft` line is the modal's subtitle; the feats toast takes the recap's slot.

**P18: Audio buses and haptics** (about 600 lines)
- Files: `src/audio/audio.ts`, `platform/haptics.ts` (rewrite), and the feelDirector audio and haptic calls.
- Tasks: A16.2 buses, tiers, ducking, pan buses, the voice cap of 24, the recipes, and A17.
- Acceptance: a wipe of 200 kills does not mask the boss cue (manual listen plus voice count at most 24), and there is no haptic per shot or per chaff kill.

**P19: Tuning and verification** (config and content only)
- Run the full matrix in section 11. Tune in this order, one knob per pass, re-running the 10-seed smart+P set each time:
  1. boss `hpBase`
  2. rows 5 to 10 `maxAlive` and `every`
  3. `BITE_SCALE`
  4. `xpScale`
- Update `docs/store-listing.md` and `public/privacy.html` (section 8.6).

**P20: Release audit**
- Run the `ship-audit` skill.
- The owner does iPhone A17 calibration, the server deploy (section 8.4) and publishes the store copy.
- Set `DAILY_EPOCH` to the release day.

**PB: Render-side zero allocation** (W5, beside P16 and P17; not a numbered phase)
- Files: `src/render/quads.ts`, `src/game/warmup.ts`, `src/game/step.ts` (new); `render/textures.ts` (atlas), `render/entityRenderer.ts`, `render/emergeFx.ts`, `render/backdrop.ts`, `render/ichorLayer.ts`, `render/app.ts` (render groups), `effects/damageNumbers.ts`, `effects/screenFx.ts`; the sim's spawn sites write quad fields (`systems/spawn.ts`, `weapons.ts`, `bossAI.ts`, `ai.ts`, `acid.ts`, `pickups.ts`, the `game/` entity classes, `world.ts`); `main.ts` (atlas bake, warm-up call, `stepSim` calls `runSystems`).
- Tasks: section 3.2 on the render side, after PA: particles and pooled entities in ParticleContainers on one atlas, pooled sprites kept visible and moved out of view, pre-settled fields, no per-frame `Graphics.clear()`, and a boot warm-up of the boss and event code paths on a scratch World.
- Acceptance: `probe-alloc all all` total 1.0 MB/s or less in every scene and no sim function over 0.1 MB/s; post-GC growth under 0.2 MB per 60 s of flood hive after an 80 s warm-up (`probe-alloc x x --growth=60 --warm=80`); det, det-long and det-death hashes unchanged; side-by-side screenshots at 375x667 and 667x375 show no change. Results in the section 11 PB note.

---

## 11. Verification matrix (THREAT 0 unless noted)

```
npm run dev -- --port 5176 --strictPort
node scripts/playtest/playtest.mjs hive turret:777:12 roam:777:12 roam:1001:12
node scripts/playtest/playtest.mjs hive smart:1001:14 ... smart:10010:14          # and :nova:priority, crude:x3
node scripts/playtest/analyze.mjs                                                  # repeat per world; threat sweep :4; overtime :ot
node scripts/playtest/matrix.mjs --seeds=10                                       # every set above, A1 to A18 scored: docs/tuning/<label>.md
node scripts/measure.mjs 375 667 det-long ; 667 375 ; 1440 900 ; daily fresh + unlocked save
node scripts/measure.mjs 390 844 perf ; node scripts/measure.mjs 390 844 perf-final hive   # run alone
```

| ID | Metric | Pass |
|---|---|---|
| A1 | Opening probe (5 seeds x 3 worlds, both phone views) | first enemy in view 1.0 s or less; first kill 2.5 s or less; empty view 2.0 s or less in the first 60 s |
| A2 | First draft | 6 to 12 s; max 20 s |
| A3 | Beats and density | beats on time or per deferral; alive at most `row.maxAlive + 160` (inside a cage, the row in force when it rose) and at most 610; at most 25% of non-event, non-cage steps at 95% or more of maxAlive |
| A4 | Density band | smart+P median free-field alive (steps with no cage and no lull) inside the A7.2 target band in 9 or more of 12 minutes |
| A5 | Boss arrival | 250 to 340 u; cage active the same tick |
| A6 | Fights | boss-focus bot (smart+focus+P): mid1/mid2 median 20 to 40 s; final 40 to 75 s. Default bot: none over 150 s except stalemate. Gap from kill to next arrival at least 20 s |
| A7 | Win rate (10 seeds per world) | smart+P 25 to 45%; smart 5 to 25% |
| A8 | Median survival | smart 5:30 or more; smart+P 8:00 or more; crude 2:30 or more; Hive crude median at least that of Depths and Wastes |
| A9 | Level curve (smart+P median) | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 |
| A10 | Readable deaths | from the last HP at 50% or more to death: median 3.0 s or more, minimum 1.2 s or more |
| A11 | Speed | no enemy over 240 u/s outside stream, charger dash and lunge (before OVERTIME; its cycles raise the ceiling, section 4.1) |
| A12 | Ladder | T4 win rate at most 15%; T1 at most T0 |
| A13 | Overtime | 90% or more dead by 20:00; none past 24:00 |
| A14 | Determinism | identical hash across 3 viewports, a rerun, extreme settings, and a fresh vs unlocked save (Daily) |
| A15 | Perf | perf: 60 fps, 0 frames over 20 ms; perf-final: p95 16.7 ms or less, 0 frames over 33.4 ms |
| A16 | Allocation | no GC pause over 2 ms in a 10 s perf-final trace |
| A17 | Human (owner) | about 1 win in 3 Hive T0 runs on iPhone for a player with 5 or more runs. If 0 of 3 while A7 passes: Hive rows 5 to 10 maxAlive -10% and hpBase -10%. If 3 of 3: raise both by 10%. |
| A18 | Build systems | dash bot survives 1.25x or more vs no-dash; 1 to 4 close calls per minute; 50% or more of priority runs take a fusion by 4:00; 40% or more of evolve runs that reach boss 2 evolve; XP collected 90% or more (roam bot, up to the PRIME kill) |
| A-LB | Server | forged seed 400; wrong pilot 400; second Daily 409; 4th Daily per IP 429; 9th insert in 10 min 429; `killPts > 80 x xpSum` stored clamped; kills over 250/s 422; `kills 5, closeCalls 2, bestChain 35` accepted; `bestChain > kills + 15 x closeCalls` 422; blocklisted name becomes `PILOT####`; burst of 12 accepts exactly the remaining budget; board returns one row per player; `me` present outside the top 50; no `player_id` in any response; `/api/score` 410 |

**A6 note (P6a review).**
- A6 medians are measured on the boss-focus bot, `smart+focus:SEED:14:nova:priority`, because a player aims at the boss during a fight. The default bot shoots the nearest enemy, which in a fight is often the swarm held outside the cage, so it only has to finish every fight under 150 s.
- At the old mid1 `hpBase` of 1600 the focus bot's mid1 median was 18.4 s. P6a raised it to 2400 (A10.2).
- Measured on Hive with 2400: focus bot, seeds 1001 to 10010: mid1 27.7 s, mid2 38.1 s, final 40.6 s (2 kills); 30 seeds (1001 x 1 to 30): mid1 23.6 s, mid2 27.2 s, final 44.1 s (7 kills). Default bot, 30 seeds: longest fight 136.3 s, 7 wins. Kill-to-next-arrival at least 103 s. These are P6a branch numbers, before the W2 merge.
- **Merged W2 build (P5 + P6a + P10 on main), Hive, seeds 1001 x 1 to 10, `nova:priority`.** P19 retunes `hpBase` from these numbers, not the P6a ones above.
  - Focus bot: mid1 median 31.2 s (10 kills, 17.1 to 45.25 s), mid2 median 21.11 s (5 kills), final median 41.75 s (3 kills: 19.23, 41.75 and 69.11 s), 3 wins. Kill-to-next-arrival at least 147.3 s.
  - Default bot: mid1 median 77.9 s (8 kills, longest 108.1 s), mid2 median 52.7 s (5 kills, longest 134.6 s), final 50.66 s and 158.83 s, 2 wins. Kill-to-next-arrival at least 45.4 s.
  - **A6 FAIL on the default bot:** the seed 9009 PRIME fight took 158.83 s, over the 150 s cap. The build was survival (Vampiric, Regrowth 2, Bulwark 2, Vitality 3, and LIVING ARMOR, which has no effect until P8) with one damage perk, Heavy Rounds 1. So buildScale was about 1.22 (PRIME HP 4876 = 4200 x 1.22^0.75), and the default bot shoots the nearest enemy, often the swarm outside the cage.
  - Every W2 number ran with the inert picks listed in the P8 W2 hand-off (section 10.3). P19 re-measures after P8.
- **P8 branch (every hand-off pick live), Hive, seeds 1001 x 1 to 10, default bot `smart:SEED:14:nova:priority`.**
  - mid1 median 69.8 s (10 kills, 26.4 to 89.6 s), mid2 median 67.3 s (6 kills, longest 108.5 s), final 74.6 s (1 kill), 1 win. No fight goes over 150 s, so the default-bot A6 check passes. Kill-to-next-arrival at least 110.8 s.
  - Seed 9009 died at 9:41, before the PRIME, so its 158.83 s W2 fight has no P8 counterpart.
  - Two changes move these numbers against W2: Vampiric kill healing is now capped (A2), and the harness bot stops on a pod it wants (hold to take, A5.1).
- **P6b (W2 main + the Matron and Tyrant kits, before P7 and P8), after its review, seeds 1001 x 1 to 30 unless noted, `nova:priority`.** `node scripts/probe-fightdps.mjs <world> <config>...` prints the per-fight numbers below (damage rate by boss state, distance, aim).
  - **Depths worldMul 0.9 to 1.0.** The focus bot's damage rate on the Matron does not depend on her kit state: idle, telegraph and recover sit at 0.98 to 1.15 of the fight's mean, and her active windows (the undertow pull included) are the lowest at 0.70 to 0.87. Its mean distance to her is 280 to 360 u (the Queen: 350 to 385 u). So her blinks and her pull do not hand the bot close-range damage. At the same build (same seed, equal buildScale) the bot deals her 1.2 to 1.4x the damage per second it deals the Queen, whose eggs and brood take part of its fire. At 0.9 her fights were the shortest of the three worlds (focus medians over 90 seeds: Depths 21.4, 18.9 and 21.9 s; Hive 25.1, 25.6 and 41.8 s). The default bot's longest Depths mid1 (124.6 s at 0.9) caps worldMul at 1.08.
  - Depths, focus bot: mid1 median 25.68 s (29 kills, 8.1 to 38.9 s), mid2 22.58 s (15 kills), final 24.81 s (5 kills); over 90 seeds 23.29, 22.72 and 27.61 s (9 final kills). mid1 and mid2 pass.
  - Depths, default bot: longest mid1 132.7 s, mid2 76.1 s, no final reached; over 90 seeds the longest are 132.7, 83.0 and 97.1 s. Every fight is under 150 s. Wins over 90 seeds: default 8, focus 9 (9 and 8 at 0.9).
  - **A6 FAIL, Depths final (focus floor).** No worldMul passes both clauses: the final needs about 1.45x the HP it has at 1.0 (the default bot's longest final would then be about 141 s), and mid1 caps the world at 1.08. The Matron PRIME needs an HP factor of her own relative to the Queen PRIME (her signature adds no brood; the Queen's adds 24 swarmers). The appendix has no knob for it, so it is an owner or P19 decision. Hive's final shows the same tension on this build: focus median 41.75 s (27 kills) but the default bot's longest final is 165.1 s (90 seeds).
  - Wastes (the review changed nothing there): focus mid1 median 29.32 s (23 kills), mid2 24.56 s (8), final 43.11 and 57.75 s, so the medians pass. Default bot: longest mid1 160.85 s, final 176.46 s, so **A6 FAILS on the default bot**, and 15 fights ended in the bot's death (13 mid1, 2 mid2), mostly by boss hazards. The harness bot sums a push away from each damaging circle, so the magma mortar's 5 circles cancel, and it treats the scorch sweep as a circle of r 30 on the boss. P7's harness change (as of `36acc76`) adds stream dodging only, so the bot needs a multi-circle and sweep dodge before the post-P7 re-measure can settle Wastes; P19 tunes from that re-measure.
  - Kill-to-next-arrival at least 45 s in every world and bot.
- **Merged W3 build (P8 + P7 + P6b + P12b on main), `nova:priority`, seeds 1001 x k.** P19 retunes from these numbers. The harness calls `world.beginRun` itself, so these runs draft and drop from the canonical pools.
  - Hive, k 1 to 10. Focus bot: mid1 median 23.81 s (10 kills, 14.48 to 46.68 s), mid2 26.05 s (7), final 38.43 s (3 kills: 33.75, 38.43 and 42.33 s), 3 wins. Default bot: medians 52.19, 56.5 and 86.66 s; longest fights 101.98, 110.76 and 113.51 s, so every fight is under 150 s; 5 wins. Kill-to-next-arrival at least 69.2 s. **A6 FAIL, Hive final (focus floor):** 38.43 s against 40 s, on 3 kills.
  - Depths, k 1 to 30. Focus bot: mid1 23.62 s (30 kills), mid2 23.37 s (14), final 28.44 s (6), 6 wins. Default bot: longest 89.92, 59.78 and 71.71 s, 5 wins. The final still fails the focus floor (the P6b gap above).
  - Wastes, k 1 to 30. Focus bot: mid1 29.0 s (22 kills; 6 more fights ended in the bot's death), mid2 22.81 s (13), final 46.0 s (2), 2 wins. Default bot: longest 107.93, 107.16 and 71.75 s over the finished fights, 1 win, but 15 of 28 mid1 fights ended in the bot's death, so the 150 s check is censored until the bot dodges multi-circle and sweep hazards.
- **P19 baseline (harness hazard escape).** The smart and roam bots now plan an escape from each telegraphed hazard instead of summing one push per circle (`docs/tuning/hazard-dodge.md`). On main `15c16b9`, Wastes, `smart:SEED:7.5:nova:priority`, seeds 1001 x 1 to 30: mid1 fights that end in the bot's death fall from 9 of 29 (the bot before the change) to 0 of 29, and hazard HP lost from 4492 to 0. The Hive default bot takes 93% less ROYAL LUNGE damage, and its longest mid1 fight rose from 93.8 to 158.9 s. The 10-seed matrix on this harness is `docs/tuning/baseline.md`.

**A3 note (P7).**
- Beat timing is measured from `Director.firedAt` (the sim time each beat fired, or -1 when a rule dropped or skipped it). `scripts/playtest/analyze.mjs` replays the deferral rules over each run's own cage intervals (held beats at kill + 10 s, then 12 s apart; an event more than 60 s late dropped; a lull inside a cage skipped; bosses at `max(at, last kill + 20)`, mid2 skipped past 570 s) and prints one `A3` line per run.
- The event window for the saturation share lasts while an event part emits or a stream unit lives, and 15 s after an event beat fires. Ring units are ordinary enemies after that.
- Measured on the P7 branch, T0, `roam:1001:14`, `smart+focus:1001:14:nova:priority` and `smart+dash:2002:14:nova:priority` in each world (9 runs): 153 of 153 beats on time or where the rules put them (held elites and events after a boss kill, BLINK STORM, HIVE WALL and a lull dropped or skipped by rule). Density on the smart bots: alive at most 293, never over the row's maxAlive, saturated share at most 0.033.
- Re-measured after the P7 review fixes (same 9 runs): 153 of 153 beats on time or where the rules put them. Smart bots: alive at most 263, at most 5 over the row's maxAlive (within the +160 bound), saturated share at most 0.034. Invincible roam bots: Hive 581 alive and 421 over row 11 (the PRIME brood below), Wastes saturated share 0.232, Depths 0.265 on seed 1001, over the 0.25 bound. The pre-fix sim gives 0.149 on that seed; seeds 2002 and 3003 give 0 on both builds. The runs split at the first event. On the fixed sim the bot killed mid2 at 503.8 s instead of 569.5 s, so the stretch from 8:24 to the PRIME at 10:30 ran without a cage, and the roam bot (189.9 kills per minute in Depths) held the field at the row's maxAlive through it. P19 owns the roam-bot density with the brood excess.
- The invincible Hive roam run fails the density bound: 627 alive and 467 over row 11's maxAlive during the PRIME fight it cannot finish. Tagging every spawn after 10:30 by source gave 474 boss-brood swarmers and 60 eggs, 81 other spawns and no event units, so the excess is the PRIME kit's brood in a 210 s stalemate fight (the eggClutch cap of 24 brood does not limit mothersCall), not the events. P6b or P19 owns it.
- **Merged W3 build**, the same 9 runs: 153 of 153 beats on time or where the rules put them. The replay in `analyze.mjs` now holds a beat again when it is still waiting as the next cage rises (the director reschedules every held beat at that fight's kill); a Wastes roam run that ran its mid fights long reported that case as the one off-rule beat before the fix. Density: the smart bots pass in these 9 runs, but the A6 batches above fail it on Hive smart bots that live to the PRIME. The per-30 s chunks of those runs (re-run in the W3 integration fix) show where each number comes from:
  - Over the row's maxAlive by 188 (default bot, seed 9009) and 233 (focus bot, seed 5005). Both appear in the first chunk after 11:00, when the row steps from row 10 (maxAlive 420) to row 11 (160) during the PRIME fight: the field built under row 10 and the FINAL SWARM units still alive count against 160. Before 11:00 the excess is at most 25 (seed 5005, 10:30 to 11:00) and 0 on seed 9009, so the PRIME brood adds at most 25. On seed 9009 the excess falls to 98 and 43 as the bot kills the field down.
  - A saturated share of 0.266 (default bot) and 0.36 (focus bot), both on seed 5005. The share counts only steps with no cage and no event, so brood inside the cage cannot raise it. It comes from the no-cage stretches between about 5:30 and 10:30, after fast mid kills (focus bot: mid1 in 18 s, mid2 in 26 s), with the field at 95% or more of maxAlive.
  - P19 decides between row 11's maxAlive and how A3 treats a row step during the PRIME fight, and retunes rows 5 to 10 (`maxAlive`, `every`) for the saturated share. Capping mothersCall changes neither number.
- Roam bots on the merged W3 build: Hive 573 alive, 413 over row 11, share 0.313; Depths 166 over, 0.255; Wastes 52 over, 0.001. The Hive roam excess is the PRIME brood in a fight the invincible bot cannot finish (the source tagging above), so the mothersCall MAX_BROOD question (A10.3) belongs to it.
- The harness bot dodges streams (it sidesteps toward the side with less of the stream, sticky until no stream threatens) and, since the P19 baseline, plans an escape from every telegraphed hazard (damaging circles, sweeps and lanes; `docs/tuning/hazard-dodge.md`). In an A/B on 5 seeds per world the dodge steered for 5 to 183 steps per run and stream contact damage was near 0 with and without it; a stationary ship takes 8 to 16 HP from one STAMPEDE or SHOAL RUN. Survival differences between the arms come from divergence after the first event, not from the dodge.

**A3 note (P11, the brood cap).** mothersCall now casts A instead at the brood cap, as eggClutch does (A10.3). Invincible Hive roam bot, seeds 1001, 2002 and 3003, 14 min, A/B on the P11 branch:
- Without the cap: brood alive at 14:00 was 357, 202 and 207; alive at most 573, 438 and 512 (seed 1001 reproduces the W3 573 and 413 over row 11).
- With the cap: brood alive at most 39 at any 30 s sample; alive at most 478, 438 and 436, so the 610 bound passes.
- Over row maxAlive is still 150 to 254 through the whole PRIME fight. It is the row step: the field built under row 10 (maxAlive 420) plus the FINAL SWARM stays outside the cage, the caged roam bot cannot thin it, and row 11's maxAlive is 160. Before 11:00 the excess is at most 58 (at 10:30). P19 owns it (the A3 note above).
- The saturated share stays 0.267 to 0.313 (the W3 note above; P19).

**A12 and A13 note (P11).** Hive, `smart:SEED:14:nova:priority:T`, seeds 1001 x 1 to 10 (OVERTIME runs: `:25:nova:priority:T:ot`).
- A12 passes: wins T0 5/10, T1 3/10, T2 4/10, T3 1/10, T4 0/10. T4 is at most 15% and below T0, and T1 is at most T0. Median end: T0 10:27, T4 5:16.
- First P11 build, **A13 failed**: 13 runs went on into OVERTIME (Hive, T0 to T3), 10 died by 20:00 (77%, pass 90%), and T0 seeds 6006 and 9009 were alive at 25:00. The surviving bots kite: from cycle 2 on they hold 450 enemies (the PRACTICAL_CAP, HP x3.4 to x5, damage x1.7 to x2.1) and take 0 to 56 HP per 30 s, because enemy speed stops at the 240 u/s ceiling and NOVA runs at 285 u/s or more.
- **P11 review** (the OT boss at `1.35^c` x THREAT, the elite count fixed at warn time). A13 runs: `smart:SEED:25:nova:priority:T:ot`, T0 seeds 1001 x 1 to 30 and T1 to T3 seeds 1001 x 1 to 10 (set 1: 16 runs into OVERTIME), plus T0 1001 x 31 to 60 and T1 to T3 1001 x 11 to 20 (set 2: 12 runs). Nothing before the win changes, so every arm has the same 16 winners on set 1 (T0 8/30, and T1 to T3 match the P11 A12 numbers above). Set 1 per arm, dead by 20:00 and alive past 24:00:
  - No speed term, retreat when the next OT boss is due: 13/16 (81%), T2 seed 9009 alive at 25:00 at full HP with 450 enemies. Median time in OVERTIME 220 s.
  - Speed `x1.1^c` from cycle 1, same retreat: 14/16 (88%), none past 24:00, but the median time in OVERTIME fell to 51 s: flyers at 264 u/s catch most bots in the first minute of cycle 1.
  - Speed from cycle 2 only (`x1.15^(c-1)`), same retreat: 12/16 (75%), 2 past 24:00. The long runs were caged for 54 to 64% of their OVERTIME: the default bot shoots the swarm at the fence, so an OT boss often lived until the next one was due.
  - Retreat after 90 s (`bossStay`) with `x1.1^(c-1)`, `x1.15^(c-1)`, `x1.2^(c-1)`: 13/16, 14/16, 13/16 (81 to 88%), none past 24:00. The late deaths came at 20:04 to 22:54, in cycle 3 or 4: in cycle 2 the kiters (NOVA with one Fleet Footed stack, 308 u/s) still outrun a swarm at x1.2 (flyers 288 u/s).
  - **Shipped: `x1.3^(c-1)` and a 90 s stay.** Set 1: 15/16 (94%), none past 24:00, last death 20:36, median time in OVERTIME 236 s; the reviewer's T0 seeds 4004, 5005, 6006, 7007 and 9009 die at 16:09, 15:54, 19:39, 13:31 and 19:57. Set 2: 11/12 (92%), none past 24:00, last death 20:21. Both sets: 26/28 (93%). Long runs spend at most 47% of their OVERTIME caged. Deaths in cycle 1 (14 to 138 s into OVERTIME) are the same as without the term. P19 may retune `speedMul` and `bossStay` against A13.

**A16 and section 3.2 note (W3 integration).**
- A16 passes: a 10 s `perf-final` trace (Hive) has 23 minor GCs and no major GC. The longest pause was 1.81 to 1.90 ms in the integrator's runs and 1.05 ms in the fix re-run, so the margin under 2 ms is small.
- Section 3.2 fails. In `flood(500)`, `aiSystem` allocates about 7 to 8 MB per second (78 MB per 10 s in the integrator's runs, the same on the W2 + P6b base), and `buildEnemyHash` with the spatial hash insert about 1 MB per second. A sampling heap profile (10 s, 500 enemies, fix re-run) puts 71 MB in `aiSystem`'s frame (the sampler folds inlined callees into their caller), 10 MB in `buildEnemyHash` and 5 MB in `Math.hypot`. `aiSystem` has no literal, closure or template string in its loop, so the cause does not show in the source (boxed doubles or a deopt are candidates). The rest of the sample is Pixi rendering and the DEV debug overlay (`GameLoop.p95()` copies and sorts its window every frame, about 10 MB per 10 s, DEV only).
- The 60 s `flood(500)` heap sample grows after a forced GC: +1.55 MB (integrator) and +0.8 MB (fix re-run), where section 3.2 asks for no growth.
- P19 or P20 profiles and fixes both.

**Section 3.2 note (PA, zero-allocation pass).**
- Measured with `node scripts/probe-alloc.mjs` (CDP sampling heap profiler, objects freed by GC included; frames of the probe's own page code excluded): flood (5:00), boss (the mid1 fight) and event (EVENT 1) in each world, the field topped up to 500, NOVA with 8 perks and Hailstorm, 15 s warm-up, 10 s window. In the event scene the warm-up plays up to the beat, the window opens when the event goes live (a part emitting or an event unit alive) and closes when it ends or after 10 s, and the event units get 1e6 HP so that the window stays on the event; the run fails if the event was not live at the window's start or lasted under 4 s. MB per second, base `a81b33d` one run, PA three runs (range):

| Scenario | Base total | Base sim | Base Pixi | PA total | PA sim | PA presentation | PA Pixi | Sim functions over 0.1 MB/s (PA) |
|---|---|---|---|---|---|---|---|---|
| flood hive | 21.2 | 7.85 | 12.9 | 9.8 to 10.0 | 0.22 to 0.26 | 0.10 to 0.12 | 9.5 to 9.6 | none |
| boss hive | 17.1 | 9.43 | 7.6 | 4.3 to 4.4 | 0.02 to 0.03 | 0.04 | 4.2 to 4.3 | none |
| event hive | 19.9 | 7.65 | 11.7 | 8.7 to 9.0 | 0.56 to 0.63 | 0.06 to 0.09 | 8.0 to 8.3 | aiSystem 0.35 to 0.41 (3 of 3) |
| flood depths | 21.9 | 8.15 | 13.2 | 9.5 to 9.8 | 0.08 to 0.09 | 0.05 to 0.10 | 9.3 to 9.6 | none |
| boss depths | 19.2 | 10.37 | 8.4 | 5.7 to 5.9 | 0.78 to 0.83 | 0.04 to 0.06 | 4.8 to 5.0 | aiSystem 0.70 to 0.73 (3 of 3) |
| event depths | 20.8 | 7.96 | 12.4 | 8.7 to 8.9 | 0.06 | 0.05 to 0.07 | 8.6 to 8.8 | none |
| flood wastes | 21.3 | 7.49 | 13.3 | 9.2 to 9.4 | 0.05 to 0.07 | 0.10 to 0.11 | 9.0 to 9.3 | none |
| boss wastes | 18.2 | 9.71 | 8.1 | 4.7 | 0.01 | 0.04 to 0.05 | 4.6 to 4.7 | none |
| event wastes | 20.0 | 7.11 | 12.4 | 8.1 to 8.7 | 0.05 | 0.08 to 0.10 | 7.9 to 8.5 | none |

- **Section 3.2 acceptance: FAIL.** The 0.5 MB/s total fails in every scene on the Pixi share alone. The 0.1 MB/s per sim function passes in 7 of 9 scenes in all 3 runs and fails in every run of event hive and boss depths (`aiSystem`, the first-use deopts below). Flood hive is over in some runs: the review measured `aiSystem` at 0.45 MB/s on `47b02e8`, and 1 of 6 runs on this build measured 0.47 (neither run traced; the traced runs show the same first-use deopts landing inside the window). The heap still grows after a forced GC (below).
- The causes were engine behavior, found with V8's own output (`--trace-turbo` graphs listing each `Allocate` node by source line, `--trace-turbo-inlining`, `--trace-opt`, `--trace-deopt` and `--trace-generalization` inside marked windows), not in the source:
  - `SpatialHash` cleared its buckets and the query buffer with `length = 0`, which frees an array's backing store in V8, so every insert and every query grew a new one (most of `aiSystem` and all of `buildEnemyHash`). Buckets now keep a count, and `query` writes `out[0..n)` without cutting `out`, in the same order.
  - `Math.hypot` copies its arguments per call. `hypot()` in `core/vec.ts` is V8's and JavaScriptCore's two-argument algorithm step for step, and it equals `Math.hypot` bit for bit for every input: `node scripts/test-hypot.mjs` compares every pair of 20 edge values (NaN, both zeros, both infinities, subnormals, the largest doubles) and 2 million random pairs, and checks that an inlined call allocates nothing. (Review fixes: the first version returned 0 for (NaN, 0) and NaN for (Infinity, NaN). Returning the global `NaN` or `Infinity` from the special cases then made V8 box every result of the inlined call, about 16 B per call and 0.4 to 0.9 MB/s in `aiSystem` at 500 enemies, so the special cases return the argument itself.) `Math.sqrt(x * x + y * y)` differs from `Math.hypot` in the last bit for about 40% of inputs. Every det, det-long and det-death hash is unchanged.
  - A number field that first holds a fraction mid-run (the first bite, pod, acid pool, boss fight) changes the hidden class of every object of that shape and deoptimizes each system compiled against it; they then run unoptimized, allocating on every arithmetic step, for many frames. `doubleFields()` (`core/fields.ts`) settles the number fields of the long-lived sim objects at construction. `node scripts/probe-alloc.mjs x all --shapes` plays the full arc in each world and fails on any representation change after 10 s: base 38 changes in the first 150 s of Hive, PA none in 780 s of each world.
  - Enemy and weapon defs were object literals of many shapes, so every per-enemy `def` read was a per-type lookup that boxes fractional fields, and a new type mid-run deoptimized its readers. Both tables now build every def with every key in one order.
  - `aiSystem` merged the imported `ENEMY_SPEED_CEIL` (an untyped module binding) into the speed, which boxed the speed of every enemy every tick; it now clamps with `Math.min`.
  - Particle emitters called `rng.range` per value (a call that is not inlined returns its number boxed) and Pixi setters inside the sim tick. They now draw with `Rng.fill` (float()'s steps, bit for bit) and record the look (texture, blend, tint); `renderParticles` applies it when the particle first shows.
  - Pixi builds a `Color` on every `tint` write, even an unchanged one: per-frame and spawn-time tint writes go through `setTint` (writes only a change).
  - DEV only: `GameLoop.p95()` sorts a preallocated copy, and the hidden debug overlay no longer builds its info object.
- What remains:
  - Pixi internals, 4.2 to 9.6 MB per second: the transform update of every sprite that changed this frame (loads of fractional fields through megamorphic property access box, about 70 B per changed sprite per frame), the draw-list rebuild each time a pooled sprite is shown or hidden (`break`), and the HUD's per-frame `Graphics` redraws (P15 replaces them). Candidates for P19 or P20: particles and gibs in a `ParticleContainer` on one atlas, pooled sprites kept visible and moved out of view instead of toggled, and the render groups tried here (no measurable change, reverted).
  - First-use deopts. When a branch of the per-enemy loop runs for the first time in a page session, V8 finds no type feedback there ("Insufficient type feedback"), drops `aiSystem` out of TurboFan and runs it in Maglev, which boxes, until it optimizes it again; that can take the rest of a 10 s window. With TurboFan code in the window, the per-enemy loop allocates nothing (flood hive traced with `--trace-opt --trace-deopt`: TurboFan for the whole window, `aiSystem` under 0.1 MB/s). The failing scenes are this effect: boss depths deopts at the first brood unit inside a cage (`brood++`, bytecode offset 662) and then at the first slowed enemy's `slowFactor` read (1865); event hive at the first stream unit (the `streamStep` call). Other first-use sites in the traces: the hit-flash, slow and buff timers (offsets 430, 479, 543), a spitter's first back-off and first shot (1282, 1335), the first affix elite (`affixStep`, 731), and in `bossStep` a first call (314). Moving a rare branch into a small function does not avoid this: a call site that has never run deoptimizes the same way ("Insufficient type feedback for call", as the stream case shows). Options for P19 or P20: write per-enemy counters without a branch (`brood += inFight ? 1 : 0`), run each path once before the first optimization, or treat the one-time cost per session as event-rate and apply the per-function budget to the steady state only. To trace a scene: `node scripts/probe-alloc.mjs boss depths --dumpio "--jsflags=--trace-opt --trace-deopt --trace-generalization"` prints each tier change between the `PA_MARK_start` and `PA_MARK_stop` lines, and `--jsflags="--print-bytecode --print-bytecode-filter=aiSystem --trace-generalization"` maps the offsets.
  - Heap growth over 60 s of flood hive after a forced GC (`--growth=60`), 3 runs per build alternating base and PA: base +0.70 to +0.78 MB, PA +0.84 to +0.95 MB. Of the objects allocated in the window, base still holds 0.93 to 1.21 MB and PA 0.83 to 1.09 MB. Pixi's ticker (`_tick`, 0.38 to 0.49 MB) and its container and draw-list objects hold most of it in both builds; game code holds 0.08 to 0.20 MB (base) and 0.04 to 0.09 MB (PA), and no pooled sim object (Enemy, Projectile, Particle, Pickup) is in PA's top 10. So the pools do not explain the difference, and the prewarm sizes stay as section 3.2 lists them. Section 3.2's "no growth" fails in both builds on Pixi.
  - A16, 10 s of the `perf-final` scene (`node scripts/probe-alloc.mjs x x --gc --perks=`), alternating on a loaded machine: base 19 and 20 minor GCs, longest 1.60 and 1.76 ms; PA 9 minor GCs, longest 1.37 and 0.99 ms; no major GC. Two earlier PA runs under heavier load: 9 minor GCs, longest 2.12 and 2.25 ms. The integrator's run alone decides A16.
  - `node scripts/measure.mjs 390 844 bench nova hive 10 --perks=...` (3 runs each, contended machine): stepSim mean 0.47 to 0.65 ms base, 0.38 to 0.63 ms PA; render update 0.62 to 0.79 ms base, 0.58 to 0.79 ms PA; Pixi draw 1.36 to 1.65 ms base, 1.39 to 1.90 ms PA. No change beyond the noise on an M1.

**W4 integration note (P13, P15, P9, P11 and PA merged on main).**
- Determinism on the merged build (compare within this build only): det 600 at 375x667, 667x375, a rerun and the settings injection all give hive 642fbc46, depths 1365ccb6, wastes d3c8cef6; det-long hive 49f8452e, depths b2509c53, wastes e27e6638; det-death hive 97ec1b8a (158.98 s), depths df152cad (211.17 s), wastes 83418332 (176.77 s); `--threat=3` det hive 77ca2ebb, depths ef465647, wastes 937e2980. The Daily of 2026-10-02 (Daily #3, wastes, VESPER, T1) gives det 552a87a2 (offers 28e7cbfc, score 1884) with a fresh save at 375x667 and with the unlocked save, MAGMA and the extreme settings at 667x375, and det-death aa2fa281 (score 26988, offers 5d979317) at 390x844 and 844x390. The Daily score moved from P13's 1860 because THREAT 1 now has its gameplay effects (P11).
- **A12 FAILS on the merged build** (`smart:SEED:14:nova:priority:T`, Hive, seeds 1001 x 1 to 30): T0 6/30 (20%), T1 12/30 (40%), T4 1/30 (3%). T4 passes; T1 at most T0 does not (seeds 1 to 10 alone: T0 1/10, T1 5/10, T4 0/10). The P11 branch had T0 5/10 and T1 3/10 before P9. Per run the shards, bonuses, Hive Cores and evolutions are the same at T0 and T1 (3.3, 13.4, 1.4 and 0.7 on average); the difference is where the runs end: 12 T0 runs die between 7:30 and 10:30 against 6 at T1. P19 owns it. One candidate, not measured: each extra T1 elite gives 20 unscaled XP, about 140 swarmers' worth after minute 7 (xpScale 0.14 to 0.17).
- **A13 FAILS on the merged build** with the shipped P11 knobs (`speedMul 1.3`, `bossStay 90`): set 1 has 16 OVERTIME runs, 14 dead by 20:00 (88%) and T0 seed 9009 alive at 25:00 in cycle 5 at full HP; set 2 has 21, 18 dead by 20:00 (86%), none past 24:00. The late runs die in cycle 4 (21:12 to 24:20). The survivor holds full HP through OVERTIME on a sustain build (Vampiric, Regrowth 2, Bulwark 2, Vitality 5, LIVING ARMOR, BLOODRUSH, Second Wind) with three evolutions (the PRIME core at OVERTIME start adds one) and about 3.5 bonus drops a minute in OVERTIME (P9). One arm with `speedMul 1.35` changed little (set 1: 14/16 and the same survivor; set 2: 19/21, 90%) and was not shipped. P19 retunes OVERTIME against A13 with P9 in (the bonus rate at OVERTIME kill counts, sustain, or the speed and stay knobs).
- A3 brood cap (P11), invincible Hive roam bot, seeds 1001, 2002 and 3003: alive max 358, 377 and 424 (pass at most 610), at most 21 brood per 30 s chunk, 17 of 17 beats on time or by rule; over row maxAlive 0, 211 and 257 and a saturated share up to 0.298 (the row 10 to row 11 step, P19, as in the P11 note).
- Section 3.2 on the merged build (`probe-alloc all all`, one run, then event depths twice more), MB/s sim: flood hive 0.29, depths 0.11, wastes 0.13; boss hive 0.03, depths 0.78, wastes 0.01; event hive 0.63, depths 0.66 then 0.13 and 0.21, wastes 0.07. Totals 2.7 to 9.9 (Pixi 2.6 to 9.5). Over 0.1 MB/s per function: `aiSystem` in event hive (0.43), boss depths (0.68) and the first event depths run (0.50), the first-use deopts described above. `probe-alloc x all --shapes` first reported `CoreReveal.openAt` and `closeAt` (P9) turning from integer to double fields at the first reveal; `doubleFields` at construction fixed it, and the check passes (190 markers, no representation change).
- A16 on the merged build, 4 runs of `probe-alloc x x --gc --perks=` with nothing else of ours running but 5.4 GB of swap in use and system daemons busy (load 3.3 to 4.3): longest pause 2.20, 3.42 (the one run with a major GC), 3.01 and 1.04 ms; 7 or 8 minor GCs per run (PA 9, base 19 and 20). Only 1 of 4 passes; the owner or P20 should repeat it on an idle machine before calling it.
- Perf alone at 390x844 (load 2.8 to 3.8): perf hive and perf wastes 60 fps, p95 16.8 ms, max 16.8 ms, 0 frames over 20 ms, sim time 91.2 to 111.8 s in the window; perf-final hive p95 16.7 ms, max 16.8 ms, 0 over 33.4 ms, sim time 600 to 609.9 s, peak alive 329.

**W4 integration fix (after the W4 review).**
- **OVERTIME bonus rate.** P9's drop chance is per unscaled XP, so OVERTIME's kill volume raised the drop rate past P9's band of 1.5 to 3 a minute (A5.3). The invincible roam bot (`node scripts/playtest/playtest.mjs hive roam:1001:20:nova:priority:0:ot roam:2002:20:ember:evolve:2:ot`) drew 2.52 and 2.69 bonuses a minute from 2:00 to the win, and 4.09 and 3.21 in OVERTIME. The default bots of the A13 sets below drew a median of 2.95 (set 1) and 2.67 (set 2) a minute in OVERTIME, per run with 30 s or more of it, and up to 4.58. Scaling the chance by xpScale's x0.8^c gave 3.34 and 2.75 on the roam bots. `OVERTIME.bonusMul` 0.6 (x0.6^c) gives 2.85 and 2.87 (Depths and Wastes, seed 1001: 2.54 and 1.98), and medians of 2.06 and 2.02 on the A13 sets. Two short windows stay over 3: 9 drops in 150 s and 14 drops in 256 s. Nothing before the win changes, and every bot reaches OVERTIME at the same second.
- **A13 with the bonus rate split out** (`smart:SEED:25:nova:priority:T:ot`, the two sets of the W4 note). With the merged rate (`bonusMul` 1), set 1 has 14 of 16 dead by 20:00 (88%): T0 seed 9009 is alive at 25:00, drawing 3.25 bonuses a minute in OVERTIME, and T2 seed 2002 dies at 24:19. Set 2 has 18 of 21 (86%). This matches the W4 note. With 0.6^c, set 1 has 12 of 16 (75%): T0 seed 9009 is alive at 25:00 at 1.90 a minute, and so is T2 seed 2002. Set 2 has 20 of 21 (95%), none past 24:00. Both arms total 32 of 37 (86%). So the bonus rate does not keep the survivors alive: seed 9009 lives at the low end of the band. **A13 still FAILS.** P19 retunes sustain, `speedMul` or `bossStay` against it.
- **A12 cause** (`smart:SEED:14:nova:priority:T`, Hive, seeds 1001 x 1 to 60). T0 wins 6/30 on seeds 1 to 30, which matches the W4 note, and 12/30 on seeds 31 to 60, so 18/60 in all. T1 wins 12/30 and 8/30, so 20/60. Seeds 31 to 60 alone pass `T1 at most T0`. Over 60 seeds T1 leads by 2 wins (33% against 30%, two-sided Fisher p 0.85; 6/30 against 12/30 gives p 0.16). Two T1 arms ran on the same 60 seeds; each matches T1 until its first extra elite. With the extra elites' XP scaled by the row's xpScale, T1 wins 22/60. With no extra elites at all (HUNTERS without its +1), it wins 21/60. So neither the extra elites' XP nor the elites themselves raise T1's win rate, which rules out the W4 note's candidate. T1 changes every enemy's HP from the first spawn, so a T0 run and a T1 run of one seed are independent samples. The T1 step (+10% HP, an affix on the teaching elite, +1 elite from 6:15) is smaller than the noise of 60 runs of this bot: T1 dies before 7:30 more often (28 of 60 against 22), but it wins more of the runs that reach 7:30 (20 of 32 against 18 of 38, p 0.24). T4 wins 1/30, which passes. **A12's T1 clause still FAILS as written (20/60 against 18/60).** P19 decides between a stronger HUNTERS step and a T1 clause measured on 60 seeds with a tolerance.
- **Practice Daily.** A practice Daily's intro reads `DAILY #N` over `<WORLD> · PRACTICE RUN` (A15). The HUD tag stays `DAILY #N`.
- **FREEZE.** Frozen chargers no longer show a live dash threat (A5.3, section 6.5). An ad-hoc probe of the Wastes CHARGER VOLLEY at 375x667 checks this. Unfrozen windup chargers flicker between #ffffff and their tint, their lanes pulse at 0.22 to 0.49, and the off-screen one has an arrow. Under FREEZE they draw only #7fd8ff, their lanes hold at 0.22, and there is no charger arrow. After the thaw all three return.
- **hud-shots.** The HUD scene shows the tag `DAILY #1000`, and the intro check stages the title `DAILY #1000`. So the Daily pairs (the tag against the timeline and the score, and the bonus rings against the tag) now run. `node scripts/hud-shots.mjs p320,l568,p375,l667,p390,l844 --world=hive` passes at all six sizes. At p320 the tag (79 x 13) starts 11 px right of the timeline. As a negative control, the tag `DAILY #1000 PRACTICE` fails `overlap daily / timeline` at p320 and p375, which is why the HUD tag carries no practice mark.
- **ui-shots and the leaderboard.** The leaderboard steps (opt-in card, name prompt, rank lines, JOIN, NO THANKS) need a dev server with `VITE_LEADERBOARD_URL` and `VITE_LEADERBOARD_DEV_SUBMIT`. Any URL works, because the script mocks the API in the page. `ui-shots.mjs` reads the env the dev server injects. Without both variables it skips steps 16, 17, 18b, 21 and 23, lists them under `skipped` and prints the reason. Run them with `VITE_LEADERBOARD_URL=http://127.0.0.1:8788 VITE_LEADERBOARD_DEV_SUBMIT=1 npx vite --port 5177 --strictPort`, then `SWG_URL=http://localhost:5177 node scripts/ui-shots.mjs p375,l667`. Results at p375 and l667: 0 failed with the variables. Without them, 0 failed and 5 skipped. The overlap list is unchanged from 7d473a1: text under the confirm sheet and the settings panel, and the 13-win `COLLECT FOR XP` line (P17).
- **Determinism and perf on the fixed build.** Every det, det-long, det-death, settings-injection, Daily and `--threat=3` hash in the W4 note is unchanged, because the fix changes only OVERTIME and presentation. Perf ran alone at 390x844 (load 3.8 to 4.9, with system media daemons busy). `perf nova hive` and `perf nova wastes`: 60 fps, p95 16.8 and 16.7 ms, max 16.8 ms, 0 frames over 20 ms. `perf-final nova hive`: p95 16.7 ms, max 16.8 ms, 0 over 33.4 ms, peak alive 329.

**Section 3.2 note (PB, render-side zero allocation, W5).**
- Measured with `node scripts/probe-alloc.mjs all all --budget=1.0` (the scenes of the PA note), MB per second. Base: the W4 build `16939b5`, one run in this lane. PB: three runs, the total as a range and the last run's split.

| Scenario | Base total | Base sim | Base Pixi | PB total (3 runs) | PB sim | PB presentation | PB Pixi |
|---|---|---|---|---|---|---|---|
| flood hive | 10.50 | 0.77 | 9.53 | 0.59 to 0.67 | 0.14 | 0.12 | 0.35 |
| boss hive | 2.83 | 0.03 | 2.73 | 0.37 to 0.40 | 0.02 | 0.06 | 0.32 |
| event hive | 8.82 | 0.64 | 8.07 | 0.50 | 0.09 | 0.10 | 0.31 |
| flood depths | 9.01 | 0.11 | 8.78 | 0.52 to 0.60 | 0.12 | 0.07 | 0.33 |
| boss depths | 4.29 | 0.83 | 3.42 | 0.36 to 0.39 | 0.04 | 0.04 | 0.28 |
| event depths | 8.52 | 0.07 | 8.35 | 0.48 to 0.50 | 0.10 | 0.05 | 0.35 |
| flood wastes | 9.31 | 0.19 | 8.99 | 0.48 to 0.52 | 0.08 | 0.09 | 0.34 |
| boss wastes | 3.28 | 0.01 | 3.22 | 0.33 to 0.34 | 0.01 | 0.05 | 0.27 |
| event wastes | 8.62 | 0.07 | 8.42 | 0.37 to 0.40 | 0.06 | 0.06 | 0.25 |

- **Acceptance: PASS.** Every scene is at most 1.0 MB/s in every run (the 0.5 of section 3.2 holds in 6 of 9 scenes in the last run; the flood scenes are 0.48 to 0.67). No sim function reaches 0.1 MB/s in any run (largest: `hypot`, 0.04). Base sim functions over 0.1: `aiSystem` 0.43 to 0.74 in flood hive, event hive and boss depths.
- Where base allocated: `updateTransformAndChildren` 1.9 to 6.0 MB/s (Pixi's shared setters and transform update see every node class, so each fractional field read or write of a changed sprite is a megamorphic access that boxes the double, 70 to 150 B per sprite per frame), `break` 0.2 to 2.4 (the whole stage's draw list rebuilt whenever a pooled sprite was shown or hidden, in 263 to 289 of 300 frames of flood hive), and `set alpha` and `set tint` 0.4 to 0.7.
- What changed:
  - Enemies, player and enemy shots, pickups and acid pools draw as quads in ParticleContainers (`src/render/quads.ts`), one per pool. Each pool entry owns a quad in a fixed slot (so the draw order stays that of the old sprites), and a dead entry's quad gets zero size instead of `visible = false`. The sim's spawn sites write the look (frame and anchor, tint, alpha, scale) as plain fields; the renderer writes position, rotation and the packed color each frame. Entity layer order: enemies, player shots, enemy shots, the base build's order while the enemy pool held its 64 prewarmed sprites (the whole early game). Enemy shots draw last, so a shot to dodge stays visible inside the swarm (PB review: the first build drew them under every enemy, which hid them). The fx layer: pod rings, emerge, pickups, normal particles, additive particles.
  - Particles, emerge parts, backdrop motes and glows, damage-number glyphs and ichor stamps are refilled into quad layers each frame (one layer per blend mode and texture source). Particles no longer own a sprite.
  - One atlas (`TextureRegistry.packAtlas`, 2049 px wide): every texture baked at resolution 3 but the hazard lane and sector, copied pixel for pixel with 3 px gutters; the ichor splats get their own small atlas (`packTextures`).
  - `warpHost` and `overlay` are render groups: the camera moves one matrix, and a toggle inside one rebuilds only that group. Structure changes in flood hive: 263 to 289 of 300 frames before, 11 of 298 after (HUD, callouts and arrows at event rate).
  - Two Pixi details in `quads.ts`: the generated upload loop (`new Function`, sloppy mode) assigns `offset` and the vertex corners without declaring them, so each corner was a boxed implicit global (about 3 MB/s by itself); a `var` line makes them locals. And each layer has its own particle shader instance, so drawing layers of different textures does not rebind one shared shader.
  - The hurt edge glow parks off screen at alpha 0 instead of toggling `visible`.
  - Particles prewarm to `MAX_PARTICLES` and enemy shots to `MAX_ENEMY_PROJECTILES`; refilled layers reserve their caps; ichor prewarms 64 stamps.
  - First-use warm-up (`src/game/warmup.ts`, called once in `boot` before the loop starts): on a scratch World with its own arena, player, ichor and unattached layers, every event, elite and boss beat of each world (one THREAT per world: Hive 0, Depths 2, Wastes 4), boss phases, deaths and the PRIME win, the OVERTIME start, every bonus, pickup and weapon, the full perk and fusion build and dashes run through `runSystems` (`src/game/step.ts`, the one list of stepSim's systems, which stepSim calls too), and `renderEntities` after each step. One THREAT per world is enough: each A11 rule is off in one pass and on in another, the rules act only in code every world shares (the script, the director, the boss cadence, kill drops), and a mirror copy only turns its event's angles, so no world-specific branch depends on THREAT. It takes about 100 ms on an M1 (9 boss kills, 3 clears, 36 elite kills); boot under 4x CPU throttling measured 1.9 to 2.0 s against the base's 1.4 to 2.6 s on the dev server. The real input's fields are restored after.
- No `Graphics.clear()` runs per frame: a hook on `Graphics.clear` and `GraphicsContext.clear` over 4 s of a Depths boss fight counted none (P15's NineSlice plates and DigitStrips).
- Determinism: det at 375x667, 667x375, a rerun, the settings injection and `--threat=3`, det-long and det-death at both views, and the Daily of 2026-10-02 (a fresh save at 375x667, the unlocked save with the extreme settings at 667x375, det-death at 390x844) give exactly the W4 hashes listed above, `rerunMatch` true in all 30 lines. `probe-alloc x all --shapes`: pass, no representation change (190 markers).
- Heap growth after a forced GC, 60 s of flood hive: 0.38 to 0.46 MB with the probe's 20 s warm-up, 0.10 to 0.15 MB with `--warm=80` (4 runs; the PA note measured 0.84 to 0.95 at 20 s). A heap-snapshot diff by node type over the 20 to 80 s window puts most of the early growth in optimized code objects (V8 finishing tier-up; code space is part of the heap), which the sampler books to the requestAnimationFrame callback when the code lands. Pools that still grew inside the window (particles to 1500, enemy shots to 160) were the rest and are now prewarmed. The 10.3 acceptance (under 0.2 MB per 60 s) is measured with `--warm=80`; the 20 s number is dominated by engine warm-up. Section 3.2's proof asks for no growth, which 0.10 to 0.15 MB is not: it stays open for the integrator (P20).
- `node scripts/measure.mjs 390 844 bench nova hive 10 --perks=piercing,cryo_rounds,explosive_rounds,arc_rounds,incendiary,ricochet,f_shatter,f_firestorm`, 5 runs alternating base and PB on a loaded machine (load 4.5 to 6): Pixi draw mean 1.70 to 1.95 ms base, 0.48 to 0.67 ms PB; render update 0.63 to 0.76 ms base, 0.26 to 0.37 ms PB; stepSim 0.42 to 0.52 ms base, 0.43 to 0.59 ms PB (noise).
- Other checks on the PB build: `npm run build` (check:sim included); a scripted bot plays Standard Hive to 12:20 with the live render loop (mid1 killed, the mid2 and PRIME fights rendered), the recap, a Daily and the menu, with no page or console error; `probe-score`, `probe-meta` and `probe-p8` read entity quads now (`p.quad`): probe-score and probe-meta pass, and probe-p8 fails the same 3 checks on the base build with its own copy (`pods.cageClamp` 0.024 u over, `pods.crossNoTake` and `pods.holdTime`, which predate NOVA's instant pods from P9). `ui-shots p375,l667`: 0 failed and 5 skipped on both builds; the lists differ only in where the 13-win `COLLECT FOR XP` label lands (offscreen or over the win text, a timing-dependent known P17 item).
- Visual check: frame-stepped screenshots (live loop stopped, synthetic timestamps, shake off, DPR 2) of the base and PB builds at 375x667 and 667x375: flood, event, boss and dense-swarm scenes and an emerge scene per world, looked at side by side with no visible change. Pixels differing by more than 8 of 255: 0.007 to 0.08% in the flood, event and emerge scenes, 1.0% in the dense swarm at 375x667 (overlapping particles drawn in another order: normal and additive particles are now two layers, and a layer is refilled in pool order). The Depths boss scene differs 9 to 12%, but two base runs differ 7.9% from each other: the Void Matron warps, and the warp's wobble reads the wall clock (`main.ts`, `performance.now()`), so that scene is not frame-reproducible.
- **PB review fixes**, measured on the fixed build:
  - Enemy shots draw above the enemies (the layer order above). In a frame-stepped Hive scene with a swarmer placed on each of 6 live enemy shots, the shots change 503 device pixels at 375x667 and 472 at 667x375 against the same frame with them hidden. Drawn under the enemies (the first build's order), they change 0.
  - `runSystems` (`src/game/step.ts`) is the one list of the tick's systems, which stepSim and the warm-up both call.
  - The warm-up keeps one THREAT per world (see the warm-up line above). `probe-alloc` takes `--threat=N`. `probe-alloc event hive --threat=3 --seconds=20` covers EVENT 1 and its mirror copy: 0.59 MB/s, sim 0.13, no sim function over 0.1 (largest `float`, 0.03). `boss hive --threat=4`: 0.43 MB/s, sim 0.03.
  - `probe-alloc all all --budget=1.0`, one run: 0.36 to 0.64 MB/s in every scene, no sim function over 0.1 (largest `streamStep`, 0.04). Heap growth over 60 s of flood hive: 0.10 MB with `--warm=80`, 0.44 MB with the default 20 s.
  - det at 375x667, 667x375, a rerun, the settings injection and `--threat=3`, det-long and det-death at both views, and the Daily of 2026-10-02 give the W4 hashes again.
  - A live-loop bot (invincible, each boss cut short after 15 s of fight) plays Standard Hive through mid1, mid2, the PRIME win, OVERTIME and 7 OVERTIME bosses to 32:17 (6656 rendered frames), then the recap, a Daily and the menu, with no page or console error.
- What remains on the render side (0.25 to 0.35 MB/s of Pixi in every scene): the bloom and grade filter passes rebind pooled render textures (listener records in `setResource`, 0.04 to 0.09), each quad layer's buffer upload emits an event (0.04 to 0.06), render-target binds (0.03 to 0.05), and the remaining UI sprite updates (0.03 to 0.04). Not run in this lane: perf, perf-final and A16's `--gc` trace (the integrator's).

**W5 integration note (P16, P17 and PB merged on main).**
- Merges (`--no-ff`, in the order P16, P17, PB). P16 merged clean. P17 conflicted in `main.ts`, `feelDirector.ts` and this file; PB in `main.ts`. Both phases' intents were kept: the UI layer order holds P16's pause sheet and recap and P17's hints chip and records; `endRun` reads the bests and feats before recording (P16), then files the run through `fileRun` (P17); the BossKill case keeps P17's bloom pulse and P16's `bossSlain(false)`; `stepSim` runs the time, the input sample, P16's start gate, then PB's `runSystems`, so the system order lives only in `src/game/step.ts`.
- Built in the integration (both lanes deferred it to the other): the `draft` hint (`hints.draftLine()`) is the draft modal's subtitle for the first 2 drafts. It is a text.hi line above the controls hint, under the controls, not under the title: under the title there is no room between `LEVEL N` and the cards. The full ceremony's white flash goes through `feel.tryFlash`, so Flashes off (or the 3 per second limiter) leaves it out. Settings opened from the pause sheet return to it through `closeSettings` (X, BACK, Escape, Android back, pad B or Start); opened from the menu they return to the menu.
- Integration fixes:
  - The `hints` record had two writers: P16's draft controls counter (`draftPick`, a read-modify-write in `main.ts`) and P17's `Hints`, which keeps a copy loaded at run start and saves the whole copy when a hint shows. The next hint in the same run wrote the old copy back, so `draftPick` never advanced. The counter is now `Hints.bump()`, the one writer of the record.
  - The feats hint toast (P17) showed before `endRun` switched the screen, so it took the menu's slot (the band over the title) and covered the recap header. It now shows last in `endRun`, after the opt-in card and the rank row are placed, and waits for a recap with no opt-in card (the card's area is the recap's toast slot, and the toast would cover its buttons). `ToastSlot` has an optional free height: the recap's slot under the meta column was sized for one line, so the two-line feats toast ran 6 px into RETRY at 375x667; a taller toast goes to the top of the screen, as a recap toast already did on short screens. On a first-run recap at 375x667 (unlock card and 3 goals) that was the top band over the header, for 5 s, until the W5 integration fix below made room for it.
  - The recap's unlock card lists new rewards first. P16 listed every finished feat in evaluation order, so `FIRST CONTACT · Already yours` took a visible row and new rewards went to `+N more in RECORDS`.
  - Instruments that encoded a sibling's old UI or sim: `probe-meta` (the menu toast may cover the title, P17's slot; the recap check reads P16's unlock card), `probe-lb ckpt` (P17's Daily card button reads `PRACTICE`), `probe-dash` (its test enemies are past P15's 0.45 s emerge, which delayed the first bite by 26 ticks; stale since W4).
- Determinism on the merged build: every hash equals the W4 note. det 600 at 375x667, 667x375, a rerun and the settings injection: hive 642fbc46, depths 1365ccb6, wastes d3c8cef6; `--threat=3` 77ca2ebb, ef465647, 937e2980; det-long at both views 49f8452e, b2509c53, e27e6638; det-death at 375x667 and 390x844 97ec1b8a (158.98 s), df152cad (211.17 s), 83418332 (176.77 s); the Daily of 2026-10-02 det 552a87a2 (offers 28e7cbfc, score 1884) fresh at 375x667 and unlocked with MAGMA and the settings injection at 667x375, det-death aa2fa281 (score 26988, offers 5d979317) at 390x844 and 844x390. `probe-p16.mjs gatedet` gives e34934ef for both runs.
- Lane headlines re-measured on the merged build:
  - P16: `probe-p16.mjs` passes every part: gate (10 s idle at 0:00, HP 100/100, streams unmoved; a key, a mouse move and a touch open it at 1.07, 0.92 and 0.85 s), lock (a draft tap at 67 ms, a recap tap at 66 ms and an EXTRACT at 82 ms ignored; later taps pick, retry and extract), background, chain (alpha 1, faces 1, pending 3, 2, 1), rotate and pad (13 flags). `hud-shots.mjs p320,l568,p375,l667,p390,l844 --world=hive`: 0 fails, the PRIME lane `['QUEEN SLAIN']` with sub `FLAWLESS`.
  - P17: `menu-shots.mjs p375,l667,p390,l844,d1440` (leaderboard variables set): failed [] and errors [] at every size (p375 re-run after a screenshot timeout while a source edit reloaded the server), issues only on 04b (the two-message boot toast), worst contrast outside 04b 6.45. Pause chip boxes p375 [12,80,67,104], l667 [12,62,67,86], p390 [12,130,70,155], l844 [59,64,117,89], no overlaps; 04c rebuilds the Daily card for the new day; the seeds self-check.
  - PB: `probe-alloc all all --budget=1.0`: flood hive 0.65, boss hive 0.37, event hive 0.52, boss depths 0.41, event depths 0.49, flood wastes 0.48, boss wastes 0.34, event wastes 0.39 MB/s, no sim function over 0.1. Flood depths read 1.32 with `aiSystem` 0.67 in the first run (a tier change inside the window, the PA note), then 0.63 and 0.71 with none over 0.1. Growth over 60 s after an 80 s warm-up: 0.085 MB. `--shapes`: 190 markers, no representation change. Entity layers are enemies, player shots, enemy shots. Bench (390x844, Hive, the 8-perk build), alternating the PB branch and the merged build on one loaded machine (5 GB of swap in use): Pixi draw mean 0.80 to 0.88 ms PB, 0.77 to 0.82 ms merged; render update 0.45 to 0.50 PB, 0.47 to 0.54 merged; the merge keeps PB's gain (the absolute numbers are above the PB lane's because of the machine state).
- Screens: `ui-shots.mjs p375,l667` (leaderboard variables set): 0 failed, 0 skipped, 0 page errors; overlaps only on 03b (text under the confirm scrim and the daily hint toast in the menu's title band) and p375 26 (the feats toast over the header, above). P16's steps at p390 and l844 (insets): no findings. A probe of the integration items (draft subtitle on drafts 1 and 2 only, controls hint on drafts 1 to 3, `draftPick` 1 to 4 kept after a later hint, the ceremony flash shown with Flashes on and hidden with it off, settings from pause back to the sheet by Escape and by close) passes with no page error.
- Other checks: `npm run build` (check:sim over 43 files), the em dash grep, `test-meta`, `test-rules`, `test-storage`, `test-hypot`, `draft-test`, `feats-pacing`, `probe-score`, `probe-p9`, `probe-dash`, `probe-meta` and `probe-lb` (fresh, prompt, errors, ckpt) pass. `probe-lb`'s three live posts need a local worker on 127.0.0.1:8788, which was not running. `probe-p8` keeps its 3 known failures (pods.cageClamp, crossNoTake, holdTime; the probe predates NOVA's instant pods, PB note). `playtest.mjs hive smart:1001:4`: 4:00, L10, 1,173 kills, the mid boss up at 4:00, alive.
- Perf alone at 390x844 (no other job of ours): `perf nova hive` 60 fps, p95 16.8 ms, max 16.8 ms, 0 frames over 20 ms, sim time 91.2 to 111.8 s (load 3.2); `perf nova wastes` 60 fps, p95 16.7 ms, max 16.8 ms, 0 over 20 ms, sim 91.2 to 111.9 s (load 2.9); `perf-final nova hive` p95 16.7 ms, max 16.8 ms, 0 over 33.4 ms, sim 600 to 609.9 s, peak alive 331 (load 3.5).
- **A16 FAILS on this machine** (`probe-alloc x x --gc --perks=`, 3 runs): each 10 s window has one minor GC (W4: 7 or 8), and it paused 5.83, 4.20 and 78.8 ms (the last with a 0.5 ms parallel phase inside a 28 ms scavenge, a descheduled thread), with 5 GB of 6 GB swap in use and load 3.7 to 5.9. The owner or P20 repeats it on an idle machine.

**W5 integration fix (after the W5 review).**
- **The feats toast on the first recap.** The two-line feats toast went to the top band and covered the recap header and its sub line for 5 s, on the first recap most players see. `endRun` now calls `recap.reserveToast(line)` before it shows the toast. The recap measures the toast's plate for its column (`toastHeight` in `src/ui/toast.ts`) and keeps that height plus 8 px free above RETRY (portrait) or above the button row (landscape), through the section 9.6 overflow order (the build strip goes first, then goals past the first). The room stays for the rest of that recap, so the toast's expiry moves nothing. Only when no fit leaves the room does the toast take the top band. A rank line that arrives later places the toast again in the recap's new slot. Live-loop probe (fresh save, Enter, a held key, mouse fire, death at 0:36): at 375x667 the toast plate moved from [20, 8, 334, 60] (over `OVERRUN` and `STANDARD · HIVE MEADOW · NOVA · LV 4`) to [20, 448, 334, 60] under the goals, with RETRY at 553; at 667x375 it stays in the right column under the goals ([348, 218, 301, 60]). `ui-shots` step 26 now fails when the feats toast is missing or its plate covers any recap text; on the build before the fix it fails with `covers OVERRUN, STANDARD · HIVE MEADOW · NOVA · LV 4`.
- **The draft rows under the controls.** Arming BANISH moved the whole draft: on drafts 1 and 2 the subtitle row left the block (9 px), and on a draft with no controls hint (draft 4 on) the banish prompt added a row (13 px; at 320x568 the cards also shrank from 112 to 96). The modal now keeps, for the life of a draft, the rows that draft can show: the subtitle row when it has a subtitle, and the hint row when the controls hint shows or BANISH can be armed. Banish mode blanks the subtitle and shows its prompt in the hint row. A live probe that arms and cancels BANISH on drafts 1 to 5 found no moved text at 375x667, 667x375 and 320x568 (before: 19 to 24 moved texts on drafts 1, 2, 4 and 5). At 320x568 a draft that can banish now keeps 96 px cards from the start. `ui-shots` step 08c fails when the `LEVEL N` line moves; before the fix it fails with y 99 to 108 at p375 and 17 to 26 at l667.
- Checks on the fixed build: `npm run build` (check:sim over 43 files) and the em dash grep pass. det 600 at 375x667, 667x375 and a rerun give the W5 hashes (hive 642fbc46, depths 1365ccb6, wastes d3c8cef6), and det-death at 375x667 gives 97ec1b8a, df152cad and 83418332. `ui-shots.mjs p375,l667` (leaderboard variables set): 0 failed, 0 skipped, 0 page errors; overlaps only on 03b, as before. `probe-p16.mjs` passes every part (gatedet e34934ef twice). `playtest.mjs hive smart:1001:4`: 4:00, L10, 1,173 kills, alive. Perf alone at 390x844 (system daemons busy, load 3.5 to 4.5): `perf nova hive` 60 fps, p95 16.8 ms, max 16.8 ms, 0 frames over 20 ms; `perf-final nova hive` p95 16.7 ms, max 16.8 ms, 0 over 33.4 ms, peak alive 334. `perf nova wastes` had one long frame (50 ms, then 33.4 ms) in 2 of its first 3 runs and none in the next 3 (p95 16.8 ms, max 16.8 ms); the build before the fix, run between them, had none in 3. The fix changes no per-frame code (the draft modal lays out only when a draft opens or changes).

**A1 note (P4 review).**
- "Both phone views" means the P14 normalized camera views: 560 x 996 (portrait) and 996 x 560 (landscape). Measure them with `node scripts/measure.mjs 375 667 opening 560 996` and `node scripts/measure.mjs 375 667 opening 996 560`.
- Without view arguments, `opening` uses a 1:1 view (375 x 667 world units). That view cannot pass before P14, because `RING_NEAR` stays off screen on the normalized views by design (C27). Measured worst empty view: 16.0 s at 375 x 667 and 15.3 s at 667 x 375.
- With the first minute-0 minAlive values (Hive 12, Depths 10, Wastes 10), the normalized views failed: worst empty view 3.45 s portrait, 1.83 s landscape.
- P4 raised minute-0 minAlive to Hive 16, Depths 14, Wastes 14 (A7.2). Measured worst: empty view 0.80 s portrait and 1.32 s landscape, first enemy in view 0.30 s, first kill 0.57 s. P19 may lower these values only while A1 still passes at both normalized views.

**A10 note (P19 deaths pass).** Full tables, every arm and the commands: `docs/tuning/pass-deaths.md`. Smart-family deaths (smart, smart+P, smart+focus+P, smart+dash+P, smart+E), seeds 1001 x 1 to 30 per world, T0, 14 min.
- What killed fast (old values): the A10 window (last step at 50%+ HP to death) held bites, enemy shots, acid and charger rams at about 49, 41, 7 and 3% of its damage. Bites hit the 0.16 x maxHp cap every 0.4 s in an engulf (40 dps for NOVA), discrete hits (shots, rams, hazards) landed every 0.5 s at 17 to 36 HP each after the time ramp, and up to 4 overlapping acid pools hurt at once. The fastest deaths were two capped bites and one shot inside 0.42 s.
- Values (A1.1): `GRACE.hit` 0.5 to 0.8, `BITE.capFracOfMaxHp` 0.16 to 0.08, `ACID.maxStack` 1 (one overlapping pool hurts per tick, the first in pool order; every pool did before). `BITE.scale` 0.4 and `DMG_RAMP_PER_MIN` 0.04 stay: single-knob arms of scale 0.32 and ramp 0.02 did not move the tail, and ramp 0.02 on top of the rest made Hive smart+P win 9 of 10.
- **A10:** 316 deaths, median 2.12 s, minimum 0.42 s, 66 under 1.2 s (old values); 207 deaths, median 3.83 s, minimum 0.82 s, 7 under 1.2 s (new). The median passes; **the minimum still FAILS.** Every death under 1.2 s left is two discrete hits 0.8 s apart (two spitter or psychic shots of 20 to 25 HP, a Warden shot of 36 HP, or two charger rams of 36 HP) plus 1 to 3 capped bites. No value of these knobs bounds it: a 1.2 s window can hold 2 discrete hits at `GRACE.hit` up to 1.2 s, and two hits of 35 HP are already 70% of NOVA's HP. A guaranteed 1.2 s needs discrete hits of at most about 15% max HP each (enemy `projectileDamage` and the charger's `damage`, or a cross-source damage cap per window, which is a rule change). Owner or a later P19 pass decides.
- **Side effect, A7 and A8:** win rates rise past A7 in Hive and Wastes: smart+P 8/30, 7/30, 6/30 to 23/30, 7/30, 17/30 (Hive, Depths, Wastes), smart 4/30, 3/30, 5/30 to 12/30, 4/30, 11/30. A8 smart and smart+P now pass in every world (Hive smart 6:50 to 9:35, Depths smart+P 6:58 to 8:25, Wastes smart+P 7:07 to 14:00); crude stays at about 2:08 (its deaths got slower, not later). The boss-HP and density passes take the A7 overshoot. A12 passes (T0 23/30, T1 19/30, T4 2/30). **A13 gets worse:** 47/72 (65%) dead by 20:00 and 18 alive past 24:00 (baseline 25/33, 4), because more runs win and the bite cap is a share of max HP that OVERTIME's dmgMul cannot raise.
- Determinism on the new values (A14, 21 of 21 lines agree across 375x667, 667x375 and the settings injection): det keeps the W5 hashes (642fbc46, 1365ccb6, d3c8cef6); det-long 8c3766b0, 54a5737, 51ca7954; det-death 7408614a (159 s), 5739e8a2 (141.87 s), 224be1c (168.1 s).

**A6 and A7 note (P19 bosshp pass).** Full tables, every arm and the commands: `docs/tuning/pass-bosshp.md`. Seeds 1001 x 1 to 30 per world (the confirm) and 1001 x 31 to 60 (a holdout, `matrix.mjs --seed-from=31`), T0, 14 min, NOVA, evolutions, cores and bonuses live. `node scripts/playtest/fightwindow.mjs <runs dir>` prints the per-stage numbers below and the HP windows each clause leaves.
- Values (A10.1, A10.2, A7.2): mid1 `hpBase` 2400 to 2760, mid2 2600 to 3380, final 4200 to 9800; the OVERTIME boss keeps 2600 as its own `hpBase`; Wastes `worldMul` 1.15 to 0.9; new `primeHpMul` Hive 1.0, Depths 1.0, Wastes 0.95.
- **Why the PRIME needs 9800.** At 4200 on the deaths-pass build the focus bot killed the PRIME in 19.7, 26.9 and 31.6 s (Hive, Depths, Wastes) and smart+P won 23, 7 and 17 of 30. The deaths pass let more bots reach the PRIME with more levels (focus PRIME 25.8 to 19.7 s in Hive), and the PRIME's damage outgrows `buildScale`: the focus bot's damage per second over `88 x buildScale` is 0.95 to 0.99 at mid1 and 1.13 to 1.61 at the PRIME (median 2 cores taken before it; evolutions, fusions and pickup weapons are not in `buildScale`). Since boss HP grows with `buildScale ** 0.75`, the PRIME gets about 0.55 of mid1's seconds per unit of `hpBase`, so 4200 / 2400 made it about as long as mid1, and 9800 / 2760 makes it about twice as long.
- **A6 focus passes** on both seed halves and on the union: medians mid1 / mid2 / final Hive 26.6 / 26.7 / 60.6 s (60 seeds 24.9 / 24.5 / 53.2), Depths 24.0 / 22.0 / 64.2 (23.4 / 21.0 / 54.3), Wastes 25.1 / 23.3 / 59.2 (24.3 / 20.9 / 52.3). Kill to next arrival at least 20.1 s. The holdout half alone fails the 20 s floor in Depths mid2 (17.2 s) and Wastes mid1 (19.9 s): the two 30-seed halves differ by more than any knob step tried.
- **A6 default bot FAILS, and no PRIME HP can pass it with A7.** A7 needs 55 to 75% of smart+P runs to end without a PRIME kill while most of them reach the PRIME (45, 26 and 38 of 60), and the default bot's PRIME kills spread from 11 to 210 s with no gap: on 60 seeds 18, 17 and 16 kills under 150 s, 10, 9 and 10 between 150 and 210 s, 17, 0 and 12 stalemates. Every final tested (4200, 7000, 9800, 11300) left kills between 150 and 210 s in at least two worlds. The owner decides between counting a PRIME fight that ends by kill or by the 210 s stalemate as passing, a cap on the default bot's median instead of its maximum, or a 150 s PRIME stalemate (a rule change: the 14:00 run end, `UNCLEARED_MAX_MS` and the clear score depend on it). The mid stages fail on single fights: Hive mid2 seed 9009 (159.9 s), Depths mid1 seed 6006 (159.5 s), and on the holdout a Wastes mid2 ascend (180 s) and a 152.2 s mid2 kill. A 7% mid step that fixes one of them (b1 mid1 2560, b2 mid2 3150) moves every later fight and broke the focus floor or A7 elsewhere.
- **A7:** seeds 1 to 30 smart+P 13, 9 and 12 of 30 (43, 30, 40%), smart 7, 0 and 6 of 30 (FAIL in Depths only); 60 seeds smart+P 28, 26 and 26 of 60 (Hive 47%, FAIL by one run), smart 13, 5 and 12 of 60 (pass). Finals of 10300 and 11300 gave Hive smart+P 30/60 and 27/60: from 9800 to 10300, 15 of 109 smart+P PRIME fights switched between kill and stalemate in both directions, so the A7 count does not follow PRIME HP at this resolution. Depths smart is set by survival: 29 of 30 runs died before 10:30, outside boss fights (density pass).
- **PRIME factor (`primeHpMul`).** Depths 1.15 cut the Depths smart+P wins to 6/30 (under the band); at 1.0 the Matron PRIME already measures like the Queen PRIME (focus 64.2 against 60.6 s; 60 seeds 54.3 against 53.2 s). She still takes about 1.4x the Queen PRIME's damage per second, but the Depths bots that reach her carry larger builds (median PRIME HP 39,135 against 30,672). Wastes 0.95 is the one value of 1.0, 0.95 and 0.9 that passes both A7 bands (0.9: smart 8/30).
- Side effects (seeds 1 to 30): A12 passes (T0 13/30, T1 11/30, T4 0/30). A13 23/40 (58%) dead by 20:00 and 10 past 24:00 (deaths pass 47/72 and 18): fewer runs win, so fewer enter OVERTIME; the OVERTIME knobs own it. A8 smart+P Depths 8:25 to 9:19. A2, A5, A10, A11 unchanged in result.
- Determinism (A14, 21 of 21 lines): det and det-death keep their hashes (no boss in those windows); det-long bc906b30, 65945a0d, 3e2a9a51.

**A3, A4, A5, A8, A9 and A18 note (P19 density pass).** Full tables, every arm and the commands: `docs/tuning/pass-density.md`. Seeds 1001 x 1 to 30 per world (A6 and A7 also on 1001 x 31 to 60), T0, 14 min, NOVA. Values: Hive rows 5 to 10 `maxAlive` and rows 6 to 9 `every` (A7.2), `XP.gemSoftCap` 200 to 150 (A6). xpScale is unchanged (A9 below).
- **A3 over-row rule.** Inside a cage the field is measured against the maxAlive of the row in force when that cage rose; a row step inside a cage takes effect when the cage drops. No pulse runs inside a cage (section 4.1), so the step from row 10 (420) to row 11 (160) during the PRIME fight changed no spawn: it moved only the reference under the field row 10 built, which gave the control's 285 over row. Outside that step the excess was at most 45 (FINAL SWARM units). Of the two options (raise row 11's maxAlive, or measure from the cage), the measure was chosen: both play the same in all 630 confirm runs, because none ran row 11 without a cage, and row 11 at 160 keeps the approach to a late PRIME thin. After: 68 over the cage's row, alive at most 518.
- **A3 saturated share:** 0.343 (Hive roam seed 14014; focus 0.341, dash 0.307, smart+P 0.26) to 0.246 (Hive smart seed 14014). Depths and Wastes were under 0.25 and keep their rows. From 6:00 the Hive pulse rate (10 to 15.6 units a second) was above the kill rate of a build that clears the swarm slowly (a single-target boss build at 4 to 6 kills a second, the invincible roam bot at about 4), so the field sat at maxAlive whenever there was no cage and no event. Raising the caps alone (arm a1) or slowing the pulses alone (a2) left 0.32 to 0.33; both together pass. Row 10 keeps its rate: the FINAL SWARM fills that field anyway.
- **A4 rule.** A minute is scored on the smart+P field over the steps with no cage and no lull (the free field), where `row.minAlive` is the floor; a run counts in a minute it lived through with 10 s or more of free field. The band's floor is `minAlive`, which is not in force inside a cage (`CAGE_OUTSIDE_MIN`) or a lull (`lullMin`). Since the bosshp pass the default bot's mid fights (median about 60 s) spill into rows 5 and 8, so those minutes' means fell under the band while the free field sat inside it. Control: minute mean 6/9, 6/9, 7/9 (seeds 1 to 30); free field on seeds 1 to 10, the only control runs with the free-field counters, 7/9 (Hive rows 8 and 9 over the band at the caps, 246 and 280), 9/9, 9/9. After: free field 9/9 in every world (minute mean 6/9, 6/9, 5/9, kept in the report). Rows 8 and 9 have the fewest scored runs (4 to 17 of 30): the mid2 fight and the 9:40 lull take most of those minutes.
- **A5.** A PRIME that ascends from a living mid2 boss spawns in its place (section 4.1), not at the arrival distance, so A5 leaves its distance out (2 of 380 fights; an arm logged one at 437 u). Every arrival placed by the rule is at 295 to 306 u, cage up the same tick.
- **A18 XP rule and value.** XP collected is measured up to the PRIME kill (the XP dropped and collected just before the kill step); a run with no PRIME kill counts the whole run. A win ends the run 2 s after the kill, so the PRIME's own gem (240 to 260 XP) is never collected: Hive roam seed 14014 killed the PRIME 0.5 s before the 14:00 end and scored 0.865 whole-run against 0.964 before the kill. The rule alone left the control at 0.926, 0.875 and 0.899: a wandering player left gems behind under the 200-gem cap, so the bank rule never pulled them along. At `gemSoftCap` 150: 0.967, 0.913 and 0.927 (whole run 0.907, 0.906, 0.913). 120 collected more but changed play: the smart bots step to the nearest gem within 450 u when threat is low, and with fewer gems on the field Depths smart+P won 5/30 against the control's 9/30 (12/30 against 17/30 on seeds 31 to 60) and Wastes 7/30 against 12/30. `captureRadius` 140 left Wastes at 0.866.
- **A8 crude: FAIL, unchanged** (2:09, 2:13, 1:43; Hive is also under Depths). The crude bot dies in its third minute to the row 2 shooters: in Hive it stands in spitter acid at 2:05 to 2:15, in Depths psychic and spitter shots kill it, in Wastes charger rams and bites at 1:35 to 1:45. xpScale cannot move it: rows 1 and 2 at three times their xpScale gave 2:09, 2:10 and 1:44. A fix needs rows 1 and 2 content (mix, minAlive), `ACID.dps` or enemy shot damage, or a crude bot that leaves acid: owner or a later pass.
- **A9: FAIL, xpScale unchanged.** After: Hive L9/16/19, Depths L9/17/22, Wastes L10/17/22 at 3:00/8:00/11:00; runs with a gap over 60 s 25, 13 and 20 of 30. Arms that met the checkpoints (k1 to k4, f1: fodder XP 1.5 to 1.85 times the control in rows 3 to 11) broke A6 and A7 as the bosshp pass set them. The bots reach the PRIME at L22 to 25 instead of L19 to 21, and boss HP follows `buildScale ** 0.75`, which counts only the base weapon. k1 (30 seeds): Hive L9/20/25, Depths L11/20.5/24, Wastes L11/20.5/26.5, but smart+P won 18/30 in Hive and 16/30 in Wastes. f1 added PRIME factors 1.45, 1.15 and 1.35: Hive smart+P fell to 5/30 with the focus PRIME at 81.8 s, Depths' focus mid2 and PRIME fell to 16.7 and 36.4 s, and in Wastes no PRIME factor fits both A6 (focus 0.55 to 1.01 times f1's HP) and A7 (1.22 to 2.01). On the A9 curve the gaps sit in boss fights (k1: none outside a fight; about 2.5 XP per second inside a cage against 216 to 717 XP per level), so xpScale outside fights does not close them. Owner decision: lower A9's band to the measured curve, or a joint pass that raises xpScale and refits boss HP per stage and world (Wastes needs its A6 or A7 band relaxed); for the gaps, more XP inside fights (`CAGE_OUTSIDE_MIN` or the SURGE constants) or a gap clause scored outside fights.
- Side effects. A6 focus medians, 60 seeds: Hive 26.3/24.4/58.2 s, Depths 22.7/27.1/55.6, Wastes 24.0/20.2/54.3 (in band; the 31 to 60 half alone has Wastes mid1 19.9 and mid2 18.5 s, as in the bosshp holdout). Default-bot mid fights over 150 s (seeds 1 to 30): 2 of 52 in Hive (two 180 s mid2 ascends), 1 of 51 in Wastes, 0 of 45 in Depths (decided A6 rule: at most 5%). A7, 60 seeds: smart+P 25/60, 22/60, 26/60 (42, 37, 43%), smart 14/60, 9/60, 9/60; on seeds 1 to 30 Hive smart+P is 14/30 (47%, one run over; control 13/30). A12 passes (T0 14/30, T1 8/30, T4 0/30). A13 23/40 (58%) to 17/35 (49%) dead by 20:00 and 9 past 24:00: OVERTIME uses rows 8 to 10, and the slower Hive rows 8 and 9 lower its pressure (OVERTIME knobs). A10 median 3.88 to 3.83 s, minimum 0.82 to 0.88 s (FAIL as before). A2, A5, A11 unchanged in result.
- Determinism (A14, 21 of 21 lines at 375x667, 667x375, the rerun and the settings injection): det keeps 642fbc46, 1365ccb6, d3c8cef6 and det-death 7408614a, 5739e8a2, 224be1c (det plays 10 s and det-death ends at 2:22 to 2:48, before row 5 and under 150 gems on the field); det-long 4b54dab1, be186edf, 7a87fa18.

---

## 12. Later

These are out of the first store release. They follow from the audit but do not decide whether v2 is fun:
- **Content:**
  - BASTION (ANCHOR) and ORACLE (FORESIGHT) pilots
  - THREAT 5 APEX (twin PRIMEs) and THREAT 6 to 8
  - WARPING affix
  - SINGULARITY and BLIZZARD evolutions
  - per-weapon bounties
  - new boss art and music
- **Modes and meta:**
  - assist mode (unranked, +20% damage reduction)
  - CODEX tab
  - live in-run feat toasts
  - yesterday's Daily placement
  - offline submit queue
  - share card upgrade with a store link
  - local notifications (opt-in)
  - Game Center and iCloud sync
  - clear-time board
- **Tech:**
  - server-side input-log replay verification
  - VoiceOver mirroring through the Pixi AccessibilitySystem
  - left-handed DASH button option
  - shell casings and scorch stamps
  - colorblind brood audit
  - desktop keyboard focus navigation

---

# Appendix A: Content tables

## A1. Dash

### A1.1 Parameters (`src/config.ts`)

```ts
export const DASH = {
  ticks: 9, distance: 170,            // 18.89 u per tick at 60 Hz, about 1133 u/s
  iframes: 0.20, endLag: 0.10, endLagSpeedMul: 0.5,
  cooldown: 2.0, buffer: 0.15, minMoveForDir: 0.2, maxCharges: 4, closeCallRefund: 0.8,
} as const
export const GRACE = { hit: 0.8, draft: 0.75, revive: 1.5, win: 3.0 } as const
export const BITE = { scale: 0.4, window: 0.4, w2: 0.5, w3: 0.25, capFracOfMaxHp: 0.08 } as const
export const ACID = { dps: 16, maxStack: 1 } as const   // pool dps x dmgMul at landing; overlapping pools that hurt per tick
```

- P19 deaths pass (section 11, A10 note): `GRACE.hit` 0.5 to 0.8, `BITE.capFracOfMaxHp` 0.16 to 0.08, and `ACID` (new: the pool dps moved out of `acid.ts`, and `maxStack` 1 where every overlapping pool used to hurt).

- Base charges: NOVA 1, VESPER 1, EMBER 2. Phase Step adds more, up to maxCharges 4.
- Maxed mobility is Phase Step 3 plus Slipstream 3: 3 charges, a 1.23 s recharge and 0.30 s i-frames. That gives about 24% i-frame uptime.

### A1.2 Button

```ts
export const DASH_BTN = {
  visualD: 64, hitR: 44,
  portrait: { offX: 58, offY: 200 },   // center = (W - R - offX, H - B - offY)
  landscape: { offX: 64, offY: 150 },
  aimExclusionPad: 8, fireLatch: 0.45, fireLatchWindow: 0.25,
} as const
```

## A2. Perks

### A2.1 Families

| Family | Chip color | Keystones | Pilot |
|---|---|---|---|
| FIREPOWER | #ff9a3c | twin_shot, ricochet | none in v2 |
| ELEMENTAL | #9be7ff | explosive_rounds, arc_rounds | none in v2 |
| SURVIVAL | #4dffa0 | vampiric, thorns | VESPER |
| MOBILITY | #ff6cf0 | phase_step, shock_step | EMBER |
| HUNTER | #ffc24a | deadeye, executioner | NOVA |

### A2.2 Perk table

31 perks, 96 stacks. "Lock" names the feat that unlocks a perk. Descs are 20 words or fewer. `s` = stacks.

| id | Name | Fam | Rarity | Max | Effect | stat(s) example | Desc | Glyph | Lock |
|---|---|---|---|---|---|---|---|---|---|
| adrenaline | Adrenaline | FIRE | common | 5 | fireRateMul *= 1+0.14s | `fire rate x1.28` | Fire faster. | rate | |
| heavy_rounds | Heavy Rounds | FIRE | common | 5 | damageMul *= 1+0.22s | `damage x1.44` | Every bullet hits harder. | damage | |
| twin_shot | Twin Shot | FIRE | rare, key | 3 | extraProjectiles += s; spreadMul *= 1+0.18s | `+2 projectiles` | Fire extra bullets in a wider fan. | multishot | |
| piercing | Piercing Rounds | FIRE | common | 4 | extraPierce += s | `pierce +2` | Bullets pass through more enemies. | pierce | |
| long_barrel | Long Barrel | FIRE | common | 3 | lifeMul, speedMul *= 1+0.2s; spreadMul *= 0.85^s | `range and speed x1.40` | Longer range, faster bullets, tighter spread. | range | |
| ricochet | Ricochet | FIRE | rare, key | 3 | seekBounces += s | `2 seek bounces` | After its last hit, a bullet turns toward the nearest enemy. | bounce | |
| berserker | Berserker | FIRE | rare | 1 | up to +80% fire rate at 0 HP; medkits give +40% fire rate for 3 s | `up to +80% fire rate` | Fire faster as HP drops. Medkits fuel a burst. | rate | #5 |
| glass_cannon | Glass Cannon | FIRE | rare | 1 | damageMul *= 1.45; hpMul *= 0.75 | `damage x1.45, max HP x0.75` | Big damage, less health. | damage | #32 |
| explosive_rounds | Explosive Rounds | ELEM | rare, key | 3 | burst on final hit: radius 60/75/90, 50/100/150% of the hit | `burst 75 u, 100% damage` | Bullets burst on their final hit. | explode | |
| arc_rounds | Arc Rounds | ELEM | rare, key | 3 | arcChance 0.2; arcHops s+1 at 50% damage, 150 u (on Arc Lash: +s hops instead) | `20% of hits arc to 3` | Some hits jump to nearby enemies. | arc | |
| cryo_rounds | Cryo Rounds | ELEM | common | 3 | slow 0.2s for 1.2 s (bosses max 0.3) | `slow 40% for 1.2 s` | Hits slow enemies. | cryo | |
| incendiary | Incendiary | ELEM | common | 3 | burn 6s x damageMul dps for 2 s, refreshes, does not stack | `burn 12 dps for 2 s` | Hits set enemies on fire. | burn | #12 |
| overpressure | Overpressure | ELEM | common | 3 | knockbackMul *= 1+0.4s; stagger 0.08/0.12/0.16 s on non-elites | `knockback x1.80, stagger 0.12 s` | Hits shove enemies and stop them briefly. | knockback | #8 |
| vitality | Vitality | SURV | common | 5 | bonusHp += 25s (heals the gain) | `max HP +50` | More health, healed now. | hp | |
| regrowth | Regrowth | SURV | common | 4 | regen += 1.4s HP/s | `+2.8 HP/s` | Regenerate health over time. | regen | |
| vampiric | Vampiric | SURV | rare, key | 3 | +1.0s HP per kill; killHealCap += 4s | `+2 HP per kill, max 14 HP/s` | Kills heal you, up to a cap. | lifesteal | |
| bulwark | Bulwark | SURV | rare | 3 | damageReduction += 0.15s | `damage taken -30%` | Take less damage from everything. | shield | |
| thorns | Spiked Carapace | SURV | rare, key | 3 | thorns += 18s dps | `36 dps to touching enemies` | Enemies touching you take damage. | knockback | |
| second_wind | Second Wind | SURV | rare | 1 | revives += 1 (50% HP, 1.5 s grace, 220 u shove) | `revive once at 50% HP` | Survive one death. | hp | #24 |
| fleet_footed | Fleet Footed | MOB | common | 5 | moveSpeedMul *= 1+0.08s | `move speed x1.16` | Move faster. | speed | |
| phase_step | Phase Step | MOB | rare, key | 3 | Lv1 +1 charge; Lv2 i-frames 0.30 s; Lv3 +1 charge | `dash charges 2, i-frames 0.20 s` | More dash charges and longer invulnerability. | dash | |
| slipstream | Slipstream | MOB | common | 3 | dashCooldownMul *= 0.85 | `dash recharge 1.45 s` | Dash recharges faster. | dash | #19 |
| adrenal_wake | Adrenal Wake | MOB | common | 3 | +15s% fire rate for 2 s after a dash | `+30% fire rate for 2 s after a dash` | Dashing speeds up your trigger. | rate | #17 |
| shock_step | Shock Step | MOB | rare, key | 3 | dash end blast 90/110/130 u, 25/40/55 x damageMul, knockback | `dash blast 110 u, 40 damage` | Your dash ends in a shockwave. | explode | |
| deadeye | Deadeye | HUNT | rare, key | 3 | critChance += 0.12s (cap 0.75) | `crit chance +24%` | Chance to deal critical hits. | crit | |
| hollow_point | Hollow Point | HUNT | common | 3 | critChance += 0.06s; critMul += 0.4s | `crit +12%, crit damage +0.8x` | More crits that hit harder. | crit | #14 |
| giant_slayer | Giant Slayer | HUNT | rare | 3 | eliteDamageMul *= 1+0.35s (includes AoE, chain, burn) | `x1.70 vs elites and bosses` | Extra damage to elites and bosses. | damage | #3 |
| executioner | Executioner | HUNT | rare, key | 2 | executeFrac = 0.12s | `cull below 24% HP` | Finish off badly hurt enemies instantly. | reaper | |
| magnetic | Magnetic | HUNT | common | 3 | magnetMul *= 1+0.6s | `pickup range x2.20` | Pull XP from farther away. | magnet | |
| scavenger | Scavenger | HUNT | common | 3 | xpMul *= 1+0.2s | `XP x1.40` | Gain more XP. | magnet | |
| quartermaster | Quartermaster | HUNT | common | 3 | ammoMul *= 1+0.3s; podLife +5s; pod hold -0.1s | `ammo x1.60, pods last +10 s` | Pickup weapons carry more ammo and wait longer. | range | #22 |

The start pool is the 21 perks without a Lock entry, including all 10 keystones.

Per-stack forms of the listed values (P5): Explosive Rounds radius `45 + 15s`, burst `0.5s` of the hit; Overpressure stagger `0.04 + 0.04s` s; Shock Step radius `70 + 20s` u, damage `10 + 15s`; Arc Rounds hops at 50% of the hit within 150 u; Cryo slow lasts 1.2 s. The kill-heal cap starts at 6 HP/s (so Vampiric 2 reads `max 14 HP/s`). The Berserker medkit burst is +40% fire rate for 3 s. A card for an owned perk shows `stat(s) → stat(s + 1)` with the shared words once.

### A2.3 Draft constants

```ts
export const DRAFT = {
  rareBase: 0.15, rareStep: 0.06, rareMax: 0.55, ownedBias: 0.55, fusionRepeat: 0.35,
  familyStep: 0.5, familyMax: 2.5, startRerolls: 2, startBanishes: 1, maxRerolls: 5, maxBanishes: 3,
  skipHealFrac: 0.2, minGap: 12, lockFullMs: 450, lockShortMs: 300, fullCeremonies: 3,
  firstOpenAt: 6,
} as const
```

`firstOpenAt` (P5): the Keystone draft never opens before 6 s. The P4 opening (minute-0 minAlive 16/14/14, first kill near 0.6 s) reaches L2 at 2.1 to 2.9 s for every bot, so without the gate the first draft would interrupt Pack A instead of landing at 6 to 12 s.

### A2.4 Fallbacks

| id | Name | Effect | stat | Desc |
|---|---|---|---|---|
| sharpen | Sharpen | damageMul *= 1.04 per pick, unlimited | `damage x1.04 (total x1.12)` | A little more damage. Take it as often as you like. |
| field_repair | Field Repair | heal 35% of max HP | `heal 35 HP` | Patch the hull right now. |
| spare_parts | Spare Parts | +1 reroll (cap 5) | `rerolls 2 → 3` | One more reroll for later drafts. |

Fallbacks cannot be banished, so a draft always shows 3 cards.

## A3. Fusions

All fusions: rarity fusion, max 1, need 1+ stack of each parent, and never cost a parent. Order = offer priority.

| id | Name | Requires | Effect |
|---|---|---|---|
| f_shatter | SHATTER | cryo_rounds + explosive_rounds | An enemy that dies while slowed queues a blast: 70 u, 12 + 25% of its maxHp, x damageMul (x eliteDamageMul on elites; no bosses). |
| f_firestorm | FIRESTORM | arc_rounds + incendiary | Arc hops ignite their target. Burning targets take +50% arc damage. |
| f_pinball | PINBALL | ricochet + piercing | Each seek bounce restores 1 pierce and multiplies that bullet's damage by 1.15. |
| f_headhunter | HEADHUNTER | deadeye + hollow_point | Crits ignore front armor. A crit kill queues a 55 u blast at 40% of the killing hit. |
| f_guillotine | GUILLOTINE | executioner + giant_slayer | Executioner also culls elites at half its threshold (6% / 12%). Culled enemies drop double XP. |
| f_bloodrush | BLOODRUSH | vampiric + berserker | Below 50% HP: kill healing x2, kill-heal cap x1.5, move speed x1.2. |
| f_living_armor | LIVING ARMOR | regrowth + bulwark | Healing past max HP becomes overshield, up to 25% of max HP. It absorbs first and never decays. |
| f_ram | RAM | phase_step + thorns | During dash ticks, each enemy within radius + 30 takes 6x thorns dps x damageMul, once per enemy per dash (`e.ramStamp = dashSeq`). Non-elites are pushed 40 u sideways. |
| f_salvo | SALVO STEP | adrenal_wake + twin_shot | Every dash start fires a ring of 12 shots of the current weapon at 60% damage, with no ammo cost. |
| f_cold_blood | COLD BLOOD | cryo_rounds + giant_slayer | Slowed elites and bosses take +30% damage. Hits on elites and bosses always apply the full Cryo slow (bosses capped at 30%). |

Card desc (the draft card shows the two parents as its tag line):

| id | Desc |
|---|---|
| f_shatter | Enemies that die while slowed burst. |
| f_firestorm | Arcs ignite. Burning targets take +50% arc damage. |
| f_pinball | Each seek bounce restores pierce and adds 15% damage. |
| f_headhunter | Crits ignore front armor. Crit kills burst. |
| f_guillotine | Executioner also culls elites. Culls drop double XP. |
| f_bloodrush | Below 50% HP: double kill healing, faster movement. |
| f_living_armor | Overhealing becomes a shield, up to 25% of max HP. |
| f_ram | Dashing through enemies deals heavy thorns damage. |
| f_salvo | Every dash fires a ring of 12 shots. |
| f_cold_blood | Slowed elites and bosses take +30% damage. |

Blast queue: `BLAST_CAP 64`, `Float32Array(64 * 6)` holding x, y, r, dmg, readyAt and flags (`NO_BONUS 1`, `KNOCK 2`, `CRIT 4`). It drains at the end of `collisionSystem`, and entries pushed during a drain wait for the next tick.

Resolved in P8:
- **Blasts.** The queue holds 64 waiting blasts, and a full queue drops new ones. A drain first moves its due blasts out of the queue, so their slots are free for the blasts they queue (a SHATTER cascade of 64 keeps going). A blast hits every enemy whose center lies inside r, and elite and boss targets take eliteDamageMul, as every AoE does (section 4.5). KNOCK shoves non-elite, non-boss enemies `BLAST_KNOCK_PX` (40 u) away from the center. CRIT marks the Explosion feel event. NO_BONUS rides along for the P9 bonus rule.
- **On-hit order.** A bullet's slow, stagger and burn land after its damage. So SHATTER needs an enemy slowed before the killing hit, and COLD BLOOD's +30% starts with the second hit. A boss death queues no SHATTER blast.
- **FIRESTORM.** Arc hops include the Arc Lash chain hops. The ignite is Incendiary's burn: 6 per stack x damageMul dps for 2 s.
- **HEADHUNTER.** The blast is 40% of the killing hit after crit and armor, before eliteDamageMul and COLD BLOOD. Each blast target takes those multipliers itself, so they apply once.
- **GUILLOTINE.** Without it, Executioner culls non-elite, non-boss enemies only.
- **BLOODRUSH and Vampiric.** The kill-heal bucket holds 1 s of the cap and refills every tick.
- **LIVING ARMOR.** Every heal goes through `healPlayer`: regen, kill healing, medkits, SKIP and FIELD REPAIR. A hit the overshield takes whole emits `ShieldHit`: the SHIELD chime 7 semitones up, a 3 px kick, a light haptic and a cyan ring on the ship (bites once per bite window; acid ticks stay silent). It removes no HP, so it does not halve the chain.
- **RAM.** "radius + 30" is the contact distance (enemy radius + ship radius) + 30 u. The damage takes eliteDamageMul on elites and bosses. "Sideways" is perpendicular to the dash heading, away from its line.
- **SALVO STEP.** One bullet per ring slot, starting at the dash heading. Each bullet keeps the weapon's and the build's pierce, speed, explosion and chain. The 60% also scales the weapon's own explosion (BILE MORTAR, PLAGUE BARRAGE and its bomblets). Every `fireRing` works this way, so P9's FIREBLAST x1.5 scales explosions too.

## A4. Weapons

### A4.1 Pickup weapons

| Weapon id | Name | Pair | Start pool | Lock | Change |
|---|---|---|---|---|---|
| smg | SPLATTER SMG | adrenaline | yes | | damage 7 → 8.5 |
| shotgun | BOOMSTICK | twin_shot | yes | | |
| minigun | HIVE RIPPER | heavy_rounds | yes | | |
| plasma | ION LANCE | piercing | yes | | |
| rocket | BILE MORTAR | explosive_rounds | yes | | AoE x damageMul |
| flamethrower | PYRE | incendiary | yes | | sfx `whoosh` |
| lightning | ARC LASH | arc_rounds | no | #2 | |
| hailstorm | HAILSTORM | cryo_rounds | no | #7 | no evolution in v2 |
| railgun | RAIL SPIKE | deadeye | no | #11 | sfx `crack` |
| beam | PHOTON BEAM | long_barrel | no | #21 | |
| vortex | VORTEX CANNON | overpressure | no | #31 | fireRate 2.6, damage 32; no evolution in v2 |

Base weapon change: Stiletto damage 11 → 12.

`kickPx`: pistol 1.5, smg 1.0, shotgun 6, minigun 0.8, plasma 2, railgun 9, flamethrower 0.4, rocket 5, lightning 1.5, beam 0.3, vortex 5, hailstorm 1.2, scorcher 2.5, stiletto 1.2. Each evolved weapon uses its source x1.2.

### A4.2 Evolutions

Trigger: a Hive Core, while holding the pickup weapon with its pair at 2+ stacks.

| Pickup | Evolves to (id) | Stats | Behavior |
|---|---|---|---|
| SPLATTER SMG | GORE HOSE `gore_hose` | fireRate 18, dmg 10, spread 0.08, speed 860, life 0.6 | pierceOnKill: a bullet that kills gains +1 pierce |
| BOOMSTICK | DEVASTATOR `devastator` | fireRate 2.4, 12 pellets x 7, spread 0.34, knockback 320, life 0.38 | pointBlank: x2 damage in the first 0.12 s of flight |
| HIVE RIPPER | HIVE REAPER `hive_reaper` | fireRate 24, dmg 7, spread 0.12 | lockOn: +5% per consecutive hit on the same uid, max +75%, resets after 0.4 s |
| ION LANCE | ION SPEAR `ion_spear` | fireRate 8, dmg 24, pierce 6, speed 1100 | pierceRamp: x1.2 per enemy pierced, cap x2.5 |
| RAIL SPIKE | SKEWER `skewer` | fireRate 1.6, dmg 120, pierce 20, speed 2000, knockback 400 | firstHitCrit |
| PYRE | INFERNO `inferno` | fireRate 22, 3 streams x 4, pierce 2, life 0.45 | ignite: burn 10 dps for 2 s; burning enemies take +25% damage while INFERNO is held |
| BILE MORTAR | PLAGUE BARRAGE `plague_barrage` | fireRate 1.2, 3 mortars (spread 0.08), dmg 26, radius 110, explode 50 | bomblets: 3 blasts 0.25 s later at 55 u, radius 50, 35% |
| ARC LASH | STORM LASH `storm_lash` | fireRate 7, dmg 18, chain 7, range 200 | chainFrac 0.75 per hop; the last hop queues a 70 u blast at 50% |
| PHOTON BEAM | SOLAR LANCE `solar_lance` | fireRate 24, dmg 6, pierce 10, life 0.6 | rangeRamp: +12% per 100 u traveled, max +90% |

Unlisted stats come from the source weapon. Resolved in P8:
- **pointBlank.** Flight time under 0.12 s.
- **lockOn.** The first hit on an enemy is x1.00, and each consecutive hit on the same uid adds 5%, so the 16th reaches x1.75. A hit on another enemy, or a gap over 0.4 s, starts over.
- **pierceRamp.** The n-th enemy a bullet hits takes x min(2.5, 1.2^(n-1)).
- **firstHitCrit.** The first hit of each bullet crits without a roll.
- **ignite.** 10 x damageMul dps. With Incendiary the stronger burn wins. The +25% applies to all damage.
- **bomblets.** At 0, 120 and 240 degrees from the mortar's heading, at 35% of its explosion damage (crit included).
- **stormChain.** Every hop deals 75% of the hit (Arc Lash: 60%). The chain's last target gets a 70 u blast at 50% of the hit.
- **rangeRamp.** Distance traveled = flight time x speed, applied linearly.

## A5. Pods, cores, bonuses

### A5.1 Pods

```ts
export const PODS = { first: 20, interval: 15, life: 20, blinkLast: 3, minDist: 250, maxDist: 450,
  edgeInset: 60, cageInset: 40, holdTime: 0.4, holdDecayPerSec: 2, holdRadiusPad: 6,
  affinityChance: 0.5, eliteChance: 0.35, bossPodOffset: 60 } as const
```

Resolved in P8:
- **Timer slots.** Slots come at `first`, then every `interval`. A slot passes while the last timer pod is still on the field.
- **Loot draws.** A timer pod draws the angle, the distance, the affinity roll and the pick. An elite pod draws the 0.35 roll, the affinity roll and the pick. A boss pod draws an angle (it sits 60 u from the corpse) and the pick, and it may be the held weapon.
- **Clamps.** The 60 u arena inset clamps every pod. While the cage is up, every pod (timer, elite, boss) also clamps inside `cage.r - cageInset`.
- **Hold to take.** "On the pod" means the ship's body is within `holdRadiusPad` of touching the pod. The fill runs from 0 to 1 over the hold time and decays at `holdDecayPerSec`. A pass through the center at 285 u/s fills 0.71.
- **Ammo.** The HUD shows the magazine rounded up. SMG: 260 rounds at 13/s = 20 s.

### A5.2 Cores

```ts
export const CORES = {
  shardCooldown: 60, shardLife: 30,
  table: { mid1: [0.60, 0.35, 0.05], mid2: [0.30, 0.50, 0.20], overtime: [0.20, 0.50, 0.30] }, // P(1, 3, 5 levels)
  primeLevels: 5,               // PRIME core: fixed 5 levels + evolution offer; auto-granted on OVERTIME start
  rerollPerCore: 1, banishPerCore: 1,
  revealSec: { 1: 1.2, 3: 1.8, 5: 2.4 }, skipAfterSec: 0.3,
} as const
```

| Tier | Radius / tint | Source | Reward |
|---|---|---|---|
| CORE SHARD | 16, cyan #57e0ff | elite kill, at most 1 per 60 s | +1 level to a random owned non-maxed perk; toast `+1 ADRENALINE (LV 3)` |
| HIVE CORE | 26, gold #ffc24a | every boss kill | 1, 3 or 5 levels, +1 reroll, +1 banish, evolution choice; pause and reveal |

Resolved in P9 (`src/systems/cores.ts`, `src/ui/coreReveal.ts`):
- **Shard cooldown.** A shard sets `eliteCoreReadyAt = time + shardCooldown`, so two shards are always at least 60 s apart (`+= 60` from 0 would let a late elite and the next one drop close together). A shard needs a free core slot; with none, nothing drops and the cooldown does not start. Shards and Hive Cores share the 4 core slots of the pickup pool.
- **Loot draws.** A shard draws its perk (none when every owned perk is maxed: SHARPEN). A Hive Core draws its row (1, 3 or 5) and then one perk per level, at contact, counting the levels already allotted; a level with no owned perk left below its max becomes SHARPEN with no draw. The levels apply when the reveal closes, so the choice never moves a stream.
- **Rows.** mid1 and mid2 use their rows; every boss after mid2 uses the overtime row. The PRIME drops no core at its corpse: its core (5 levels, no draw for the row) comes with OVERTIME, from the win panel's OVERTIME button.
- **Evolution offer.** Any Hive Core, the PRIME core included, offers the evolution while the held pickup weapon has an evolution and its pair has 2+ stacks, except when that evolution is already the base weapon (a new Ion Lance pod after ION SPEAR). EVOLVE replaces the levels; +1 reroll and +1 banish come with either choice (caps 5 and 3). `World.evolutions` records each evolution taken, and `RunResult.evolutions` is that list.
- **Pause.** The hand-off order is death, stalemate, win, core reveal, draft, and the win panel also waits for a pending core. A second core, or a shard, touched in the tick a core is taken waits on the field until the reveal closes: the core's levels counted the stacks at contact, so a shard taken before they apply could push a perk past its max (P9 review). Without a choice the reveal closes itself after revealSec and a tap skips it after skipAfterSec; with a choice it waits for EVOLVE or TAKE N LEVELS (keys 1 and 2). Closing it gives the 0.75 s draft grace.

### A5.3 Bonuses

```ts
export const BONUS = { perXpChance: 0.0015, pityAfter: 40, minGap: 8, maxOnField: 2, life: 9, blinkLast: 3, radius: 16 } as const
```

| id | Name | Weight | Duration | Tint | Effect |
|---|---|---|---|---|---|
| nuke | NUKE | 14 | instant | #ff5a3c | Non-elite, non-boss enemies within 380 u die (NoScore). Elites take 30% of maxHp, bosses 6%. Enemy shots within 380 u are removed. |
| freeze | FREEZE | 16 | 4.0 s | #9be7ff | Non-boss enemies stop, do not fire, do not bite, and take +20% damage. Bosses move at 50%. |
| overdrive | OVERDRIVE | 20 | 8.0 s | #ffc24a | Fire rate x1.6, no ammo cost, move speed x1.15. |
| shield | SHIELD | 16 | 6.0 s | #4dffa0 | Full damage immunity. It cannot trigger a Close Call. |
| fireblast | FIREBLAST | 20 | instant | #ff9a3c | 24 radial shots of the current weapon at x1.5 damage, pierce +3, no ammo. |
| vacuum | VACUUM | 14 | instant | #b886ff | Captures every gem and medkit. Eligible only with 25+ gems on the field. |

Resolved in P9 (`src/systems/bonuses.ts`, constants `BONUS` and `BONUS_FX` in `src/config.ts`):
- **Drop order.** Capacity and timing gate before any draw: at most 2 bonuses on the field, then (except the first elite kill) the 8 s gap from the last drop, then pity (no draw) or the chance roll (one loot draw), then the type roll (one loot draw). Pity and the gap count from the last drop, and from 0 s before the first one.
- **First elite.** The first elite kill of the run drops a bonus past the gap (not past the field cap). A NUKE or FIREBLAST kill of that elite uses the guarantee up with no drop.
- **No bonus.** NUKE kills, FIREBLAST shots and everything they set off (their explosions, chain hops, the burns they light and the blasts they queue, which carry `BLAST_NO_BONUS`) drop no bonus. A burn belongs to the latest hit that lit or refreshed it. NUKE kills go through the normal kill path (kills, XP, gibs, BROOD and VOLATILE, VESPER's growth). The enemies it kills outright take `KillSource.NoScore` (C40); an elite or boss that its fraction finishes scores like any kill, points and chain included (P9 review: 6% on a nearly dead PRIME took its 2,400 x tier points).
- **NUKE.** Centered on the ship. The fractions are flat: no damage multiplier applies to them, not even FREEZE's +20% or INFERNO's +25%. Only the enemies alive at the blast are hit, so a nuked BROOD elite's brood lives. Burrowed enemies and a boss still emerging are untouched.
- **FREEZE.** Non-boss enemies skip their AI step (no move, no fire, no hatch, stream units hold), do not bite or ram, and take +20% from every damage source but the NUKE; thorns still hurts them. "Bosses move at 50%" is the boss's walk; its attacks keep their timing.
- **OVERDRIVE** multiplies the effective fire rate (after every perk) and skips the ammo cost; the move bonus is in `playerSpeedMul`. **SHIELD** makes `hurtPlayer` return 0 for every kind and disarms the Close Call. **FIREBLAST** fires from the ship's facing, through the same launch path as SALVO STEP (so pilot and weapon multipliers apply and explosions scale). **VACUUM** captures gems, the bank gem and medkits, never pods, shards, cores or bonuses.
- **End cue.** When FREEZE, OVERDRIVE or SHIELD runs out, its pickup recipe plays an octave down and a world label shows `FREEZE OFF`, `OVERDRIVE OFF` or `SHIELD OFF` in its tint. The HUD timer rings (section 9.2) are P15's.
- **OVERTIME (W4 integration fix).** In OVERTIME cycle c the chance roll is `perXpChance x def.xp x OVERTIME.bonusMul^c` with `bonusMul` 0.6 (x0.6, x0.36, x0.216, ...); pity, the gap and the field cap are unchanged, so a kill worth 2+ XP still drops one once 40 s pass with no drop. Without it the roam bots drew 3.21 and 4.09 bonuses a minute in OVERTIME, and the A13 default bots a run median of 2.67 to 2.95 and up to 4.58 (section 11, W4 integration fix note).
- **FREEZE on screen (W4 integration fix).** A frozen non-boss enemy holds its pose in the ice tint (#7fd8ff) with no wobble; a charger frozen in its windup keeps the coil pose without the white flicker, its lane decal holds still at 0.22, and it gets no off-screen arrow until the freeze ends (its windup resumes then).

## A6. XP and pickup pool

```ts
export const XP = { firstLevelCost: 6, a: 5, b: 6, c: 1.2, surgeAfter: 40, surgeMul: 2,
  gemSoftCap: 150, captureRadius: 125, homeStart: 260, homeMax: 900, homeRamp: 0.35, medkitLife: 10,
  bankLeash: 150 } as const
export function xpForLevel(L: number): number { return L === 1 ? 6 : Math.floor(5 + 6 * L + 1.2 * L * L) }
export const PICKUP_RESERVE = { xp: 200, bank: 1, health: 40, weapon: 4, core: 4, bonus: 2 } as const // MAX_PICKUPS 400
```

Cumulative XP by level: 6 to reach L2, 108 to reach L5, 647 to reach L10, 1906 to reach L15, 4185 to reach L20, 7784 to reach L25.

Bank gem: tint #ff4a6a, scale `min(2.4, 1.2 + 0.25 x log2(1 + xp / 20))`. It appears where the first merged gem lay, pulled in to at most `bankLeash` (150 u) from the player, and never expires. Until it is captured, every tick pulls it back to 150 u when the player has moved farther away. So it trails the fight inside the phone view (short half-extent 280 u, minus the 78 u aim look-ahead), and a 25 u step toward it captures it. (P5: merging the new XP instead left a bank gem far from the fight once stale gems filled the cap; a hive smart+P bot collected 1 of 763 XP over a minute. P5 review: with no leash the bank sat at the farthest gem, and the hive roam bot collected 83.7% of dropped XP. A 200 u leash gave 88.8% in the same run, because the bot left the bank alone during the PRIME fight; 150 u gave 95.6%.) (P19 density pass: `gemSoftCap` 200 to 150. A wandering player left gems behind below the 200 cap, so the bank rule never pulled them along: the invincible roam bot collected 0.875 of the XP dropped before the PRIME kill in its worst Depths run and 0.899 in Wastes. At 150 the farthest gems join the bank sooner. 120 collected more but changed play: the smart bots chase the nearest gem within 450 u when threat is low, and with fewer gems on the field the smart+P wins fell from 9/30 to 5/30 in Depths (17/30 to 12/30 on seeds 31 to 60) and from 12/30 to 7/30 in Wastes. At 150 the roam minimum is 0.913 to 0.967 per world, and Depths and Wastes smart+P win 8/30 and 11/30, within 1 of the control. Section 11, A18 note.)

## A7. Run scripts

### A7.1 Constants and beat skeleton (T0)

```ts
export const PRACTICAL_CAP = 450, EVENT_HEADROOM = 120, MAX_ENEMIES = 700
export const RING_NEAR = { halfW: 640, halfH: 560 }, RING_STD = { halfW: 900, halfH: 640 }
export const TOPUP_RATE = 30, WARN_LEAD = 3.0, ELITE_WARN_LEAD = 2.0
export const DMG_RAMP_PER_MIN = 0.04, SPEED_RAMP = 0.0012, SPEED_RAMP_CAP_T = 360, ENEMY_SPEED_CEIL = 240, HP_RAMP_T_CAP = 720
export const CAGE_R = 520, CAGE_R_MIN = 340, CAGE_OUTSIDE_MIN = { hive: 40, depths: 35, wastes: 30 }
export const BOSS_MIN_GAP = 20, POST_BOSS_LULL = 15, FRENZY_AFTER = 90, FRENZY_STEP = 15, STALEMATE_AFTER = 210
export const BOSS_DPS_REF = 88, BOSS_TELE_MIN = 0.6, MAX_BOSS_TELEGRAPHS = 1, MAX_BROOD = 24, MAX_HAZARDS = 48
export const PURGE_SEC = 1.2, PURGE_RADIUS = 1500, WIN_PANEL_DELAY = 2.0
export const POST_BOSS_LULL_MIN = 0.5, BOSS_MARKER_LEAD = 1.5, BOSS_MARKER_R = 90, BOSS_EMERGE = 1.0, BOSS_ROAR = 0.8
```

| t | Beat | script draws |
|---|---|---|
| 0.3 | Pack A (8 units evenly on a full circle, r 250 + 50u each) | 8 |
| 2.0 | Pulses start (RING_NEAR) | 0 |
| 6.0 | Pack B (evenly along a 100 degree arc, r 420 to 460 by position) | 1 |
| 1:30 | Teaching elite (0 affixes, hpMul 0.6) | 1 |
| 2:30 | EVENT 1 (warn 2:27) | per event |
| 3:00 | Lull 15 s (minAlive x0.5) | 0 |
| 3:15 | Elite x1, 1 affix | 2 |
| 4:00 | BOSS mid1 (warn 3:57) | 1 |
| 5:10 | Elite x1, 1 affix | 2 |
| 5:30 | EVENT 2 | per event |
| 6:15 | Elite x2, 1 affix each | 4 |
| 7:30 | BOSS mid2 | 1 |
| 8:15 | Elite x2, 1 affix each | 4 |
| 8:45 | EVENT 3 | per event |
| 9:10 | Elite x3, 1 affix each | 6 |
| 9:40 | Lull 20 s (minAlive x0.5), alert `FINAL SWARM / IN 20 SECONDS` | 0 |
| 10:00 | EVENT 4: FINAL SWARM | per event |
| 10:30 | BOSS final: PRIME (warn 10:27) | 1 |

Event draw counts: 1 per event for S or G. MORTAR BARRAGE draws 36 extra. BLINK STORM and CHARGER VOLLEY draw 1 start angle each. A FINAL SWARM draws its S once (every component's direction derives from it) plus the start angle of its BLINK STORM or CHARGER VOLLEY: Hive 1, Depths 2, Wastes 2. The T0 Wastes script takes 64 draw slots in all.

### A7.2 World rows

xpScale values below already include the no-expiry factor (x0.85, row 0 pinned at 1.00). They are starting values for P19 tuning. "Target alive" is the smart+P median band used by A4.

**HIVE MEADOW**
- Pack A: 8 swarmers. Pack B: 6 biters.
- Elite `guardian` (GUARDIAN). Fodder `swarmer`.
- Bosses `queen` / `queenPrime`, worldMul 1.0, primeHpMul 1.0.
- Affix pool: MOLTEN, HASTED, BROOD, VOLATILE.

| min | Mix (weights) | minAlive | maxAlive | every x batch | xpScale | Target alive | Debut / beats |
|---|---|---|---|---|---|---|---|
| 0 | swarmer 10, biter 4 | 16 | 40 | 1.0 x 2 | 1.00 | 16-28 | packs |
| 1 | swarmer 10, biter 6, flyer 3 | 24 | 80 | 0.8 x 3 | 0.51 | 24-56 | teaching elite |
| 2 | swarmer 9, biter 6, flyer 4, spitter 3 | 40 | 120 | 0.75 x 4 | 0.47 | 40-84 | STAMPEDE |
| 3 | swarmer 8, biter 5, flyer 4, spitter 3, splitter 3 | 40 | 140 | 0.8 x 4 | 0.38 | 40-98 | lull, elite |
| 4 | row 3 + beetle 2 | 55 | 180 | 0.7 x 5 | 0.36 | cage | THE QUEEN |
| 5 | row 4 + hivemind 2 | 70 | 250 | 0.65 x 5 | 0.32 | 70-175 | elite, BROOD RING |
| 6 | row 5 + broodmother 2 | 85 | 330 | 1.0 x 6 | 0.22 | 85-231 | debut broodmother; elites x2 |
| 7 | row 6 with beetle 3, + brute 2 | 100 | 360 | 0.95 x 6 | 0.19 | cage | QUEEN returns |
| 8 | row 7 with brute 3 | 120 | 400 | 0.75 x 7 | 0.16 | 120-280 | elites x2, HIVE WALL |
| 9 | row 8 | 140 | 440 | 0.8 x 7 | 0.14 | 140-308 | elites x3, lull |
| 10 | row 8 | 170 | 450 | 0.4 x 8 | 0.17 | 170-315 | FINAL SWARM, QUEEN PRIME |
| 11 | swarmer 8, biter 5, flyer 4, spitter 3 | 40 | 160 | 0.8 x 4 | 0.26 | cage | frenzy |

P19 density pass (section 11, A3 and A4 notes; `docs/tuning/pass-density.md`): rows 5 to 10 maxAlive 210, 250, 280, 320, 360, 420 to 250, 330, 360, 400, 440, 450, and rows 6 to 9 `every` 0.6, 0.55, 0.5, 0.45 to 1.0, 0.95, 0.75, 0.8 (pulse rate per second 10.0, 10.9, 14.0, 15.6 to 6.0, 6.3, 9.3, 8.8). Before, the Hive pulse rate was above what most builds kill from 6:00 on, so the field sat at maxAlive whenever there was no cage or event: a build that clears the swarm slowly (a single-target boss build, the invincible roam bot) held it there for 30 to 34% of those steps (A3 allows 25%). The rates now sit near a mid build's kill rate, and the caps are higher so a slow build fills them later. Row 10 keeps its rate: the FINAL SWARM sets that field anyway. "Target alive" is `minAlive` to `0.7 x maxAlive` in every row, so the band tops moved with the caps. Row 11 keeps maxAlive 160: no pulse runs inside the PRIME's cage, and A3 measures a cage against the row it rose under (section 11, A3 note).

**VIOLET DEPTHS**
- Pack A: 8 biters. Pack B: 5 flyers.
- Elite `abyssalWarden` (WARDEN). Fodder `biter`.
- Bosses `voidMatron` / `voidMatronPrime`, worldMul 1.0 (P6b review: 0.9 made her fights the shortest of the three worlds; A6 note in section 11), primeHpMul 1.0 (P19 bosshp: 1.15 cut the smart+P wins to 6/30; section 11, A6 and A7 note).
- Affix pool: HASTED, VOLATILE, SHIELDED, BROOD. No acid in Depths.

| min | Mix | minAlive | maxAlive | every x batch | xpScale | Target alive | Beats |
|---|---|---|---|---|---|---|---|
| 0 | biter 8, flyer 3 | 14 | 40 | 3.0 x 6 | 1.00 | 14-28 | packs |
| 1 | biter 8, flyer 5, wraith 6 | 20 | 70 | 3.0 x 9 | 0.51 | 20-49 | teaching elite |
| 2 | biter 6, flyer 5, wraith 8, psychic 3 | 30 | 100 | 3.0 x 12 | 0.44 | 30-70 | RIPTIDE |
| 3 | row 2 + abyssalMaw 2 | 30 | 110 | 3.2 x 14 | 0.36 | 30-77 | debut abyssalMaw; lull, elite |
| 4 | row 3 | 40 | 140 | 3.0 x 16 | 0.34 | cage | THE VOID MATRON |
| 5 | row 3 + deepCaller 2 | 50 | 170 | 3.0 x 18 | 0.34 | 50-119 | debut deepCaller; elite, SHOAL RUN |
| 6 | row 5 + warper 3 | 60 | 200 | 2.8 x 20 | 0.31 | 60-140 | elites x2 |
| 7 | row 6 + brute 2 | 70 | 230 | 2.8 x 22 | 0.27 | cage | MATRON returns |
| 8 | row 7 with psychic 4, deepCaller 3, brute 3 | 80 | 260 | 2.6 x 24 | 0.26 | 80-182 | elites x2, BLINK STORM |
| 9 | row 8 | 90 | 290 | 2.6 x 26 | 0.23 | 90-203 | elites x3, lull |
| 10 | row 8 | 110 | 330 | 2.5 x 30 | 0.30 | 110-231 | FINAL SWARM, MATRON PRIME |
| 11 | biter 8, flyer 5, wraith 6 | 35 | 140 | 3.0 x 12 | 0.34 | cage | frenzy |

**EMBER WASTES**
- Pack A: 8 biters. Pack B: 3 beetles.
- Elite `duneLeviathan` (LEVIATHAN). Fodder `biter`.
- Bosses `emberTyrant` / `emberTyrantPrime`, worldMul 0.9 (1.15 before the P19 bosshp pass: with the hazard escape the bot lives through her mid fights, and at 1.15 they ran 33 and 40 s on the focus bot), primeHpMul 0.95 (the one value of 1.0, 0.95 and 0.9 that passes both A7 bands; section 11, A6 and A7 note).
- Affix pool: MOLTEN, SHIELDED, VOLATILE, BROOD.

| min | Mix | minAlive | maxAlive | every x batch | xpScale | Target alive | Beats |
|---|---|---|---|---|---|---|---|
| 0 | biter 6, beetle 3 | 14 | 35 | 1.4 x 2 | 1.00 | 14-25 | packs |
| 1 | biter 6, beetle 6, cinderCharger 4 | 16 | 60 | 1.3 x 2 | 0.47 | 16-42 | teaching elite |
| 2 | row 1 with biter 5, + stinger 3 | 22 | 80 | 1.2 x 3 | 0.44 | 22-56 | CINDER WALL |
| 3 | row 2 + burrower 4 | 26 | 100 | 1.1 x 3 | 0.41 | 26-70 | lull, elite |
| 4 | row 3 | 30 | 115 | 1.0 x 3 | 0.38 | cage | THE EMBER TYRANT |
| 5 | row 3 + cinderMortarch 3 | 36 | 135 | 0.9 x 3 | 0.43 | 36-95 | debut cinderMortarch; elite, CHARGER VOLLEY |
| 6 | row 5 + brute 3 | 44 | 155 | 0.9 x 4 | 0.40 | 44-109 | elites x2 |
| 7 | row 6 | 50 | 175 | 0.8 x 4 | 0.36 | cage | TYRANT returns |
| 8 | row 6 with cinderCharger 5, stinger 4 | 58 | 195 | 0.75 x 4 | 0.38 | 58-137 | elites x2, MORTAR BARRAGE |
| 9 | row 8 | 66 | 215 | 0.7 x 5 | 0.30 | 66-151 | elites x3, lull |
| 10 | row 8 | 80 | 250 | 0.6 x 5 | 0.38 | 80-175 | FINAL SWARM, TYRANT PRIME |
| 11 | biter 6, beetle 6, cinderCharger 4 | 30 | 110 | 1.2 x 3 | 0.43 | cage | frenzy |

Debut alerts (`NEW BUG`) use `EnemyDef.displayName`: BROODMOTHER, ABYSSAL MAW, DEEP CALLER, CINDER MORTARCH.

**Script texts** (title max 18 chars, sub max 24):

| World | mid1 | mid2 | final | slain | win | stalemate |
|---|---|---|---|---|---|---|
| HIVE | THE QUEEN / AWAKENS | THE QUEEN / RETURNS | QUEEN PRIME / THE FINAL FIGHT | QUEEN SLAIN | HIVE PURGED | THE QUEEN ESCAPED |
| DEPTHS | THE VOID MATRON / STIRS | THE VOID MATRON / RETURNS | MATRON PRIME / THE FINAL FIGHT | MATRON SLAIN | DEPTHS SILENCED | THE MATRON ESCAPED |
| WASTES | THE EMBER TYRANT / RISES | THE EMBER TYRANT / RETURNS | TYRANT PRIME / THE FINAL FIGHT | TYRANT SLAIN | WASTES QUENCHED | THE TYRANT ESCAPED |

### A7.3 Director state (preallocated)

```ts
pulseT, topupAcc, beatCursor, warnCursor, lullUntil, lullMin
beatAng = new Float32Array(96); beatAffix = new Uint8Array(96); scratch = new Float32Array(64)
firedAt = new Float32Array(32)   // P7: fire time per beat (NaN not yet, -1 dropped or skipped); A3 reads it
cage = { active, x, y, r, formingFrom }; bossesAlive, fightIndex, fightStart, nextFrenzyAt, frenzy
lastBossKillAt, bossStageNext; deferred = new Int16Array(12); deferredAt = new Float32Array(12); warned = new Uint8Array(32)
eliteN = new Uint8Array(32)   // P11 review: elites per beat, fixed at warn time
events = [EventRun x5]; runState, clearTime, purgeT, purgeX, purgeY, otCycle, otStart, otWarn, otFire, otXpMul
broodCount, bossesKilled, elitesKilled
```

- `deferred` holds one slot per event and elite beat of the script (`DEFER_SLOTS = 12`; T0 scripts have 10). `resolveScript` throws if a script has more, so a held beat never overflows the queue and never fires inside the cage.
- (P7) `beatAng` holds 96 draws: the T0 Wastes script takes 64 (MORTAR BARRAGE alone takes 37), and P11's extra elites and mirrors need room. `resolveScript` throws past 96 draws or 32 beats.
- (P11) `resolveScript(arenaId, threat)` also builds one OVERTIME cycle (`otBeats`, beat index `beats.length + k`) with its own draw slots, so `beatAng` holds 160 (Wastes at THREAT 2 and up: 70 for the run and 49 for the cycle, whose elite beat reserves 8), `deferred` 16 (THREAT 2 adds 3 mirror events to the 10 held beats), and the 32 beats include the cycle. `EVENT_SLOTS` is 5: a FINAL SWARM's 3 parts plus a held event and its mirror copy.

## A8. Swarm events (T0)

| World | Event | Units | Geometry and motion | Alert (title / sub) |
|---|---|---|---|---|
| HIVE | STAMPEDE 2:30 | 40 swarmer, STREAM, speed 200, TTL 9 s | origin 720 u toward S; heading locked at `at` toward the player; emitted over 2.0 s, lateral ±110 u | STAMPEDE / FROM THE S |
| HIVE | BROOD RING 5:30 | 33 swarmer (hp x1.5), NORMAL | 36 slots on r 460; 3-slot gap centered on G | BROOD RING / GAP TO THE G |
| HIVE | HIVE WALL 8:45 | 22 beetle, STREAM, speed 64, TTL 16 s | line 924 u (spacing 44) centered 640 u toward S, perpendicular; beetle front armor 0.6 | HIVE WALL / FROM THE S |
| HIVE | FINAL SWARM 10:00 | STAMPEDE from S at +0; STAMPEDE from S+90 degrees at +2.5 s; BROOD RING (gap opposite S) at +6 s | 113 bodies max | FINAL SWARM / HOLD ON |
| DEPTHS | RIPTIDE 2:30 | 27 wraith (hp x1.3), NORMAL | 30 slots on r 480, 3-slot gap at G | RIPTIDE / GAP TO THE G |
| DEPTHS | SHOAL RUN 5:30 | 48 flyer, STREAM, speed 230, TTL 8 s | origin 760 u toward S, band ±100; lateral wobble `60·5.2·cos(5.2·age + 0.7i)` | SHOAL RUN / FROM THE S |
| DEPTHS | BLINK STORM 8:45 | 10 psychic | 10 marker hazards (r 34, tele 1.0 s) on r 280 around the player; a psychic spawns at each | BLINK STORM / ALL AROUND YOU |
| DEPTHS | FINAL SWARM 10:00 | RIPTIDE (36 slots, 32 filled) +0; SHOAL RUN from S +3 s; BLINK STORM +8 s | | FINAL SWARM / HOLD ON |
| WASTES | CINDER WALL 2:30 | 18 beetle, STREAM, speed 60, TTL 16 s | line 828 u (spacing 46) at 600 u toward S | CINDER WALL / FROM THE S |
| WASTES | CHARGER VOLLEY 5:30 | 10 cinderCharger | on r 220, spawned in windup (phase 1, heading at the player, stateTimer 0.9) | CHARGER VOLLEY / SIDESTEP THE RAMS |
| WASTES | MORTAR BARRAGE 8:45 | 18 hazard circles, r 70, dmg 22, tele 1.0 s, 3 per s for 6 s | drop k lands on the player's position + offset k (angle, radius 0 to 160); every 3rd leaves a magma pool | MORTAR BARRAGE / KEEP MOVING |
| WASTES | FINAL SWARM 10:00 | two CINDER WALLs from S and opposite S, closing (TTL 12 s); CHARGER VOLLEY +6 s | | FINAL SWARM / HOLD ON |

- Direction words: `FROM THE NORTH/EAST/SOUTH/WEST` and `GAP TO THE ...`. World up is screen up.
- The S or G drawn at warn time is shown in the 3 s alert.
- (P7) Emission (`spawnDur`): STAMPEDE and SHOAL RUN over 2.0 s (one unit every 50 or 42 ms); walls, rings, BLINK STORM and CHARGER VOLLEY at once; MORTAR BARRAGE drop k at k/3 s. Lateral offsets (band) are spawn-stream draws; the SHOAL RUN wobble phase is `0.7i` with no draw. A wall's units sit `spacing` apart centered on its center (HIVE WALL 21 gaps = 924 u; CINDER WALL 17 gaps = 782 u). A ring's empty slots are centered on G (4 empty slots in the Depths FINAL SWARM). Every third mortar drop (k = 2, 5, 8 ...) leaves the magma pool.
- (P7) FINAL SWARM directions: the Depths RIPTIDE gap faces opposite S (as in Hive), and SHOAL RUN comes from S. Body counts at T0: Hive 113, Depths 80 (plus 10 BLINK STORM psychics), Wastes 46.
- (P7 review) CHARGER VOLLEY radius 220 (was 380): a cinderCharger dash covers 253 u (460 u/s for 0.55 s) and contact starts at 34 u (radii 16 + 18), so from 220 u each ram runs through a ship that stands still and ends 33 u past it, as its 253 u windup lane shows. From 380 u every ram stopped 127 u short and the volley needed no sidestep. `probe-events.mjs` checks that all 10 rams reach a still ship.

## A9. Elite affixes

| Affix | Bit | Effect (sim) | Pools |
|---|---|---|---|
| MOLTEN | 1 | drops an acid or magma pool every 1.0 s (MAX_ACID guard) | Hive, Wastes |
| HASTED | 2 | speed x1.5 (ceiling applies); fire and teleport cooldowns x0.75 | all |
| BROOD | 4 | at 50% HP and on death, 4 world fodder at r 30 | all |
| VOLATILE | 8 | on death, a hazard circle r 110, tele 0.8 s, dmg 22 | all |
| SHIELDED | 16 | front armor 0.6; facing turns at most 2.4 rad/s | Depths, Wastes |

Elite XP (unscaled): guardian 20, abyssalWarden 26, duneLeviathan 30. Outline color by affix: MOLTEN #ff7a3a, HASTED #57c8ff, BROOD #4dffa0, VOLATILE #ffe066, SHIELDED #b886ff.

P7 rules (`src/content/affixes.ts`): the outline is a ring on the floor at the body radius + 8 u in the lowest set bit's color. MOLTEN's first pool drops 1.0 s after spawn, with the arena's hazard tint (acid in Hive, magma in Wastes). HASTED multiplies the spawn speed (the 240 u/s ceiling still applies) and every restart of the fire and teleport timers by 0.75. BROOD's 4 fodder stand at 90 degree steps on r 30 from one spawn-stream draw; the half-HP burst and the death burst are separate, so a kill from above half HP spawns 8. VOLATILE's blast uses the flat authored damage (threat scaling only). SHIELDED sets front armor to max(def armor, 0.6), and the facing (not the path) turns at most 2.4 rad/s.

## A10. Bosses

### A10.1 Defs

- `queen`, `voidMatron`, `emberTyrant`: behavior `'boss'`, XP 120, 120, 130.
- `queenPrime`: sprite queen, scale 3.2, r 56, speed 34, damage 60, tint #ff2a6a, XP 240.
- `voidMatronPrime`: scale 3.1, r 54, speed 40, damage 55, tint #ff4f86, XP 240.
- `emberTyrantPrime`: scale 3.4, r 58, speed 30, damage 60, tint #ffd23d, XP 260.
- `egg`: sprite splitter, scale 0.9, hp 40, speed 0, r 14, damage 0, XP 2, behavior `'egg'`, hpRamp 0. Hatches after 4.0 s into 3 swarmers.
- `flakTurret`: sprite cinderMortarch, scale 1.0, hp 60, speed 0, r 16, XP 3, behavior `'spitter'`, fireCooldown 1.6, projectileSpeed 460, projectileDamage 11, hpRamp 0.1. P6b: damage 0 (a rooted gun, no bite), tint #ff8a2a, gib #ffb05a x6, name `FLAK TURRET`, no acid. It is the fight's brood, so it shoots inside the cage. When its fight ends (kill, ascend or stalemate), every turret of that fight collapses with no credit: a speed-0 shooter would otherwise fire across the arena for the rest of the run.
- Boss contact bites: queen 24, matron 22, tyrant 24.
- Boss HP per world (`WorldScript.boss`, A7.2): `worldMul` scales every boss of the world, the OVERTIME boss included; `primeHpMul` (P19 bosshp pass) scales only the PRIME, on top of `worldMul`, so a world's final fight can be set apart from its mid fights. Values: Hive 1.0 / 1.0, Depths 1.0 / 1.0, Wastes 0.9 / 0.95. The pass added the PRIME factor because the P6b review found the Matron PRIME short next to the Queen PRIME; on the P19 build the three PRIMEs measure close at one base (section 11, A6 and A7 note), and the Matron at 1.15 lost A7. `director.beginFight` applies it once, when the stage is `'final'` (the PRIME's beat and the ascend both pass through it).

### A10.2 Stages

| Stage | hpBase | Phases (HP frac) | Cadence per phase | Tele mul per phase |
|---|---|---|---|---|
| mid1 | 2760 | [0.5] | 1.0 / 1.2 | 1.0 / 1.0 |
| mid2 | 3380 | [0.66, 0.33] | 1.0 / 1.2 / 1.35 | 1.0 / 1.0 / 0.8 |
| final (PRIME) | 9800 (x `primeHpMul`) | [0.66, 0.33] | 1.0 / 1.2 / 1.35 | 1.0 / 1.0 / 0.75 |
| overtime c | 2600 x 1.35^c (x THREAT hpMul, not OVERTIME's 1.5^c); its own hpBase | as mid2 | as mid2 | as mid2 |

P19 bosshp pass (section 11, A6 and A7 note; `docs/tuning/pass-bosshp.md`): mid1 2400 to 2760, mid2 2600 to 3380, final 4200 to 9800. The OVERTIME boss keeps 2600 as its own `hpBase` (it shared mid2's object before), so the pass leaves A13 to the OVERTIME knobs. Every hpBase is multiplied by the world's `worldMul`, the PRIME also by `primeHpMul` (A10.1), then by `buildScale ** 0.75` and `hpMul` (section 4.7).

Idle gap: queen 0.9 s, matron 0.7 s, tyrant 1.1 s. Cadence divides idleGap and recover. THREAT 3+ multiplies base cadence by 1.2, and FRENZY stacks on top.

**Rotations:**

| Stage | P1 | P2 | P3 |
|---|---|---|---|
| mid1 | A, B | A, B, C | none |
| mid2 / overtime | A, B, C | A, C, B (P2 variants) | B, A, C |
| final | A, B, C | A, B, A, C (variants) | SIG at once, then A, B, SIG, C |

### A10.3 Attack kits (T0)

**THE QUEEN** (idle: walks toward the player to 160 u)

| Attack | tele | active | recover | dmg | Parameters |
|---|---|---|---|---|---|
| A sporeNova | 0.90 | instant | 0.70 | 12 per glob | 16 globs, speed 220, r 8, life 3.0; the first is aimed at the player. P2+: second ring 0.35 s later, rotated 11.25 degrees. PRIME P3: 20 per ring. |
| B royalLunge | 0.90 | up to 1.0 | 1.00 | 30 | lane len 560, halfW 50, heading locked at tele start; dash 560 u/s; stops at the cage edge or the arena wall; one hit, only inside the drawn lane (the stretch the body's front has swept), never on the wider PRIME body alone |
| C eggClutch | 0.60 | instant | 0.60 | 0 | 5 eggs (PRIME P3: 7) on r 150, 1 boss draw; at brood cap, cast A instead |
| SIG mothersCall | 1.20 | instant | 1.00 | none | 24 swarmers (hp x1.5) on 27 slots at `cage.r - 40`; 3 empty slots face away from the queen; at brood cap, cast A instead (P11) |

Decals: sporeNova a circle r 120 on the queen; royalLunge its lane, cut at the ring or the wall; eggClutch a circle r 164 (the egg ring plus an egg radius); mothersCall a circle of `cage.r - 40` on the cage center.

**THE VOID MATRON** (idle: strafes at 260 u)

| Attack | tele | active | recover | dmg | Parameters |
|---|---|---|---|---|---|
| A riftBlink | 0.90 | 0.15 | 0.80 | 26 | circle r 140 on the player's position at tele start; she teleports there and slams |
| B psiLance | 0.80 | bolts | 0.70 | 16 per bolt | 3 lanes at -24, 0 and +24 degrees, len 700, halfW 22; 1 bolt per lane (P2+: 2 bolts, 0.15 s apart), speed 760, r 9 |
| C undertow | 0.70 | 3.0 | 0.60 | 0 | pulls the player at 150 u/s (clamped by MAX_WELL_PULL 140); 6 wraiths at r 90 |
| SIG riftStorm | 0.70 x3 | 0.15 each | 1.00 | 22 | 3 riftBlinks in a row, r 120, each aimed at its own tele start |

Decals (P6b): riftBlink and riftStorm the slam circle on the player's spot, and she lands in it as it slams: the circle detonates and hits at the end of one tick, and she arrives on her cast tick, the next one; the next riftStorm blink telegraphs at the player's spot on that tick. psiLance its 3 lanes, and each bolt ends where its lane ends; bolts are drawn 60% toward white. undertow a circle r 104 on her (the wraith ring plus a wraith radius) that stays up through the 3.0 s pull; the pull adds to any gravity well inside the one MAX_WELL_PULL clamp and stops when the bodies touch; the wraith ring starts toward the player (no draw).

**THE EMBER TYRANT** (idle: approaches to 300 u at 0.6x speed)

| Attack | tele | active | recover | dmg | Parameters |
|---|---|---|---|---|---|
| A magmaMortar | 1.00 | 0.15 | 0.80 | 22 | 5 circles r 70: one on the player plus 4 at 120 u (1 boss draw for rotation); the center leaves a magma pool |
| B flakTurrets | 0.80 | instant | 0.60 | 11 per shot | 3 turrets on r 170 around her (1 draw); max 6 alive, otherwise cast A |
| C scorchSweep | 0.90 | 1.40 | 0.80 | 28 | 120 degree sector, r 460; flame line halfW 30 sweeps from player angle -60 degrees; direction alternates |
| SIG cinderfall | 1.00 each | 0.15 | 1.00 | 20 | 12 circles r 80 on a spiral (radius 90 + 27k, angle 50k degrees + 1 draw), one every 0.25 s |

Decals (P6b): magmaMortar its 5 circles, placed around the player's spot at the tele start (the center one leaves the magma pool). flakTurrets a marker circle r 34 at each turret spot (on r 170 around her, clamped inside the cage), and the turret rises from it (hazard `onEnd` spawn); "max 6 alive" means slot A casts when the live turrets plus 3 would pass 6. scorchSweep its 120 degree sector from her position at the tele start, with the flame line waiting on the edge it starts from, then, while it burns, the flame line moving across (the sector dims). cinderfall its circles; the spiral is centered on the player's spot at the cast start, and a circle that lies wholly outside the cage (it cannot reach the caged player) is not cast.

A multi-part attack (riftStorm, cinderfall) holds the boss until its last part lands, then recovers, so only one attack's telegraph is live at a time. A phase change cancels every boss telegraph still warning and every boss marker, and the parts still to come; damage already live finishes. The end of a fight (a kill, an ascend or a stalemate) ends every boss hazard of it.

**Arrival and fight sanity** (effective DPS = estimate x 0.6):

| Stage | Build ratio | HP | Fight length |
|---|---|---|---|
| mid1 | 1.0 | 2760 | 52 s |
| mid2 | 5.0 | 11300 | 43 s |
| final | 7.0 | 42170 | 114 s |

This table is a design estimate (Hive, worldMul 1.0; the P19 bosshp values). The rows run past the A6 bands, but the focus bot reaches mid1 at a median build ratio of 1.8 (1.0 to 6.1) and deals about the full estimate to the boss, not 0.6 of it, and the evolutions, fusions and pickup weapons it has by the PRIME add damage that `buildScale` does not count. A6 is measured with the bot (A6 and A7 note in section 11): the focus bot's medians on these values are about 25 s, 25 s and 55 to 60 s.

## A11. THREAT levels

Effects are cumulative. Rule text is at most 48 characters.

| T | Name | Rule (UI) | hpMul | dmgMul | aliveMul | Mechanics |
|---|---|---|---|---|---|---|
| 0 | STANDARD | The hive as designed. | 1.00 | 1.00 | 1.00 | none |
| 1 | HUNTERS | Elites hunt in packs and carry an affix sooner. | 1.10 | 1.00 | 1.00 | teaching elite: 1 affix, hpMul 1.0; elite beats from 6:15 get +1 elite |
| 2 | BROOD TIDE | Every swarm event strikes twice. | 1.20 | 1.05 | 1.10 | events 1 to 3 fire a mirror copy 8 s later (S and G rotated 180 degrees) |
| 3 | CHAMPIONS | Elites carry 2 affixes. Bosses attack faster. | 1.30 | 1.10 | 1.10 | elite affixes 2 (teaching elite 1); base boss cadence x1.2 |
| 4 | SCARCITY | Only elites and bosses drop medkits. | 1.40 | 1.15 | 1.15 | non-elite medkit drops off; every elite drops 1 medkit and every boss 2, each healing x0.5 |

- Daily threat: `DAILY_THREAT_CYCLE = [0, 0, 1, 0, 1, 0, 2]`, indexed by `dayIndex % 7`.
- Score factor: `(10 + 2T) / 10`.

P11 rules (`src/content/threat.ts`, `resolveScript(arenaId, threat)`):
- hpMul multiplies every enemy's spawn HP (`world.hpMul`), so elites, event units, brood and bosses take it too. dmgMul is `world.runDmgMul`: `world.dmgMul` is the time ramp x runDmgMul, and authored damage (boss bites, boss shots, the royal lunge, every hazard: boss attacks, MORTAR BARRAGE, VOLATILE) takes runDmgMul alone. aliveMul multiplies minAlive and maxAlive (maxAlive floored); lulls and the cage floor keep their own values.
- The teaching elite (1:30) takes 1 affix and hpMul 1.0 from T1. "Elite beats from 6:15" are the 6:15, 8:15 and 9:10 beats (x3, x3, x4 at T1).
- A mirror copy is its own event beat 8 s after its event (2:38, 5:38, 8:53), with its own alert and a HUD timeline tick. It takes no script draw: its S or G is its event's turned 180 degrees and fitted to the arena (`fitSide`, so near a wall it may turn back), and BLINK STORM, CHARGER VOLLEY and MORTAR BARRAGE reuse their event's drawn angles turned 180 degrees. Held by a cage, it follows the deferral rules like any event.
- CHAMPIONS: every elite beat after the teaching elite has 2 affixes; the boss cadence is `stage cadence x 1.2 x FRENZY`.
- SCARCITY: non-elite kills still roll the medkit draw but drop nothing; an elite drops 1 medkit and a boss 2 (5 below T4), each healing 7 (14 x 0.5).

## A12. Feats (48)

Notation: `r` = RunResult, `L` = LifetimeStats. Name max 18 chars, desc max 34. Bands follow the pacing model: a session is 15 min of run time and about 4 runs; session 1 is 10 min and 5 runs.

| # | id | NAME | desc | kind | value | target | reward | band |
|---|---|---|---|---|---|---|---|---|
| 1 | first_contact | FIRST CONTACT | Finish your first run | total | L.runs | 1 | paint static | S1 |
| 2 | field_promotion | FIELD PROMOTION | Reach Lv 5 in one run | run | r.level | 5 | weapon lightning | S1 |
| 3 | big_game | BIG GAME | Slay an elite | total | L.elites | 1 | perk giant_slayer | S1 |
| 4 | overcharged | OVERCHARGED | Reach Lv 8 in one run | run | r.level | 8 | pilot ember | S1 |
| 5 | rampage | RAMPAGE | Reach a x3 multiplier | run | r.peakTier | 3 | perk berserker | S1 |
| 6 | swatter | SWATTER | Kill 300 in one run | run | r.kills | 300 | paint hazard | S1 |
| 7 | pest_control | PEST CONTROL | Kill 1,000 in total | total | L.kills | 1,000 | weapon hailstorm | S1 |
| 8 | back_for_more | BACK FOR MORE | Finish 5 runs | total | L.runs | 5 | perk overpressure | S1 |
| 9 | thick_hide | THICK HIDE | Take 1,000 damage in total | total | L.damage | 1,000 | pilot vesper | S2 |
| 10 | deep_dive | DEEP DIVE | Survive 2:30 in Hive Meadow | run | hive ? r.time : 0 | 150 | world depths | S2 |
| 11 | near_miss | NEAR MISS | Make 10 close calls | total | L.closeCalls | 10 | weapon railgun | S2 |
| 12 | culler | CULLER | Kill 5,000 in total | total | L.kills | 5,000 | perk incendiary | S2 |
| 13 | arsenal | ARSENAL | Use 4 pickup weapons in one run | run | r.weapons.length | 4 | paint gunmetal | S2 |
| 14 | queenslayer | QUEENSLAYER | Slay THE QUEEN | total | kills of queen + queenPrime | 1 | perk hollow_point | S3 |
| 15 | world_tour | WORLD TOUR | Finish a run in all 3 worlds | total | worlds played | 3 | paint atlas | S3 |
| 16 | on_shift | ON SHIFT | Play for 30 minutes | total | L.seconds | 1,800 | paint cobalt | S3 |
| 17 | mayhem | MAYHEM | Reach a x5 multiplier | run | r.peakTier | 5 | perk adrenal_wake | S3 |
| 18 | daybreak | DAYBREAK | Finish a ranked Daily | total | L.dailyRanked | 1 | paint daybreak | S3 |
| 19 | untouchable | UNTOUCHABLE | Go 2:00 without being hit | run | r.longestNoHit | 120 | perk slipstream | S4 |
| 20 | void_walker | VOID WALKER | Slay THE VOID MATRON | total | kills of voidMatron + prime | 1 | world wastes | S4 |
| 21 | five_alive | FIVE ALIVE | Survive 5:00 in one run | run | r.time | 300 | weapon beam | S4 |
| 22 | regular | REGULAR | Finish 15 runs | total | L.runs | 15 | perk quartermaster | S4 |
| 23 | exterminator | EXTERMINATOR | Kill 12,000 in total | total | L.kills | 12,000 | paint magma | S4 |
| 24 | back_to_back | BACK TO BACK | Slay 2 bosses in one run | run | r.bossesSlain | 2 | perk second_wind | S5 |
| 25 | purist | PURIST | Survive 3:00 with no weapon pickup | run | pods 0 ? r.time : 0 | 180 | paint bone | S5 |
| 26 | long_watch | LONG WATCH | Play for 60 minutes | total | L.seconds | 3,600 | paint chrome | S5 |
| 27 | flawless | FLAWLESS | Slay a boss without being hit | total | L.bossesFlawless | 1 | paint ghost | S5 |
| 28 | fused | FUSED | Take a fusion perk | run | r.fusions.length | 1 | paint overclock | S5 |
| 29 | nova_ace | NOVA ACE | Slay a boss as NOVA | total | L.perPilot.nova.bosses | 1 | paint nova_prime | S5 |
| 30 | ember_ace | EMBER ACE | Reach Lv 12 as EMBER | run | ember ? r.level : 0 | 12 | paint wildfire | S5 |
| 31 | tyrantfall | TYRANTFALL | Slay THE EMBER TYRANT | total | kills of emberTyrant + prime | 1 | weapon vortex | S6 |
| 32 | plague | PLAGUE | Kill 18,000 in total | total | L.kills | 18,000 | perk glass_cannon | S6 |
| 33 | vesper_ace | VESPER ACE | Survive 5:00 as VESPER | run | vesper ? r.time : 0 | 300 | paint nightshade | S6 |
| 34 | hive_breaker | HIVE BREAKER | Slay 10 bosses in total | total | L.bosses | 10 | paint royal_jelly | S6 |
| 35 | infestation | INFESTATION | Kill 24,000 in total | total | L.kills | 24,000 | paint sunset | S7 |
| 36 | high_score | HIGH SCORE | Score 250,000 in one run | run | r.score | 250,000 | paint gilded | S7 |
| 37 | evolved | EVOLVED | Evolve a weapon | run | r.evolutions.length | 1 | paint ultraviolet | S6 |
| 38 | devoted | DEVOTED | Finish 30 runs | total | L.runs | 30 | paint rust | S8 |
| 39 | creature_of_habit | CREATURE OF HABIT | Finish 7 ranked Dailies | total | L.dailyRanked | 7 | paint dusk | S8 |
| 40 | five_everywhere | FIVE EVERYWHERE | Survive 5:00 in all 3 worlds | total | worlds with bestTime >= 300 | 3 | paint tricolor | S8 |
| 41 | dedicated | DEDICATED | Play for 2 hours | total | L.seconds | 7,200 | paint ice | S9 |
| 42 | first_clear | FIRST CLEAR | Clear any world | total | L.clears | 1 | paint purged | S6+ |
| 43 | veteran | VETERAN | Finish 40 runs | total | L.runs | 40 | paint veteran | S10 |
| 44 | swarmgeddon | SWARMGEDDON | Reach the x8 multiplier | run | r.peakTier | 8 | paint swarmgeddon | S8+ |
| 45 | clean_sweep | CLEAN SWEEP | Clear all 3 worlds | total | worlds cleared | 3 | paint sweep | S10+ |
| 46 | under_pressure | UNDER PRESSURE | Clear a world at Threat 3 | total | max threat cleared | 3 | paint pressure | S12+ |
| 47 | apex | APEX | Clear a world at Threat 4 | total | max threat cleared | 4 | paint apex | late |
| 48 | extinction | EXTINCTION EVENT | Kill 100,000 in total | total | L.kills | 100,000 | paint extinction | late |

Reward lines:
- `New pilot: EMBER`
- `New world: VIOLET DEPTHS`
- `Added to your perk pool: HOLLOW POINT`
- `Added to the weapon drops: RAIL SPIKE`
- `New paint: COBALT`
- `Already yours`

If measured kill rates differ from 250 per minute, retune only the kill thresholds (#12, #23, #32, #35).

Pacing check (P12b, `node scripts/feats-pacing.mjs`): a model player on the real save code, with the session budget above, 250 kills per minute and one ranked Daily per session from S3. Every session S1 to S10 unlocks at least one thing, and each one has at least one count feat (runs, play time, kills or ranked Dailies), which no skill assumption decides. The skill assumptions (run lengths, level, no-hit stretch, boss and elite timing) are listed in the script.

## A13. Paints

All paints are earned. `factory` = the pilot's own colors, always owned.

| id | NAME | body | outline | visor | barrel | bullet | feat |
|---|---|---|---|---|---|---|---|
| static | STATIC | e8f4ff | 23313f | 0b1622 | 7f9bb5 | d6f0ff | 1 |
| hazard | HAZARD | ffd23a | 3a2a00 | 1a1300 | 2b2b2b | ffe066 | 6 |
| gunmetal | GUNMETAL | 8a96a3 | 1b2129 | 0d1117 | 4a5561 | c9d3dd | 13 |
| atlas | ATLAS | 3aa0ff | 0a2a4a | 04121f | ff9a3a | 9ad0ff | 15 |
| cobalt | COBALT | 3a6bff | 0d1a4a | 070d26 | 1f3a99 | 8fb0ff | 16 |
| daybreak | DAYBREAK | ffb3c7 | 5a1f33 | 2a0d18 | ff7aa0 | ffd6e2 | 18 |
| magma | MAGMA | ff5a2a | 3d0f05 | 1f0703 | ffb03a | ff8a4a | 23 |
| bone | BONE | f0e6d2 | 4a3f30 | 1f1a12 | b8a888 | fff4e0 | 25 |
| chrome | CHROME | d7dde4 | 3a424a | 11161b | 9aa5b0 | ffffff | 26 |
| ghost | GHOST | cfc4ff | 3b3366 | 17132b | 9b8cff | e6e0ff | 27 |
| overclock | OVERCLOCK | ff4a4a | 4a0a0a | 220404 | ffffff | ffb0b0 | 28 |
| nova_prime | NOVA PRIME | 1ce8b5 | 0b3b30 | 06231d | ffd24a | fff2b0 | 29 |
| wildfire | WILDFIRE | ff7a1a | 4a1e08 | 2b1206 | ffd23a | ffb066 | 30 |
| nightshade | NIGHTSHADE | 8a4dff | 1f0d40 | 0e0620 | 3a1a80 | c9a0ff | 33 |
| royal_jelly | ROYAL JELLY | ff3a8a | 4a0a26 | 240512 | ffd24a | ff9ac4 | 34 |
| sunset | SUNSET | ff6a5a | 3a0f1a | 1a0610 | 7a3aff | ffb0a0 | 35 |
| gilded | GILDED | ffd24a | 5a4000 | 2a1e00 | fff2b0 | ffe98a | 36 |
| ultraviolet | ULTRAVIOLET | b04dff | 2a0a4a | 14052a | ff6cf0 | e0a0ff | 37 |
| rust | RUST | c0602a | 3a1a0a | 1a0c05 | 7a8a8a | e8a070 | 38 |
| dusk | DUSK | ff9a6a | 3a1a4a | 1a0c24 | 7a4aff | ffc0a0 | 39 |
| tricolor | TRICOLOR | 1ce8b5 | 2c1450 | 14052a | ff8a3d | b886ff | 40 |
| ice | ICE | a8ecff | 1a4a5a | 0a2029 | ffffff | d8f8ff | 41 |
| purged | PURGED | 3df0c0 | ffffff | 05070d | ffffff | eafff6 | 42 |
| veteran | VETERAN | 9aa05a | 2a2d14 | 12140a | 5a5a3a | e0e6a0 | 43 |
| swarmgeddon | SWARMGEDDON | ffffff | ff2d4a | 05070d | 3df0c0 | ff6cf0 | 44 |
| sweep | CLEAN SWEEP | ffffff | ffd24a | 05070d | ffd24a | fff2b0 | 45 |
| pressure | PRESSURE | ff2d4a | 1a0005 | 000000 | ffd24a | ff6a6a | 46 |
| apex | APEX | 1a1a1a | ffd24a | ffd24a | ffd24a | ffe98a | 47 |
| extinction | EXTINCTION | 2a2a2a | ff2d4a | ff2d4a | ff2d4a | ff2d4a | 48 |

Screenshot every paint on every world floor at 375x667 mid-swarm. A paint that makes the ship harder to find than FACTORY gets a lighter outline before ship.

Dark paints (P12b): a body under 3:1 on #05070d (APEX, EXTINCTION) draws its outline 4 u wide, so it is at least 2 px down to the minimum camera zoom of 0.5. Every other hull keeps the 3 u outline. `node scripts/paint-shots.mjs` makes the per-world screenshot sheets.

## A14. Score tiers

| Tier | Chain | Name | Color |
|---|---|---|---|
| x1 | 0-9 | (none) | #7da99c |
| x2 | 10-29 | CHAIN (not announced) | #7dffd6 |
| x3 | 30-69 | RAMPAGE | #57c8ff |
| x4 | 70-149 | CARNAGE | #b886ff |
| x5 | 150-299 | MAYHEM | #ffe066 |
| x6 | 300-549 | HAVOC | #ffb066 |
| x7 | 550-899 | EXTINCTION | #ff6a6a |
| x8 | 900+ | SWARMGEDDON | #ff6cf0 |

Every tier color is at least 6.5:1 on #05070d. Point base = `10 x def.xp`: swarmer 10, brute 60, guardian 200, queen 1,200, queenPrime 2,400.

## A15. Callouts, alerts and copy

Callout lane: center y = `max(T + plateBottom + 56, 0.30H)` in portrait and `0.36H` in landscape. One callout at a time, a queue of 3, higher priority preempts.

| Id | Priority | Hold | Title | Sub | Color |
|---|---|---|---|---|---|
| worldIntro | 1 | 2.2 s | world name | `vs ACID HIVE` / `vs PSYCHIC BROOD` / `vs CINDER SWARM` | borderGlow |
| dailyIntro | 1 | 2.4 s | `DAILY #142` | ranked: `VIOLET DEPTHS · SAME RUN FOR EVERYONE`; practice: `VIOLET DEPTHS · PRACTICE RUN` | gold |
| alert boss / final | 3 | 3.0 s | script title | script sub | #ff6aa8 |
| alert OT boss retreat (P11) | 3 | 3.0 s | script stalemate (`THE QUEEN ESCAPED`) | `THE SWARM RETURNS` | #ff6aa8 |
| alert event | 2 | 3.0 s | event title | event sub | #ff5a6e |
| alert elite | 2 | 2.0 s | elite name tag (several elites: `GUARDIAN x2`) | `FROM THE EAST` | gold |
| alert lull / debut | 1 | 2.0 s | `FINAL SWARM` / enemy name | `IN 20 SECONDS` / `NEW BUG` | text.primary |
| bossPhase | 2 | 1.0 s | `QUEEN PRIME ENRAGES` | | #ff6aa8 |
| frenzy | 2 | 1.2 s | `FRENZY` | `FINISH IT` | #ff5a6e |
| bossSlain | 3 | 2.0 s | script slain | `+48,210` (boss points) or the Hive Core line | gold |
| flawless | 3 | 1.2 s | `FLAWLESS` | | #7dffd6 |
| win | 3 | 2.0 s | script win | `CLEARED IN 11:02` | gold |
| stalemate | 3 | 2.0 s | script stalemate | | #ff5a6e |
| newBest | 2 | 1.4 s | `NEW BEST` | score | gold |
| multUp | 2 | 1.1 s | tier name (tier 3 or higher, same tier at most once per 6 s) | `x5` | tier color |
| closeCall | 2 | 0.9 s | `CLOSE CALL` | `+15 CHAIN` | #7dffd6 |
| fusion | 3 | 1.6 s | fusion name | the two parent names | #ff5ad1 |
| evolve | 3 | 1.8 s | evolved name | `EVOLVED` | #ff9a4a |
| bonus | 2 | 1.0 s | bonus name | `8 SECONDS` (timed) | bonus tint |
| weaponPickup | 1 | 1.1 s | weapon name | `20 SECONDS OF AMMO` | weapon tint |
| outOfAmmo | 1 | 1.2 s | `OUT OF AMMO` | `Back to SIDEARM` | #ff5a6e |
| revive | 3 | 1.4 s | `SECOND WIND` | | #4dffa0 |
| hint | 0 | 3.5 s | | hint line | text.hi |

Built in P15 (`src/ui/callouts.ts`): the title is Orbitron 900 26 px with a 6 px INK stroke, the sub JetBrains Mono 800 14 px with a 5 px INK stroke in the title color 35% toward text.hi, and both are fitted to the safe width minus 32. The sub never goes under 12 px effective: when it does not fit on one line at that size it takes two lines (18 px apart), broken at its ` · ` separator or at the space nearest the middle, so the Daily intro sub on a 320 px phone reads `VIOLET DEPTHS` / `SAME RUN FOR EVERYONE` at 14 px. A line enters in 140 ms (scale 1.25 to 1) and leaves in 200 ms. A queued line that waited longer than its own hold is dropped, so a Close Call never shows seconds late behind a boss alert. A line that follows the one before it is never dropped and shows when that line ends: a boss kill's FLAWLESS and the PRIME's win line (P15 review: FLAWLESS, queued behind the 2.2 s slain line with a 1.2 s hold, never showed). The lane hides while the sim is paused (draft, win panel, pause). Wired: every row (the hint row in P17); the bonus row (name, `8 SECONDS` for a timed bonus) was wired in the W4 integration, after P9. bossSlain's sub is the points scored since the boss arrived; the PRIME's kill shows one slain line with FLAWLESS in its sub when earned, and the WIN panel or the recap carries the win text (P16). newBest shows once per run, when the score passes the world's best score (none on a world's first run). A world-space elite tag under the showing line dims to 0.2.

Other copy:
- **Daily card:**
  - `DAILY #12`
  - `VIOLET DEPTHS · AS EMBER · THREAT 1: HUNTERS` (the threat part only when > 0)
  - `EMBER is free to fly today.`
  - `RANKED ATTEMPT READY` with button `PLAY RANKED`
  - after the ranked run: `RANKED 48,210 · #37 OF 412`, `PRACTICE BEST 61,000`, button `PRACTICE`
  - `NEW DAILY IN 5H 12M` (under one hour: `NEW DAILY IN 42M`)
  - `12 DAILIES PLAYED · 3 IN A ROW`
- **Ranked confirm:** `RANKED ATTEMPT` / `Your first Daily run today is the ranked one. After it, practice as much as you like.` / `START` `BACK`.
- **Checkpoint toast:** `Ranked Daily #12 saved at 4:10 when the app closed.`
- **Opt-in card:** `JOIN THE LEADERBOARD?` / `Post your scores under a nickname. The board shows your nickname, score, run stats, pilot, world and country.` / `CHOOSE A NAME` / `NO THANKS`. Toast: `You can turn this on in Settings.` (P13: `You can join later from LEADERS.` until P17 adds the Settings ACCOUNT rows.)
- **Name prompt:**
  - `YOUR LEADERBOARD NAME`
  - `2 to 14 characters. Shown on the public board.`
  - placeholder `PILOT`, buttons `CANCEL` and `SAVE`
  - validation `Use 2 to 14 visible characters.`
  - server rename toast: `That name is not allowed. Posted as PILOT4F2A.`
- **Recap rank lines:**
  - `RANK 37 OF 412 TODAY`
  - `VIOLET DEPTHS: #12 THIS WEEK · #140 ALL TIME`
  - `Score not posted. Check your connection.`
  - `Your ranked Daily is already posted.`
  - (P13) `Score not posted. The leaderboard is offline.` (404 or 410: a server without the v2 routes), `Score not posted. Update the game to post scores.` (426), `Score not posted.` (400 or 422)
- **Leaderboard:**
  - `LEADERBOARD`, `DAILY`, `THIS WEEK`, `ALL TIME`
  - `YOU  #347 OF 2,118 · TOP 17%`, `YOU  no score on this board yet`
  - `You are not posting scores.` with `JOIN`
  - `No scores yet. Be the first.`, `Could not reach the leaderboard.`
  - (P13) `The leaderboard is offline.` (404 or 410), `Update the game to see the leaderboard.` (426), `LOADING`, `TAP THE WORLD TO SWITCH IT`, `NAME: TESTER  (TAP TO EDIT)`
- **Menu Daily button (P13, until the P17 Daily card):** `DAILY #12`, then `DAILY #12 PRACTICE` after the ranked start.
- **Remove scores:** `Remove all your scores from the public board? This cannot be undone.` / `REMOVE` `CANCEL`. (P17) Toast after it: `Your scores are removed.`, or `The leaderboard is offline.`, `Update the game to see the leaderboard.`, `Could not reach the leaderboard.`
- (P17) **Leaderboard:** `TRY AGAIN` under `Could not reach the leaderboard.` **Settings:** `SHOW TIPS AGAIN` reads `TIPS RESET` once pressed; `NAME` shows `NOT SET` before a name exists.
- **Settings help:** `Posts your nickname, score, run stats, pilot, world and country.`

## A16. Audio and shake

### A16.1 Buses

```
voice → panBus[-1, -0.5, 0, 0.5, 1] of its tier → [chaffBus | mainBus] → sfxBus → shaper → master
music → musicBus → musicDuck → musicLP (20 kHz idle) → master
```

- Voice cap: 24 (a voice is one recipe instance, alive until its last source stops). A tier 0 sound is dropped at the cap. A tier 1 or 2 sound at the cap takes the slot of the oldest voice of the lowest lower tier (8 ms fade); with none, it is dropped.
- Each tier has its own 5 pan buses in front of its tier bus, so one gain param per tier bus carries every duck.
- A pan bus is a gain of `Math.SQRT2` into an equal-power StereoPanner, so a center voice keeps the unpanned (v1) level on each channel. Without StereoPanner it is a unity gain.
- Pan = `clamp((screenX - W/2) / (W/2), -1, 1)`, snapped to the nearest bus.

| Tier | Sounds | On play |
|---|---|---|
| 0 | pistol, smg, plasma, beam, whoosh, hit, kill, gem, graze, spit, teleport, crit, tick | none |
| 1 | shotgun, heavy, crack, weapon, hurt, heal, eliteSpawn, chargerWindup, podSpawn, emptyClick, lowAmmo, heartbeat, ui, uiConfirm, uiBack, cardDeal, countdown, stamp, dash, closecall, shard, bonus_*, multUp, multBreak, alertEvent, alertElite | chaffBus to 0.4 for 40 ms |
| 2 | boss, bossKill, death, levelup, fusion, evolve, core1, core3, core5, newBest, feat, win, alertBoss | musicDuck to 0.5 (15 ms attack, 400 ms release); chaffBus to 0 for 120 ms. bossKill, death and win: 0.35 with a 900 ms release |

Overlapping music ducks merge: the release starts from the lower of the two levels and ends at the later end time, so a shallower duck never cuts a deeper one short.

States: pause sets LP 600 Hz and duck 0.6. Low HP sets LP 900 Hz. Death sweeps LP to 400 Hz over 600 ms. When hidden, `ctx.suspend()`.

### A16.2 Recipes

Primitives: `zap`, `tone`, `thump`, `click`, `noiseSweep`, `arp`, `arpAt`. `play(name, semis = 0, ratio = 1, pan = 0)` (positional, so a play allocates only its audio nodes); `semis` and `ratio` scale every oscillator of the recipe.

| Name | Recipe | Throttle |
|---|---|---|
| hurt | thump(120,45,.16,.55); noiseSweep(.12,.35,2200,400,'lowpass'); zap(180,70,.12,'sawtooth',.22,1600,300,18) | 90 ms |
| graze | noiseSweep(.06,.12,1800,600,'bandpass'); thump(140,80,.06,.18) | 250 ms |
| bossKill | thump(80,30,.9,.7); arp([392,494,587,784,988],.09,'triangle',.24); arpAt(.5,[784,988,1175,1568],.08,'sine',.10); noiseSweep(1.0,.25,3000,200,'lowpass') | none |
| win | bossKill + arpAt(.9,[523,659,784,1047],.12,'triangle',.2) | none |
| eliteSpawn | zap(185,139,.45,'sawtooth',.22,900,500,14); thump(90,50,.4,.35) | 400 ms |
| alertEvent | zap(220,165,.5,'sawtooth',.2,1200,600,10); zap(330,247,.5,'sawtooth',.12,1200,600,10) | 1 s |
| alertElite | eliteSpawn | 1 s |
| alertBoss | thump(60,40,1.0,.6); zap(110,82,1.0,'sawtooth',.25,800,300,12) | 1 s |
| chargerWindup | zap(300,900,.6,'square',.07,1200,3000,6) | 150 ms |
| spit | noiseSweep(.07,.12,1200,400,'bandpass'); tone(420,0,.05,'sine',.06) | 120 ms |
| teleport | zap(900,1800,.12,'sine',.08,4000,4000,30) | 200 ms |
| podSpawn | tone(1568,0,.08,'sine',.07); tone(2093,.07,.12,'sine',.07) | none |
| emptyClick | click(.01,.25,3000); tone(220,.02,.05,'square',.08) | 300 ms |
| lowAmmo | click(.006,.12,4000) | none |
| heal | tone(523,0,.14,'sine',.10); tone(659,.02,.14,'sine',.08); tone(784,.04,.16,'sine',.08) | 80 ms |
| gem | the old `pickup` recipe x ratio (ladder); replaces `pickup` | 60 ms |
| crit | click(.006,.12,5000); tone(2637,0,.03,'square',.05) | 50 ms |
| whoosh | noiseSweep(.08,.14,900,2400,'bandpass') | 45 ms |
| crack | click(.01,.35,5000); zap(2400,300,.12,'sawtooth',.2,6000,800,20); thump(160,40,.18,.5) | none |
| heartbeat | thump(70,45,.09,.35); at +.14 s thump(70,45,.09,.25) | clock |
| stamp | thump(200,60,.12,.45); click(.02,.3,1500) | none |
| tick | click(.004,.06,5000) | 45 ms |
| cardDeal | tone(1047 x 1.122^i,0,.035,'triangle',.07) | none |
| uiConfirm | click(.006,.1,2200); zap(680,1020,.06,'square',.1,3200,3200,0) | 60 ms |
| uiBack | zap(940,680,.045,'square',.08,3200,2400,0) | 60 ms |
| countdown | tone(880,0,.08,'square',.1); last beat 1320 Hz | none |
| dash | noiseSweep(.14,.18,600,3000,'bandpass'); zap(300,700,.1,'sine',.08,2000,2000,0) | 150 ms |
| closecall | zap(1200,2400,.12,'sine',.12,5000,5000,0); tone(1760,.05,.1,'triangle',.08) | 200 ms |
| multUp | arp([659,880],.04,'square',.1), freqs x 2^(2(tier-1)/12) | 250 ms |
| multBreak | zap(440,220,.15,'square',.12,2000,800,0) | 300 ms |
| fusion | arp([523,659,784,1047,1319],.06,'triangle',.2); thump(120,60,.3,.4) | none |
| evolve | arp([392,523,659,784,1047,1319],.07,'sawtooth',.18); thump(90,40,.5,.5) | none |
| core1 / core3 / core5 | arp([784,988],.08,'sine',.15) / arp([784,988,1175],.08,'sine',.18) / arp([784,988,1175,1568],.08,'triangle',.22) + thump(100,50,.4,.4) (the thump is core5 only) | none |
| shard | tone(1319,0,.06,'sine',.08); tone(1760,.05,.08,'sine',.07) | 200 ms |
| bonus_nuke | thump(70,30,.8,.7); noiseSweep(.8,.4,4000,150,'lowpass') | none |
| bonus_freeze | zap(2400,1200,.3,'sine',.12,6000,3000,0); noiseSweep(.3,.1,6000,2000,'highpass') | none |
| bonus_overdrive / bonus_fireblast | arp([330,440,554,659],.04,'sawtooth',.15) | none |
| bonus_shield | tone(523,0,.3,'sine',.12); tone(784,0,.3,'sine',.08) | none |
| bonus_vacuum | zap(200,1600,.4,'sine',.12,2000,6000,0) | none |
| newBest / feat | arp([659,784,988,1319],.07,'triangle',.18) | none |

Kill ladder: `play('kill', min(12, 2 x (tier - 1)), 1, pan)`, with the 40 ms throttle kept.

### A16.3 Shake per event

| Event | Trauma add | Ceiling | Kick (px) |
|---|---|---|---|
| Shot | 0 | | `-aim x kickPx` |
| Kill, xp 1 | 0.015 | 0.25 | |
| Kill, xp 2+ on-screen | 0.04 | 0.35 | |
| Explosion (1 per 80 ms) | 0.10 | 0.35 | 3 away from the center |
| Bite | 0.05 | 0.30 | 2 along source to player |
| Acid tick | 0.008 | 0.25 | |
| Discrete hit / ram | 0.30 / 0.45 | 1 | 8 / 12 along source to player |
| Hazard detonation near the player | 0.15 | 0.5 | |
| EliteSpawn | 0.20 | 1 | |
| Elite kill on-screen / off-screen | 0.40 / 0.05 | 1 / 0.35 | |
| BossSpawn / BossPhase / BossKill | 0.55 / 0.45 / 0.85 | 1 | |
| Dash | 0 | | 4 along the heading |
| NUKE / FIREBLAST | 0.6 / 0.25 | 1 | |
| WeaponPickup | 0.10 | 0.35 | |
| Revive / PlayerDeath / Win | 0.70 / 0.90 / 0.6 | 1 | |

## A17. Haptics

`haptic(kind)`:
- **Native:** Capacitor Haptics impact for light, medium and heavy; notification for success, warning and error; selection start, changed and end.
- **Web:** `vibrate` with selection 8, light 12, medium 20, heavy 35, success [12,40,12], warning [20,60,20], error [40,50,40].
- **Throttle:** 80 ms global. Notifications bypass it.
- **Gamepad rumble:** heavy, success and error only, as dual-rumble with weak = 0.6 x strong: heavy 120 ms at 0.5, success 90 ms at 0.4, error 320 ms at 0.9 (the v1 hurt, draft and death values).
- **Web gesture gate:** no `vibrate` call before the page's first user activation (Chrome blocks and logs it).

| Event | Haptic |
|---|---|
| Button pointerdown | light |
| Carousel snap, tab, segmented change | selection |
| Level-up full ceremony / short | success / light |
| Card pick | medium |
| Discrete hit 15+ / under 15 / bite (1 per 250 ms) | heavy (1 per 150 ms) / medium / light |
| Dash / Close Call | light / medium |
| Elite kill on-screen, weapon pickup | medium |
| Event warning alert | warning |
| Boss arrival / boss phase | heavy / heavy |
| Boss kill, fusion, evolve, Hive Core | heavy, then success at +150 ms |
| NUKE | heavy |
| HP crosses below 25% | warning |
| Revive | heavy, then success |
| Death | error |
| Win, NEW BEST, unlock | success |

Never per shot, per hit or per chaff kill.

## A18. UI tokens

All ratios are WCAG contrast.

| Token | Hex | On #05070d | Use |
|---|---|---|---|
| bg.void | #05070d | | background |
| surface.panel / card / raised | #0c1220 / #0e1726 / #141d2e | | surfaces |
| plate | #05070d @ 0.85 | | HUD plate, worst composite #2b2c31 |
| scrim.modal | #05070d @ 0.88 | | modals |
| text.hi | #eafff6 | 19.31 | primary text |
| text.primary | #7dffd6 | 16.45 | secondary text |
| text.muted | #7da99c | 7.70 | labels (replaces #3a5a52 for text) |
| accent.player | #1ce8b5 | 12.72 | |
| accent.xp | #57c8ff | 10.66 | |
| accent.gold | #ffc24a | 12.53 | |
| accent.crit | #ffe066 | 15.45 | |
| accent.danger | #ff5a6e | 6.66 | |
| boss.text | #ff6aa8 | 7.56 | |
| line.strong | #6f8f89 | 5.72 | control borders |
| line.faint / decor.dim | #1d2c44 / #3a5a52 | decor only | never text |
| rarity.common | #7dffd6 | 16.45 | border line.strong |
| rarity.rare | #5aa9ff | 8.20 | |
| rarity.fusion | #ff5ad1 | 7.32 | |
| rarity.evolution | #ff9a4a | 9.57 | |
| rarity.fallback | #7da99c | 7.70 | |

- Accent fills (HP green #2ee6a6, HP yellow #e8c64a, HP red #e8434a, boss #ff3a8a, level chip #57c8ff, rare, fusion, family chips) always take `#05070d` ink.
- Dynamic colors go through `ensureContrast`. Known lifts: Vortex #9b7aff and Depths glow #b06bff.
- Secondary buttons: fill #8aa6a0 @ 0.14 with a line.strong border.

Damage number tiers (glyph tint, size):

| Hit | Tint | Size |
|---|---|---|
| under 25 | #eafff6 | 13 px |
| 25 to 99 | #ffe066 | 15 px |
| 100+ | #ff9a4a | 18 px |
| crit | #ffe066 + `!` | 22 px, 4 px shake for 80 ms |
| heal | #4dffa0 `+14` | 15 px |

Glyph atlas: `BitmapFont.install({ name: 'numMono', style: { fontFamily: 'JetBrains Mono', fontWeight: '800', fontSize: 40, fill: 0xffffff, stroke: { color: 0x05070d, width: 6, join: 'round' } }, chars: '0123456789,:+-!x%#/K', resolution: 2, padding: 6 })`.

Damage number timing (real clock): life 600 ms (crit 700 ms), fading over the last 180 ms; each number starts 14 px above the hit. Values over 99,999 show as thousands with `K`. Merging is keyed on the enemy uid the Hit event carries in `b`.

Mode `big` shows crits, heals and any number whose total reaches 10. Every pilot's base weapon hit clears 10 (Sidearm 16, Stiletto 12, Scorcher 26); chip hits (4.5 to 8.5) and armor-blunted hits (a Sidearm shot into a beetle's front deals 6.4) do not. A smaller hit opens a hidden number on that enemy that collects every hit on it for up to 450 ms, and it shows at the latest hit once the total reaches 10. After it shows, the 150 ms merge rule applies. When the pool is full, a number that shows takes a hidden one's slot.

FX (section 6.4): directional gibs throw `round(0.6 x count)` gibs within ±0.6 rad of the killing shot's velocity and the rest radially (fx stream, one draw per angle as before). The muzzle is 2 sparks plus one additive flash quad: a 22 x 10 soft diamond along the aim, centered 11 px ahead of the muzzle, muzzle tint, 60 ms life, shrinking at 6/s. Rail and beam carry `WeaponDef.tracer`; their shots stretch along travel by `1 + speed / 1800`.

World labels (until the P15 callout lane replaces them): 8 pooled lines, JetBrains Mono 800 16 px with a 4 px INK stroke, 1.1 s life, 14 px rise, color through `ensureContrast`. They carry pickup names, alerts, boss kills and the gem hint. Each line sits a fixed number of screen px above its world anchor (the lift is divided by the camera zoom), so two-line alerts keep their 22 px line gap at every zoom.

Font coverage: the shipped subsets hold U+0020-007E (Orbitron has no `^`) and U+00B7 (JetBrains Mono only). U+2192 is not in the upstream latin files, so `→` renders in the fallback face.

Components: Toggle 52 x 28; Segmented 44 high; Slider hit band 44 high and 12 px past each end; every hit rect is at least 44 x 44.

Camera constants:

```ts
export const CAM = { SHORT_TARGET: 560, LONG_MAX_RATIO: 2.2, Z_MIN: 0.5, Z_MAX: 3.0, LOOK_FRAC: 0.14,
  LOOK_RATE: 5, LOOK_RETURN: 3, TOUCH_PORTRAIT_BIAS: 0.06, BOSS_BIAS: 0.2, BOSS_BIAS_MAX_FRAC: 0.25,
  BOSS_ZOOM: 0.92, BOSS_ZOOM_RATE: 1.5 } as const
```

The boss pull and fight zoom blend in and out at `BOSS_ZOOM_RATE` per second. Transient punches decay at 8/s; the death punch (+0.25) holds until the recap. Punches zoom about the ship.

## A19. Glyph and icon sets

- **Perk glyphs (20):** rate, damage, multishot, pierce, range, speed, regen, lifesteal, hp, magnet, crit, bounce, explode, cryo, burn, arc, knockback, shield, reaper, dash. A2 maps them per perk. A fusion uses its first parent's glyph with a fusion border.
- **Icons (18, 48 px bake, 2 px stroke on a 24 px grid):** pause, play, gear, trophy, share, lock, check, skull, chevronL, chevronR, close, reroll, banish, skip, flag, diamond, clock, arrow.