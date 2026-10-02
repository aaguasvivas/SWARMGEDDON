# P19 builds-s30x3 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T06:41:01.022Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s30x3 --runs=/tmp/swg-builds/s30x3 --seeds=30 --only=A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A14,A18` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 16.72 18.05 13.33, swap total = 4096.00M  used = 3101.81M  free = 994.19M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A1 | Opening probe (5 seeds x 3 worlds, views 560x996 and 996x560) | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) | first enemy in view <= 1.0 s; first kill <= 2.5 s; empty view <= 2.0 s | PASS |
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 498; over row maxAlive 48 (row of the minute: 302); saturated share max 0.195 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | PASS |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 6/9), depths 9/9 (minute mean 6/9), wastes 9/9 (minute mean 5/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A5 | Boss arrival (smart+P and focus fights) | 410 arrivals (1 PRIME ascends, placed where the mid boss was), 294 to 306 u, cage active and inside 410/410, in arena 410/410 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 23.1/27.5/52.4 s (kills 29/27/21), default longest 207.7 s; depths focus 23.9/26.5/49.3 s (kills 30/20/10), default longest 170.7 s; wastes focus 23.9/19.5/46.4 s (kills 29/21/16), default longest 172.2 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 16/30, smart 11/30; depths smart+P 11/30, smart 7/30; wastes smart+P 11/30, smart 9/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 14:00, smart+P 14:00, crude 3:11; depths smart 6:53, smart+P 9:41, crude 2:56; wastes smart 9:13, smart+P 14:00, crude 1:44 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L18/L21 at 3:00/8:00/11:00, gap over 60 s outside fights in 7/30 runs (fights counted: 21); depths L10/L18/L23 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 10); wastes L10/L18/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 16) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 176 deaths, median 3.82 s, min 0.88 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A14 | Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection; each with its rerun) | 9 groups, 0 split; reruns match; 21/21 lines | one hash per mode and world across views, settings, reruns | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P minutes alive per death; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash Infinityx per death (deaths 0/30 vs 8/30; mean 1.16x, ceiling 1.16x), cc 1.54/min, fusion by 4:00 64/88, evolve 20/22, XP min 0.956 (whole run 0.923); depths dash 3.98x per death (deaths 5/30 vs 16/30; mean 1.24x, ceiling 1.36x), cc 1.45/min, fusion by 4:00 66/90, evolve 19/20, XP min 0.949 (whole run 0.943); wastes dash 7.16x per death (deaths 2/30 vs 12/30; mean 1.19x, ceiling 1.22x), cc 2.08/min, fusion by 4:00 64/88, evolve 20/24, XP min 0.91 (whole run 0.864) | dash >= 1.25x minutes alive per death; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | PASS |

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

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A4 median alive per minute (smart+P)

Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median free-field alive [target band], x outside it, (n) runs alive through the minute with 10 s or more of free field; then the median over every step of the minute (cage and lull steps included).

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 48 [40-84] (30); 48 | 46 [40-98] (29); 41 | 75 cage (1); 43 | 77 [70-175] (24); 73 | 91 [85-231] (24); 91 | 104 cage (23); 84 | 143 [120-280] (13); 73 x | 157 [140-308] (18); 122 x | 189 [170-315] (19); 143 x | - cage (0); 49 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 36 [30-70] (30); 36 | 38 [30-77] (30); 33 | 47 cage (1); 36 | 59 [50-119] (23); 50 | 68 [60-140] (20); 68 | 77 cage (18); 63 | 90 [80-182] (12); 70 x | 98 [90-203] (14); 82 x | 127 [110-231] (13); 100 x | - cage (0); 37 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 28 [22-56] (30); 28 | 30 [26-70] (29); 27 | 31 cage (1); 34 | 40 [36-95] (23); 35 x | 51 [44-109] (24); 51 | 55 cage (23); 46 | 60 [58-137] (9); 35 x | 89 [66-151] (16); 65 x | 95 [80-175] (16); 71 x | - cage (0); 34 |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 23.1 s (29 kills, 8.5 to 61.5; 0 deaths) | 27.5 s (27 kills, 5.2 to 54.1; 0 deaths) | 52.4 s (21 kills, 10.8 to 139.3; 0 deaths) | 207.7 s | mid2 150.86 s (kill, hive_smart_2002_priority.json); final 193.05 s (kill, hive_smart_5005_priority.json); final 203.26 s (kill, hive_smart_9009_priority.json); mid2 168.75 s (kill, hive_smart_10010_priority.json); final 201.22 s (open, hive_smart_10010_priority.json); mid2 180 s (ascend, hive_smart_16016_priority.json); final 164.23 s (kill, hive_smart_18018_priority.json); mid2 151.05 s (kill, hive_smart_20020_priority.json); final 152.71 s (kill, hive_smart_23023_priority.json); final 207.66 s (kill, hive_smart_25025_priority.json) | 1/75 |
| depths | 23.9 s (30 kills, 8.9 to 36.6; 0 deaths) | 26.5 s (20 kills, 7.8 to 59; 0 deaths) | 49.3 s (10 kills, 12 to 142; 0 deaths) | 170.7 s | final 170.66 s (kill, depths_smart_30030_priority.json) | 0/62 |
| wastes | 23.9 s (29 kills, 11.6 to 52.9; 0 deaths) | 19.5 s (21 kills, 5 to 49.3; 0 deaths) | 46.4 s (16 kills, 6.5 to 130.8; 0 deaths) | 172.2 s | mid2 150.8 s (kill, wastes_smart_6006_priority.json); final 153.38 s (kill, wastes_smart_7007_priority.json); final 172.18 s (kill, wastes_smart_9009_priority.json); mid2 158.9 s (kill, wastes_smart_10010_priority.json); mid2 150.2 s (kill, wastes_smart_24024_priority.json); final 156.38 s (kill, wastes_smart_30030_priority.json) | 0/70 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 50 | 3.29 | 0.9 |
| smart+P | 36 | 3.91 | 1.25 |
| smart+focus+P | 43 | 3.75 | 1 |
| smart+dash+P | 7 | 6.13 | 0.88 |
| smart+E | 40 | 4.15 | 1.3 |
| crude | 90 | 3.22 | 1.22 |
| hive (smart family) | 38 | 2.92 | 1.18 |
| depths (smart family) | 78 | 3.17 | 0.9 |
| wastes (smart family) | 60 | 5.91 | 0.88 |

