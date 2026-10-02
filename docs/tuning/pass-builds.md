# P19 pass 'builds': build systems and loose ends (A18, small items)

Targets (section 11, with this pass's rule decisions): A18 dash bot (smart+dash+P) lives 1.25x or more the minutes per death of smart+P in every world, 1 to 4 close calls a minute, 50% or more of priority runs take a fusion by 4:00, 40% or more of evolve runs that reach mid2 evolve, XP collected 90% or more (roam bot, up to the PRIME kill); A8 crude median survival 2:30 or more in every world, Hive at least Depths and Wastes; A9 smart+P median level L9 to 12 at 3:00, L16 to 20 at 8:00, L19 to 24 at 11:00, and no gap over 60 s without a level-up after 1:00, counting only the seconds outside boss fights. Small items: SHATTER blasts from NUKE kills score nothing (C40); flak turrets and splitter offspring near the ship; enemy fire in the death sequence; probe-p8 pod checks.

- Build under test: `8e346d5` plus the src changes of this commit (`v2 P19: build systems and loose ends (A18, small items)`). Matrix headers print `8e346d5 (src has uncommitted changes)` because they ran before the commit. The control (`builds-before30*`) ran with the src stashed (`git stash push -- src`), so it prints `(src clean)`: it is `8e346d5` scored with this commit's scripts.
- Harness: this commit's `scripts/`. Dev server: `npx vite --port 5176 --strictPort` (`SWG_URL` default).
- Seeds: 1001 x k per world, T0, 14 minutes, NOVA, evolutions, cores and bonuses live. Search arms k = 1..10; confirm k = 1..30; holdout k = 31..60 (`--seed-from=31`) for A6 to A9 (A10 on the confirm); A12 on k = 1..60 (T0 to T4); A13 on OVERTIME sets 1 and 2 (the A12/A13 note's sets).
- Date: 2026-10-02. Machine: 8 GB, load 2 to 8, 2.6 to 3.2 GB of 4 GB swap in use, 1.7 to 3.3 GB free on the data volume.
- Final values = arm `rows30` (the final values were re-checked by re-running 7 configs across the three worlds and diffing their run files against `rows30`: identical except the wall time; `builds-final-a14.md` repeats the A14 hashes on the committed src).
- Raw runs: `/tmp/swg-builds/<label>`. The permission system denied `rm -rf` on them, so they are still there (about 0.4 GB); delete the folder by hand.

## Result

Before is the control `builds-before30.md` and `builds-before30-q.md` (seeds 1..30; 60-seed control values come from `density-confirm.md` and `density-holdout.md`, the same `af12f12` 14-minute runs, and A12/A13 sets from `ladder-confirm.md`). After is `builds-rows30.md`, `builds-rows-holdout.md`, `builds-rows-ladder.md`, `builds-rows30-q.md` and `builds-final-a14.md`. Hive, Depths, Wastes in that order in every cell.

| ID | Target | Before | After | Result |
|---|---|---|---|---|
| A18 dash | >= 1.25x minutes alive per death | 4.57x, 6.59x, 9.48x (deaths dash 2/30, 4/30, 2/30 vs smart+P 8/30, 19/30, 15/30); mean ratio 1.14, 1.39, 1.26x under ceilings 1.17, 1.46, 1.29x | 6.53x, 5.39x, 8.78x (deaths 2/30, 6/30, 2/30 vs 11/30, 22/30, 14/30); mean 1.19, 1.47, 1.25x under ceilings 1.22, 1.61, 1.28x | PASS (rule decided: per death) |
| A18 close calls | 1 to 4 a minute | 1.76, 1.68, 2.06 | 1.55, 1.40, 2.19 | PASS |
| A18 fusion by 4:00 | >= 50% of priority runs | 58/88, 64/86, 66/90 | 58/88, 65/90, 66/90 | PASS |
| A18 evolve | >= 40% of evolve runs at mid2 | 18/23, 17/19, 18/22 | 18/20, 13/13, 21/24 | PASS |
| A18 XP | >= 0.90 (roam, up to the PRIME kill) | 0.967, 0.913, 0.927 | 0.954, 0.933, 0.893 | FAIL (Wastes roam 1001; the flak rule re-rolls it) |
| A8 crude | >= 2:30; Hive >= others | 2:09, 2:13, 1:43 | 60 seeds 3:12, 3:14, 1:43 (1..30: 3:11, 3:17, 1:43; 31..60: 3:12, 2:31, 1:42) | Hive, Depths PASS; Wastes FAIL; order FAIL by 2 s |
| A8 smart, smart+P | >= 5:30, >= 8:00 | 14:00, 7:02, 10:07; 14:00, 9:02, 12:12 | 60 seeds 9:32, 6:32, 6:50; 14:00, 8:45, 14:00 | PASS |
| A9 levels | L9-12 / L16-20 / L19-24 | L9/16/19, L9/17/22, L10/17/22 | L8/16/20, L9/17/21.5, L10/17/20.5 (31..60: L8/14/18, L9/17/21, L10/16/19) | FAIL (Hive 3:00; 31..60 Hive 8:00 and 11:00) |
| A9 gaps | none over 60 s outside fights | 5, 0, 3 of 30 | 6, 0, 2 of 30 (31..60: 14, 2, 7) | FAIL (SURGE unchanged; see arms) |
| Flak turrets near the ship | 0 within 120 u (`ringview`) | 2 (79 and 56 u) | 1 (60 u): drawn 210 u away, the bot walked onto the marker in its 0.8 s telegraph; nearest spot at a draw 161 u | rule PASS at the draw; 1 left by ship movement |
| Splitter offspring near the ship | exempt (rule) | 30 in Hive per 300 s | 26 | exempt |
| SHATTER after NUKE | 0 points, 0 chain, no bonus | scored 60 points, chain 1 | `nukeShatter` PASS: weapon kill's blast 60 points, chain 1; NUKE kill's blast 0, 0, no bonus, 3.1 XP | PASS |
| Death sequence fire | no new enemy shot | shots 21 to 26, 15 to 17, 14 to 19 over 60 death ticks | 21 to 21, 15 to 15, 14 to 14 | PASS |
| probe-p8 pods | pass for the right reason | cageClamp 0.024 over, crossNoTake and holdTime fail (NOVA takes at once) | 12/12 pod checks pass on EMBER (clamp 0 u over 419 pods; pass at full speed: fill 0.667, not taken; 24 ticks to take, 6 with Quartermaster 3) | PASS |

The earlier passes, re-checked on the final values:

| ID | Target | Before | After | Result |
|---|---|---|---|---|
| A10 | median >= 3.0 s, min >= 1.2 s | 191 deaths, 3.83 s, 0.88 s (10 under 1.2 s) | 216 deaths, 3.09 s, 0.82 s (15 under 1.2 s) | median PASS, min FAIL (as before) |
| A6 focus mid1/mid2/final | 20-40 / 20-40 / 40-75 s | 60 seeds 26.3/24.4/58.2, 22.7/27.1/55.6, 24.0/20.2/54.3 | 60 seeds 24.2/25.0/58.7, 24.7/21.8/59.9, 22.3/19.3/49.3 | FAIL (Wastes mid2; the flak rule took turrets away from the ship) |
| A6 default mid fights over 150 s | <= 5% (decided rule) | 2/52, 0/45, 1/51 | 60 seeds 5/107, 0/91, 2/109 | PASS |
| A6 kill to next arrival | >= 20 s | 20 s | 20 s | PASS |
| A3 | share <= 0.25, over row <= 160, alive <= 610 | 0.246; 68; 518 | 0.29 (Wastes focus 3003; Hive roam 11011 0.274); 74; 524 | FAIL (share) |
| A7 smart+P | 25-45% | 60 seeds 25/60, 22/60, 26/60 | 60 seeds 27/60, 23/60, 32/60 | FAIL (Wastes 53%) |
| A7 smart | 5-25% | 60 seeds 14/60, 9/60, 9/60 | 60 seeds 8/60, 7/60, 10/60 | PASS |
| A12 (60 Hive seeds) | T4 <= 15%, T1 5 points under T0 | T0 25/60, T1 18/60, T2 13/60, T3 11/60, T4 2/60 | T0 27/60, T1 20/60, T2 15/60, T3 14/60, T4 4/60 | PASS |
| A13 | >= 90% dead by 20:00, none past 24:00, per set | set 1 19/19, set 2 15/16 | set 1 18/18, set 2 14/17 (82%), none past 24:00 | FAIL (set 2) |
| A12, A13 quick (10 seeds) | | T0 5/10, T1 4/10; set 1 10/10 | T0 5/10, T1 4/10; set 1 10/10 | PASS |
| A1 | opening | 0.3 / 0.57 / 1.32 s | 0.3 / 0.57 / 1.32 s | PASS |
| A2, A4, A5, A11 | | 6.02 s; 9/9 x3; 380 arrivals 295-306 u; 240 u/s | 6.02 s; 9/9 x3; 374 arrivals 295-306 u; 240 u/s | PASS |
| A14 | one hash per mode and world | det 642fbc46, 1365ccb6, d3c8cef6; det-long 4b54dab1, be186edf, 7a87fa18; det-death 7408614a, 5739e8a2, 224be1c | det unchanged; det-long af0a9917, ba6215aa, ab4f477; det-death 4e549672, 7f0eec9a, 224be1c; 21/21 lines agree at 375x667, 667x375, the rerun and the settings injection | PASS |

Why the regressions are where they are: every change to an early row (Hive and Depths row 2) or to the flak ring (Wastes) re-rolls every later spawn, so all later runs of that world are new samples. A3's worst run, A7 Wastes, A18 XP and A6 Wastes mid2 move with the Wastes re-roll from the approved flak rule (Wastes rows did not change); A13 set 2 and A3's Hive runs move with the Hive re-roll. Within one arm, the two seed halves differ by up to 11 wins of 30 (arm s50x10, Hive smart+P: 10/30 on seeds 1..30, 21/30 on 31..60).

## Chosen values

| Knob | Before | After | Why |
|---|---|---|---|
| `BLAST_NO_SCORE` (new, `src/config.ts`) and its use in `collision.ts`, `blasts.ts` | | 8 | Approved C40 patch: a SHATTER blast from a kill that scores nothing carries the flag, and its non-elite, non-boss kills score nothing (kills and XP stay). |
| `FLAK_TURRETS.shipClear` (new, `src/content/bosses.ts`; `bossAI.ts`) | | 120 | Approved rule: after the draw, a ring with a spot within 120 u of the ship turns so the ship's bearing falls midway between two spots (147 u or more at count 3, r 170). |
| Enemy fire in the death sequence (`ai.ts` `fireEnemyShot`) | fires | no new shot | Approved rule: projectiles are frozen in the death sequence, so new shots piled up. |
| Hive row 2 mix (`src/content/runScripts.ts`, A7.2) | swarmer 9, biter 6, flyer 4, spitter 3 | swarmer 9, biter 6, flyer 4 | A8: 27 of 30 control crude runs died 6 to 16 s after the first spitter arrived; at weight 1 the median stayed 2:12. |
| Depths row 2 mix | biter 6, flyer 5, wraith 8, psychic 3 (`DEPTHS_R2`) | biter 6, flyer 5, wraith 8 | A8: 22 of 30 control crude runs died within 35 s of the first psychic; at weight 1 the median was 2:19. Row 3 keeps psychic 3 (it now lists its mix in full). |
| Hive and Depths row 2 xpScale | 0.47, 0.44 | unchanged | Arm x1 (0.60, 0.59, the old XP per spawn) put Hive back at L9 at 3:00 but moved A12 (T1 25/60 over T0 22/60), A13 (16/19, 12/15) and Depths smart+P (14/60). |
| `XP.surgeAfter`, `XP.surgeMul` | 40, 2 | unchanged | No value closes the Hive A9 gaps with A7 in its band (arms below). |
| Wastes rows 1 and 2 | | unchanged | No row 1 or row 2 arm moved the Wastes crude median (the teaching elite sets it). |
| `DASH`, Close Call, fusion and evolution offer rates | | unchanged | A18 dash, close calls, fusion and evolution pass on the control and the final values. |

## Rules written (docs/NEXT-LEVEL.md)

- Section 11 A18 row: the dash clause is minutes alive per death (all minutes played over the deaths, smart+dash+P against smart+P) in every world; the mean ratio and its 14:00 ceiling are reported only. `matrix.mjs` scores it (`dashLifeRatio`).
- Section 11 A9 row: targets L9 to 12, L16 to 20, L19 to 24; a gap counts only its seconds outside boss fights (spawn to kill, ascend, stalemate or run end). `matrix.mjs` scores it (`gaps` outside fights; `gapsWithFights` kept in the details).
- A10.3 flakTurrets row and decal paragraph: the ring rule (`shipClear` 120). Section 11 builds note: splitter offspring near the ship are exempt from the near-spawn count.
- Section 4.1 (death sequence): no enemy fires a new shot in it.
- A5.3 "No bonus": `BLAST_NO_SCORE` and the `nukeShatter` probe check.
- A7.2: Hive and Depths row 2 mixes, Depths row 3 mix in full, and the reasons.
- Section 11: "Build systems and loose ends note (P19 builds pass)".

## Arms

Each arm changed one knob against the arm named in "base". 10-seed arms read noise of several wins; the decisions use the 30 and 60-seed arms.

### A8 crude (rows 1 and 2)

| Arm | Base | Knob | Seeds | Crude median (Hive, Depths, Wastes) | Other |
|---|---|---|---|---|---|
| c10 | | control on the small-item build | 10 | 2:10, 2:13, 1:42 | A7 smart+P 5/10, 2/10, 4/10 |
| a8-1 | c10 | Hive row 2 spitter 3 to 1; Depths row 2 psychic 3 to 1; Wastes row 1 charger 4 to 1 | 10 | 2:12, 2:19, 1:41 | A7 4/10, 3/10, 5/10 |
| a8-2 | a8-1 | spitter 0, psychic 0, charger 0 | 10 | 3:14, 3:20, 1:43 | A7 5/10, 1/10, 5/10 |
| cr-a | a8-2 with Wastes rows restored | crude only | 30 | 3:11, 3:17, 1:43 | Hive under Depths by 6 s |
| cd2.6, cd3.0 | cr-a | spitter `fireCooldown` 2.1 to 2.6, 3.0 (Hive crude only) | 30 | 3:12, 3:11 | no effect: reverted |
| life23 | cr-a | acid pool life 3.5-5 s to 2-3 s (Hive crude only) | 30 | 3:12 | no effect: reverted |
| W1 | c10 Wastes | row 1 charger 0, minAlive 16 to 12, maxAlive 60 to 45 | 10 | Wastes 1:43 | |
| W2 | W1 | + row 2 without stinger | 10 | 1:43 | |
| W4 | c10 Wastes | row 2 without stinger only | 10 | 1:42 | |
| Wdiag | c10 Wastes | beat `hpMul` of the teaching elite 0.6 to 0.05 | 10 | 1:42, identical runs | the THREAT level's `teachHpMul` overrides the beat's field: no effect |
| Wdiag2 | c10 Wastes | T0 `teachHpMul` 0.6 to 0.05 (diagnostic only) | 10 | 2:10 | deaths move to the row 2 stingers (5 of 10) |

### A9 SURGE (on the row 2 changes)

| Arm | surgeAfter, surgeMul | Seeds | Levels at 3:00/8:00/11:00 (H; D; W) | Gap runs (H, D, W) | A7 smart+P; smart | A6 focus mid1/mid2/final |
|---|---|---|---|---|---|---|
| s0 | 40, 2 | 10 | 9/17/20; 9/17/22; 10/16/19 | 3, 0, 1 | 5, 1, 4; 0, 1, 1 | 25.4/29.0/48.4; 26.6/23.6/133.1; 28.2/20.2/60.2 |
| s1 | 30, 3 | 10 | 9/17/20; 9/18.5/23; 10/18/22 | 2, 0, 0 | 5, 3, 3; 2, 2, 2 | 30.8/22.3/56.0; 23.8/46.2/77.8; 23.9/20.2/69.2 |
| s2 | 20, 3 | 10 | 10/19/23; 10/20/26; 11/19.5/24 | 0, 0, 0 | 7, 3, 5; 1, 0, 3 | 25.6/27.5/66.1; 26.2/14.1/107.2; 22.9/27.1/36.7 |
| s3 | 30, 4 | 10 | 9/18/23; 9.5/19.5/24; 10/18.5/22 | 3, 0, 0 | 5, 2, 5; 3, 4, 3 | 29.7/22.0/63.4; 26.0/26.4/42.7; 27.1/19.5/46.9 |
| s4 | 40, 4 | 10 | 9/16/19.5; 9/18.5/25; 10/16/21 | 2, 0, 0 | 2, 3, 4; 0, 1, 1 | 28.4/25.5/64.8; 26.6/15.1/92.9; 22.6/26.6/73.6 |
| s5 | 45, 6 | 10 | 8/16/20.5; 9/18/22; 10/17/20 | 2, 0, 0 | 4, 3, 2; 1, 0, 1 | 26.4/24.5/62.2; 25.1/24.7/75.5; 24.0/21.0/50.5 |
| s6 | 35, 4 | 10 | 9/17/20; 9/17.5/23; 10/18/21 | 2, 0, 0 | 4, 4, 5; 0, 2, 1 | 26.2/26.9/79.6; 23.5/22.6/86.3; 27.6/27.4/81.7 |
| s7 | 25, 3 | 10 | 9/18/21; 10/19/24; 10/18/21.5 | 0, 0, 0 | 2, 2, 4; 0, 1, 3 | 29.6/24.6/59.2; 23.9/15.6/96.9; 25.4/22.6/72.6 |
| s8 | 20, 2.5 | 10 | 9.5/19/21.5; 10/19.5/25; 11/19/22 | 1, 0, 3 | 5, 3, 3; 1, 2, 3 | 27.9/23.8/75.2; 22.4/26.2/64.4; 20.3/19.6/39.6 |
| s9 | 25, 2.5 | 10 | 9/17/20.5; 10/20/25; 10/18.5/22 | 3, 0, 1 | 5, 2, 4; 2, 2, 1 | 27.0/27.6/43.6; 24.9/26.1/77.4; 29.0/23.4/68.0 |
| after30 | 25, 3 | 30 | 9/18/22; 10/19/24; 10/18/23 | 1, 0, 0 | 15, 12, 13; 6, 5, 9 | 22.1/25.4/48.2; 23.4/23.9/42.0; 21.7/20.0/55.3 |
| after-holdout | 25, 3 | 31..60 | 9/18/21.5; 10/19/24; 10/19/23 | 5, 0, 1 | 17, 17, 18; 6, 6, 4 | 25.7/25.7/59.0; 21.9/20.4/55.1; 21.0/20.8/53.5 |
| s30x3 | 30, 3 | 30 | 9/18/21; 10/18/23; 10/18/22 | 7, 0, 0 | 16, 11, 11; 11, 7, 9 | 23.1/27.5/52.4; 23.9/26.5/49.3; 23.9/19.5/46.4 |
| s50x10 | 50, 10 | 30 | 8/16/20; 9/17/22; 10/17/21 | 3, 0, 1 | 10, 11, 13; 6, 4, 8 | |
| s50x10-h | 50, 10 | 31..60 | 8/15.5/19.5; 9/17/22; 10/16/21 | 6, 0, 0 | 21, 12, 19; 9, 5, 1 | |
| rows30 (final) | 40, 2 | 30 | 8/16/20; 9/17/21.5; 10/17/20.5 | 6, 0, 2 | 13, 7, 15; 5, 3, 8 | 25.4/24.8/59.2; 24.4/20.2/63.5; 24.4/18.6/58.1 |
| rows-holdout (final) | 40, 2 | 31..60 | 8/14/18; 9/17/21; 10/16/19 | 14, 2, 7 | 14, 16, 17; 3, 4, 2 | 23.6/25.2/58.5; 25.0/21.8/55.8; 19.9/19.8/37.5 |

25 s and x3 also failed its other checks on seeds 1..30: A3 share 0.304, A10 median 3.0 s, A13 quick 8/10 dead by 20:00, A12 quick T1 5/10 over T0 2/10. The Hive gaps sit between fights in rows 6 to 9 with the field near maxAlive: in one s5 run (45 s, x6) the bot collected 58 raw XP from 540 to 630 s while the kills dropped about 140, so it went 122 s without a level outside fights even at x6.

### Row 2 XP (x1)

| Arm | Base | Knob | Result |
|---|---|---|---|
| x1 | rows30 | Hive row 2 xpScale 0.47 to 0.60, Depths 0.44 to 0.59 (the old XP per spawn) | 30 seeds: Hive L9/16/20 at 3:00/8:00/11:00 (L8 before); A7 smart+P 13, 4, 15 of 30 (31..60: 9, 10, 17); A3 0.31; A12 60 seeds T0 22/60, T1 25/60 (FAIL); A13 16/19, 12/15 (FAIL). Reverted. |
| rows-ladder | rows30 | (A12 and A13 on the final values) | A12 T0 27/60, T1 20/60, T4 4/60 PASS; A13 18/18, 14/17 |

## Small items, how they were checked

- SHATTER: `node scripts/probe-p9.mjs bonuses` (all 10 checks pass). Mutation: with `noScoreFlag()` returning 0 the new `nukeShatter` check fails (NUKE case 60 points, chain 1).
- Flak ring: `node scripts/measure.mjs 375 667 ringview all 300`. `ringview` now logs `nearList` (the first 60 near spawns with time, source, distance and the boss distance) and `flakDraws` (each ring's nearest spot at the draw and at the rise). Control arm: `FLAK_TURRETS.shipClear` 0 (the rule can never fire, the draw is unchanged).
- Death sequence: `node scripts/measure.mjs 375 667 det-death` now prints `shotsAtDeath` and `shotsAfterSequence`. Control: the `pendingGameOver` guard removed from `fireEnemyShot`.
- Isolation of det and det-long: on the small-item build (`builds-a14-small.md`) det is unchanged and det-long changes only in Wastes (a30eed82); with `shipClear` 0 det-long gives 4b54dab1, be186edf, 7a87fa18, so SHATTER and the death-sequence rule change no det or det-long hash. det-death is unchanged by all three small items (7408614a, 5739e8a2, 224be1c). The final det-death changes in Hive and Depths come from the row 2 changes (the det-death bot lives through row 2).
- Note: det-long runs the three worlds in one page, so a world's hash depends on the worlds run before it: `det-long nova wastes` alone gives 3e2a9a51 where the all-worlds run gives 7a87fa18 on the same src.
- probe-p8: `node scripts/probe-p8.mjs pods`.

## Commands

```
npx vite --port 5176 --strictPort
# control (src of 8e346d5: git stash push -- src; then git stash pop)
node scripts/playtest/matrix.mjs --label=builds-before30 --runs=/tmp/swg-builds/before30 --seeds=30 --only=A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A14,A18
node scripts/playtest/matrix.mjs --label=builds-before30-q --runs=/tmp/swg-builds/before30-q --seeds=10 --only=A12,A13 --threat-seeds=10 --ot-seeds=10 --ot-sets=1
# final values
node scripts/playtest/matrix.mjs --label=builds-rows30 --runs=/tmp/swg-builds/rows30 --seeds=30 --only=A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A14,A18
node scripts/playtest/matrix.mjs --label=builds-rows-holdout --runs=/tmp/swg-builds/rows-holdout --seeds=30 --seed-from=31 --only=A6,A7,A8,A9
node scripts/playtest/matrix.mjs --label=builds-rows-ladder --runs=/tmp/swg-builds/rows-ladder --only=A12,A13 --threat-seeds=60 --ot-sets=1,2
node scripts/playtest/matrix.mjs --label=builds-rows30-q --runs=/tmp/swg-builds/rows30-q --seeds=10 --only=A12,A13 --threat-seeds=10 --ot-seeds=10 --ot-sets=1
node scripts/playtest/matrix.mjs --label=builds-final-a14 --runs=/tmp/swg-builds/final-a14 --only=A14
# search arms: the same matrix command with --seeds=10 and --only=A6,A7,A9 (SURGE) or A7,A8 (rows)
# crude-only arms: node scripts/playtest/playtest.mjs <world> crude:SEED:14 ... --out=<dir> (SEED = 1001 x 1..30 or 1..10)
node scripts/probe-p9.mjs bonuses
node scripts/probe-p8.mjs pods
node scripts/measure.mjs 375 667 ringview all 300
node scripts/measure.mjs 375 667 det-death
```

`matrix.mjs --ot-seeds=N` (new) runs only the first N T0 seeds and the first min(N, 10) T1 to T3 seeds of each OVERTIME set (a quick A13 check). The A6 decided rule (default mid fights over 150 s) was counted from the run files of the smart+P set, mid1 and mid2 fights only.

Matrix tables for every arm: `builds-c10`, `builds-a8-1`, `builds-a8-2`, `builds-s0` to `builds-s9`, `builds-after30`, `builds-after30-q`, `builds-after-holdout`, `builds-s30x3`, `builds-s30x3-q`, `builds-s50x10`, `builds-s50x10-h`, `builds-x1`, `builds-x1-q`, `builds-x1-holdout`, `builds-x1-ladder`, `builds-before30`, `builds-before30-q`, `builds-rows30`, `builds-rows30-q`, `builds-rows-holdout`, `builds-rows-ladder`, `builds-a14-small`, `builds-final-a14` (each `.md` and `.json` in this folder).
