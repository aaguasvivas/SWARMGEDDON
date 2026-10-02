# P19 builds-x1-q matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T07:33:49.748Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-x1-q --runs=/tmp/swg-builds/x1-q --seeds=10 --only=A12,A13 --threat-seeds=10 --ot-seeds=10 --ot-sets=1` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..10; A13 OVERTIME sets 1 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n; quick check: the first 10 T0 and 10 T1 to T3 seeds of each set)
- Machine at the end: load 1.92 3.37 4.88, swap total = 4096.00M  used = 3528.06M  free = 567.94M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A12 | Ladder (Hive smart+P, T0 to T4) | T0 3/10 (30%), T1 4/10 (40%), T2 1/10 (10%), T3 1/10 (10%), T4 0/10 (0%); ladder T1 over T0 | T4 win rate <= 15%; T1 at least 5 points under T0 | FAIL |
| A13 | Overtime (Hive OVERTIME sets 1, runs that won) | set 1 8/9 (89%), 0 past 24:00; all 8/9 (89%) | >= 90% dead by 20:00 and none past 24:00, in each set | FAIL |

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
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:2 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:3 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/x1-q
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..10) --out=/tmp/swg-builds/x1-q
```

Raw runs: `/tmp/swg-builds/x1-q` (not kept). The JSON next to this file holds every metric's details.
