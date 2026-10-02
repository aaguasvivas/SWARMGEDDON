# P19 builds-s50x10 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T07:07:27.163Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s50x10 --runs=/tmp/swg-builds/s50x10 --seeds=30 --only=A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 9.87 7.18 7.34, swap total = 4096.00M  used = 3168.00M  free = 928.00M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A7 | Win rate (30 seeds per world) | hive smart+P 10/30, smart 6/30; depths smart+P 11/30, smart 4/30; wastes smart+P 13/30, smart 8/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L8/L16/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 3/30 runs (fights counted: 23); depths L9/L17/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/30 runs (fights counted: 8); wastes L10/L17/L21 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/30 runs (fights counted: 15) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart | `smart:SEED:14` | hive, depths, wastes | 90 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s50x10
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s50x10
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s50x10
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s50x10
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s50x10
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-builds/s50x10
```

Raw runs: `/tmp/swg-builds/s50x10` (not kept). The JSON next to this file holds every metric's details.
