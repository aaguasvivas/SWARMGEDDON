# P19 builds-s2 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T04:52:13.880Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s2 --runs=/tmp/swg-builds/s2 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 6.17 5.23 7.02, swap total = 5120.00M  used = 3929.19M  free = 1190.81M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.6/27.5/66.1 s (kills 10/9/9), default longest 208 s; depths focus 26.2/14.1/107.2 s (kills 10/5/3), default longest 134.1 s; wastes focus 22.9/27.1/36.7 s (kills 10/6/6), default longest 180.8 s; kill-to-next-arrival min 22.7 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 7/10, smart 1/10; depths smart+P 3/10, smart 0/10; wastes smart+P 5/10, smart 3/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L10/L19/L23 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 9); depths L10/L20/L26 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 4); wastes L11/L19.5/L24 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 8) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 25.6 s (10 kills, 13 to 34.7; 0 deaths) | 27.5 s (9 kills, 5.3 to 51.3; 0 deaths) | 66.1 s (9 kills, 33.8 to 148; 0 deaths) | 208 s | final 150.21 s (kill, hive_smart_2002_priority.json); final 174.11 s (kill, hive_smart_5005_priority.json); final 208 s (kill, hive_smart_6006_priority.json); final 155.9 s (kill, hive_smart_7007_priority.json); final 180.05 s (kill, hive_smart_10010_priority.json) | 0/28 |
| depths | 26.2 s (10 kills, 11.8 to 59.4; 0 deaths) | 14.1 s (5 kills, 9.3 to 29.6; 0 deaths) | 107.2 s (3 kills, 90.8 to 147.2; 0 deaths) | 134.1 s | none | 0/19 |
| wastes | 22.9 s (10 kills, 15.9 to 45.5; 0 deaths) | 27.1 s (6 kills, 22.7 to 49.8; 0 deaths) | 36.7 s (6 kills, 17.4 to 84; 0 deaths) | 180.8 s | final 178.15 s (kill, wastes_smart_4004_priority.json); final 180.83 s (kill, wastes_smart_5005_priority.json); mid2 157.28 s (kill, wastes_smart_10010_priority.json) | 0/26 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s2
```

Raw runs: `/tmp/swg-builds/s2` (not kept). The JSON next to this file holds every metric's details.
