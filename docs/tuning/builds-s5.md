# P19 builds-s5 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T05:01:48.029Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s5 --runs=/tmp/swg-builds/s5 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 4.62 6.62 7.66, swap total = 5120.00M  used = 3621.38M  free = 1498.62M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 26.4/24.5/62.2 s (kills 9/6/6), default longest 200.9 s; depths focus 25.1/24.7/75.5 s (kills 10/6/5), default longest 204.6 s; wastes focus 24/21/50.5 s (kills 10/6/5), default longest 180 s; kill-to-next-arrival min 38.4 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 4/10, smart 1/10; depths smart+P 3/10, smart 0/10; wastes smart+P 2/10, smart 1/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L8/L16/L20.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 2/10 runs (fights counted: 7); depths L9/L18/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 4); wastes L10/L17/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 4) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart | `smart:SEED:14` | hive, depths, wastes | 30 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 26.4 s (9 kills, 20.1 to 34.4; 0 deaths) | 24.5 s (6 kills, 15.6 to 29.4; 0 deaths) | 62.2 s (6 kills, 26.1 to 162.7; 0 deaths) | 200.9 s | final 181.68 s (kill, hive_smart_3003_priority.json); final 200.9 s (kill, hive_smart_4004_priority.json); mid2 180 s (ascend, hive_smart_10010_priority.json) | 0/22 |
| depths | 25.1 s (10 kills, 18.1 to 38.3; 0 deaths) | 24.7 s (6 kills, 17 to 34.9; 0 deaths) | 75.5 s (5 kills, 24.6 to 80.8; 0 deaths) | 204.6 s | final 204.61 s (kill, depths_smart_10010_priority.json) | 0/20 |
| wastes | 24 s (10 kills, 14 to 31.9; 0 deaths) | 21 s (6 kills, 11.3 to 29.7; 0 deaths) | 50.5 s (5 kills, 29.7 to 71.8; 0 deaths) | 180 s | mid2 180 s (ascend, wastes_smart_9009_priority.json); final 179.1 s (kill, wastes_smart_10010_priority.json) | 0/21 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s5
```

Raw runs: `/tmp/swg-builds/s5` (not kept). The JSON next to this file holds every metric's details.
