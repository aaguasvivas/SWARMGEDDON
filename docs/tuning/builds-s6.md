# P19 builds-s6 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T05:04:54.710Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s6 --runs=/tmp/swg-builds/s6 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 4.21 5.62 7.03, swap total = 4096.00M  used = 3089.69M  free = 1006.31M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 26.2/26.9/79.6 s (kills 9/9/9), default longest 180 s; depths focus 23.5/22.6/86.3 s (kills 10/6/4), default longest 205.7 s; wastes focus 27.6/27.4/81.7 s (kills 10/5/4), default longest 194.3 s; kill-to-next-arrival min 21.7 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 4/10, smart 0/10; depths smart+P 4/10, smart 2/10; wastes smart+P 5/10, smart 1/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L17/L20 at 3:00/8:00/11:00, gap over 60 s outside fights in 2/10 runs (fights counted: 9); depths L9/L17.5/L23 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 4); wastes L10/L18/L21 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 7) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 26.2 s (9 kills, 15 to 30.4; 0 deaths) | 26.9 s (9 kills, 7.4 to 48.5; 0 deaths) | 79.6 s (9 kills, 12.8 to 99.6; 0 deaths) | 180 s | mid2 158.31 s (kill, hive_smart_9009_priority.json); mid2 180 s (ascend, hive_smart_10010_priority.json) | 0/26 |
| depths | 23.5 s (10 kills, 15.7 to 29.5; 0 deaths) | 22.6 s (6 kills, 14.5 to 59; 0 deaths) | 86.3 s (4 kills, 65 to 107.9; 0 deaths) | 205.7 s | final 205.7 s (kill, depths_smart_9009_priority.json) | 0/20 |
| wastes | 27.6 s (10 kills, 15.2 to 39.3; 0 deaths) | 27.4 s (5 kills, 11 to 28.2; 1 deaths) | 81.7 s (4 kills, 63.8 to 101.7; 0 deaths) | 194.3 s | final 174.86 s (kill, wastes_smart_3003_priority.json); final 173.1 s (kill, wastes_smart_4004_priority.json); final 194.26 s (kill, wastes_smart_5005_priority.json); final 190.05 s (kill, wastes_smart_6006_priority.json) | 0/25 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s6
```

Raw runs: `/tmp/swg-builds/s6` (not kept). The JSON next to this file holds every metric's details.
