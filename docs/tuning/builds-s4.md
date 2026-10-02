# P19 builds-s4 matrix

- Commit: `8e346d5` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T04:59:07.502Z
- Command: `node scripts/playtest/matrix.mjs --label=builds-s4 --runs=/tmp/swg-builds/s4 --seeds=10 --only=A6,A7,A9` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 5.61 7.73 8.19, swap total = 5120.00M  used = 3685.38M  free = 1434.62M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 28.4/25.5/64.8 s (kills 9/8/6), default longest 158.8 s; depths focus 26.6/15.1/92.9 s (kills 10/5/3), default longest 129.4 s; wastes focus 22.6/26.6/73.6 s (kills 10/7/6), default longest 206.8 s; kill-to-next-arrival min 30.3 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 2/10, smart 0/10; depths smart+P 3/10, smart 1/10; wastes smart+P 4/10, smart 1/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level; gaps outside boss fights) | hive L9/L16/L19.5 at 3:00/8:00/11:00, gap over 60 s outside fights in 2/10 runs (fights counted: 7); depths L9/L18.5/L25 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 3); wastes L10/L16/L21 at 3:00/8:00/11:00, gap over 60 s outside fights in 0/10 runs (fights counted: 6) | L9 to 12 at 3:00; L16 to 20 at 8:00; L19 to 24 at 11:00; no gap over 60 s after 1:00 outside boss fights | FAIL |

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
| hive | 28.4 s (9 kills, 15.2 to 34.7; 0 deaths) | 25.5 s (8 kills, 8 to 53.5; 0 deaths) | 64.8 s (6 kills, 9.1 to 122.7; 0 deaths) | 158.8 s | final 158.83 s (kill, hive_smart_5005_priority.json) | 0/24 |
| depths | 26.6 s (10 kills, 19.2 to 55.2; 0 deaths) | 15.1 s (5 kills, 7.7 to 54.2; 0 deaths) | 92.9 s (3 kills, 72.4 to 113.2; 0 deaths) | 129.4 s | none | 0/21 |
| wastes | 22.6 s (10 kills, 15.2 to 44.3; 0 deaths) | 26.6 s (7 kills, 15.8 to 62.4; 0 deaths) | 73.6 s (6 kills, 52.5 to 86.5; 0 deaths) | 206.8 s | final 151.61 s (kill, wastes_smart_3003_priority.json); final 179.06 s (kill, wastes_smart_4004_priority.json); final 206.83 s (kill, wastes_smart_10010_priority.json) | 0/20 |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-builds/s4
```

Raw runs: `/tmp/swg-builds/s4` (not kept). The JSON next to this file holds every metric's details.
