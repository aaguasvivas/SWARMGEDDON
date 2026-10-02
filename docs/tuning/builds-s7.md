# P19 builds-s7 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T05:08:30.005Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s7 --runs=/tmp/swg-builds/s7 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 6.49 5.59 6.67, swap total = 4096.00M  used = 3247.94M  free = 848.06M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 29.6/24.6/59.2 s (kills 10/9/9), default longest 204.7 s; depths focus 23.9/15.6/96.9 s (kills 10/5/3), default longest 110.4 s; wastes focus 25.4/22.6/72.6 s (kills 10/6/4), default longest 161.9 s; kill-to-next-arrival min 35.7 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 2/10, smart 0/10; depths smart+P 2/10, smart 1/10; wastes smart+P 4/10, smart 3/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L18/L21 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 7); depths L10/L19/L24 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 5); wastes L10/L18/L21.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 6) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | PASS |

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
| hive | 29.6 s (10 kills, 13.6 to 58.1; 0 deaths) | 24.6 s (9 kills, 7.8 to 54.4; 0 deaths) | 59.2 s (9 kills, 10.7 to 96.9; 0 deaths) | 204.7 s | final 204.73 s (kill, hive_smart_9009_priority.json) | 0/22 |
| depths | 23.9 s (10 kills, 13.3 to 41.1; 0 deaths) | 15.6 s (5 kills, 6.2 to 33.3; 0 deaths) | 96.9 s (3 kills, 33.2 to 118.6; 0 deaths) | 110.4 s | none | 0/22 |
| wastes | 25.4 s (10 kills, 10.5 to 31.3; 0 deaths) | 22.6 s (6 kills, 6.5 to 45.8; 0 deaths) | 72.6 s (4 kills, 44.2 to 97.7; 0 deaths) | 161.9 s | final 160.56 s (kill, wastes_smart_5005_priority.json); final 161.88 s (kill, wastes_smart_10010_priority.json) | 0/24 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s7
```

Raw runs: `/tmp/swg-builds/s7` (not kept). The JSON next to this file holds every metric's details.
