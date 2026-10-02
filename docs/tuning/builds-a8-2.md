# P19 builds-a8-2 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T04:37:05.170Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-a8-2 --runs=/tmp/swg-builds/a8-2 --seeds=10 --only=A8,A7` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 4.84 5.18 10.12, swap total = 4096.00M  used = 3123.88M  free = 972.12M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A7 | Win rate (10 seeds per world) | hive smart+P 5/10, smart 0/10; depths smart+P 1/10, smart 1/10; wastes smart+P 5/10, smart 2/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 8:25, smart+P 14:00, crude 3:14; depths smart 7:37, smart+P 6:25, crude 3:20; wastes smart 11:35, smart+P 14:00, crude 1:43 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart | `smart:SEED:14` | hive, depths, wastes | 30 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| crude | `crude:SEED:14` | hive, depths, wastes | 30 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/a8-2
```

Raw runs: `/tmp/swg-builds/a8-2` (not kept). The JSON next to this file holds every metric's details.
