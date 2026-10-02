# P19 builds-rows-holdout matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T07:01:31.744Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-rows-holdout --runs=/tmp/swg-builds/rows-holdout --seeds=30 --seed-from=31 --only=A6,A7,A8,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 31..60 per world; A12 Hive 1001 x 31..90; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 4.47 4.77 7.11, swap total = 4096.00M  used = 3264.06M  free = 831.94M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 23.6/25.2/58.5 s (kills 30/29/26), default longest 180 s; depths focus 25/21.8/55.8 s (kills 30/17/12), default longest 207 s; wastes focus 19.9/19.8/37.5 s (kills 30/24/22), default longest 199.1 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 14/30, smart 3/30; depths smart+P 16/30, smart 4/30; wastes smart+P 17/30, smart 2/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 9:30, smart+P 14:00, crude 3:12; depths smart 6:25, smart+P 14:00, crude 2:31; wastes smart 6:46, smart+P 14:00, crude 1:42 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L8/L14/L18 at 3:00/8:00/11:00, gap over 60 s outside fights in 14/30 runs (fights counted: 25); depths L9/L17/L21 at 3:00/8:00/11:00, gap over 60 s outside fights in 2/30 runs (fights counted: 15); wastes L10/L16/L19 at 3:00/8:00/11:00, gap over 60 s outside fights in 7/30 runs (fights counted: 24) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 23.6 s (30 kills, 10.3 to 44.1; 0 deaths) | 25.2 s (29 kills, 7.4 to 52.8; 0 deaths) | 58.5 s (26 kills, 15.8 to 133.7; 0 deaths) | 180 s | mid2 154.51 s (kill, hive_smart_37037_priority.json); final 157.43 s (kill, hive_smart_38038_priority.json); mid2 180 s (ascend, hive_smart_46046_priority.json); final 173.98 s (kill, hive_smart_55055_priority.json); final 160.71 s (kill, hive_smart_57057_priority.json) | 0/79 |
| depths | 25 s (30 kills, 11.3 to 81.1; 0 deaths) | 21.8 s (17 kills, 7.4 to 36.4; 0 deaths) | 55.8 s (12 kills, 21.1 to 156.2; 0 deaths) | 207 s | final 206.96 s (kill, depths_smart_38038_priority.json); final 183.3 s (kill, depths_smart_39039_priority.json); final 155.51 s (kill, depths_smart_48048_priority.json); final 173.55 s (kill, depths_smart_54054_priority.json); final 177.8 s (kill, depths_smart_57057_priority.json) | 0/65 |
| wastes | 19.9 s (30 kills, 9.8 to 37.4; 0 deaths) | 19.8 s (24 kills, 4.7 to 45.2; 0 deaths) | 37.5 s (22 kills, 19.7 to 115.7; 0 deaths) | 199.1 s | final 176.53 s (kill, wastes_smart_31031_priority.json); final 170.45 s (kill, wastes_smart_32032_priority.json); final 199.05 s (kill, wastes_smart_33033_priority.json); mid2 172.18 s (kill, wastes_smart_37037_priority.json); final 197.78 s (open, wastes_smart_37037_priority.json); final 194.68 s (kill, wastes_smart_38038_priority.json); mid2 176.9 s (kill, wastes_smart_39039_priority.json); final 193.07 s (open, wastes_smart_39039_priority.json); final 164.93 s (kill, wastes_smart_42042_priority.json); final 188.58 s (kill, wastes_smart_43043_priority.json); final 189.06 s (kill, wastes_smart_56056_priority.json) | 0/79 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 31..60) --out=/tmp/swg-builds/rows-holdout
```

Raw runs: `/tmp/swg-builds/rows-holdout` (not kept). The JSON next to this file holds every metric's details.
