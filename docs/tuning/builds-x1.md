# P19 builds-x1 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T07:31:11.980Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-x1 --runs=/tmp/swg-builds/x1 --seeds=30 --only=A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A14,A18` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 3.72 4.31 5.46, swap total = 4096.00M  used = 3560.06M  free = 535.94M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A1 | Opening probe (5 seeds x 3 worlds, views 560x996 and 996x560) | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) | first enemy in view <= 1.0 s; first kill <= 2.5 s; empty view <= 2.0 s | PASS |
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 549; over row maxAlive 99 (row of the minute: 313); saturated share max 0.31 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 6/9), depths 9/9 (minute mean 6/9), wastes 9/9 (minute mean 5/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A5 | Boss arrival (smart+P and focus fights) | 388 arrivals (1 PRIME ascends, placed where the mid boss was), 294 to 306 u, cage active and inside 388/388, in arena 388/388 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 26.1/24.9/56.2 s (kills 28/26/24), default longest 199.8 s; depths focus 24.1/17.6/52.2 s (kills 30/16/10), default longest 193.1 s; wastes focus 24.4/18.6/58.1 s (kills 30/18/11), default longest 207.1 s; kill-to-next-arrival min 35.3 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 13/30, smart 5/30; depths smart+P 4/30, smart 4/30; wastes smart+P 15/30, smart 8/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 11:54, smart+P 14:00, crude 3:12; depths smart 7:18, smart+P 8:30, crude 3:16; wastes smart 7:49, smart+P 14:00, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L16/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 6/30 runs (fights counted: 23); depths L10/L17.5/L22.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 12); wastes L10/L17/L20.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 2/30 runs (fights counted: 16) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 209 deaths, median 3.32 s, min 0.82 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A14 | Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection; each with its rerun) | 9 groups, 0 split; reruns match; 21/21 lines | one hash per mode and world across views, settings, reruns | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P minutes alive per death; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash Infinityx per death (deaths 0/30 vs 9/30; mean 1.16x, ceiling 1.16x), cc 1.52/min, fusion by 4:00 59/86, evolve 18/24, XP min 0.96 (whole run 0.92); depths dash 4.17x per death (deaths 8/30 vs 24/30; mean 1.39x, ceiling 1.59x), cc 1.41/min, fusion by 4:00 66/90, evolve 11/13, XP min 0.947 (whole run 0.925); wastes dash 8.78x per death (deaths 2/30 vs 14/30; mean 1.25x, ceiling 1.28x), cc 2.19/min, fusion by 4:00 66/90, evolve 21/24, XP min 0.893 (whole run 0.903) | dash >= 1.25x minutes alive per death; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

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
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 48 [40-84] (30); 48 | 48 [40-98] (28); 42 | 66 cage (3); 43 | 79 [70-175] (26); 73 | 89 [85-231] (27); 89 | 104 cage (26); 87 | 139 [120-280] (14); 92 x | 146 [140-308] (19); 122 x | 199 [170-315] (19); 166 x | - cage (0); 48 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 35 [30-70] (30); 35 | 37 [30-77] (30); 32 | 46 cage (3); 36 | 60 [50-119] (26); 54 | 67 [60-140] (17); 67 | 78 cage (16); 63 | 88 [80-182] (9); 61 x | 97 [90-203] (8); 78 x | 116 [110-231] (6); 85 x | - cage (0); 37 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 28 [22-56] (30); 28 | 30 [26-70] (30); 26 | 31 cage (5); 34 | 42 [36-95] (22); 36 x | 57 [44-109] (23); 56 | 55 cage (21); 45 | 65 [58-137] (9); 36 x | 77 [66-151] (14); 64 x | 91 [80-175] (16); 69 x | - cage (0); 34 |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 26.1 s (28 kills, 11.1 to 57.5; 0 deaths) | 24.9 s (26 kills, 7.6 to 37.5; 0 deaths) | 56.2 s (24 kills, 14.3 to 119.3; 0 deaths) | 199.8 s | final 151.9 s (kill, hive_smart_1001_priority.json); final 179.5 s (kill, hive_smart_4004_priority.json); final 199.8 s (kill, hive_smart_16016_priority.json); mid2 180 s (ascend, hive_smart_17017_priority.json); final 167.88 s (kill, hive_smart_21021_priority.json); final 157.11 s (kill, hive_smart_23023_priority.json); final 193.6 s (kill, hive_smart_30030_priority.json) | 0/75 |
| depths | 24.1 s (30 kills, 11.3 to 49.8; 0 deaths) | 17.6 s (16 kills, 6.3 to 52.9; 0 deaths) | 52.2 s (10 kills, 22.1 to 141.3; 0 deaths) | 193.1 s | final 193.11 s (kill, depths_smart_28028_priority.json) | 0/52 |
| wastes | 24.4 s (30 kills, 11.3 to 47; 0 deaths) | 18.6 s (18 kills, 5.8 to 37.1; 1 deaths) | 58.1 s (11 kills, 15.9 to 80.5; 0 deaths) | 207.1 s | final 156.33 s (kill, wastes_smart_3003_priority.json); final 180.95 s (kill, wastes_smart_5005_priority.json); final 191.3 s (kill, wastes_smart_10010_priority.json); final 189.65 s (kill, wastes_smart_14014_priority.json); final 202.83 s (kill, wastes_smart_16016_priority.json); final 156.96 s (kill, wastes_smart_29029_priority.json); final 207.05 s (kill, wastes_smart_30030_priority.json) | 0/67 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 60 | 2.52 | 0.92 |
| smart+P | 47 | 3.17 | 0.82 |
| smart+focus+P | 45 | 3.58 | 0.88 |
| smart+dash+P | 10 | 6.29 | 2.45 |
| smart+E | 47 | 3.95 | 0.82 |
| crude | 90 | 3.62 | 1 |
| hive (smart family) | 42 | 2.52 | 1.13 |
| depths (smart family) | 102 | 3.62 | 0.82 |
| wastes (smart family) | 65 | 5.42 | 0.88 |

