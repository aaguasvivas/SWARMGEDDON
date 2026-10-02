# P19 k1 matrix

- Commit: `7eaf81b` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T21:08:11.585Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --worlds=hive,depths,wastes --only=A2,A3,A4,A7,A8,A9,A18 --label=k1 --runs=/tmp/swg-density/k1 --out=/tmp/swg-density/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 5.05 3.95 3.82, swap total = 6144.00M  used = 5377.31M  free = 766.69M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 534; over row maxAlive 84 (row of the minute: 311); saturated share max 0.292 | beats on time or per deferral; alive <= row.maxAlive + 160 (inside a cage, the row in force when it rose) and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median free-field alive per minute vs the A7.2 Target alive; free field = steps with no cage and no lull) | hive 9/9 (minute mean 5/9), depths 9/9 (minute mean 6/9), wastes 9/9 (minute mean 5/9) | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | PASS |
| A7 | Win rate (30 seeds per world) | hive smart+P 18/30, smart 7/30; depths smart+P 13/30, smart 3/30; wastes smart+P 16/30, smart 5/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 14:00, smart+P 14:00, crude 2:09; depths smart 7:09, smart+P 9:29, crude 2:11; wastes smart 12:04, smart+P 14:00, crude 1:44 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L9/L20/L25 at 3:00/8:00/11:00, gap over 60 s in 21/30 runs; depths L11/L20.5/L24 at 3:00/8:00/11:00, gap over 60 s in 9/30 runs; wastes L11/L20.5/L26.5 at 3:00/8:00/11:00, gap over 60 s in 9/30 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |
| A18 | Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam, up to the PRIME kill) | hive dash 1.13x, cc 1.67/min, fusion by 4:00 65/86, evolve 22/28, XP min 0.933 (whole run 0.933); depths dash 1.27x, cc 1.41/min, fusion by 4:00 73/90, evolve 16/20, XP min 0.892 (whole run 0.849); wastes dash 1.24x, cc 2.3/min, fusion by 4:00 73/86, evolve 23/27, XP min 0.885 (whole run 0.891) | dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

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
| hive | 17 [16-28] (30); 17 | 29 [24-56] (30); 29 | 50 [40-84] (29); 50 | 47 [40-98] (28); 41 | 61 cage (7); 44 | 81 [70-147] (22); 66 x | 90 [85-175] (26); 90 | 104 cage (26); 86 | 124 [120-224] (11); 59 x | 143 [140-252] (18); 119 x | 176 [170-294] (22); 131 x | - cage (0); 50 |
| depths | 16 [14-28] (30); 16 | 24 [20-49] (30); 24 | 35 [30-70] (30); 35 | 36 [30-77] (30); 31 | 46 cage (3); 36 | 59 [50-119] (24); 52 | 66 [60-140] (23); 66 | 77 cage (22); 59 | 87 [80-182] (12); 62 x | 98 [90-203] (11); 80 x | 123 [110-231] (12); 92 x | - cage (0); 37 |
| wastes | 15 [14-25] (30); 15 | 18 [16-42] (30); 18 | 30 [22-56] (29); 30 | 31 [26-70] (28); 28 | 35 cage (3); 34 | 42 [36-95] (21); 36 x | 63 [44-109] (22); 61 | 81 cage (22); 59 | 64 [58-137] (14); 46 x | 79 [66-151] (16); 63 x | 98 [80-175] (14); 74 x | - cage (0); 35 |

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max (cage row) | Over row max (row of the minute) | Saturated share max (run) |
|---|---|---|---|---|---|---|
| roam | 90 | 0 | 534 | 84 | 280 | 0.292 (wastes_roam_11011.json) |
| smart | 90 | 0 | 500 | 50 | 258 | 0.211 (hive_smart_8008.json) |
| smart+P | 90 | 0 | 452 | 15 | 215 | 0.121 (wastes_smart_18018_priority.json) |
| smart+focus+P | 90 | 0 | 474 | 24 | 311 | 0.227 (hive_smart_focus_3003_priority.json) |
| smart+dash+P | 90 | 0 | 466 | 16 | 268 | 0.141 (wastes_smart_dash_3003_priority.json) |
| smart+E | 90 | 0 | 413 | 15 | 36 | 0.059 (wastes_smart_24024_evolve.json) |

Saturated share per minute row, all A3 runs of the world summed (steps outside a cage and an event window at 95%+ of maxAlive):

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 0 | 0.001 | 0 | 0 | 0 | 0.006 | 0.018 | 0.039 | 0.006 | 0.03 | 0.046 | - |
| depths | 0 | 0 | 0 | 0 | 0 | 0 | 0.015 | 0.019 | 0 | 0.013 | 0.019 | - |
| wastes | 0 | 0 | 0 | 0 | 0 | 0.002 | 0.061 | 0.097 | 0 | 0.04 | 0.054 | - |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-density/k1
```

Raw runs: `/tmp/swg-density/k1` (not kept). The JSON next to this file holds every metric's details.
