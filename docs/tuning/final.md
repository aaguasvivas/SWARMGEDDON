# P19 final matrix

- Commit: `e60ae5f` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T11:56:55.123Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --threat-seeds=60 --ot-sets=1,2 --daily=2026-10-02 --baseline=docs/tuning/baseline.json --label=final --runs=/tmp/swg-rf/final` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A6 focus set 1001 x 1..90; A7 and A8 1001 x 1..60; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n); depths and wastes: the T0 part of the same sets
- Machine at the end: load 8.03 10.13 9.94, swap total = 3072.00M  used = 2233.50M  free = 838.50M  (encrypted)

- Baseline: `docs/tuning/baseline.json` (label baseline, commit `15c16b9`, 1001 x 1..10 per world, 2026-10-01T08:11:10.934Z). The Baseline column gives its value and result; where a P19 decision changed the measure or the target since, the cell ends with what the baseline was scored on. Change gives the result, baseline to now, and the main numbers, baseline to now (percentages where the seed counts differ); it starts with 're-scored' where the measure or the target changed since, so a result change there is partly a change of rule.

| ID | Metric | Value | Target | Result | Baseline | Change |
|---|---|---|---|---|---|---|
| A1 | Opening probe (5 seeds x 3 worlds, views 560x996 and 996x560) | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) | first enemy in view <= 1.0 s; first kill <= 2.5 s; empty view <= 2.0 s | PASS | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) (PASS) | PASS, same: first in view 0.3 s (same); first kill 0.57 s (same); empty view 1.32 s (same) |
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS | median 6.02 s, max 6.02 s (PASS) | PASS, same: median 6.02 s (same) |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 524; over row maxAlive 74 (row of the minute: 306); saturated share max 0.274 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | FAIL | beats off-rule 0; alive max 440; over row maxAlive 243; saturated share max 0.368 (FAIL; target then: beats on time or per deferral; alive <= row.maxAlive + 160 and <= 610; saturated share <= 0.25) | re-scored, FAIL, same: alive max 440 to 524; over row of the minute 243 to 306; saturated share 0.368 to 0.274 |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 5/9), depths 9/9 (minute mean 6/9), wastes 9/9 (minute mean 5/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS | hive 6/9, depths 6/9, wastes 7/9 (FAIL; measured then as: Density band (smart+P median alive per minute vs the A7.2 Target alive)) | re-scored, FAIL to PASS: hive 6/9 to 9/9; depths 6/9 to 9/9; wastes 7/9 to 9/9 |
| A5 | Boss arrival (smart+P and focus fights) | 400 arrivals (1 PRIME ascends, placed where the mid boss was), 294 to 306 u, cage active and inside 400/400, in arena 400/400 | 250 to 340 u; cage active the same tick | PASS | 99 arrivals, 295 to 305 u, cage active and inside 99/99, in arena 99/99 (PASS) | PASS, same: distance 295-305 u to 294-306 u |
| A6 | Fights (focus bot medians mid1/mid2/final on 90 seeds, * = under 20 kills; default bot = smart+P on 60 seeds) | hive focus 23.4/24.3/55.7 s (kills 89/73/61), default mid fights over 150 s 5/112 (PRIME 12/46, longest 203.3 s), default PRIME median 166.7 s, p75 210 s (46 fights), boss-attack HP per default fight 7.1 (hit in 32/158), fights ended by death 0; depths focus 21.6/24.1/44.6 s (kills 89/53/36), default mid fights over 150 s 0/98 (PRIME 8/27, longest 207.4 s), default PRIME median 106.7 s, p75 164.5 s (27 fights), boss-attack HP per default fight 37.1 (hit in 73/125), fights ended by death 2; wastes focus 23.7/25.6/68.4 s (kills 89/66/52), default mid fights over 150 s 2/104 (PRIME 9/36, longest 209.2 s), default PRIME median 162.2 s, p75 210 s (36 fights), boss-attack HP per default fight 36 (hit in 83/140), fights ended by death 1; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s, each on 20 kills or more; default bot at most 5% of mid1 and mid2 fights over 150 s, and its PRIME fight (every ending, a stalemate at 210 s) median <= 120 s; gap >= 20 s | FAIL | hive focus 22.3/19/32.5 s (kills 8/5/2), default longest 181.1 s; depths focus 21.3/16.9/- s (kills 10/3/0), default longest 114.5 s; wastes focus 28.9/21.3/27.9 s (kills 10/5/2), default longest 173.5 s; kill-to-next-arrival min 51.1 s (FAIL; measured then as: Fights (focus bot medians mid1/mid2/final; default bot = smart+P); target then: focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s) | re-scored, FAIL, same: hive focus 22.3/19/32.5 s to 23.4/24.3/55.7 s; hive default longest 181.1 s to 203.3 s; depths focus 21.3/16.9/- s to 21.6/24.1/44.6 s; depths default longest 114.5 s to 207.4 s; wastes focus 28.9/21.3/27.9 s to 23.7/25.6/68.4 s; wastes default longest 173.5 s to 209.2 s; kill to next arrival 51.1 s to 20 s |
| A7 | Win rate (60 seeds per world) | hive smart+P 29/60, smart 14/60 (halves: smart+P 12/30 and 17/30, smart 8/30 and 6/30); depths smart+P 24/60, smart 13/60 (halves: smart+P 9/30 and 15/30, smart 7/30 and 6/30); wastes smart+P 23/60, smart 11/60 (halves: smart+P 13/30 and 10/30, smart 6/30 and 5/30) | smart+P 25 to 45%; smart 5 to 25% | FAIL | hive smart+P 4/10, smart 1/10; depths smart+P 3/10, smart 1/10; wastes smart+P 3/10, smart 3/10 (FAIL; measured then as: Win rate (10 seeds per world)) | re-scored, FAIL, same: hive smart+P 40% to 48%; hive smart 10% to 23%; depths smart+P 30% to 40%; depths smart 10% to 22%; wastes smart+P 30% to 38%; wastes smart 30% to 18% |
| A8 | Median survival (60 seeds per world; a win or a stalemate counts as the whole 14:00) | hive smart 10:20, smart+P 14:00, crude 3:12; depths smart 7:06, smart+P 9:55, crude 3:17; wastes smart 9:14, smart+P 14:00, crude 2:10. Busiest death minute (smart+P): hive 9:00 to 10:00 0.29 of 14, depths 6:00 to 7:00 0.31 of 35, wastes 6:00 to 7:00 0.38 of 24 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes; no single minute holds more than 35% of the smart+P deaths | FAIL | hive smart 6:19, smart+P 9:44, crude 2:07; depths smart 6:21, smart+P 8:19, crude 2:07; wastes smart 6:53, smart+P 6:57, crude 1:39 (FAIL; measured then as: Median survival (a win or a stalemate counts as the whole 14:00); target then: smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes) | re-scored, FAIL, same: hive smart, smart+P, crude 6:19, 9:44, 2:07 to 10:20, 14:00, 3:12; depths smart, smart+P, crude 6:21, 8:19, 2:07 to 7:06, 9:55, 3:17; wastes smart, smart+P, crude 6:53, 6:57, 1:39 to 9:14, 14:00, 2:10 |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L8/L16/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 5/30 runs (fights counted: 24); depths L9/L17/L21.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 16); wastes L10/L16/L20.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 4/30 runs (fights counted: 23) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL | hive L9/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 6/10 runs; depths L9/L17/L22 at 3:00/8:00/11:00, gap over 60 s in 1/10 runs; wastes L10/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 6/10 runs (FAIL; measured then as: Level curve (smart+P median level; a run that won earlier counts its final level); target then: L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00) | re-scored, FAIL, same: hive levels L9/L16/L20 to L8/L16/L20; hive runs with a gap (fights counted) 60% to 80%; depths levels L9/L17/L22 to L9/L17/L21.5; depths runs with a gap (fights counted) 10% to 53%; wastes levels L10/L16/L20 to L10/L16/L20.5; wastes runs with a gap (fights counted) 60% to 77% |
| A10 | Readable deaths (smart-family deaths pooled, smart+P deaths per world; crude in the details) | 193 deaths, median 4.1 s, min 0.42 s; smart+P per world (60 seeds) hive 5.22 s (14), depths 2.72 s (35), wastes 6.29 s (24); smart family per world hive 4.66 s (48), depths 2.65 s (85), wastes 9.42 s (60) | median >= 3.0 s over the smart-family deaths pooled and over the smart+P deaths of each world (60 seeds); minimum >= 1.2 s | FAIL | 99 deaths, median 2.57 s, min 0.42 s (FAIL; measured then as: Readable deaths (smart-family deaths; crude in the details); target then: median >= 3.0 s; minimum >= 1.2 s) | re-scored, FAIL, same: deaths 99 to 193; median 2.57 s to 4.1 s; min 0.42 s (same) |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS | fastest flyer 240, wraith 240, cinderCharger 240 u/s (PASS) | PASS, same: fastest 240 u/s (same) |
| A12 | Ladder (Hive smart+P, T0 to T4) | T0 29/60 (48%), T1 26/60 (43%), T2 13/60 (22%), T3 17/60 (28%), T4 1/60 (2%); ladder T3 over T2; within noise (under 2 standard errors): T0 and T1, T2 and T3 | T4 win rate <= 15%; T1 at least 5 points under T0 | PASS | T0 4/10 (40%), T1 3/10 (30%), T4 0/10 (0%) (PASS; measured then as: Ladder (Hive smart+P); target then: T4 win rate <= 15%; T1 <= T0) | re-scored, PASS, same: T0 40% to 48%; T1 30% to 43%; T4 0% to 2% |
| A13 | Overtime (runs that won: Hive OVERTIME sets 1 and 2; depths and wastes T0 of the same sets) | hive set 1 18/19 (95%), 0 past 24:00; set 2 23/25 (92%), 0 past 24:00; all 41/44 (93%); depths T0 sets 1 and 2 24/24 (100%), 0 past 24:00; wastes T0 sets 1 and 2 21/25 (84%), 0 past 24:00 | >= 90% dead by 20:00 and none past 24:00, in each Hive set and in depths and wastes (sets pooled) | FAIL | 25/33 (76%) dead by 20:00; 4 alive past 24:00 (FAIL; measured then as: Overtime (Hive OVERTIME sets 1 and 2, runs that won); target then: >= 90% dead by 20:00; none past 24:00) | re-scored, FAIL, same: dead by 20:00 76% to 93%; alive past 24:00 4 to 0 |
| A14 | Determinism (det, det-long, det-death at 375x667, 667x375 and 375x667 with the settings injection; det and det-death of the 2026-10-02 Daily, fresh save 375x667 and unlocked save 667x375; each with its rerun) | 11 groups, 0 split; reruns match; 31/31 lines | one hash per mode and world across views, settings, reruns | PASS | 9 groups, 0 split; reruns match; 21/21 lines (PASS; measured then as: Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection; each with its rerun)) | re-scored, PASS, same: lines 21/21 to 31/31; split groups 0 (same) |
| A15 | Perf at 390x844, run alone (perf hive, perf wastes, perf-final hive) | perf hive 60 fps, p95 16.7 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0; perf wastes 60 fps, p95 16.7 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0; perf-final 60 fps, p95 16.8 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0, peak alive 332 | perf: 60 fps, 0 frames over 20 ms; perf-final: p95 <= 16.7 ms, 0 frames over 33.4 ms | FAIL | perf hive 60 fps, p95 16.8 ms, max 33.3 ms, >20 ms 1, >33.4 ms 0; perf wastes 60 fps, p95 16.8 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0; perf-final 60 fps, p95 16.8 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0, peak alive 332 (FAIL) | FAIL, same: worst frame 33.3 ms to 16.8 ms; frames over 20 ms 1 to 0; perf-final p95 16.8 ms (same) |
| A16 | Allocation: GC pauses in a 10 s perf-final trace (probe-alloc --gc) | max pause 3.056 ms (minor 1, major 0) | no GC pause over 2 ms | FAIL | max pause 5.149 ms (minor 1, major 0) (FAIL) | FAIL, same: max pause 5.149 ms to 3.056 ms |
| A17 | Human (owner): about 1 win in 3 Hive T0 runs on iPhone | owner | about 1 win in 3 | owner | owner (owner) | owner, same |
| A18 | Build systems (dash = smart+dash+P vs smart+P minutes alive per death; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash mean 1.11x (under 5 deaths in a set; dash mean 13:54) (deaths 2/60 vs 14/60; mean 1.11x, ceiling 1.11x), cc 1.55/min, fusion by 4:00 58/88, evolve 17/22, XP min 0.954 (whole run 0.91); depths dash 5.62x per death (deaths 8/60 vs 35/60; mean 1.29x, ceiling 1.36x), cc 1.64/min, fusion by 4:00 65/90, evolve 16/17, XP min 0.933 (whole run 0.938); wastes dash mean 1.2x (under 5 deaths in a set; dash mean 13:35) (deaths 4/60 vs 24/60; mean 1.2x, ceiling 1.24x), cc 2.23/min, fusion by 4:00 63/90, evolve 20/21, XP min 0.921 (whole run 0.851) | dash >= 1.25x minutes alive per death (60 seeds; with under 5 deaths in either set, the mean-survival ratio >= 1.25x or a dash mean survival of 13:00 or more); 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | PASS | hive dash 1.39x, cc 1.53/min, fusion by 4:00 17/26, evolve 3/4, XP min 0.944; depths dash 1.28x, cc 1.66/min, fusion by 4:00 27/30, evolve 3/4, XP min 0.918; wastes dash 1.5x, cc 2.05/min, fusion by 4:00 27/30, evolve 2/4, XP min 0.863 (FAIL; measured then as: Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam whole-run); target then: dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90%) | re-scored, FAIL to PASS: hive dash mean ratio 1.39x to 1.11x; hive XP 0.944 to 0.954; depths dash mean ratio 1.28x to 1.29x; depths XP 0.918 to 0.933; wastes dash mean ratio 1.5x to 1.2x; wastes XP 0.863 to 0.921 |
| BENCH | CPU per tick (bench 390x844, Hive, 10 s, the 8-perk build; reported only) | stepSim median 0.7, p95 1, mean 0.725 ms; render update median 0.4, p95 0.7, mean 0.442 ms; Pixi draw median 0.7, p95 1, mean 0.696 ms; 500 enemies, 461 particles | none (compares builds on one machine) | info | - | new |
| S3.2 | Allocation (probe-alloc all all --budget=1.0; heap growth over 60 s of flood(500) after an 80 s warm-up; reported only) | 9 scenes, total 0.305 to 1.25 MB/s, game 0.058 to 0.91 MB/s, 8/9 within the probe's budget; sim functions over 0.1 MB/s in 1 scenes; growth 0.086 MB | section 3.2: no sim function over 0.1 MB/s; no heap growth over 60 s | info | - | new |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P | `smart+human:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| roam | `roam:SEED:14` | hive, depths, wastes | 90 |
| smart | `smart+human:SEED:14` | hive, depths, wastes | 90 |
| smart+focus+P | `smart+focus+human:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+dash+P | `smart+dash+human:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+E | `smart+human:SEED:14:nova:evolve` | hive, depths, wastes | 90 |
| smart+focus+P (A6) | `smart+focus+human:SEED:14:nova:priority` | hive, depths, wastes | 270 |
| smart+P (A7, A8) | `smart+human:SEED:14:nova:priority` | hive, depths, wastes | 180 |
| smart (A7, A8) | `smart+human:SEED:14` | hive, depths, wastes | 180 |
| crude (A8) | `crude:SEED:14` | hive, depths, wastes | 180 |
| crude | `crude:SEED:14` | hive, depths, wastes | 90 |
| smart+P T0 to T4 (Hive) | `smart+human:SEED:14:nova:priority:T (T 0 to 4)` | hive | 300 |
| smart+P OVERTIME (Hive) | `smart+human:SEED:25:nova:priority:T:ot` | hive | 120 |
| smart+P OVERTIME T0 (Depths, Wastes) | `smart+human:SEED:25:nova:priority:0:ot` | depths, wastes | 120 |
| smart+dash+P (A18) | `smart+dash+human:SEED:14:nova:priority` | hive, depths, wastes | 180 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A4 median alive per minute (smart+P)

Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median free-field alive [target band], x outside it, (n) runs alive through the minute with 10 s or more of free field; then the median over every step of the minute (cage and lull steps included).

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 48 [40-84] (30); 48 | 46 [40-98] (29); 41 | 68 cage (5); 42 | 77 [70-175] (25); 66 x | 93 [85-231] (26); 92 | 105 cage (26); 84 | 129 [120-280] (16); 73 x | 145 [140-308] (16); 121 x | 201 [170-315] (17); 151 x | - cage (0); 52 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 35 [30-70] (30); 35 | 37 [30-77] (30); 32 | 48 cage (3); 36 | 59 [50-119] (26); 52 | 68 [60-140] (20); 68 | 78 cage (19); 62 | 87 [80-182] (8); 54 x | 98 [90-203] (13); 80 x | 120 [110-231] (12); 93 x | - cage (0); 37 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 29 [22-56] (30); 29 | 30 [26-70] (30); 27 | 33 cage (5); 34 | 40 [36-95] (19); 35 x | 51 [44-109] (21); 50 | 54 cage (21); 45 | 62 [58-137] (9); 36 x | 79 [66-151] (14); 60 x | 91 [80-175] (17); 71 x | - cage (0); 34 |

