# P19 final matrix

- Commit: `695ec94` (src clean); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T09:26:43.517Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --threat-seeds=60 --ot-sets=1,2 --daily=2026-10-02 --baseline=docs/tuning/baseline.json --label=final --runs=/tmp/swg-final/runs` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 3.37 3.15 3.08, swap total = 3072.00M  used = 2263.06M  free = 808.94M  (encrypted)
- Re-rendered from docs/tuning/final.json (node scripts/playtest/matrix.mjs --report-from=docs/tuning/final.json --baseline=docs/tuning/baseline.json): same runs and steps, report text only

- Baseline: `docs/tuning/baseline.json` (label baseline, commit `15c16b9`, 1001 x 1..10 per world, 2026-10-01T08:11:10.934Z). The Baseline column gives its value and result; where a P19 decision changed the measure or the target since, the cell ends with what the baseline was scored on. Change gives the result, baseline to now, and the main numbers, baseline to now (percentages where the seed counts differ).

| ID | Metric | Value | Target | Result | Baseline | Change |
|---|---|---|---|---|---|---|
| A1 | Opening probe (5 seeds x 3 worlds, views 560x996 and 996x560) | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) | first enemy in view <= 1.0 s; first kill <= 2.5 s; empty view <= 2.0 s | PASS | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) (PASS) | PASS, same: first in view 0.3 s (same); first kill 0.57 s (same); empty view 1.32 s (same) |
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS | median 6.02 s, max 6.02 s (PASS) | PASS, same: median 6.02 s (same) |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 524; over row maxAlive 74 (row of the minute: 308); saturated share max 0.29 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | FAIL | beats off-rule 0; alive max 440; over row maxAlive 243; saturated share max 0.368 (FAIL; target then: beats on time or per deferral; alive <= row.maxAlive + 160 and <= 610; saturated share <= 0.25) | FAIL, same: alive max 440 to 524; over row of the minute 243 to 308; saturated share 0.368 to 0.29 |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 6/9), depths 9/9 (minute mean 5/9), wastes 9/9 (minute mean 5/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS | hive 6/9, depths 6/9, wastes 7/9 (FAIL; measured then as: Density band (smart+P median alive per minute vs the A7.2 Target alive)) | FAIL to PASS: hive 6/9 to 9/9; depths 6/9 to 9/9; wastes 7/9 to 9/9 |
| A5 | Boss arrival (smart+P and focus fights) | 374 arrivals (1 PRIME ascends, placed where the mid boss was), 295 to 306 u, cage active and inside 374/374, in arena 374/374 | 250 to 340 u; cage active the same tick | PASS | 99 arrivals, 295 to 305 u, cage active and inside 99/99, in arena 99/99 (PASS) | PASS, same: distance 295-305 u to 295-306 u |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.4/24.8/59.2 s (kills 29/24/22), default mid fights over 150 s 3/52 (PRIME 2/19, longest 197 s); depths focus 24.4/20.2/63.5 s (kills 30/14/7), default mid fights over 150 s 0/42 (PRIME 3/8, longest 208 s); wastes focus 24.4/18.6/58.1 s (kills 30/18/11), default mid fights over 150 s 0/51 (PRIME 7/16, longest 207.1 s); kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot at most 5% of mid1 and mid2 fights over 150 s, a PRIME fight may run to the 210 s stalemate (P19 decision); gap >= 20 s | FAIL | hive focus 22.3/19/32.5 s (kills 8/5/2), default longest 181.1 s; depths focus 21.3/16.9/- s (kills 10/3/0), default longest 114.5 s; wastes focus 28.9/21.3/27.9 s (kills 10/5/2), default longest 173.5 s; kill-to-next-arrival min 51.1 s (FAIL; target then: focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s) | FAIL, same: hive focus 22.3/19/32.5 s to 25.4/24.8/59.2 s; hive default longest 181.1 s to 197 s; depths focus 21.3/16.9/- s to 24.4/20.2/63.5 s; depths default longest 114.5 s to 208 s; wastes focus 28.9/21.3/27.9 s to 24.4/18.6/58.1 s; wastes default longest 173.5 s to 207.1 s; kill to next arrival 51.1 s to 20 s |
| A7 | Win rate (30 seeds per world) | hive smart+P 13/30, smart 5/30; depths smart+P 7/30, smart 3/30; wastes smart+P 15/30, smart 8/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL | hive smart+P 4/10, smart 1/10; depths smart+P 3/10, smart 1/10; wastes smart+P 3/10, smart 3/10 (FAIL; measured then as: Win rate (10 seeds per world)) | FAIL, same: hive smart+P 40% to 43%; hive smart 10% to 17%; depths smart+P 30% to 23%; depths smart 10% (same); wastes smart+P 30% to 50%; wastes smart 30% to 27% |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 9:49, smart+P 14:00, crude 3:11; depths smart 6:47, smart+P 6:59, crude 3:17; wastes smart 7:49, smart+P 14:00, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL | hive smart 6:19, smart+P 9:44, crude 2:07; depths smart 6:21, smart+P 8:19, crude 2:07; wastes smart 6:53, smart+P 6:57, crude 1:39 (FAIL) | FAIL, same: hive smart, smart+P, crude 6:19, 9:44, 2:07 to 9:49, 14:00, 3:11; depths smart, smart+P, crude 6:21, 8:19, 2:07 to 6:47, 6:59, 3:17; wastes smart, smart+P, crude 6:53, 6:57, 1:39 to 7:49, 14:00, 1:43 |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L8/L16/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 6/30 runs (fights counted: 20); depths L9/L17/L21.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 9); wastes L10/L17/L20.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 2/30 runs (fights counted: 16) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL | hive L9/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 6/10 runs; depths L9/L17/L22 at 3:00/8:00/11:00, gap over 60 s in 1/10 runs; wastes L10/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 6/10 runs (FAIL; measured then as: Level curve (smart+P median level; a run that won earlier counts its final level); target then: L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00) | FAIL, same: hive levels L9/L16/L20 to L8/L16/L20; hive runs with a gap (fights counted) 60% to 67%; depths levels L9/L17/L22 to L9/L17/L21.5; depths runs with a gap (fights counted) 10% to 30%; wastes levels L10/L16/L20 to L10/L17/L20.5; wastes runs with a gap (fights counted) 60% to 53% |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 216 deaths, median 3.09 s, min 0.82 s | median >= 3.0 s; minimum >= 1.2 s | FAIL | 99 deaths, median 2.57 s, min 0.42 s (FAIL) | FAIL, same: deaths 99 to 216; median 2.57 s to 3.09 s; min 0.42 s to 0.82 s |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS | fastest flyer 240, wraith 240, cinderCharger 240 u/s (PASS) | PASS, same: fastest 240 u/s (same) |
| A12 | Ladder (Hive smart+P, T0 to T4) | T0 27/60 (45%), T1 20/60 (33%), T2 15/60 (25%), T3 14/60 (23%), T4 4/60 (7%); ladder falls at every step | T4 win rate <= 15%; T1 at least 5 points under T0 | PASS | T0 4/10 (40%), T1 3/10 (30%), T4 0/10 (0%) (PASS; measured then as: Ladder (Hive smart+P); target then: T4 win rate <= 15%; T1 <= T0) | PASS, same: T0 40% to 45%; T1 30% to 33%; T4 0% to 7% |
| A13 | Overtime (Hive OVERTIME sets 1 and 2, runs that won) | set 1 18/18 (100%), 0 past 24:00; set 2 14/17 (82%), 0 past 24:00; all 32/35 (91%) | >= 90% dead by 20:00 and none past 24:00, in each set | FAIL | 25/33 (76%) dead by 20:00; 4 alive past 24:00 (FAIL; target then: >= 90% dead by 20:00; none past 24:00) | FAIL, same: dead by 20:00 76% to 91%; alive past 24:00 4 to 0 |
| A14 | Determinism (det, det-long, det-death at 375x667, 667x375 and 375x667 with the settings injection; det and det-death of the 2026-10-02 Daily, fresh save 375x667 and unlocked save 667x375; each with its rerun) | 11 groups, 0 split; reruns match; 31/31 lines | one hash per mode and world across views, settings, reruns | PASS | 9 groups, 0 split; reruns match; 21/21 lines (PASS; measured then as: Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection; each with its rerun)) | PASS, same: lines 21/21 to 31/31; split groups 0 (same) |
| A15 | Perf at 390x844, run alone (perf hive, perf wastes, perf-final hive) | perf hive 60 fps, p95 16.7 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0; perf wastes 60 fps, p95 16.7 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0; perf-final 60 fps, p95 16.7 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0, peak alive 326 | perf: 60 fps, 0 frames over 20 ms; perf-final: p95 <= 16.7 ms, 0 frames over 33.4 ms | PASS | perf hive 60 fps, p95 16.8 ms, max 33.3 ms, >20 ms 1, >33.4 ms 0; perf wastes 60 fps, p95 16.8 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0; perf-final 60 fps, p95 16.8 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0, peak alive 332 (FAIL) | FAIL to PASS: worst frame 33.3 ms to 16.8 ms; frames over 20 ms 1 to 0; perf-final p95 16.8 ms to 16.7 ms |
| A16 | Allocation: GC pauses in a 10 s perf-final trace (probe-alloc --gc) | max pause 4.35 ms (minor 1, major 0) | no GC pause over 2 ms | FAIL | max pause 5.149 ms (minor 1, major 0) (FAIL) | FAIL, same: max pause 5.149 ms to 4.35 ms |
| A17 | Human (owner): about 1 win in 3 Hive T0 runs on iPhone | owner | about 1 win in 3 | owner | owner (owner) | owner, same |
| A18 | Build systems (dash = smart+dash+P vs smart+P minutes alive per death; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash 6.53x per death (deaths 2/30 vs 11/30; mean 1.19x, ceiling 1.22x), cc 1.55/min, fusion by 4:00 58/88, evolve 18/20, XP min 0.954 (whole run 0.91); depths dash 5.39x per death (deaths 6/30 vs 22/30; mean 1.47x, ceiling 1.61x), cc 1.4/min, fusion by 4:00 65/90, evolve 13/13, XP min 0.933 (whole run 0.938); wastes dash 8.78x per death (deaths 2/30 vs 14/30; mean 1.25x, ceiling 1.28x), cc 2.19/min, fusion by 4:00 66/90, evolve 21/24, XP min 0.893 (whole run 0.903) | dash >= 1.25x minutes alive per death; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL | hive dash 1.39x, cc 1.53/min, fusion by 4:00 17/26, evolve 3/4, XP min 0.944; depths dash 1.28x, cc 1.66/min, fusion by 4:00 27/30, evolve 3/4, XP min 0.918; wastes dash 1.5x, cc 2.05/min, fusion by 4:00 27/30, evolve 2/4, XP min 0.863 (FAIL; measured then as: Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam whole-run); target then: dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90%) | FAIL, same: hive dash mean ratio 1.39x to 1.19x; hive XP 0.944 to 0.954; depths dash mean ratio 1.28x to 1.47x; depths XP 0.918 to 0.933; wastes dash mean ratio 1.5x to 1.25x; wastes XP 0.863 to 0.893 |
| BENCH | CPU per tick (bench 390x844, Hive, 10 s, the 8-perk build; reported only) | stepSim median 0.9, p95 1.4, mean 0.904 ms; render update median 0.5, p95 0.9, mean 0.512 ms; Pixi draw median 0.8, p95 1.2, mean 0.757 ms; 500 enemies, 450 particles | none (compares builds on one machine) | info | - | new |
| S3.2 | Allocation (probe-alloc all all --budget=1.0; heap growth over 60 s of flood(500) after an 80 s warm-up; reported only) | 9 scenes, total 0.35 to 1.295 MB/s, game 0.056 to 0.936 MB/s, 8/9 within the probe's budget; sim functions over 0.1 MB/s in 1 scenes; growth 0.085 MB | section 3.2: no sim function over 0.1 MB/s; no heap growth over 60 s | info | - | new |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| roam | `roam:SEED:14` | hive, depths, wastes | 90 |
| smart | `smart:SEED:14` | hive, depths, wastes | 90 |
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+dash+P | `smart+dash:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+E | `smart:SEED:14:nova:evolve` | hive, depths, wastes | 90 |
| crude | `crude:SEED:14` | hive, depths, wastes | 90 |
| smart+P T0 to T4 (Hive) | `smart:SEED:14:nova:priority:T (T 0 to 4)` | hive | 300 |
| smart+P OVERTIME (Hive) | `smart:SEED:25:nova:priority:T:ot` | hive | 120 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A4 median alive per minute (smart+P)

Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median free-field alive [target band], x outside it, (n) runs alive through the minute with 10 s or more of free field; then the median over every step of the minute (cage and lull steps included).

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 48 [40-84] (30); 48 | 46 [40-98] (29); 41 | 58 cage (3); 43 | 80 [70-175] (24); 73 | 90 [85-231] (24); 89 | 103 cage (23); 81 | 134 [120-280] (10); 70 x | 143 [140-308] (13); 99 x | 201 [170-315] (15); 154 x | - cage (0); 54 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 35 [30-70] (30); 35 | 38 [30-77] (30); 33 | 48 cage (2); 36 | 58 [50-119] (23); 49 x | 67 [60-140] (15); 67 | 77 cage (12); 63 | 88 [80-182] (9); 69 x | 102 [90-203] (8); 86 x | 125 [110-231] (7); 96 x | - cage (0); 38 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 28 [22-56] (30); 28 | 30 [26-70] (30); 26 | 31 cage (5); 34 | 42 [36-95] (22); 36 x | 57 [44-109] (23); 56 | 55 cage (21); 45 | 65 [58-137] (9); 36 x | 77 [66-151] (14); 64 x | 91 [80-175] (16); 69 x | - cage (0); 34 |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default mid fights over 150 s | Default PRIME fights over 150 s (no stalemate) | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|---|---|
| hive | 25.4 s (29 kills, 13.4 to 52.5; 0 deaths) | 24.8 s (24 kills, 7.3 to 48.8; 0 deaths) | 59.2 s (22 kills, 15.1 to 113.8; 0 deaths) | 3/52 | 2/19 | 197 s | mid2 177.78 s (kill, hive_smart_6006_priority.json); final 192.18 s (open, hive_smart_6006_priority.json); mid2 172.95 s (kill, hive_smart_16016_priority.json); final 197.02 s (open, hive_smart_16016_priority.json); mid2 180 s (ascend, hive_smart_24024_priority.json) | 0/71 |
| depths | 24.4 s (30 kills, 11.6 to 39.8; 0 deaths) | 20.2 s (14 kills, 5.1 to 41.3; 0 deaths) | 63.5 s (7 kills, 18.7 to 136.7; 0 deaths) | 0/42 | 3/8 | 208 s | final 207.96 s (kill, depths_smart_11011_priority.json); final 154.85 s (kill, depths_smart_16016_priority.json); final 175.58 s (kill, depths_smart_30030_priority.json) | 0/50 |
| wastes | 24.4 s (30 kills, 11.3 to 47; 0 deaths) | 18.6 s (18 kills, 5.8 to 37.1; 1 deaths) | 58.1 s (11 kills, 15.9 to 80.5; 0 deaths) | 0/51 | 7/16 | 207.1 s | final 156.33 s (kill, wastes_smart_3003_priority.json); final 180.95 s (kill, wastes_smart_5005_priority.json); final 191.3 s (kill, wastes_smart_10010_priority.json); final 189.65 s (kill, wastes_smart_14014_priority.json); final 202.83 s (kill, wastes_smart_16016_priority.json); final 156.96 s (kill, wastes_smart_29029_priority.json); final 207.05 s (kill, wastes_smart_30030_priority.json) | 0/67 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 61 | 2.62 | 0.82 |
| smart+P | 47 | 2.72 | 0.82 |
| smart+focus+P | 50 | 3.34 | 0.88 |
| smart+dash+P | 10 | 7.07 | 1.22 |
| smart+E | 48 | 2.94 | 1 |
| crude | 90 | 3.58 | 1 |
| hive (smart family) | 51 | 2.65 | 0.82 |
| depths (smart family) | 100 | 2.76 | 0.82 |
| wastes (smart family) | 65 | 5.42 | 0.88 |

