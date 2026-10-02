# P19 builds-x1-holdout matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T07:47:18.531Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-x1-holdout --runs=/tmp/swg-builds/x1-holdout --seeds=30 --seed-from=31 --only=A6,A7,A8,A9,A10` (dev server at http://localhost:5176)
- Seeds: 1001 x 31..60 per world; A12 Hive 1001 x 31..90; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 4.78 3.91 4.13, swap total = 4096.00M  used = 3416.06M  free = 679.94M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.1/27.5/65.9 s (kills 29/28/24), default longest 209.3 s; depths focus 21.1/21/51.7 s (kills 30/19/15), default longest 181.9 s; wastes focus 19.9/19.8/37.5 s (kills 30/24/22), default longest 199.1 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 9/30, smart 3/30; depths smart+P 10/30, smart 8/30; wastes smart+P 17/30, smart 2/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 9:17, smart+P 14:00, crude 3:12; depths smart 6:35, smart+P 7:46, crude 2:31; wastes smart 6:46, smart+P 14:00, crude 1:42 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L15/L18 at 3:00/8:00/11:00, gap over 60 s outside fights in 10/30 runs (fights counted: 23); depths L10/L17/L21 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/30 runs (fights counted: 14); wastes L10/L16/L19 at 3:00/8:00/11:00, gap over 60 s outside fights in 7/30 runs (fights counted: 24) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 186 deaths, median 3.65 s, min 0.82 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart | `smart:SEED:14` | hive, depths, wastes | 90 |
| crude | `crude:SEED:14` | hive, depths, wastes | 90 |
| smart+dash+P | `smart+dash:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+E | `smart:SEED:14:nova:evolve` | hive, depths, wastes | 90 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 25.1 s (29 kills, 8.5 to 66.3; 0 deaths) | 27.5 s (28 kills, 7.7 to 69.8; 0 deaths) | 65.9 s (24 kills, 10.5 to 109.5; 0 deaths) | 209.3 s | final 209.33 s (kill, hive_smart_32032_priority.json); mid2 175.48 s (kill, hive_smart_37037_priority.json); final 194.48 s (open, hive_smart_37037_priority.json); final 198.7 s (kill, hive_smart_41041_priority.json); final 162.2 s (kill, hive_smart_45045_priority.json); mid2 152.86 s (kill, hive_smart_50050_priority.json); final 168.81 s (kill, hive_smart_55055_priority.json); final 166.4 s (kill, hive_smart_57057_priority.json) | 0/73 |
| depths | 21.1 s (30 kills, 8.9 to 56.5; 0 deaths) | 21 s (19 kills, 8.4 to 34.4; 0 deaths) | 51.7 s (15 kills, 10.7 to 90.3; 0 deaths) | 181.9 s | final 181.95 s (kill, depths_smart_44044_priority.json) | 0/56 |
| wastes | 19.9 s (30 kills, 9.8 to 37.4; 0 deaths) | 19.8 s (24 kills, 4.7 to 45.2; 0 deaths) | 37.5 s (22 kills, 19.7 to 115.7; 0 deaths) | 199.1 s | final 176.53 s (kill, wastes_smart_31031_priority.json); final 170.45 s (kill, wastes_smart_32032_priority.json); final 199.05 s (kill, wastes_smart_33033_priority.json); mid2 172.18 s (kill, wastes_smart_37037_priority.json); final 197.78 s (open, wastes_smart_37037_priority.json); final 194.68 s (kill, wastes_smart_38038_priority.json); mid2 176.9 s (kill, wastes_smart_39039_priority.json); final 193.07 s (open, wastes_smart_39039_priority.json); final 164.93 s (kill, wastes_smart_42042_priority.json); final 188.58 s (kill, wastes_smart_43043_priority.json); final 189.06 s (kill, wastes_smart_56056_priority.json) | 0/79 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 67 | 4.22 | 1.02 |
| smart+P | 37 | 3.35 | 0.82 |
| smart+focus+P | 29 | 4.05 | 1.68 |
| smart+dash+P | 10 | 4.72 | 1.52 |
| smart+E | 43 | 3.2 | 0.95 |
| crude | 90 | 3.78 | 1.22 |
| hive (smart family) | 48 | 3.31 | 1.53 |
| depths (smart family) | 81 | 3.07 | 0.82 |
| wastes (smart family) | 57 | 8.1 | 0.95 |

Smart-family deaths under 1.2 s: 5; under 3.0 s: 73. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"acid":1292.5,"shot":9940.3,"bite":8283.6,"ram":422.4}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_46046_priority.json: 0.82 s at 6:45, 56.4/100 HP, {"bite":24,"shot":33}
- wastes_smart_47047_evolve.json: 0.95 s at 10:20, 62.2/100 HP, {"shot":56.5,"acid":6.4}
- wastes_smart_44044.json: 1.02 s at 7:00, 66.5/75 HP, {"ram":33.3,"bite":12,"shot":25.6,"acid":1.7}
- depths_smart_59059.json: 1.1 s at 8:57, 40.7/75 HP, {"shot":24.4,"bite":18}
- depths_smart_38038_evolve.json: 1.1 s at 10:10, 79.7/125 HP, {"shot":61.9,"bite":30}
- depths_smart_42042.json: 1.25 s at 5:58, 54.8/100 HP, {"shot":44.6,"bite":24}
- depths_smart_34034_priority.json: 1.4 s at 6:27, 66.4/100 HP, {"shot":55.3,"bite":23}
- depths_smart_45045_priority.json: 1.4 s at 7:10, 50.2/100 HP, {"bite":27.2,"shot":39.3}

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 31..60) --out=/tmp/swg-builds/x1-holdout
```

Raw runs: `/tmp/swg-builds/x1-holdout` (not kept). The JSON next to this file holds every metric's details.