Smart-family deaths under 1.2 s: 14; under 3.0 s: 89. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"shot":11938.4,"acid":1070,"bite":9463.8,"ram":567.2}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_21021_priority.json: 0.82 s at 6:51, 52.6/100 HP, {"bite":24,"shot":33.1}
- depths_smart_21021_evolve.json: 0.82 s at 6:51, 52.6/100 HP, {"bite":24,"shot":33.1}
- wastes_smart_focus_14014_priority.json: 0.88 s at 5:40, 63.2/125 HP, {"bite":30,"shot":13.5,"ram":31.9}
- depths_smart_10010_priority.json: 0.92 s at 10:19, 54.6/100 HP, {"shot":62.1,"bite":16}
- depths_smart_4004.json: 0.92 s at 7:28, 53.3/100 HP, {"shot":46.7,"bite":24}
- depths_smart_17017_priority.json: 0.97 s at 9:42, 90.2/175 HP, {"shot":72.1,"bite":42}
- depths_smart_25025.json: 1.05 s at 8:45, 54.9/100 HP, {"bite":23.6,"shot":48.6}
- wastes_smart_focus_28028_priority.json: 1.05 s at 5:13, 51.5/100 HP, {"bite":8,"acid":1.3,"shot":13.3,"ram":31.4}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 549 | 99 | 272 | 0.278 (hive_roam_2002.json) |
| smart | 90 | 0 | 471 | 21 | 264 | 0.23 (depths_smart_1001.json) |
| smart+P | 90 | 0 | 505 | 55 | 283 | 0.271 (hive_smart_3003_priority.json) |
| smart+focus+P | 90 | 0 | 525 | 75 | 313 | 0.31 (hive_smart_focus_3003_priority.json) |
| smart+dash+P | 90 | 0 | 479 | 29 | 258 | 0.177 (hive_smart_dash_5005_priority.json) |
| smart+E | 90 | 0 | 505 | 55 | 283 | 0.271 (hive_smart_3003_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.002 | 0.002 | 0 | 0 | 0.02 | 0.035 | 0.063 | 0.007 | 0.038 | 0.208 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.01 | 0.022 | 0 | 0.019 | 0.023 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.027 | 0.073 | 0.01 | 0.026 | 0.05 | - |

### A14 hashes

| Mode and world | Hashes (view) |
|---|---|
| det hive | 642fbc46 (375x667); 642fbc46 (667x375); 642fbc46 (375x667 settings) |
| det depths | 1365ccb6 (375x667); 1365ccb6 (667x375); 1365ccb6 (375x667 settings) |
| det wastes | d3c8cef6 (375x667); d3c8cef6 (667x375); d3c8cef6 (375x667 settings) |
| det-long hive | b6516380 (375x667); b6516380 (667x375) |
| det-long depths | a85e9171 (375x667); a85e9171 (667x375) |
| det-long wastes | ab4f477 (375x667); ab4f477 (667x375) |
| det-death hive | d5bc8686 (375x667, death at 213.98 s); d5bc8686 (667x375, death at 213.98 s) |
| det-death depths | b0bede7c (375x667, death at 256.83 s); b0bede7c (667x375, death at 256.83 s) |
| det-death wastes | 224be1c (375x667, death at 168.1 s); 224be1c (667x375, death at 168.1 s) |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/x1
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

Raw runs: `/tmp/swg-builds/x1` (not kept). The JSON next to this file holds every metric's details.