### A6 fights per world

Focus cells: median (kills, range; fights that ended in the bot's death); * marks a median on fewer than 20 kills, which is not scored. Boss attacks are the hazard and lunge damage the bot took while the boss lived.

| World | Focus mid1 | Focus mid2 | Focus final | Default mid fights over 150 s | Default PRIME, every ending: median, p75 (fights; over 150 s; stalemates) | Default longest | Boss-attack HP per fight: default mean, max (fights hit); focus | Fights ended by death: default, focus | Default fights over 150 s |
|---|---|---|---|---|---|---|---|---|---|
| hive | 23.4 s (89 kills, 9.3 to 52.7; 0 deaths) | 24.3 s (73 kills, 6.3 to 50.9; 0 deaths) | 55.7 s (61 kills, 13.8 to 167.7; 0 deaths) | 5/112 | 166.7 s, 210 s (46; 28; 16) | 203.3 s | 7.1, 60 (32/158); 1.3, 30 (13/223) | 0, 0 | mid2 158.41 s (kill, hive_smart_human_4004_priority.json); mid2 150.08 s (kill, hive_smart_human_6006_priority.json); mid2 177.45 s (kill, hive_smart_human_9009_priority.json); final 192.52 s (open, hive_smart_human_9009_priority.json); mid2 180 s (ascend, hive_smart_human_16016_priority.json); final 166.36 s (kill, hive_smart_human_20020_priority.json); final 167.01 s (kill, hive_smart_human_30030_priority.json); final 183.86 s (kill, hive_smart_human_32032_priority.json); final 180.76 s (kill, hive_smart_human_36036_priority.json); final 159.75 s (kill, hive_smart_human_38038_priority.json); final 203.25 s (kill, hive_smart_human_40040_priority.json); mid2 180 s (ascend, hive_smart_human_42042_priority.json); final 189.56 s (kill, hive_smart_human_43043_priority.json); final 158.28 s (kill, hive_smart_human_44044_priority.json); final 159.56 s (kill, hive_smart_human_47047_priority.json); final 179.51 s (kill, hive_smart_human_50050_priority.json); final 159.36 s (kill, hive_smart_human_56056_priority.json) |
| depths | 21.6 s (89 kills, 6.8 to 55.7; 0 deaths) | 24.1 s (53 kills, 4.3 to 67.9; 0 deaths) | 44.6 s (36 kills, 14.1 to 107.5; 1 deaths) | 0/98 | 106.7 s, 164.5 s (27; 9; 1) | 207.4 s | 37.1, 328 (73/125); 24.6, 258 (86/179) | 2, 1 | final 173.46 s (kill, depths_smart_human_14014_priority.json); final 176.41 s (death, depths_smart_human_25025_priority.json); final 171.58 s (kill, depths_smart_human_37037_priority.json); final 207.38 s (kill, depths_smart_human_38038_priority.json); final 152.25 s (kill, depths_smart_human_39039_priority.json); final 169.86 s (kill, depths_smart_human_41041_priority.json); final 159.18 s (kill, depths_smart_human_43043_priority.json); final 178.7 s (kill, depths_smart_human_52052_priority.json) |
| wastes | 23.7 s (89 kills, 8.4 to 58.6; 1 deaths) | 25.6 s (66 kills, 4.4 to 103.1; 1 deaths) | 68.4 s (52 kills, 6.4 to 140.1; 0 deaths) | 2/104 | 162.2 s, 210 s (36; 20; 11) | 209.2 s | 36, 210 (83/140); 17.6, 178 (97/209) | 1, 2 | final 159.91 s (kill, wastes_smart_human_5005_priority.json); final 164.4 s (kill, wastes_smart_human_9009_priority.json); final 166.4 s (kill, wastes_smart_human_20020_priority.json); final 168.08 s (kill, wastes_smart_human_30030_priority.json); final 193.65 s (kill, wastes_smart_human_33033_priority.json); mid2 170.01 s (kill, wastes_smart_human_39039_priority.json); final 199.38 s (kill, wastes_smart_human_39039_priority.json); mid2 180 s (ascend, wastes_smart_human_42042_priority.json); final 209.2 s (kill, wastes_smart_human_44044_priority.json); final 199.88 s (kill, wastes_smart_human_48048_priority.json); final 153.73 s (kill, wastes_smart_human_57057_priority.json) |

### A8 deaths per minute of the run

Deaths whose time falls in each minute (column 5 is 5:00 to 6:00); the busiest minute's share is reported against a provisional 35% (x: over it).

| World and set | Deaths | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | Busiest share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive smart+P | 14 | 0 | 0 | 0 | 1 | 0 | 2 | 3 | 1 | 0 | 4 | 3 | 0 | 0 | 0 | 0 | 0.29 |
| hive smart and smart+P | 46 | 0 | 0 | 0 | 4 | 0 | 8 | 10 | 3 | 1 | 11 | 8 | 1 | 0 | 0 | 0 | 0.24 |
| depths smart+P | 35 | 0 | 0 | 0 | 0 | 0 | 8 | 11 | 3 | 4 | 4 | 3 | 0 | 1 | 1 | 0 | 0.31 |
| depths smart and smart+P | 82 | 0 | 0 | 0 | 0 | 1 | 19 | 26 | 9 | 9 | 9 | 6 | 0 | 1 | 2 | 0 | 0.32 |
| wastes smart+P | 24 | 0 | 0 | 0 | 0 | 1 | 4 | 9 | 2 | 3 | 2 | 3 | 0 | 0 | 0 | 0 | 0.38 x |
| wastes smart and smart+P | 63 | 0 | 0 | 0 | 2 | 1 | 12 | 21 | 7 | 4 | 9 | 6 | 0 | 1 | 0 | 0 | 0.33 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 52 | 4.02 | 0.42 |
| smart+P | 42 | 4.22 | 0.7 |
| smart+focus+P | 45 | 3.82 | 0.92 |
| smart+dash+P | 7 | 7.88 | 4.45 |
| smart+E | 47 | 3.88 | 0.7 |
| crude | 90 | 3.63 | 1 |
| hive (smart family) | 48 | 4.66 | 0.42 |
| depths (smart family) | 85 | 2.65 x | 0.82 |
| wastes (smart family) | 60 | 9.42 | 0.92 |
| hive (smart+P) | 14 | 5.22 | 0.7 |
| depths (smart+P) | 35 | 2.72 | 1.22 |
| wastes (smart+P) | 24 | 6.29 | 1.5 |

Smart-family deaths under 1.2 s: 7; under 3.0 s: 76. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"bite":9654.8,"shot":8551.8,"acid":1062.3,"hazard":1022,"ram":471.1,"lunge":30}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- hive_smart_human_8008.json: 0.42 s at 9:09, 37.7/75 HP, {"bite":12,"acid":7.3,"shot":19.1}
- hive_smart_human_11011_priority.json: 0.7 s at 9:24, 50.1/100 HP, {"bite":16,"acid":15.4,"shot":19.2}
- hive_smart_human_11011_evolve.json: 0.7 s at 9:24, 50.1/100 HP, {"bite":16,"acid":15.4,"shot":19.2}
- depths_smart_human_8008.json: 0.82 s at 6:58, 42.3/75 HP, {"shot":51.1,"bite":12}
- wastes_smart_focus_human_11011_priority.json: 0.92 s at 8:51, 56/100 HP, {"bite":15.6,"ram":35.2,"shot":27.1,"acid":0.4}
- wastes_smart_focus_human_15015_priority.json: 0.92 s at 9:31, 53.7/100 HP, {"shot":42.8,"acid":14.7}
- hive_smart_human_1001.json: 1.05 s at 10:08, 64.1/100 HP, {"shot":39.3,"acid":23.6,"bite":24}
- depths_smart_human_23023_priority.json: 1.22 s at 8:35, 51.9/100 HP, {"bite":32,"shot":26.8}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 524 | 74 | 292 | 0.274 (hive_roam_11011.json) |
| smart | 90 | 0 | 484 | 34 | 275 | 0.22 (wastes_smart_human_4004.json) |
| smart+P | 90 | 0 | 459 | 9 | 287 | 0.05 (wastes_smart_human_26026_priority.json) |
| smart+focus+P | 90 | 0 | 482 | 32 | 306 | 0.218 (hive_smart_focus_human_3003_priority.json) |
| smart+dash+P | 90 | 0 | 467 | 17 | 256 | 0.201 (depths_smart_dash_human_3003_priority.json) |
| smart+E | 90 | 0 | 452 | 4 | 205 | 0.05 (wastes_smart_human_26026_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.002 | 0.002 | 0 | 0.002 | 0.016 | 0.03 | 0.057 | 0.003 | 0.023 | 0.204 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.013 | 0.023 | 0 | 0.012 | 0.033 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.018 | 0.064 | 0 | 0.047 | 0.046 | - |

### A14 hashes

| Mode and world | Hashes (view) |
|---|---|
| det hive | 642fbc46 (375x667); 642fbc46 (667x375); 642fbc46 (375x667 settings) |
| det depths | 1365ccb6 (375x667); 1365ccb6 (667x375); 1365ccb6 (375x667 settings) |
| det wastes | d3c8cef6 (375x667); d3c8cef6 (667x375); d3c8cef6 (375x667 settings) |
| det-long hive | af0a9917 (375x667); af0a9917 (667x375); af0a9917 (375x667 settings) |
| det-long depths | ba6215aa (375x667); ba6215aa (667x375); ba6215aa (375x667 settings) |
| det-long wastes | 2ee8fbee (375x667); 2ee8fbee (667x375); 2ee8fbee (375x667 settings) |
| det-death hive | 4e549672 (375x667, death at 142.5 s); 4e549672 (667x375, death at 142.5 s); 4e549672 (375x667 settings, death at 142.5 s) |
| det-death depths | 6409cc9d (375x667, death at 252.48 s); 6409cc9d (667x375, death at 252.48 s); 6409cc9d (375x667 settings, death at 252.48 s) |
| det-death wastes | 7515552a (375x667, death at 146.42 s); 7515552a (667x375, death at 146.42 s); 7515552a (375x667 settings, death at 146.42 s) |
| daily det wastes | 552a87a2 (375x667 fresh); 552a87a2 (667x375 unlocked) |
| daily det-death wastes | 997bf89c (375x667 fresh, death at 211.88 s); 997bf89c (667x375 unlocked, death at 211.88 s) |

### A15 machine state per perf run

- Cool-down before the timing steps: 180 s, then load 9.01 8.55 9.52, total = 3072.00M  used = 2417.50M  free = 654.50M  (encrypted)
- `390 844 perf nova hive`: load 8.08 8.36 9.39, total = 3072.00M  used = 2417.50M  free = 654.50M  (encrypted); sim 91.2 to 111.8 s; echo ok
- `390 844 perf nova wastes`: load 11.5 9.13 9.6, total = 3072.00M  used = 2417.50M  free = 654.50M  (encrypted); sim 91.2 to 111.9 s; echo ok
- `390 844 perf-final nova hive`: load 12.23 9.48 9.72, total = 3072.00M  used = 2417.50M  free = 654.50M  (encrypted); sim 600 to 609.9 s; echo ok

### S3.2 allocation per scene

| Scene | Total MB/s | Game MB/s | Sim functions over 0.1 MB/s | Within budget 1.0 |
|---|---|---|---|---|
| flood hive | 0.629 | 0.253 | none | yes |
| boss hive | 0.367 | 0.065 | none | yes |
| event hive | 0.489 | 0.173 | none | yes |
| flood depths | 1.25 | 0.91 | [{"fn":"aiSystem src/systems/ai.ts:19","MBs":0.65}] | no |
| boss depths | 0.388 | 0.075 | none | yes |
| event depths | 0.507 | 0.195 | none | yes |
| flood wastes | 0.498 | 0.13 | none | yes |
| boss wastes | 0.305 | 0.058 | none | yes |
| event wastes | 0.363 | 0.112 | none | yes |

Heap growth (flood Hive, 80 s warm-up, forced GC before and after 60 s): 20.136 to 20.222 MB, growth 0.086 MB, kept 0.222 MB.

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+human:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+human:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+human:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+focus+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+focus+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+focus+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+dash+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+dash+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+dash+human:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+human:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+human:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+human:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+focus+human:SEED:14:nova:priority (SEED = 1001 x 1..90) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+focus+human:SEED:14:nova:priority (SEED = 1001 x 1..90) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+focus+human:SEED:14:nova:priority (SEED = 1001 x 1..90) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+human:SEED:14:nova:priority (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+human:SEED:14:nova:priority (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+human:SEED:14:nova:priority (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+human:SEED:14 (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+human:SEED:14 (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+human:SEED:14 (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+human:SEED:14:nova:priority (SEED = 1001 x 1..60) smart+human:SEED:14:nova:priority:1 (SEED = 1001 x 1..60) smart+human:SEED:14:nova:priority:2 (SEED = 1001 x 1..60) smart+human:SEED:14:nova:priority:3 (SEED = 1001 x 1..60) smart+human:SEED:14:nova:priority:4 (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+human:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) smart+human:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..20) smart+human:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..20) smart+human:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..20) --out=/tmp/swg-rf/final
node scripts/playtest/playtest.mjs depths smart+human:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final
node scripts/playtest/playtest.mjs wastes smart+human:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final
node scripts/playtest/playtest.mjs hive smart+dash+human:SEED:14:nova:priority (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+dash+human:SEED:14:nova:priority (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+dash+human:SEED:14:nova:priority (SEED = 1001 x 1..60) --out=/tmp/swg-rf/final   # reused from an earlier run of this matrix
node scripts/measure.mjs 375 667 det
node scripts/measure.mjs 667 375 det
node scripts/measure.mjs 375 667 det '--settings={"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
node scripts/measure.mjs 375 667 det-long
node scripts/measure.mjs 667 375 det-long
node scripts/measure.mjs 375 667 det-long '--settings={"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
node scripts/measure.mjs 375 667 det-death
node scripts/measure.mjs 667 375 det-death
node scripts/measure.mjs 375 667 det-death '--settings={"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
node scripts/measure.mjs 375 667 det --mode=daily --date=2026-10-02
node scripts/measure.mjs 667 375 det --mode=daily --date=2026-10-02 --save=unlocked
node scripts/measure.mjs 375 667 det-death --mode=daily --date=2026-10-02
node scripts/measure.mjs 667 375 det-death --mode=daily --date=2026-10-02 --save=unlocked
node scripts/measure.mjs 375 667 opening 560 996
node scripts/measure.mjs 375 667 opening 996 560
node scripts/measure.mjs 390 844 perf nova hive
node scripts/measure.mjs 390 844 perf nova wastes
node scripts/measure.mjs 390 844 perf-final nova hive
node scripts/measure.mjs 390 844 bench nova hive 10 --perks=piercing,cryo_rounds,explosive_rounds,arc_rounds,incendiary,ricochet,f_shatter,f_firestorm
node scripts/probe-alloc.mjs x x --gc --perks=
node scripts/probe-alloc.mjs all all --budget=1.0
node scripts/probe-alloc.mjs flood hive --growth=60 --warm=80
```

Raw runs: `/tmp/swg-rf/final` (not kept). The JSON next to this file holds every metric's details.
