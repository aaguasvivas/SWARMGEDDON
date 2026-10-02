# P19 builds-before30-q matrix

- Commit: `8e346d5` (src clean); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T06:02:19.727Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-before30-q --runs=/tmp/swg-builds/before30-q --seeds=10 --only=A12,A13 --threat-seeds=10 --ot-seeds=10 --ot-sets=1` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..10; A13 OVERTIME sets 1 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n; quick check: the first 10 T0 and 10 T1 to T3 seeds of each set)
- Machine at the end: load 3.81 4.95 5.98, swap total = 5120.00M  used = 3745.69M  free = 1374.31M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A12 | Ladder (Hive smart+P, T0 to T4) | T0 5/10 (50%), T1 4/10 (40%), T2 0/10 (0%), T3 1/10 (10%), T4 0/10 (0%); ladder T3 over T2 | T4 win rate <= 15%; T1 at least 5 points under T0 | PASS |
| A13 | Overtime (Hive OVERTIME sets 1, runs that won) | set 1 10/10 (100%), 0 past 24:00; all 10/10 (100%) | >= 90% dead by 20:00 and none past 24:00, in each set | PASS |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P T0 to T4 (Hive) | `smart:SEED:14:nova:priority:T (T 0 to 4)` | hive | 50 |
| smart+P OVERTIME (Hive) | `smart:SEED:25:nova:priority:T:ot` | hive | 40 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:2 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:3 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/before30-q
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..10) --out=/tmp/swg-builds/before30-q
```

Raw runs: `/tmp/swg-builds/before30-q` (not kept). The JSON next to this file holds every metric's details.
