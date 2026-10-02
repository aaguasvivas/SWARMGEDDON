# P19 c10 matrix

- Commit: `7eaf81b` (src clean); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T20:07:17.898Z
- Command: `node scripts/playtest/matrix.mjs --seeds=10 --worlds=hive,depths,wastes --only=A3,A4,A7,A8,A9 --label=c10 --runs=/tmp/swg-density/c10 --out=/tmp/swg-density/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..10; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 3.21 3.46 3.73, swap total = 6144.00M  used = 5302.62M  free = 841.38M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 465; over row maxAlive 45 (row of the minute: 285); saturated share max 0.339 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 7/9 (minute mean 6/9), depths 9/9 (minute mean 6/9), wastes 9/9 (minute mean 7/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A7 | Win rate (10 seeds per world) | hive smart+P 4/10, smart 2/10; depths smart+P 2/10, smart 0/10; wastes smart+P 1/10, smart 2/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 7:25, smart+P 14:00, crude 2:08; depths smart 6:30, smart+P 8:07, crude 2:07; wastes smart 10:30, smart+P 8:47, crude 1:42 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L9/L16/L19 at 3:00/8:00/11:00, gap over 60 s in 7/10 runs; depths L9/L17/L22.5 at 3:00/8:00/11:00, gap over 60 s in 5/10 runs; wastes L10/L16/L19 at 3:00/8:00/11:00, gap over 60 s in 5/10 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| roam | `roam:SEED:14` | hive, depths, wastes | 30 |
| smart | `smart:SEED:14` | hive, depths, wastes | 30 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 30 |
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
| hive | 17 [16-28] (10); 17 | 29 [24-56] (10); 29 | 51 [40-84] (10); 51 | 44 [40-98] (10); 41 | - cage (0); 42 | 77 [70-147] (7); 64 x | 105 [85-175] (8); 97 | 111 cage (7); 82 | 246 [120-224] x (3); 51 x | 280 [140-252] x (4); 111 x | 281 [170-294] (5); 206 | - cage (0); 51 |
| depths | 16 [14-28] (10); 16 | 24 [20-49] (10); 24 | 35 [30-70] (10); 35 | 37 [30-77] (10); 32 | - cage (0); 36 | 57 [50-119] (7); 46 x | 67 [60-140] (6); 67 | 77 cage (5); 62 | 88 [80-182] (4); 71 x | 122 [90-203] (3); 102 | 121 [110-231] (2); 98 x | - cage (0); 38 |
| wastes | 15 [14-25] (10); 15 | 18 [16-42] (10); 18 | 29 [22-56] (10); 29 | 30 [26-70] (10); 27 | 31 cage (1); 34 | 41 [36-95] (7); 35 x | 55 [44-109] (7); 48 | 77 cage (6); 61 | 73 [58-137] (1); 34 x | 105 [66-151] (3); 84 | 112 [80-175] (3); 89 | - cage (0); 35 |

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 30 | 0 | 465 | 45 | 257 | 0.235 (hive_roam_8008.json) |
| smart | 30 | 0 | 424 | 22 | 145 | 0.199 (hive_smart_4004.json) |
| smart+P | 30 | 0 | 423 | 23 | 226 | 0.26 (hive_smart_5005_priority.json) |
| smart+focus+P | 30 | 0 | 454 | 34 | 285 | 0.339 (hive_smart_focus_3003_priority.json) |
| smart+dash+P | 30 | 0 | 440 | 22 | 197 | 0.307 (hive_smart_dash_3003_priority.json) |
| smart+E | 30 | 0 | 423 | 23 | 226 | 0.215 (hive_smart_3003_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.005 | 0 | 0 | 0 | 0.028 | 0.181 | 0.321 | 0.14 | 0.217 | 0.366 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.016 | 0.023 | 0.008 | 0.028 | 0.053 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0 | 0.038 | 0.086 | 0 | 0.041 | 0.066 | - |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-density/c10
```

Raw runs: `/tmp/swg-density/c10` (not kept). The JSON next to this file holds every metric's details.
