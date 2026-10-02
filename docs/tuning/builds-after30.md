# P19 builds-after30 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T05:32:10.692Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-after30 --runs=/tmp/swg-builds/after30 --seeds=30 --only=A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A14,A18` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 3.46 13.1 13.32, swap total = 4096.00M  used = 3109.00M  free = 987.00M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A1 | Opening probe (5 seeds x 3 worlds, views 560x996 and 996x560) | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) | first enemy in view <= 1.0 s; first kill <= 2.5 s; empty view <= 2.0 s | PASS |
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 507; over row maxAlive 57 (row of the minute: 314); saturated share max 0.304 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 6/9), depths 9/9 (minute mean 5/9), wastes 9/9 (minute mean 5/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A5 | Boss arrival (smart+P and focus fights) | 424 arrivals (0 PRIME ascends, placed where the mid boss was), 294 to 307 u, cage active and inside 424/424, in arena 424/424 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 22.1/25.4/48.2 s (kills 30/26/23), default longest 204.7 s; depths focus 23.4/23.9/42 s (kills 30/19/13), default longest 201.2 s; wastes focus 21.7/20/55.3 s (kills 30/22/18), default longest 198.2 s; kill-to-next-arrival min 35.7 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 15/30, smart 6/30; depths smart+P 12/30, smart 5/30; wastes smart+P 13/30, smart 9/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 14:00, smart+P 14:00, crude 3:12; depths smart 7:18, smart+P 14:00, crude 2:58; wastes smart 14:00, smart+P 14:00, crude 1:44 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L18/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/30 runs (fights counted: 20); depths L10/L19/L24 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 12); wastes L10/L18/L23 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 17) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 173 deaths, median 3 s, min 0.85 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A14 | Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection; each with its rerun) | 9 groups, 0 split; reruns match; 21/21 lines | one hash per mode and world across views, settings, reruns | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P minutes alive per death; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash Infinityx per death (deaths 0/30 vs 8/30; mean 1.15x, ceiling 1.15x), cc 1.39/min, fusion by 4:00 71/90, evolve 20/23, XP min 0.954 (whole run 0.91); depths dash 2.29x per death (deaths 7/30 vs 14/30; mean 1.15x, ceiling 1.29x), cc 1.39/min, fusion by 4:00 69/90, evolve 13/14, XP min 0.945 (whole run 0.923); wastes dash Infinityx per death (deaths 0/30 vs 12/30; mean 1.23x, ceiling 1.23x), cc 2.31/min, fusion by 4:00 74/90, evolve 21/24, XP min 0.913 (whole run 0.909) | dash >= 1.25x minutes alive per death; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | PASS |

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
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 48 [40-84] (30); 48 | 46 [40-98] (30); 41 | 74 cage (4); 44 | 78 [70-175] (24); 66 x | 90 [85-231] (24); 89 | 103 cage (24); 85 | 131 [120-280] (11); 63 x | 148 [140-308] (17); 121 x | 219 [170-315] (21); 185 | - cage (0); 52 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 36 [30-70] (30); 36 | 37 [30-77] (30); 32 | 44 cage (5); 36 | 58 [50-119] (24); 49 x | 67 [60-140] (22); 67 | 77 cage (20); 60 | 87 [80-182] (15); 63 x | 99 [90-203] (17); 82 x | 122 [110-231] (16); 89 x | - cage (0); 37 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 29 [22-56] (30); 29 | 30 [26-70] (30); 26 x | 32 cage (6); 34 | 40 [36-95] (23); 36 | 51 [44-109] (24); 51 | 57 cage (23); 50 | 62 [58-137] (7); 36 x | 83 [66-151] (13); 59 x | 102 [80-175] (18); 71 x | - cage (0); 34 |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 22.1 s (30 kills, 9.6 to 58.1; 0 deaths) | 25.4 s (26 kills, 7.8 to 63.3; 0 deaths) | 48.2 s (23 kills, 7.5 to 103.7; 0 deaths) | 204.7 s | final 204.73 s (kill, hive_smart_9009_priority.json); final 168.76 s (kill, hive_smart_11011_priority.json); final 180.6 s (kill, hive_smart_19019_priority.json); final 194.76 s (kill, hive_smart_24024_priority.json) | 0/76 |
| depths | 23.4 s (30 kills, 6.8 to 44.9; 0 deaths) | 23.9 s (19 kills, 6.2 to 40.3; 0 deaths) | 42 s (13 kills, 14.9 to 118.6; 0 deaths) | 201.2 s | final 192.15 s (kill, depths_smart_13013_priority.json); final 201.15 s (kill, depths_smart_14014_priority.json) | 0/66 |
| wastes | 21.7 s (30 kills, 6.5 to 46.2; 0 deaths) | 20 s (22 kills, 4.6 to 70.9; 0 deaths) | 55.3 s (18 kills, 13.6 to 121.3; 0 deaths) | 198.2 s | final 160.56 s (kill, wastes_smart_5005_priority.json); final 161.88 s (kill, wastes_smart_10010_priority.json); final 198.18 s (kill, wastes_smart_30030_priority.json) | 0/71 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 52 | 2.42 | 0.85 |
| smart+P | 34 | 4.72 | 0.93 |
| smart+focus+P | 36 | 3.09 | 1.3 |
| smart+dash+P | 7 | 4.2 | 0.93 |
| smart+E | 44 | 2.73 | 0.93 |
| crude | 90 | 3.47 | 1.22 |
| hive (smart family) | 40 | 3.56 | 0.97 |
| depths (smart family) | 84 | 2.38 | 0.85 |
| wastes (smart family) | 49 | 4.55 | 1.23 |

