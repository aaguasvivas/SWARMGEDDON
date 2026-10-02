# P19 builds-rows30-q matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T06:22:41.990Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-rows30-q --runs=/tmp/swg-builds/rows30-q --seeds=10 --only=A12,A13 --threat-seeds=10 --ot-seeds=10 --ot-sets=1` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..10; A13 OVERTIME sets 1 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n; quick check: the first 10 T0 and 10 T1 to T3 seeds of each set)
- Machine at the end: load 4.48 3.64 4.36, swap total = 4096.00M  used = 2980.25M  free = 1115.75M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A12 | Ladder (Hive smart+P, T0 to T4) | T0 5/10 (50%), T1 4/10 (40%), T2 1/10 (10%), T3 0/10 (0%), T4 0/10 (0%); ladder falls at every step | T4 win rate <= 15%; T1 at least 5 points under T0 | PASS |
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
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:2 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:3 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/rows30-q
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..10) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..10) --out=/tmp/swg-builds/rows30-q
```

Raw runs: `/tmp/swg-builds/rows30-q` (not kept). The JSON next to this file holds every metric's details.
