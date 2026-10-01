# P19 bosshp-holdout matrix

- Commit: `56dd2d9` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T18:26:02.903Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --seed-from=31 --only=A6,A7 --label=bosshp-holdout --runs=/tmp/swg-bosshp/holdout --out=/tmp/swg-bosshp/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 31..60 per world; A12 Hive 1001 x 31..60; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 3.6 3.77 3.93, swap total = 6144.00M  used = 5213.62M  free = 930.38M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 24.8/20.6/45.9 s (kills 29/24/21), default longest 206.9 s; depths focus 22.5/17.2/44.8 s (kills 30/18/13), default longest 170.1 s; wastes focus 19.9/20.2/40.6 s (kills 30/27/22), default longest 202.8 s; kill-to-next-arrival min 27.8 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 15/30, smart 6/30; depths smart+P 17/30, smart 5/30; wastes smart+P 14/30, smart 6/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart | `smart:SEED:14` | hive, depths, wastes | 90 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 24.8 s (29 kills, 13.5 to 46.4; 0 deaths) | 20.6 s (24 kills, 4.5 to 61.5; 0 deaths) | 45.9 s (21 kills, 6.1 to 140; 0 deaths) | 206.9 s | final 172.1 s (kill, hive_smart_31031_priority.json); final 155.33 s (kill, hive_smart_33033_priority.json); final 183.28 s (kill, hive_smart_36036_priority.json); final 181.36 s (kill, hive_smart_38038_priority.json); final 163.35 s (kill, hive_smart_48048_priority.json); final 165.91 s (kill, hive_smart_50050_priority.json); final 206.95 s (kill, hive_smart_51051_priority.json); final 186.36 s (kill, hive_smart_53053_priority.json) | 0/79 |
| depths | 22.5 s (30 kills, 8.6 to 39.1; 0 deaths) | 17.2 s (18 kills, 7.4 to 69.3; 0 deaths) | 44.8 s (13 kills, 18.1 to 108.1; 0 deaths) | 170.1 s | final 170.11 s (kill, depths_smart_33033_priority.json); final 159.26 s (kill, depths_smart_38038_priority.json); final 155.96 s (kill, depths_smart_42042_priority.json); final 157.5 s (kill, depths_smart_48048_priority.json); final 158.68 s (kill, depths_smart_57057_priority.json) | 0/70 |
| wastes | 19.9 s (30 kills, 9.8 to 37.4; 0 deaths) | 20.2 s (27 kills, 5 to 52.2; 0 deaths) | 40.6 s (22 kills, 9.7 to 113.2; 0 deaths) | 202.8 s | final 202.8 s (kill, wastes_smart_32032_priority.json); mid2 180 s (ascend, wastes_smart_38038_priority.json); final 172.48 s (kill, wastes_smart_40040_priority.json); final 161.23 s (kill, wastes_smart_47047_priority.json); mid2 152.16 s (kill, wastes_smart_52052_priority.json); final 185.71 s (kill, wastes_smart_52052_priority.json) | 0/77 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-bosshp/holdout
```

Raw runs: `/tmp/swg-bosshp/holdout` (not kept). The JSON next to this file holds every metric's details.
