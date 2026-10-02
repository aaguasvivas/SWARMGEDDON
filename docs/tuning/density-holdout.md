# P19 density-holdout matrix

- Commit: `7eaf81b` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T23:51:26.948Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --seed-from=31 --only=A6,A7,A8 --label=density-holdout --runs=/tmp/swg-density/holdout --out=/tmp/swg-density/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 31..60 per world; A12 Hive 1001 x 31..60; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 3.46 3.61 3.49, swap total = 6656.00M  used = 5521.94M  free = 1134.06M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 26.3/30.8/61.5 s (kills 29/26/24), default longest 199 s; depths focus 22.7/24.9/58.6 s (kills 30/14/11), default longest 188.3 s; wastes focus 19.9/18.5/46 s (kills 30/26/21), default longest 200.3 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 11/30, smart 7/30; depths smart+P 14/30, smart 7/30; wastes smart+P 15/30, smart 3/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 11:48, smart+P 14:00, crude 2:08; depths smart 8:02, smart+P 11:48, crude 2:10; wastes smart 6:49, smart+P 14:00, crude 1:42 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart | `smart:SEED:14` | hive, depths, wastes | 90 |
| crude | `crude:SEED:14` | hive, depths, wastes | 90 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 26.3 s (29 kills, 11 to 59.4; 0 deaths) | 30.8 s (26 kills, 6.8 to 55.1; 0 deaths) | 61.5 s (24 kills, 7.8 to 208.3; 0 deaths) | 199 s | mid2 180 s (ascend, hive_smart_42042_priority.json); final 191.03 s (kill, hive_smart_52052_priority.json); mid2 156.95 s (kill, hive_smart_53053_priority.json); mid1 199.02 s (kill, hive_smart_54054_priority.json) | 0/78 |
| depths | 22.7 s (30 kills, 8.6 to 39.1; 0 deaths) | 24.9 s (14 kills, 7.6 to 43.7; 0 deaths) | 58.6 s (11 kills, 10.5 to 114.3; 0 deaths) | 188.3 s | final 176.65 s (kill, depths_smart_31031_priority.json); final 188.28 s (kill, depths_smart_42042_priority.json); final 185.71 s (kill, depths_smart_45045_priority.json); final 153.9 s (kill, depths_smart_52052_priority.json) | 0/63 |
| wastes | 19.9 s (30 kills, 9.8 to 37.4; 0 deaths) | 18.5 s (26 kills, 4.7 to 45.2; 0 deaths) | 46 s (21 kills, 15.9 to 122.3; 0 deaths) | 200.3 s | final 176.15 s (kill, wastes_smart_32032_priority.json); mid2 169.63 s (kill, wastes_smart_39039_priority.json); final 200.33 s (open, wastes_smart_39039_priority.json); mid2 163.65 s (kill, wastes_smart_42042_priority.json); final 179.42 s (kill, wastes_smart_42042_priority.json); mid2 157.56 s (kill, wastes_smart_52052_priority.json); final 196.65 s (kill, wastes_smart_54054_priority.json) | 0/76 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-density/holdout
```

Raw runs: `/tmp/swg-density/holdout` (not kept). The JSON next to this file holds every metric's details.
