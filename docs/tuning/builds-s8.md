# P19 builds-s8 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T05:11:10.947Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s8 --runs=/tmp/swg-builds/s8 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 4.26 5.04 6.25, swap total = 4096.00M  used = 3223.94M  free = 872.06M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 27.9/23.8/75.2 s (kills 10/8/7), default longest 198.5 s; depths focus 22.4/26.2/64.4 s (kills 10/9/6), default longest 189.9 s; wastes focus 20.3/19.6/39.6 s (kills 10/7/5), default longest 195.1 s; kill-to-next-arrival min 20 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 5/10, smart 1/10; depths smart+P 3/10, smart 2/10; wastes smart+P 3/10, smart 3/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9.5/L19/L21.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 1/10 runs (fights counted: 9); depths L10/L19.5/L25 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 4); wastes L11/L19/L22 at 3:00/8:00/11:00, gap over 60 s outside fights in 3/10 runs (fights counted: 9) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 27.9 s (10 kills, 12.6 to 40; 0 deaths) | 23.8 s (8 kills, 8.4 to 43.3; 0 deaths) | 75.2 s (7 kills, 43 to 96.9; 0 deaths) | 198.5 s | final 198.53 s (kill, hive_smart_4004_priority.json); final 171.01 s (kill, hive_smart_5005_priority.json) | 0/28 |
| depths | 22.4 s (10 kills, 11.5 to 31.9; 0 deaths) | 26.2 s (9 kills, 6.4 to 38; 0 deaths) | 64.4 s (6 kills, 17.6 to 124.7; 0 deaths) | 189.9 s | final 189.93 s (kill, depths_smart_6006_priority.json) | 0/17 |
| wastes | 20.3 s (10 kills, 11 to 44.1; 0 deaths) | 19.6 s (7 kills, 7.3 to 33; 0 deaths) | 39.6 s (5 kills, 25.5 to 118.1; 0 deaths) | 195.1 s | mid2 174.86 s (kill, wastes_smart_6006_priority.json); final 195.1 s (open, wastes_smart_6006_priority.json); mid2 159.26 s (kill, wastes_smart_10010_priority.json) | 0/26 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s8
```

Raw runs: `/tmp/swg-builds/s8` (not kept). The JSON next to this file holds every metric's details.
