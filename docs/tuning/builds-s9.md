# P19 builds-s9 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T05:13:49.796Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s9 --runs=/tmp/swg-builds/s9 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 5.36 5.1 6.06, swap total = 4096.00M  used = 3199.94M  free = 896.06M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 27/27.6/43.6 s (kills 10/9/7), default longest 200.1 s; depths focus 24.9/26.1/77.4 s (kills 10/5/2), default longest 97.5 s; wastes focus 29/23.4/68 s (kills 10/7/4), default longest 203.4 s; kill-to-next-arrival min 25.7 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 5/10, smart 2/10; depths smart+P 2/10, smart 2/10; wastes smart+P 4/10, smart 1/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L17/L20.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 3/10 runs (fights counted: 10); depths L10/L20/L25 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 3); wastes L10/L18.5/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/10 runs (fights counted: 6) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 27 s (10 kills, 16.8 to 48.3; 0 deaths) | 27.6 s (9 kills, 14.7 to 71.4; 0 deaths) | 43.6 s (7 kills, 13.6 to 165.5; 0 deaths) | 200.1 s | mid2 154.26 s (kill, hive_smart_4004_priority.json); mid1 170.95 s (kill, hive_smart_6006_priority.json); final 200.08 s (kill, hive_smart_6006_priority.json) | 0/28 |
| depths | 24.9 s (10 kills, 14.7 to 38.7; 0 deaths) | 26.1 s (5 kills, 5.5 to 49; 0 deaths) | 77.4 s (2 kills, 49.8 to 105; 0 deaths) | 97.5 s | none | 0/17 |
| wastes | 29 s (10 kills, 13.9 to 44.7; 0 deaths) | 23.4 s (7 kills, 16 to 52.3; 0 deaths) | 68 s (4 kills, 64.1 to 95.7; 0 deaths) | 203.4 s | final 203.4 s (kill, wastes_smart_10010_priority.json) | 0/24 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s9
```

Raw runs: `/tmp/swg-builds/s9` (not kept). The JSON next to this file holds every metric's details.
