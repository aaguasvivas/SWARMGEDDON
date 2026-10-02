# P19 builds-rows-ladder matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T08:10:21.647Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-rows-ladder --runs=/tmp/swg-builds/rows-ladder --only=A12,A13 --threat-seeds=60 --ot-sets=1,2` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 2.64 2.86 3.65, swap total = 4096.00M  used = 2680.75M  free = 1415.25M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A12 | Ladder (Hive smart+P, T0 to T4) | T0 27/60 (45%), T1 20/60 (33%), T2 15/60 (25%), T3 14/60 (23%), T4 4/60 (7%); ladder falls at every step | T4 win rate <= 15%; T1 at least 5 points under T0 | PASS |
| A13 | Overtime (Hive OVERTIME sets 1 and 2, runs that won) | set 1 18/18 (100%), 0 past 24:00; set 2 14/17 (82%), 0 past 24:00; all 32/35 (91%) | >= 90% dead by 20:00 and none past 24:00, in each set | FAIL |

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
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:2 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:3 (SEED = 1001 x 1..60) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..60) --out=/tmp/swg-builds/rows-ladder
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..20) --out=/tmp/swg-builds/rows-ladder
```

Raw runs: `/tmp/swg-builds/rows-ladder` (not kept). The JSON next to this file holds every metric's details.
