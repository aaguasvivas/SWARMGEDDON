# P19 builds-c10 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T04:29:05.354Z
- Command: `node scripts/playtest/matrix.mjs --seeds=10 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=builds-c10 --runs=/tmp/swg-builds/c10` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 4.16 8.39 14.69, swap total = 4096.00M  used = 3262.31M  free = 833.69M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 518; over row maxAlive 68 (row of the minute: 314); saturated share max 0.29 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 7/9 (minute mean 7/9), depths 9/9 (minute mean 5/9), wastes 9/9 (minute mean 6/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A5 | Boss arrival (smart+P and focus fights) | 128 arrivals (1 PRIME ascends, placed where the mid boss was), 295 to 305 u, cage active and inside 128/128, in arena 128/128 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 27.8/23.3/57.7 s (kills 10/10/9), default longest 197.3 s; depths focus 23.7/27.8/97.3 s (kills 10/2/1), default longest 205.2 s; wastes focus 28.2/20.2/60.2 s (kills 10/7/5), default longest 191.3 s; kill-to-next-arrival min 55.4 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 5/10, smart 1/10; depths smart+P 2/10, smart 1/10; wastes smart+P 4/10, smart 1/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 14:00, smart+P 14:00, crude 2:10; depths smart 7:38, smart+P 6:46, crude 2:13; wastes smart 6:31, smart+P 11:50, crude 1:42 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L16/L18 at 3:00/8:00/11:00, gap over 60 s outside fights in 3/10 runs (fights counted: 8); depths L9.5/L17.5/L21.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 6); wastes L10/L16/L19 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/10 runs (fights counted: 5) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 63 deaths, median 3.7 s, min 0.88 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A18 | Build systems (dash = smart+dash+P vs smart+P minutes alive per death; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash Infinityx per death (deaths 0/10 vs 3/10; mean 1.18x, ceiling 1.18x), cc 1.58/min, fusion by 4:00 21/30, evolve 4/6, XP min 0.972 (whole run 0.907); depths dash 8.49x per death (deaths 1/10 vs 6/10; mean 1.41x, ceiling 1.49x), cc 1.58/min, fusion by 4:00 27/30, evolve 6/6, XP min 0.913 (whole run 0.928); wastes dash Infinityx per death (deaths 0/10 vs 5/10; mean 1.33x, ceiling 1.33x), cc 2.29/min, fusion by 4:00 27/30, evolve 7/8, XP min 0.893 (whole run 0.903) | dash >= 1.25x minutes alive per death; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| roam | `roam:SEED:14` | hive, depths, wastes | 30 |
| smart | `smart:SEED:14` | hive, depths, wastes | 30 |
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart+dash+P | `smart+dash:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart+E | `smart:SEED:14:nova:evolve` | hive, depths, wastes | 30 |
| crude | `crude:SEED:14` | hive, depths, wastes | 30 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A4 median alive per minute (smart+P)

Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median free-field alive [target band], x outside it, (n) runs alive through the minute with 10 s or more of free field; then the median over every step of the minute (cage and lull steps included).

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 17 [16-28] (10); 17 | 29 [24-56] (10); 29 | 48 [40-84] (10); 48 | 45 [40-98] (10); 41 | - cage (0); 42 | 86 [70-175] (8); 73 | 93 [85-231] (8); 93 | 103 cage (7); 87 | 291 [120-280] x (2); 55 x | 169 [140-308] (6); 128 x | 320 [170-315] x (5); 266 | - cage (0); 102 |
| depths | 16 [14-28] (10); 16 | 24 [20-49] (10); 24 | 35 [30-70] (10); 35 | 37 [30-77] (10); 32 | 44 cage (1); 36 | 58 [50-119] (8); 47 x | 68 [60-140] (4); 68 | 77 cage (4); 61 | 88 [80-182] (2); 45 x | 98 [90-203] (4); 85 x | 128 [110-231] (4); 93 x | - cage (0); 37 |
| wastes | 15 [14-25] (10); 15 | 18 [16-42] (10); 18 | 29 [22-56] (10); 29 | 30 [26-70] (10); 27 | 31 cage (1); 34 | 41 [36-95] (7); 36 x | 59 [44-109] (7); 59 | 63 cage (6); 51 | 67 [58-137] (3); 42 x | 104 [66-151] (3); 69 | 95 [80-175] (5); 70 x | - cage (0); 33 |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 27.8 s (10 kills, 16.7 to 47.3; 0 deaths) | 23.3 s (10 kills, 11.5 to 50.1; 0 deaths) | 57.7 s (9 kills, 12 to 123.5; 0 deaths) | 197.3 s | final 150.78 s (kill, hive_smart_3003_priority.json); final 156.48 s (kill, hive_smart_5005_priority.json); final 197.35 s (kill, hive_smart_9009_priority.json); mid2 180 s (ascend, hive_smart_10010_priority.json) | 0/24 |
| depths | 23.7 s (10 kills, 16.6 to 38; 0 deaths) | 27.8 s (2 kills, 20.8 to 34.8; 0 deaths) | 97.3 s (1 kills, 97.3 to 97.3; 0 deaths) | 205.2 s | final 205.23 s (kill, depths_smart_9009_priority.json) | 0/18 |
| wastes | 28.2 s (10 kills, 17.4 to 37.9; 0 deaths) | 20.2 s (7 kills, 8.4 to 27.9; 1 deaths) | 60.2 s (5 kills, 23.8 to 80.5; 0 deaths) | 191.3 s | final 156.33 s (kill, wastes_smart_3003_priority.json); final 180.95 s (kill, wastes_smart_5005_priority.json); final 191.3 s (kill, wastes_smart_10010_priority.json) | 0/21 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 19 | 4.07 | 0.88 |
| smart+P | 14 | 2.68 | 1.43 |
| smart+focus+P | 15 | 5.23 | 1.22 |
| smart+dash+P | 1 | 30.37 | 30.37 |
| smart+E | 14 | 2.76 | 1.33 |
| crude | 30 | 3.22 | 1.35 |
| hive (smart family) | 11 | 2.77 | 1.18 |
| depths (smart family) | 31 | 3.78 | 0.88 |
| wastes (smart family) | 21 | 5.42 | 1.13 |

Smart-family deaths under 1.2 s: 4; under 3.0 s: 26. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"bite":2795.7,"shot":3379,"acid":318.3,"ram":194}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_2002.json: 0.88 s at 6:33, 82.1/150 HP, {"bite":36,"shot":65.6}
- depths_smart_7007.json: 1.12 s at 3:58, 50.5/100 HP, {"shot":41.7,"bite":24}
- wastes_smart_8008.json: 1.13 s at 8:47, 40/75 HP, {"bite":12,"acid":17.6,"shot":27}
- hive_smart_2002.json: 1.18 s at 8:54, 73.3/125 HP, {"shot":37.9,"acid":13,"bite":30}
- wastes_smart_focus_10010_priority.json: 1.22 s at 6:46, 52.3/100 HP, {"shot":14,"acid":4.7,"bite":8,"ram":33}
- depths_smart_8008_evolve.json: 1.33 s at 9:31, 65.6/125 HP, {"shot":60.7,"bite":20}
- wastes_smart_6006_priority.json: 1.43 s at 9:40, 51.1/100 HP, {"bite":20.4,"ram":61.3}
- hive_smart_2002_priority.json: 1.57 s at 7:20, 95/175 HP, {"bite":47.3,"shot":30.7,"acid":17.3}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 30 | 0 | 475 | 25 | 282 | 0.198 (wastes_roam_1001.json) |
| smart | 30 | 0 | 454 | 6 | 267 | 0.105 (depths_smart_1001.json) |
| smart+P | 30 | 0 | 510 | 60 | 290 | 0.22 (hive_smart_3003_priority.json) |
| smart+focus+P | 30 | 0 | 487 | 37 | 314 | 0.29 (wastes_smart_focus_3003_priority.json) |
| smart+dash+P | 30 | 0 | 518 | 68 | 244 | 0.134 (depths_smart_dash_3003_priority.json) |
| smart+E | 30 | 0 | 510 | 60 | 290 | 0.22 (hive_smart_3003_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.005 | 0 | 0 | 0 | 0.013 | 0.017 | 0.066 | 0.003 | 0.084 | 0.332 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.024 | 0.08 | 0.012 | 0.025 | 0.048 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.039 | 0.087 | 0.03 | 0.036 | 0.07 | - |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/c10
```

Raw runs: `/tmp/swg-builds/c10` (not kept). The JSON next to this file holds every metric's details.
