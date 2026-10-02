# P19 builds-s3 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T04:55:46.152Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s3 --runs=/tmp/swg-builds/s3 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 7.8 9.5 8.79, swap total = 5120.00M  used = 4013.38M  free = 1106.62M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 29.7/22/63.4 s (kills 10/9/7), default longest 154.4 s; depths focus 26/26.4/42.7 s (kills 10/8/6), default longest 127.6 s; wastes focus 27.1/19.5/46.9 s (kills 10/8/7), default longest 190.5 s; kill-to-next-arrival min 39.1 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 5/10, smart 3/10; depths smart+P 2/10, smart 4/10; wastes smart+P 5/10, smart 3/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L18/L23 at 3:00/8:00/11:00, gap over 60 s outside fights in 3/10 runs (fights counted: 6); depths L9.5/L19.5/L24 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 2); wastes L10/L18.5/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 7) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 29.7 s (10 kills, 18 to 45.8; 0 deaths) | 22 s (9 kills, 8 to 35.8; 0 deaths) | 63.4 s (7 kills, 36.9 to 81.3; 0 deaths) | 154.4 s | final 154.36 s (kill, hive_smart_1001_priority.json) | 0/24 |
| depths | 26 s (10 kills, 11.6 to 49.9; 0 deaths) | 26.4 s (8 kills, 10 to 38.3; 0 deaths) | 42.7 s (6 kills, 33.7 to 87.9; 0 deaths) | 127.6 s | none | 0/16 |
| wastes | 27.1 s (10 kills, 15.3 to 37.5; 0 deaths) | 19.5 s (8 kills, 15.1 to 61; 0 deaths) | 46.9 s (7 kills, 23.5 to 107.2; 0 deaths) | 190.5 s | final 178.43 s (kill, wastes_smart_5005_priority.json); final 190.48 s (kill, wastes_smart_6006_priority.json) | 0/25 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s3
```

Raw runs: `/tmp/swg-builds/s3` (not kept). The JSON next to this file holds every metric's details.
