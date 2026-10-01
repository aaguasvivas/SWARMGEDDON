# P19 bosshp-confirm-a12-a13 matrix

- Commit: `56dd2d9` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T18:15:28.684Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --only=A12,A13 --label=bosshp-confirm-a12-a13 --runs=/tmp/swg-bosshp/confirm2 --out=/tmp/swg-bosshp/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 3.21 3.87 4, swap total = 6144.00M  used = 5230.19M  free = 913.81M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A12 | Ladder (Hive smart+P) | T0 13/30 (43%), T1 11/30 (37%), T4 0/30 (0%) | T4 win rate <= 15%; T1 <= T0 | PASS |
| A13 | Overtime (Hive OVERTIME sets 1 and 2, runs that won) | 23/40 (58%) dead by 20:00; 10 alive past 24:00 | >= 90% dead by 20:00; none past 24:00 | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+P T1, T4 (Hive) | `smart:SEED:14:nova:priority:T (T 1 and 4)` | hive | 60 |
| smart+P OVERTIME (Hive) | `smart:SEED:25:nova:priority:T:ot` | hive | 120 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..30) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..30) --out=/tmp/swg-bosshp/confirm2
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..20) --out=/tmp/swg-bosshp/confirm2
```

Raw runs: `/tmp/swg-bosshp/confirm2` (not kept). The JSON next to this file holds every metric's details.
