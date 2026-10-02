# P19 builds-after-holdout matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T06:52:38.130Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-after-holdout --runs=/tmp/swg-builds/after-holdout --seeds=30 --seed-from=31 --only=A6,A7,A8,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 31..60 per world; A12 Hive 1001 x 31..90; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 2.7 6.34 9.57, swap total = 4096.00M  used = 3326.88M  free = 769.12M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.7/25.7/59 s (kills 30/29/24), default longest 180 s; depths focus 21.9/20.4/55.1 s (kills 30/17/12), default longest 172.7 s; wastes focus 21/20.8/53.5 s (kills 30/24/24), default longest 194.2 s; kill-to-next-arrival min 29.8 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 17/30, smart 6/30; depths smart+P 17/30, smart 6/30; wastes smart+P 18/30, smart 4/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 9:47, smart+P 14:00, crude 3:12; depths smart 6:48, smart+P 14:00, crude 2:59; wastes smart 7:16, smart+P 14:00, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L18/L21.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 5/30 runs (fights counted: 25); depths L10/L19/L24 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 16); wastes L10/L19/L23 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/30 runs (fights counted: 20) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 25.7 s (30 kills, 9.3 to 60.6; 0 deaths) | 25.7 s (29 kills, 3.5 to 108.3; 0 deaths) | 59 s (24 kills, 6.3 to 106.7; 0 deaths) | 180 s | final 171.58 s (kill, hive_smart_31031_priority.json); final 156.03 s (kill, hive_smart_32032_priority.json); mid2 180 s (ascend, hive_smart_37037_priority.json); final 174.4 s (kill, hive_smart_39039_priority.json); mid2 150.18 s (kill, hive_smart_50050_priority.json); final 166.01 s (kill, hive_smart_50050_priority.json); final 151.65 s (kill, hive_smart_52052_priority.json) | 0/83 |
| depths | 21.9 s (30 kills, 11.2 to 39.5; 0 deaths) | 20.4 s (17 kills, 10.2 to 54.2; 0 deaths) | 55.1 s (12 kills, 28.9 to 88.7; 0 deaths) | 172.7 s | final 171.38 s (kill, depths_smart_38038_priority.json); final 155.88 s (kill, depths_smart_45045_priority.json); final 156.88 s (kill, depths_smart_48048_priority.json); final 172.66 s (kill, depths_smart_52052_priority.json) | 0/68 |
| wastes | 21 s (30 kills, 7.2 to 41.7; 0 deaths) | 20.8 s (24 kills, 4.3 to 82.2; 0 deaths) | 53.5 s (24 kills, 22.8 to 133.3; 0 deaths) | 194.2 s | final 161.01 s (kill, wastes_smart_31031_priority.json); final 191.28 s (kill, wastes_smart_32032_priority.json); final 174.58 s (kill, wastes_smart_35035_priority.json); final 187.91 s (kill, wastes_smart_37037_priority.json); final 194.18 s (kill, wastes_smart_38038_priority.json); final 156.81 s (kill, wastes_smart_42042_priority.json); final 185.08 s (kill, wastes_smart_48048_priority.json); final 170.73 s (kill, wastes_smart_54054_priority.json); final 166.35 s (kill, wastes_smart_57057_priority.json) | 0/77 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/after-holdout
```

Raw runs: `/tmp/swg-builds/after-holdout` (not kept). The JSON next to this file holds every metric's details.
