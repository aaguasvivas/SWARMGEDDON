# P19 builds-s1 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T04:48:59.901Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s1 --runs=/tmp/swg-builds/s1 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 3.89 5.39 7.58, swap total = 4096.00M  used = 3273.44M  free = 822.56M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 30.8/22.3/56 s (kills 9/8/8), default longest 203.3 s; depths focus 23.8/46.3/77.8 s (kills 10/5/3), default longest 104.2 s; wastes focus 23.9/20.2/69.2 s (kills 10/7/5), default longest 172.2 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 5/10, smart 2/10; depths smart+P 3/10, smart 2/10; wastes smart+P 3/10, smart 2/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L17/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 2/10 runs (fights counted: 6); depths L9/L18.5/L23 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 4); wastes L10/L18/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 7) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 30.8 s (9 kills, 18.9 to 61.5; 0 deaths) | 22.3 s (8 kills, 5.2 to 52.9; 0 deaths) | 56 s (8 kills, 10.8 to 139.3; 0 deaths) | 203.3 s | mid2 150.86 s (kill, hive_smart_2002_priority.json); final 193.05 s (kill, hive_smart_5005_priority.json); final 203.26 s (kill, hive_smart_9009_priority.json); mid2 168.75 s (kill, hive_smart_10010_priority.json); final 201.22 s (open, hive_smart_10010_priority.json) | 0/23 |
| depths | 23.8 s (10 kills, 14.7 to 36.6; 0 deaths) | 46.3 s (5 kills, 30.1 to 59; 0 deaths) | 77.8 s (3 kills, 50 to 142; 0 deaths) | 104.2 s | none | 0/21 |
| wastes | 23.9 s (10 kills, 11.6 to 28.4; 0 deaths) | 20.2 s (7 kills, 9.2 to 42.2; 0 deaths) | 69.2 s (5 kills, 18.7 to 130.8; 0 deaths) | 172.2 s | mid2 150.8 s (kill, wastes_smart_6006_priority.json); final 153.38 s (kill, wastes_smart_7007_priority.json); final 172.18 s (kill, wastes_smart_9009_priority.json); mid2 158.9 s (kill, wastes_smart_10010_priority.json) | 0/26 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s1
```

Raw runs: `/tmp/swg-builds/s1` (not kept). The JSON next to this file holds every metric's details.
