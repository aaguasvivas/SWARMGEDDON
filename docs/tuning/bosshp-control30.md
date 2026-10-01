# P19 bosshp-control30 matrix

- Commit: `56dd2d9` (src clean); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T12:47:19.681Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --only=A5,A6,A7,A8 --label=bosshp-control30 --runs=/tmp/swg-bosshp/control --out=/tmp/swg-bosshp/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 3.64 3.31 3.71, swap total = 6144.00M  used = 5203.94M  free = 940.06M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A5 | Boss arrival (smart+P and focus fights) | 388 arrivals, 287 to 306 u, cage active and inside 388/388, in arena 388/388 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 23.6/18.5/19.7 s (kills 30/23/19), default longest 173.5 s; depths focus 21.8/17.9/26.9 s (kills 28/14/10), default longest 101.6 s; wastes focus 27.3/26/31.6 s (kills 30/23/13), default longest 210 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 23/30, smart 12/30; depths smart+P 7/30, smart 4/30; wastes smart+P 17/30, smart 11/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 9:35, smart+P 14:00, crude 2:08; depths smart 6:46, smart+P 8:25, crude 2:10; wastes smart 10:16, smart+P 14:00, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart | `smart:SEED:14` | hive, depths, wastes | 90 |
| crude | `crude:SEED:14` | hive, depths, wastes | 90 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 23.6 s (30 kills, 10.4 to 57.1; 0 deaths) | 18.5 s (23 kills, 6.5 to 68.5; 0 deaths) | 19.7 s (19 kills, 8.2 to 53.3; 0 deaths) | 173.5 s | final 170.81 s (kill, hive_smart_14014_priority.json); mid2 173.51 s (kill, hive_smart_20020_priority.json); final 165.33 s (kill, hive_smart_20020_priority.json) | 0/76 |
| depths | 21.8 s (28 kills, 10.9 to 38; 0 deaths) | 17.9 s (14 kills, 3.9 to 35.6; 0 deaths) | 26.9 s (10 kills, 5.5 to 55; 0 deaths) | 101.6 s | none | 0/51 |
| wastes | 27.3 s (30 kills, 12.8 to 41.1; 0 deaths) | 26 s (23 kills, 5.4 to 75.4; 0 deaths) | 31.6 s (13 kills, 5 to 60.1; 0 deaths) | 210 s | mid2 180 s (ascend, wastes_smart_10010_priority.json); final 166.25 s (kill, wastes_smart_10010_priority.json); final 209.98 s (open, wastes_smart_16016_priority.json) | 0/71 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/control
```

Raw runs: `/tmp/swg-bosshp/control` (not kept). The JSON next to this file holds every metric's details.
