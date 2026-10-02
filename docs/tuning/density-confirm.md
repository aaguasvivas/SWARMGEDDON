# P19 density-confirm matrix

- Commit: `7eaf81b` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T23:42:39.691Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=density-confirm --runs=/tmp/swg-density/confirm --out=/tmp/swg-density/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 2.77 3.04 3.21, swap total = 6656.00M  used = 5561.94M  free = 1094.06M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 518; over row maxAlive 68 (row of the minute: 314); saturated share max 0.246 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | PASS |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 6/9), depths 9/9 (minute mean 6/9), wastes 9/9 (minute mean 5/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A5 | Boss arrival (smart+P and focus fights) | 380 arrivals (2 PRIME ascends, placed where the mid boss was), 295 to 306 u, cage active and inside 380/380, in arena 380/380 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.6/23.1/56.7 s (kills 29/25/22), default longest 206.3 s; depths focus 22.8/28/44.8 s (kills 28/12/8), default longest 205.2 s; wastes focus 25.1/22.3/70.1 s (kills 30/17/12), default longest 205.3 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 14/30, smart 7/30; depths smart+P 8/30, smart 2/30; wastes smart+P 11/30, smart 6/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 14:00, smart+P 14:00, crude 2:09; depths smart 7:02, smart+P 9:02, crude 2:13; wastes smart 10:07, smart+P 12:12, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L9/L16/L19 at 3:00/8:00/11:00, gap over 60 s in 25/30 runs; depths L9/L17/L22 at 3:00/8:00/11:00, gap over 60 s in 13/30 runs; wastes L10/L17/L22 at 3:00/8:00/11:00, gap over 60 s in 20/30 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 191 deaths, median 3.83 s, min 0.88 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash 1.14x, cc 1.76/min, fusion by 4:00 58/88, evolve 18/23, XP min 0.967 (whole run 0.907); depths dash 1.39x, cc 1.68/min, fusion by 4:00 64/86, evolve 17/19, XP min 0.913 (whole run 0.906); wastes dash 1.26x, cc 2.06/min, fusion by 4:00 66/90, evolve 18/22, XP min 0.927 (whole run 0.913) | dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

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
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 51 [40-84] (29); 51 | 45 [40-98] (29); 41 | - cage (0); 42 | 80 [70-175] (23); 71 | 89 [85-231] (24); 89 | 103 cage (23); 83 | 173 [120-280] (4); 52 x | 150 [140-308] (15); 112 x | 224 [170-315] (19); 153 x | - cage (0); 49 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 35 [30-70] (29); 35 | 37 [30-77] (28); 32 | 44 cage (4); 36 | 59 [50-119] (25); 52 | 68 [60-140] (17); 68 | 77 cage (17); 65 | 88 [80-182] (11); 53 x | 98 [90-203] (13); 82 x | 125 [110-231] (10); 93 x | - cage (0); 37 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 28 [22-56] (30); 28 | 30 [26-70] (30); 26 | 31 cage (4); 34 | 40 [36-95] (21); 34 x | 58 [44-109] (23); 58 | 55 cage (21); 46 | 60 [58-137] (6); 36 x | 77 [66-151] (17); 62 x | 88 [80-175] (14); 64 x | - cage (0); 34 |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 25.6 s (29 kills, 10.6 to 52.1; 0 deaths) | 23.1 s (25 kills, 5.6 to 65.8; 0 deaths) | 56.7 s (22 kills, 9.6 to 157.4; 0 deaths) | 206.3 s | final 150.78 s (kill, hive_smart_3003_priority.json); final 156.48 s (kill, hive_smart_5005_priority.json); final 197.35 s (kill, hive_smart_9009_priority.json); mid2 180 s (ascend, hive_smart_10010_priority.json); mid2 180 s (ascend, hive_smart_16016_priority.json); final 206.35 s (kill, hive_smart_25025_priority.json); final 200.81 s (kill, hive_smart_30030_priority.json) | 0/74 |
| depths | 22.8 s (28 kills, 14.7 to 51.1; 0 deaths) | 28 s (12 kills, 15.3 to 63.5; 0 deaths) | 44.8 s (8 kills, 19.9 to 97.3; 0 deaths) | 205.2 s | final 205.23 s (kill, depths_smart_9009_priority.json); final 156.51 s (kill, depths_smart_20020_priority.json); final 157.11 s (kill, depths_smart_30030_priority.json) | 0/56 |
| wastes | 25.1 s (30 kills, 11.3 to 39.2; 0 deaths) | 22.3 s (17 kills, 6.1 to 64.5; 1 deaths) | 70.1 s (12 kills, 11.3 to 151.2; 0 deaths) | 205.3 s | final 195 s (kill, wastes_smart_4004_priority.json); mid2 164.61 s (kill, wastes_smart_9009_priority.json); final 205.35 s (open, wastes_smart_9009_priority.json); final 186.6 s (kill, wastes_smart_18018_priority.json); final 156.96 s (kill, wastes_smart_29029_priority.json) | 0/66 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 53 | 3.28 | 0.88 |
| smart+P | 42 | 3.63 | 1.45 |
| smart+focus+P | 48 | 4.68 | 1.08 |
| smart+dash+P | 8 | 4.55 | 1.87 |
| smart+E | 40 | 3.78 | 0.95 |
| crude | 90 | 3.39 | 1.17 |
| hive (smart family) | 35 | 3 | 0.92 |
| depths (smart family) | 90 | 2.88 | 0.88 |
| wastes (smart family) | 66 | 6.64 | 1.18 |

Smart-family deaths under 1.2 s: 10; under 3.0 s: 76. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"bite":8465.1,"shot":10368.9,"acid":1171,"ram":584.9}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_2002.json: 0.88 s at 6:33, 82.1/150 HP, {"bite":36,"shot":65.6}
- hive_smart_17017.json: 0.92 s at 6:59, 57.1/100 HP, {"shot":35.8,"acid":10.9,"bite":16}
- depths_smart_30030.json: 0.95 s at 6:53, 59.4/100 HP, {"shot":56.1,"bite":24}
- depths_smart_28028_evolve.json: 0.95 s at 5:42, 65.6/100 HP, {"shot":44.2,"bite":23.9}
- depths_smart_focus_12012_priority.json: 1.08 s at 7:03, 61.3/100 HP, {"shot":46.1,"bite":24}
- depths_smart_7007.json: 1.12 s at 3:58, 50.5/100 HP, {"shot":41.7,"bite":24}
- hive_smart_30030.json: 1.13 s at 7:16, 52.8/100 HP, {"shot":36.1,"acid":23.4}
- depths_smart_21021.json: 1.13 s at 8:40, 53.8/100 HP, {"shot":48.4,"bite":24}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 503 | 53 | 282 | 0.187 (wastes_roam_1001.json) |
| smart | 90 | 0 | 509 | 59 | 267 | 0.246 (hive_smart_14014.json) |
| smart+P | 90 | 0 | 510 | 60 | 290 | 0.22 (hive_smart_3003_priority.json) |
| smart+focus+P | 90 | 0 | 487 | 37 | 314 | 0.191 (hive_smart_focus_5005_priority.json) |
| smart+dash+P | 90 | 0 | 518 | 68 | 244 | 0.167 (wastes_smart_dash_16016_priority.json) |
| smart+E | 90 | 0 | 510 | 60 | 290 | 0.22 (hive_smart_3003_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.002 | 0 | 0 | 0 | 0.01 | 0.021 | 0.051 | 0.001 | 0.052 | 0.234 | - |
| depths | 0 | 0 | 0 | 0.001 | 0 | 0.001 | 0.023 | 0.033 | 0.003 | 0.013 | 0.028 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.032 | 0.075 | 0 | 0.028 | 0.046 | - |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/confirm   # reused from an earlier run of this matrix
```

Raw runs: `/tmp/swg-density/confirm` (not kept). The JSON next to this file holds every metric's details.
