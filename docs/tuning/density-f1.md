# P19 f1 matrix

- Commit: `7eaf81b` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T22:35:00.813Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --worlds=hive,depths,wastes --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=f1 --runs=/tmp/swg-density/f1 --out=/tmp/swg-density/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 4.5 4.94 4.81, swap total = 6656.00M  used = 5652.44M  free = 1003.56M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 533; over row maxAlive 83 (row of the minute: 275); saturated share max 0.212 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | PASS |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 4/9), depths 9/9 (minute mean 6/9), wastes 9/9 (minute mean 7/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A5 | Boss arrival (smart+P and focus fights) | 406 arrivals, 294 to 437 u, cage active and inside 406/406, in arena 406/406 | 250 to 340 u; cage active the same tick | FAIL |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.2/20.5/81.8 s (kills 29/24/20), default longest 180 s; depths focus 23.2/16.7/36.4 s (kills 30/16/13), default longest 203.3 s; wastes focus 20.9/23.8/73.9 s (kills 29/22/16), default longest 180 s; kill-to-next-arrival min 48.1 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 5/30, smart 2/30; depths smart+P 12/30, smart 7/30; wastes smart+P 15/30, smart 3/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 14:00, smart+P 14:00, crude 2:08; depths smart 7:40, smart+P 9:23, crude 2:10; wastes smart 10:17, smart+P 14:00, crude 1:45 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L10/L20/L24 at 3:00/8:00/11:00, gap over 60 s in 21/30 runs; depths L11/L21/L26.5 at 3:00/8:00/11:00, gap over 60 s in 15/30 runs; wastes L11/L19/L24 at 3:00/8:00/11:00, gap over 60 s in 18/30 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 179 deaths, median 3.93 s, min 0.82 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash 1.17x, cc 1.72/min, fusion by 4:00 67/88, evolve 21/26, XP min 0.962 (whole run 0.962); depths dash 1.26x, cc 1.58/min, fusion by 4:00 75/90, evolve 16/19, XP min 0.956 (whole run 0.958); wastes dash 1.16x, cc 2.18/min, fusion by 4:00 73/88, evolve 21/22, XP min 0.927 (whole run 0.882) | dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

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
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 50 [40-84] (29); 50 | 45 [40-98] (29); 40 x | 66 cage (4); 43 | 75 [70-147] (25); 68 x | 88 [85-175] (24); 88 | 103 cage (23); 83 | 124 [120-224] (15); 84 x | 143 [140-252] (15); 119 x | 188 [170-294] (20); 152 x | - cage (0); 48 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 35 [30-70] (30); 35 | 37 [30-77] (30); 32 | 45 cage (5); 36 | 59 [50-119] (28); 53 | 66 [60-140] (22); 66 | 75 cage (19); 59 | 91 [80-182] (13); 61 x | 98 [90-203] (13); 81 x | 118 [110-231] (12); 94 x | - cage (0); 37 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 30 [22-56] (29); 30 | 31 [26-70] (29); 28 | 31 cage (3); 34 | 42 [36-95] (22); 36 | 58 [44-109] (24); 58 | 54 cage (24); 46 | 61 [58-137] (13); 38 x | 84 [66-151] (19); 61 x | 144 [80-175] (19); 103 | - cage (0); 34 |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 25.2 s (29 kills, 10.1 to 39.3; 0 deaths) | 20.5 s (24 kills, 4.6 to 107.8; 0 deaths) | 81.8 s (20 kills, 8.9 to 167.9; 0 deaths) | 180 s | final 166.58 s (kill, hive_smart_7007_priority.json); final 152.38 s (kill, hive_smart_8008_priority.json); mid2 180 s (ascend, hive_smart_9009_priority.json) | 0/73 |
| depths | 23.2 s (30 kills, 9.2 to 49.1; 0 deaths) | 16.7 s (16 kills, 5.5 to 49.9; 0 deaths) | 36.4 s (13 kills, 13.6 to 143.2; 0 deaths) | 203.3 s | final 180.88 s (kill, depths_smart_6006_priority.json); final 203.3 s (kill, depths_smart_20020_priority.json) | 0/61 |
| wastes | 20.9 s (29 kills, 10.6 to 45.7; 0 deaths) | 23.8 s (22 kills, 7.3 to 87.2; 0 deaths) | 73.9 s (16 kills, 23.5 to 174; 0 deaths) | 180 s | final 151.1 s (kill, wastes_smart_8008_priority.json); mid2 180 s (ascend, wastes_smart_9009_priority.json); final 163.25 s (kill, wastes_smart_12012_priority.json); final 172.63 s (kill, wastes_smart_19019_priority.json); final 173.65 s (kill, wastes_smart_21021_priority.json) | 0/73 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 54 | 2.86 | 0.82 |
| smart+P | 37 | 4.48 | 0.95 |
| smart+focus+P | 41 | 4.38 | 1.22 |
| smart+dash+P | 8 | 9.72 | 3.82 |
| smart+E | 39 | 3.93 | 0.95 |
| crude | 90 | 3.58 | 0.82 |
| hive (smart family) | 36 | 4.79 | 0.82 |
| depths (smart family) | 83 | 2.82 | 0.82 |
| wastes (smart family) | 60 | 6.49 | 0.82 |

Smart-family deaths under 1.2 s: 10; under 3.0 s: 76. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"shot":10082.5,"acid":1098.7,"bite":9413.4,"ram":588.7}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- hive_smart_30030.json: 0.82 s at 9:21, 47.1/75 HP, {"shot":38.5,"acid":18}
- depths_smart_10010.json: 0.82 s at 10:06, 58.4/100 HP, {"shot":50.5,"bite":16}
- wastes_smart_7007.json: 0.82 s at 6:05, 58.4/100 HP, {"shot":24.8,"acid":4.3,"ram":32.3}
- depths_smart_4004.json: 0.88 s at 5:58, 51.5/100 HP, {"bite":24,"shot":44.6}
- depths_smart_18018.json: 0.88 s at 8:40, 52.1/100 HP, {"shot":48.5,"bite":16}
- depths_smart_15015_priority.json: 0.95 s at 7:22, 50.9/100 HP, {"bite":24,"shot":33.6}
- hive_smart_11011.json: 0.95 s at 6:25, 50/100 HP, {"acid":9,"bite":16,"shot":35.2}
- depths_smart_15015_evolve.json: 0.95 s at 7:22, 50.9/100 HP, {"bite":24,"shot":33.6}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 533 | 83 | 275 | 0.212 (depths_roam_11011.json) |
| smart | 90 | 0 | 482 | 32 | 274 | 0.15 (hive_smart_17017.json) |
| smart+P | 90 | 0 | 455 | 15 | 243 | 0.034 (hive_smart_3003_priority.json) |
| smart+focus+P | 90 | 0 | 452 | 15 | 244 | 0.092 (wastes_smart_focus_3003_priority.json) |
| smart+dash+P | 90 | 0 | 461 | 15 | 216 | 0.108 (depths_smart_dash_3003_priority.json) |
| smart+E | 90 | 0 | 452 | 15 | 206 | 0.034 (hive_smart_3003_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.001 | 0 | 0 | 0 | 0.008 | 0.008 | 0.011 | 0 | 0.017 | 0.143 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.019 | 0.021 | 0 | 0.018 | 0.024 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.003 | 0.025 | 0 | 0.02 | 0.088 | - |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/f1
```

Raw runs: `/tmp/swg-density/f1` (not kept). The JSON next to this file holds every metric's details.
