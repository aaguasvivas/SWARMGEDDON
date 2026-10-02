# P19 ladder-confirm matrix

- Commit: `af12f12` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T01:16:34.328Z
- Command: `node scripts/playtest/matrix.mjs --worlds=hive --only=A12,A13 --label=ladder-confirm --runs=/tmp/swg-ladder/confirm` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 6.71 6.22 5.79, swap total = 5632.00M  used = 4780.62M  free = 851.38M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A12 | Ladder (Hive smart+P, T0 to T4) | T0 25/60 (42%), T1 18/60 (30%), T2 13/60 (22%), T3 11/60 (18%), T4 2/60 (3%); ladder falls at every step | T4 win rate <= 15%; T1 at least 5 points under T0 | PASS |
| A13 | Overtime (Hive OVERTIME sets 1 and 2, runs that won) | set 1 19/19 (100%), 0 past 24:00; set 2 15/16 (94%), 0 past 24:00; all 34/35 (97%) | >= 90% dead by 20:00 and none past 24:00, in each set | PASS |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P T0 to T4 (Hive) | `smart:SEED:14:nova:priority:T (T 0 to 4)` | hive | 300 |
| smart+P OVERTIME (Hive) | `smart:SEED:25:nova:priority:T:ot` | hive | 120 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:2 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:3 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..60) --out=/tmp/swg-ladder/confirm   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..20) --out=/tmp/swg-ladder/confirm
```

Raw runs: `/tmp/swg-ladder/confirm` (not kept). The JSON next to this file holds every metric's details.
