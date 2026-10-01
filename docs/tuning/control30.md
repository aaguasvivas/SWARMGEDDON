# P19 control30 matrix

- Commit: `e49114b` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T12:22:48.173Z
- Command: `node scripts/playtest/matrix.mjs --seeds=30 --only=A6,A7,A8,A9,A10 --label=control30 --runs=/tmp/swg-deaths/control30 --out=/tmp/swg-deaths/reports` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..30 per world; A12 Hive 1001 x 1..30; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 7.11 5.23 4.64, swap total = 6144.00M  used = 5387.00M  free = 757.00M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 25.2/17.2/25.8 s (kills 26/17/7), default longest 181.1 s; depths focus 21.8/17.6/25.9 s (kills 28/10/3), default longest 114.5 s; wastes focus 28.4/25.8/37.8 s (kills 29/14/6), default longest 173.5 s; kill-to-next-arrival min 51.1 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (30 seeds per world) | hive smart+P 8/30, smart 4/30; depths smart+P 7/30, smart 3/30; wastes smart+P 6/30, smart 5/30 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 6:50, smart+P 8:40, crude 2:07; depths smart 6:15, smart+P 6:58, crude 2:09; wastes smart 6:48, smart+P 7:07, crude 1:40 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L8/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 14/30 runs; depths L9/L17.5/L22 at 3:00/8:00/11:00, gap over 60 s in 6/30 runs; wastes L10/L17/L20.5 at 3:00/8:00/11:00, gap over 60 s in 14/30 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 316 deaths, median 2.12 s, min 0.42 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart | `smart:SEED:14` | hive, depths, wastes | 90 |
| crude | `crude:SEED:14` | hive, depths, wastes | 90 |
| smart+dash+P | `smart+dash:SEED:14:nova:priority` | hive, depths, wastes | 90 |
| smart+E | `smart:SEED:14:nova:evolve` | hive, depths, wastes | 90 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 25.2 s (26 kills, 11.8 to 57.1; 0 deaths) | 17.2 s (17 kills, 5.5 to 57.8; 0 deaths) | 25.8 s (7 kills, 7.7 to 58.8; 0 deaths) | 181.1 s | mid1 158.9 s (kill, hive_smart_3003_priority.json); final 181.13 s (kill, hive_smart_6006_priority.json); final 160.9 s (kill, hive_smart_14014_priority.json) | 0/52 |
| depths | 21.8 s (28 kills, 10.9 to 38; 0 deaths) | 17.6 s (10 kills, 7.2 to 35.5; 0 deaths) | 25.9 s (3 kills, 20 to 33.1; 0 deaths) | 114.5 s | none | 0/47 |
| wastes | 28.4 s (29 kills, 8.1 to 52.3; 0 deaths) | 25.8 s (14 kills, 15.5 to 57.3; 0 deaths) | 37.8 s (6 kills, 15.4 to 48; 0 deaths) | 173.5 s | final 173.51 s (kill, wastes_smart_6006_priority.json) | 0/48 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 77 | 2.55 | 0.42 |
| smart+P | 69 | 2.4 | 0.42 |
| smart+focus+P | 74 | 2.27 | 0.52 |
| smart+dash+P | 27 | 2.65 | 0.42 |
| smart+E | 69 | 1.97 | 0.48 |
| crude | 90 | 1.69 | 0.53 |
| hive (smart family) | 99 | 2 | 0.48 |
| depths (smart family) | 118 | 1.99 | 0.42 |
| wastes (smart family) | 99 | 2.73 | 0.6 |

Smart-family deaths under 1.2 s: 66; under 3.0 s: 197. Damage by kind inside the windows (last step at 50%+ HP to death), summed: {"bite":10258.3,"acid":1541.3,"shot":8416.4,"ram":522.4}

Fastest smart-family deaths (HP at the window start / max HP, damage by kind inside the window; older runs: the last 3 s):

- depths_smart_8008_priority.json: 0.42 s at 5:45, -/100 HP, {"shot":44.2,"bite":55.4}
- depths_smart_25025.json: 0.42 s at 5:36, 54.9/100 HP, {"bite":31.7,"shot":31.8}
- depths_smart_dash_11011_priority.json: 0.42 s at 6:31, 58.2/100 HP, {"bite":30.1,"shot":32.8}
- hive_smart_16016_priority.json: 0.48 s at 8:28, 62.8/125 HP, {"acid":30.3,"bite":34,"shot":15.9}
- hive_smart_16016_evolve.json: 0.48 s at 8:28, 62.8/125 HP, {"acid":30.3,"bite":34,"shot":15.9}
- hive_smart_focus_7007_priority.json: 0.52 s at 6:01, -/100 HP, {"shot":69.2,"acid":34.2}
- depths_smart_18018.json: 0.57 s at 5:52, 57.3/100 HP, {"bite":24.7,"shot":44.4}
- hive_smart_focus_13013_priority.json: 0.6 s at 8:25, 54/100 HP, {"bite":32,"acid":8.5,"shot":18.7}

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..30) --out=/tmp/swg-deaths/control30
```

Raw runs: `/tmp/swg-deaths/control30` (not kept). The JSON next to this file holds every metric's details.