Smart-family deaths under 1.2 s: 8; under 3.0 s: 86. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"bite":7880.7,"acid":865.1,"shot":8854.1,"ram":397.6}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_15015.json: 0.85 s at 7:27, 56.3/100 HP, {"shot":57.1,"bite":8}
- depths_smart_7007_priority.json: 0.93 s at 5:47, 62.8/100 HP, {"shot":44.3,"bite":24}
- depths_smart_dash_21021_priority.json: 0.93 s at 8:50, 50.1/100 HP, {"shot":59.5}
- depths_smart_7007_evolve.json: 0.93 s at 5:47, 62.8/100 HP, {"shot":44.3,"bite":24}
- hive_smart_20020.json: 0.97 s at 9:15, 42.5/75 HP, {"shot":38.3,"acid":4,"bite":12}
- depths_smart_26026.json: 1.02 s at 5:32, 52.1/100 HP, {"bite":24,"shot":43.9}
- depths_smart_18018.json: 1.03 s at 5:38, 67.6/100 HP, {"shot":53.8,"bite":23.7}
- depths_smart_14014_evolve.json: 1.12 s at 6:47, 74/125 HP, {"shot":55.9,"bite":26.3}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 484 | 34 | 272 | 0.21 (hive_roam_14014.json) |
| smart | 90 | 0 | 490 | 40 | 267 | 0.282 (hive_smart_2002.json) |
| smart+P | 90 | 0 | 454 | 7 | 166 | 0.054 (wastes_smart_3003_priority.json) |
| smart+focus+P | 90 | 0 | 507 | 57 | 314 | 0.304 (hive_smart_focus_3003_priority.json) |
| smart+dash+P | 90 | 0 | 476 | 26 | 256 | 0.098 (depths_smart_dash_3003_priority.json) |
| smart+E | 90 | 0 | 453 | 7 | 233 | 0.089 (depths_smart_27027_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.001 | 0 | 0 | 0 | 0.023 | 0.035 | 0.051 | 0.018 | 0.038 | 0.156 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.006 | 0.015 | 0 | 0.02 | 0.029 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.02 | 0.053 | 0 | 0.018 | 0.026 | - |

### A14 hashes

| Mode and world | Hashes (view) |
|---|---|
| det hive | 642fbc46 (375x667); 642fbc46 (667x375); 642fbc46 (375x667 settings) |
| det depths | 1365ccb6 (375x667); 1365ccb6 (667x375); 1365ccb6 (375x667 settings) |
| det wastes | d3c8cef6 (375x667); d3c8cef6 (667x375); d3c8cef6 (375x667 settings) |
| det-long hive | 3bef227a (375x667); 3bef227a (667x375) |
| det-long depths | b75a64 (375x667); b75a64 (667x375) |
| det-long wastes | 1849d2a5 (375x667); 1849d2a5 (667x375) |
| det-death hive | 462ac73f (375x667, death at 207.77 s); 462ac73f (667x375, death at 207.77 s) |
| det-death depths | 2c07f2b2 (375x667, death at 210.68 s); 2c07f2b2 (667x375, death at 210.68 s) |
| det-death wastes | d583d758 (375x667, death at 225.73 s); d583d758 (667x375, death at 225.73 s) |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/after30
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

Raw runs: `/tmp/swg-builds/after30` (not kept). The JSON next to this file holds every metric's details.
