# P19 ladder-holdout matrix

- Commit: `af12f12` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T01:28:24.377Z
- Command: `node scripts/playtest/matrix.mjs --worlds=hive --only=A13 --ot-sets=3 --label=ladder-holdout --runs=/tmp/swg-ladder/holdout` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 3 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 5.46 5.92 5.96, swap total = 5632.00M  used = 5241.12M  free = 390.88M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A13 | Overtime (Hive OVERTIME sets 3, runs that won) | set 3 18/18 (100%), 0 past 24:00; all 18/18 (100%) | >= 90% dead by 20:00 and none past 24:00, in each set | PASS |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P OVERTIME (Hive) | `smart:SEED:25:nova:priority:T:ot` | hive | 60 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 61..90) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 21..30) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 21..30) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 21..30) --out=/tmp/swg-ladder/holdout
```

Raw runs: `/tmp/swg-ladder/holdout` (not kept). The JSON next to this file holds every metric's details.
