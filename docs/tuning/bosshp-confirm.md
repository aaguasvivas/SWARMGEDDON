# P19 bosshp-confirm matrix

- Commit: `56dd2d9` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T18:08:23.238Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=bosshp-confirm --runs=/tmp/swg-bosshp/confirm2 --out=/tmp/swg-bosshp/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 4.36 3.76 3.91, swap total = 6144.00M  used = 5105.75M  free = 1038.25M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 465; over row maxAlive 285; saturated share max 0.343 | beats on time or per deferral; alive <= row.maxAlive + 160 and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median alive per minute vs the A7.2 Target alive) | hive 6/9, depths 6/9, wastes 7/9 | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | FAIL |
| A5 | Boss arrival (smart+P and focus fights) | 399 arrivals, 294 to 305 u, cage active and inside 399/399, in arena 399/399 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 26.6/26.7/60.6 s (kills 30/24/20), default longest 176.4 s; depths focus 24/22/64.2 s (kills 28/17/10), default longest 202.2 s; wastes focus 25.1/23.3/59.2 s (kills 30/22/16), default longest 195.8 s; kill-to-next-arrival min 20.1 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 13/30, smart 7/30; depths smart+P 9/30, smart 0/30; wastes smart+P 12/30, smart 6/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 9:18, smart+P 14:00, crude 2:08; depths smart 6:50, smart+P 9:19, crude 2:10; wastes smart 8:51, smart+P 14:00, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L8/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 23/30 runs; depths L9/L17/L22 at 3:00/8:00/11:00, gap over 60 s in 14/30 runs; wastes L10/L17/L20 at 3:00/8:00/11:00, gap over 60 s in 19/30 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 205 deaths, median 3.88 s, min 0.82 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam whole-run) | hive dash 1.12x, cc 1.72/min, fusion by 4:00 62/90, evolve 13/21, XP min 0.865; depths dash 1.31x, cc 1.35/min, fusion by 4:00 64/86, evolve 16/18, XP min 0.885; wastes dash 1.26x, cc 2.28/min, fusion by 4:00 66/90, evolve 22/25, XP min 0.833 | dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

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
| hive | 17 [16-28] (30) | 29 [24-56] (30) | 51 [40-84] (30) | 41 [40-98] (30) | 43 cage (30) | 62 [70-147] x (29) | 102 [85-175] (27) | 107 cage (26) | 60 [120-224] x (24) | 134 [140-252] x (23) | 240 [170-294] (21) | 49 cage (15) |
| depths | 16 [14-28] (30) | 24 [20-49] (30) | 35 [30-70] (29) | 32 [30-77] (28) | 36 cage (28) | 50 [50-119] (26) | 67 [60-140] (21) | 62 cage (19) | 66 [80-182] x (17) | 87 [90-203] x (13) | 94 [110-231] x (8) | 37 cage (5) |
| wastes | 15 [14-25] (30) | 18 [16-42] (30) | 28 [22-56] (30) | 26 [26-70] (30) | 34 cage (30) | 34 [36-95] x (28) | 50 [44-109] (23) | 46 cage (22) | 42 [58-137] x (20) | 67 [66-151] (17) | 81 [80-175] (14) | 35 cage (13) |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 26.6 s (30 kills, 11.8 to 56.6; 0 deaths) | 26.7 s (24 kills, 7.6 to 80.6; 0 deaths) | 60.6 s (20 kills, 21.6 to 110.1; 0 deaths) | 176.4 s | mid2 159.9 s (kill, hive_smart_9009_priority.json); final 150.86 s (kill, hive_smart_21021_priority.json); final 176.38 s (kill, hive_smart_28028_priority.json) | 0/77 |
| depths | 24 s (28 kills, 11.8 to 42; 0 deaths) | 22 s (17 kills, 10 to 56.9; 0 deaths) | 64.2 s (10 kills, 31.1 to 95.3; 0 deaths) | 202.2 s | final 183.91 s (kill, depths_smart_4004_priority.json); mid1 159.47 s (kill, depths_smart_6006_priority.json); final 202.16 s (kill, depths_smart_10010_priority.json); final 164.46 s (kill, depths_smart_25025_priority.json); final 177.96 s (kill, depths_smart_30030_priority.json) | 0/56 |
| wastes | 25.1 s (30 kills, 11.3 to 39.2; 0 deaths) | 23.3 s (22 kills, 4.6 to 136.4; 1 deaths) | 59.2 s (16 kills, 12.1 to 119.6; 0 deaths) | 195.8 s | final 166.75 s (kill, wastes_smart_9009_priority.json); final 195.81 s (kill, wastes_smart_14014_priority.json); final 181.5 s (kill, wastes_smart_19019_priority.json); final 178.15 s (kill, wastes_smart_21021_priority.json); final 163.58 s (kill, wastes_smart_26026_priority.json); final 162.98 s (kill, wastes_smart_30030_priority.json) | 0/68 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 66 | 4.08 | 0.87 |
| smart+P | 44 | 4.72 | 0.88 |
| smart+focus+P | 44 | 3.13 | 1 |
| smart+dash+P | 9 | 8.6 | 1.03 |
| smart+E | 42 | 3.52 | 0.82 |
| crude | 90 | 3.27 | 1.15 |
| hive (smart family) | 52 | 3.09 | 0.97 |
| depths (smart family) | 96 | 3.22 | 0.82 |
| wastes (smart family) | 57 | 5.58 | 1.22 |

Smart-family deaths under 1.2 s: 8; under 3.0 s: 80. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"bite":9972.7,"shot":11673.6,"acid":1058.4,"ram":412}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_13013_evolve.json: 0.82 s at 5:49, 53.8/100 HP, {"bite":24,"shot":32}
- depths_smart_30030.json: 0.87 s at 9:19, 71.4/125 HP, {"bite":30,"shot":60.4}
- depths_smart_17017_priority.json: 0.88 s at 9:18, 88.1/175 HP, {"bite":42,"shot":60.3}
- hive_smart_2002.json: 0.97 s at 5:56, 56/100 HP, {"bite":24,"shot":34.6,"acid":15.2}
- depths_smart_focus_8008_priority.json: 1 s at 6:28, 65.8/100 HP, {"shot":55.4,"bite":23}
- depths_smart_24024_evolve.json: 1.02 s at 5:23, 71.8/125 HP, {"shot":53.4,"bite":26.5}
- depths_smart_dash_20020_priority.json: 1.03 s at 6:32, 69/100 HP, {"shot":55.4,"bite":16}
- hive_smart_8008.json: 1.13 s at 9:18, 40.5/75 HP, {"bite":18,"acid":16.4,"shot":38.4}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max | Saturated share max (run) |
|---|---|---|---|---|---|
| roam | 90 | 0 | 465 | 257 | 0.343 (hive_roam_14014.json) |
| smart | 90 | 0 | 433 | 204 | 0.231 (hive_smart_19019.json) |
| smart+P | 90 | 0 | 447 | 226 | 0.26 (hive_smart_5005_priority.json) |
| smart+focus+P | 90 | 0 | 457 | 285 | 0.341 (hive_smart_focus_30030_priority.json) |
| smart+dash+P | 90 | 0 | 440 | 197 | 0.307 (hive_smart_dash_3003_priority.json) |
| smart+E | 90 | 0 | 447 | 226 | 0.227 (hive_smart_16016_evolve.json) |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
```

Raw runs: `/tmp/swg-bosshp/confirm2` (not kept). The JSON next to this file holds every metric's details.