Smart-family deaths under 1.2 s: 15; under 3.0 s: 106. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"shot":11420,"acid":1374.8,"bite":8779.4,"ram":567.2}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_10010_priority.json: 0.82 s at 6:26, 50.9/100 HP, {"bite":22.1,"shot":32.7}
- hive_smart_8008.json: 0.82 s at 7:19, 41.1/75 HP, {"shot":36.2,"acid":3.8,"bite":12}
- depths_smart_19019.json: 0.83 s at 7:00, 62/100 HP, {"shot":56.3,"bite":16}
- depths_smart_27027.json: 0.83 s at 5:53, 52.8/100 HP, {"shot":54.3}
- hive_smart_29029.json: 0.88 s at 5:38, 50.1/100 HP, {"acid":17.3,"bite":16,"shot":17.1}
- wastes_smart_focus_14014_priority.json: 0.88 s at 5:40, 63.2/125 HP, {"bite":30,"shot":13.5,"ram":31.9}
- depths_smart_focus_1001_priority.json: 0.9 s at 6:14, 60.2/100 HP, {"shot":45,"bite":16}
- depths_smart_26026_priority.json: 1 s at 6:10, 65/125 HP, {"shot":44.8,"bite":30}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 524 | 74 | 292 | 0.274 (hive_roam_11011.json) |
| smart | 90 | 0 | 500 | 50 | 242 | 0.148 (hive_smart_14014.json) |
| smart+P | 90 | 0 | 480 | 30 | 244 | 0.136 (wastes_smart_16016_priority.json) |
| smart+focus+P | 90 | 0 | 482 | 32 | 308 | 0.29 (wastes_smart_focus_3003_priority.json) |
| smart+dash+P | 90 | 0 | 460 | 10 | 274 | 0.172 (depths_smart_dash_3003_priority.json) |
| smart+E | 90 | 0 | 450 | 4 | 200 | 0.036 (hive_smart_29029_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.002 | 0.002 | 0 | 0.002 | 0.01 | 0.02 | 0.036 | 0 | 0.022 | 0.18 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.015 | 0.031 | 0 | 0.012 | 0.038 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.027 | 0.073 | 0.01 | 0.026 | 0.05 | - |

### A14 hashes

| Mode and world | Hashes (view) |
|---|---|
| det hive | 642fbc46 (375x667); 642fbc46 (667x375); 642fbc46 (375x667 settings) |
| det depths | 1365ccb6 (375x667); 1365ccb6 (667x375); 1365ccb6 (375x667 settings) |
| det wastes | d3c8cef6 (375x667); d3c8cef6 (667x375); d3c8cef6 (375x667 settings) |
| det-long hive | af0a9917 (375x667); af0a9917 (667x375); af0a9917 (375x667 settings) |
| det-long depths | ba6215aa (375x667); ba6215aa (667x375); ba6215aa (375x667 settings) |
| det-long wastes | ab4f477 (375x667); ab4f477 (667x375); ab4f477 (375x667 settings) |
| det-death hive | 4e549672 (375x667, death at 142.5 s); 4e549672 (667x375, death at 142.5 s); 4e549672 (375x667 settings, death at 142.5 s) |
| det-death depths | 7f0eec9a (375x667, death at 201.7 s); 7f0eec9a (667x375, death at 201.7 s); 7f0eec9a (375x667 settings, death at 201.7 s) |
| det-death wastes | 224be1c (375x667, death at 168.1 s); 224be1c (667x375, death at 168.1 s); 224be1c (375x667 settings, death at 168.1 s) |
| daily det wastes | 552a87a2 (375x667 fresh); 552a87a2 (667x375 unlocked) |
| daily det-death wastes | cbcd258d (375x667 fresh, death at 181.48 s); cbcd258d (667x375 unlocked, death at 181.48 s) |

### A15 machine state per perf run

- Cool-down before the timing steps: 75 s, then load 2.93 3.42 3.19, total = 3072.00M  used = 2271.06M  free = 800.94M  (encrypted)
- `390 844 perf nova hive`: load 3.25 3.43 3.2, total = 3072.00M  used = 2271.06M  free = 800.94M  (encrypted); sim 91.2 to 111.9 s; echo ok
- `390 844 perf nova wastes`: load 2.58 3.24 3.14, total = 3072.00M  used = 2271.06M  free = 800.94M  (encrypted); sim 91.2 to 111.9 s; echo ok
- `390 844 perf-final nova hive`: load 3.18 3.35 3.19, total = 3072.00M  used = 2271.06M  free = 800.94M  (encrypted); sim 600 to 609.7 s; echo ok

### S3.2 allocation per scene

| Scene | Total MB/s | Game MB/s | Sim functions over 0.1 MB/s | Within budget 1.0 |
|---|---|---|---|---|
| flood hive | 0.576 | 0.196 | none | yes |
| boss hive | 0.366 | 0.069 | none | yes |
| event hive | 0.489 | 0.165 | none | yes |
| flood depths | 1.295 | 0.936 | [{"fn":"aiSystem src/systems/ai.ts:19","MBs":0.683},{"fn":"hypot src/core/vec.ts:14","MBs":0.104}] | no |
| boss depths | 0.381 | 0.091 | none | yes |
| event depths | 0.486 | 0.164 | none | yes |
| flood wastes | 0.549 | 0.17 | none | yes |
| boss wastes | 0.35 | 0.056 | none | yes |
| event wastes | 0.394 | 0.125 | none | yes |

Heap growth (flood Hive, 80 s warm-up, forced GC before and after 60 s): 20.146 to 20.23 MB, growth 0.085 MB, kept 0.23 MB.

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:2 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:3 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..60) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..20) --out=/tmp/swg-final/runs   # reused from an earlier run of this matrix
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

Raw runs: `/tmp/swg-final/runs` (not kept). The JSON next to this file holds every metric's details.
