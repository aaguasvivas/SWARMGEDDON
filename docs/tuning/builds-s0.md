# P19 builds-s0 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T04:45:25.740Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s0 --runs=/tmp/swg-builds/s0 --seeds=10 --only=A6,A7,A8,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 10.84 6.99 8.66, swap total = 4096.00M  used = 3202.88M  free = 893.12M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.4/29/48.4 s (kills 9/7/6), default longest 192.2 s; depths focus 26.6/23.6/133.1 s (kills 10/5/2), default longest 83.9 s; wastes focus 28.2/20.2/60.2 s (kills 10/7/5), default longest 191.3 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 5/10, smart 0/10; depths smart+P 1/10, smart 1/10; wastes smart+P 4/10, smart 1/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 8:25, smart+P 14:00, crude 3:14; depths smart 7:37, smart+P 6:25, crude 3:20; wastes smart 6:31, smart+P 11:50, crude 1:42 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L17/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 3/10 runs (fights counted: 7); depths L9/L17/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 3); wastes L10/L16/L19 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/10 runs (fights counted: 5) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart | `smart:SEED:14` | hive, depths, wastes | 30 |
| crude | `crude:SEED:14` | hive, depths, wastes | 30 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 25.4 s (9 kills, 13.4 to 39.4; 0 deaths) | 29 s (7 kills, 10.3 to 43.2; 0 deaths) | 48.4 s (6 kills, 15.1 to 112.4; 0 deaths) | 192.2 s | mid2 177.78 s (kill, hive_smart_6006_priority.json); final 192.18 s (open, hive_smart_6006_priority.json) | 0/23 |
| depths | 26.6 s (10 kills, 18.1 to 37.3; 0 deaths) | 23.6 s (5 kills, 10.7 to 41.2; 0 deaths) | 133.1 s (2 kills, 129.5 to 136.7; 0 deaths) | 83.9 s | none | 0/15 |
| wastes | 28.2 s (10 kills, 17.4 to 37.9; 0 deaths) | 20.2 s (7 kills, 8.4 to 27.9; 1 deaths) | 60.2 s (5 kills, 23.8 to 80.5; 0 deaths) | 191.3 s | final 156.33 s (kill, wastes_smart_3003_priority.json); final 180.95 s (kill, wastes_smart_5005_priority.json); final 191.3 s (kill, wastes_smart_10010_priority.json) | 0/21 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s0
```

Raw runs: `/tmp/swg-builds/s0` (not kept). The JSON next to this file holds every metric's details.