Smart-family deaths under 1.2 s: 7; under 3.0 s: 73. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"shot":9152.4,"acid":1036.6,"bite":6726.1,"ram":429.1}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- wastes_smart_dash_13013_priority.json: 0.88 s at 10:29, 50.3/100 HP, {"shot":28.3,"acid":14.4,"bite":8}
- depths_smart_30030.json: 0.9 s at 10:08, 65.5/100 HP, {"shot":73.1}
- depths_smart_20020.json: 0.95 s at 5:26, 62.8/100 HP, {"bite":24,"shot":43.8}
- depths_smart_8008.json: 0.97 s at 7:05, 45.3/75 HP, {"shot":56.4,"bite":12}
- depths_smart_focus_15015_priority.json: 1 s at 8:12, 56.4/100 HP, {"bite":24,"shot":47.8}
- depths_smart_18018.json: 1.17 s at 6:33, 52.1/100 HP, {"bite":24,"shot":45.4}
- hive_smart_7007.json: 1.18 s at 9:36, 53.7/100 HP, {"shot":38.7,"acid":15.5}
- depths_smart_22022.json: 1.22 s at 6:30, 52/100 HP, {"bite":32,"shot":22.7}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 498 | 48 | 292 | 0.172 (wastes_roam_11011.json) |
| smart | 90 | 0 | 458 | 23 | 281 | 0.177 (hive_smart_4004.json) |
| smart+P | 90 | 0 | 465 | 15 | 260 | 0.153 (hive_smart_5005_priority.json) |
| smart+focus+P | 90 | 0 | 489 | 39 | 302 | 0.195 (hive_smart_focus_30030_priority.json) |
| smart+dash+P | 90 | 0 | 488 | 38 | 249 | 0.17 (hive_smart_dash_30030_priority.json) |
| smart+E | 90 | 0 | 459 | 9 | 296 | 0.172 (wastes_smart_3003_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.001 | 0.001 | 0.001 | 0 | 0.014 | 0.021 | 0.026 | 0.005 | 0.016 | 0.133 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0.001 | 0.011 | 0.006 | 0 | 0.017 | 0.026 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.015 | 0.059 | 0 | 0.03 | 0.048 | - |

### A14 hashes

| Mode and world | Hashes (view) |
|---|---|
| det hive | 642fbc46 (375x667); 642fbc46 (667x375); 642fbc46 (375x667 settings) |
| det depths | 1365ccb6 (375x667); 1365ccb6 (667x375); 1365ccb6 (375x667 settings) |
| det wastes | d3c8cef6 (375x667); d3c8cef6 (667x375); d3c8cef6 (375x667 settings) |
| det-long hive | bbbafa24 (375x667); bbbafa24 (667x375) |
| det-long depths | 827c7b0b (375x667); 827c7b0b (667x375) |
| det-long wastes | 1cc976fb (375x667); 1cc976fb (667x375) |
| det-death hive | 4e549672 (375x667, death at 142.5 s); 4e549672 (667x375, death at 142.5 s) |
| det-death depths | 23698a19 (375x667, death at 256.83 s); 23698a19 (667x375, death at 256.83 s) |
| det-death wastes | 16d50c98 (375x667, death at 136.5 s); 16d50c98 (667x375, death at 136.5 s) |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s30x3
node scripts/measure.mjs 375 667 det
node scripts/measure.mjs 667 375 det
node scripts/measure.mjs 375 667 det-long
node scripts/measure.mjs 667 375 det-long
node scripts/measure.mjs 375 667 det-death
node scripts/measure.mjs 667 375 det-death
node scripts/measure.mjs 375 667 det '--settings={"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
node scripts/measure.mjs 375 667 opening 560 996
node scripts/measure.mjs 375 667 opening 996 560
```

Raw runs: `/tmp/swg-builds/s30x3` (not kept). The JSON next to this file holds every metric's details.
