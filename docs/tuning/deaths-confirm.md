# P19 deaths-confirm matrix

- Commit: `e49114b` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T12:15:21.012Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=deaths-confirm --runs=/tmp/swg-deaths/confirm --out=/tmp/swg-deaths/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 4.11 4.05 4.2, swap total = 6144.00M  used = 5427.06M  free = 716.94M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 477; over row maxAlive 269; saturated share max 0.352 | beats on time or per deferral; alive <= row.maxAlive + 160 and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median alive per minute vs the A7.2 Target alive) | hive 6/9, depths 7/9, wastes 5/9 | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | FAIL |
| A5 | Boss arrival (smart+P and focus fights) | 388 arrivals, 287 to 306 u, cage active and inside 388/388, in arena 388/388 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 23.6/18.5/19.7 s (kills 30/23/19), default longest 173.5 s; depths focus 21.8/17.9/26.9 s (kills 28/14/10), default longest 101.6 s; wastes focus 27.3/26/31.6 s (kills 30/23/13), default longest 210 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 23/30, smart 12/30; depths smart+P 7/30, smart 4/30; wastes smart+P 17/30, smart 11/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 9:35, smart+P 14:00, crude 2:08; depths smart 6:46, smart+P 8:25, crude 2:10; wastes smart 10:16, smart+P 14:00, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L8/L17/L21 at 3:00/8:00/11:00, gap over 60 s in 20/30 runs; depths L9/L17.5/L21 at 3:00/8:00/11:00, gap over 60 s in 8/30 runs; wastes L10/L17/L19 at 3:00/8:00/11:00, gap over 60 s in 19/30 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 207 deaths, median 3.83 s, min 0.82 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam whole-run) | hive dash 1.12x, cc 1.53/min, fusion by 4:00 62/90, evolve 15/21, XP min 0.845; depths dash 1.42x, cc 1.66/min, fusion by 4:00 64/86, evolve 11/16, XP min 0.914; wastes dash 1.22x, cc 2.12/min, fusion by 4:00 66/90, evolve 19/19, XP min 0.822 | dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

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

Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median alive [target band], x outside it, (n) runs alive through the minute.

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 17 [16-28] (30) | 29 [24-56] (30) | 51 [40-84] (30) | 41 [40-98] (30) | 43 cage (30) | 70 [70-147] (27) | 95 [85-175] (24) | 90 cage (23) | 120 [120-224] x (23) | 136 [140-252] x (23) | 155 [170-294] x (17) | 52 cage (8) |
| depths | 16 [14-28] (30) | 24 [20-49] (30) | 35 [30-70] (29) | 32 [30-77] (28) | 36 cage (28) | 53 [50-119] (22) | 67 [60-140] (19) | 62 cage (16) | 63 [80-182] x (13) | 94 [90-203] (8) | 103 [110-231] x (6) | - cage (0) |
| wastes | 15 [14-25] (30) | 18 [16-42] (30) | 28 [22-56] (30) | 26 [26-70] (30) | 34 cage (30) | 34 [36-95] x (30) | 54 [44-109] (24) | 49 cage (23) | 36 [58-137] x (21) | 61 [66-151] x (18) | 78 [80-175] x (15) | 34 cage (11) |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 23.6 s (30 kills, 10.4 to 57.1; 0 deaths) | 18.5 s (23 kills, 6.5 to 68.5; 0 deaths) | 19.7 s (19 kills, 8.2 to 53.3; 0 deaths) | 173.5 s | final 170.81 s (kill, hive_smart_14014_priority.json); mid2 173.51 s (kill, hive_smart_20020_priority.json); final 165.33 s (kill, hive_smart_20020_priority.json) | 0/76 |
| depths | 21.8 s (28 kills, 10.9 to 38; 0 deaths) | 17.9 s (14 kills, 3.9 to 35.6; 0 deaths) | 26.9 s (10 kills, 5.5 to 55; 0 deaths) | 101.6 s | none | 0/51 |
| wastes | 27.3 s (30 kills, 12.8 to 41.1; 0 deaths) | 26 s (23 kills, 5.4 to 75.4; 0 deaths) | 31.6 s (13 kills, 5 to 60.1; 0 deaths) | 210 s | mid2 180 s (ascend, wastes_smart_10010_priority.json); final 166.25 s (kill, wastes_smart_10010_priority.json); final 209.98 s (open, wastes_smart_16016_priority.json) | 0/71 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 60 | 3.36 | 0.87 |
| smart+P | 42 | 3.95 | 0.9 |
| smart+focus+P | 48 | 4.88 | 0.82 |
| smart+dash+P | 10 | 5.32 | 2.28 |
| smart+E | 47 | 3.83 | 0.85 |
| crude | 90 | 3.27 | 1.15 |
| hive (smart family) | 49 | 6.25 | 0.85 |
| depths (smart family) | 99 | 3.05 | 0.82 |
| wastes (smart family) | 59 | 5.52 | 0.9 |

Smart-family deaths under 1.2 s: 7; under 3.0 s: 81. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"bite":10002.9,"acid":1252.1,"shot":10184.1,"ram":813.1}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_focus_20020_priority.json: 0.82 s at 5:12, 50.4/100 HP, {"shot":43.4,"bite":14.8}
- hive_smart_28028_evolve.json: 0.85 s at 10:25, 61.3/100 HP, {"shot":39.6,"acid":19.2,"bite":16}
- depths_smart_27027.json: 0.87 s at 6:42, 57.9/100 HP, {"shot":45.6,"bite":16}
- depths_smart_focus_15015_priority.json: 0.88 s at 9:32, 60.1/100 HP, {"shot":60.7,"bite":16}
- wastes_smart_6006_priority.json: 0.9 s at 9:21, 55.3/100 HP, {"ram":71.4,"bite":16,"acid":3.7}
- depths_smart_4004.json: 0.95 s at 5:41, 56.1/100 HP, {"shot":44.2,"bite":24}
- hive_smart_29029.json: 1.13 s at 5:24, 53.4/100 HP, {"shot":34,"acid":3.9,"bite":22.6}
- depths_smart_1001_priority.json: 1.22 s at 7:16, 52.6/100 HP, {"bite":32,"shot":23.2}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max | Saturated share max (run) |
|---|---|---|---|---|---|
| roam | 90 | 0 | 470 | 260 | 0.341 (hive_roam_19019.json) |
| smart | 90 | 0 | 462 | 251 | 0.346 (hive_smart_19019.json) |
| smart+P | 90 | 0 | 430 | 267 | 0.298 (hive_smart_5005_priority.json) |
| smart+focus+P | 90 | 0 | 474 | 226 | 0.352 (hive_smart_focus_16016_priority.json) |
| smart+dash+P | 90 | 0 | 477 | 269 | 0.328 (hive_smart_dash_3003_priority.json) |
| smart+E | 90 | 0 | 424 | 192 | 0.221 (hive_smart_9009_evolve.json) |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/confirm
```

Raw runs: `/tmp/swg-deaths/confirm` (not kept). The JSON next to this file holds every metric's details.
