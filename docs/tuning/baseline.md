# P19 baseline matrix

- Commit: `15c16b9` (src clean); the harness in scripts/ is the working tree, committed with this report, 2026-10-01T08:11:10.934Z
- Command: `node scripts/playtest/matrix.mjs --seeds=10 --label=baseline` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..10; A13 OVERTIME sets 1, 2 (set 1: T0 1001 x 1..30, T1 to T3 1001 x 1..10; set 2: T0 1001 x 31..60, T1 to T3 1001 x 11..20)
- Machine at the end: load 4.18 4.15 4.05, swap total = 6144.00M  used = 5232.31M  free = 911.69M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A1 | Opening probe (5 seeds x 3 worlds, views 560x996 and 996x560) | first in view 0.3 s, first kill 0.57 s, empty view 1.32 s (worst) | first enemy in view <= 1.0 s; first kill <= 2.5 s; empty view <= 2.0 s | PASS |
| A2 | First draft (smart+P) | median 6.02 s, max 6.02 s | median 6 to 12 s; max <= 20 s | PASS |
| A3 | Beats and density (T0 runs of roam, smart, smart+P, focus, dash, evolve) | beats off-rule 0; alive max 440; over row maxAlive 243; saturated share max 0.368 | beats on time or per deferral; alive <= row.maxAlive + 160 and <= 610; saturated share <= 0.25 | FAIL |
| A4 | Density band (smart+P median alive per minute vs the A7.2 Target alive) | hive 6/9, depths 6/9, wastes 7/9 | in band in 3 of 4 scored minutes (7 of 9; the cage rows 4, 7 and 11 have no band) | FAIL |
| A5 | Boss arrival (smart+P and focus fights) | 99 arrivals, 295 to 305 u, cage active and inside 99/99, in arena 99/99 | 250 to 340 u; cage active the same tick | PASS |
| A6 | Fights (focus bot medians mid1/mid2/final; default bot = smart+P) | hive focus 22.3/19/32.5 s (kills 8/5/2), default longest 181.1 s; depths focus 21.3/16.9/- s (kills 10/3/0), default longest 114.5 s; wastes focus 28.9/21.3/27.9 s (kills 10/5/2), default longest 173.5 s; kill-to-next-arrival min 51.1 s | focus mid1/mid2 median 20 to 40 s, final 40 to 75 s; default bot none over 150 s except stalemate; gap >= 20 s | FAIL |
| A7 | Win rate (10 seeds per world) | hive smart+P 4/10, smart 1/10; depths smart+P 3/10, smart 1/10; wastes smart+P 3/10, smart 3/10 | smart+P 25 to 45%; smart 5 to 25% | FAIL |
| A8 | Median survival (a win or a stalemate counts as the whole 14:00) | hive smart 6:19, smart+P 9:44, crude 2:07; depths smart 6:21, smart+P 8:19, crude 2:07; wastes smart 6:53, smart+P 6:57, crude 1:39 | smart >= 5:30; smart+P >= 8:00; crude >= 2:30; Hive crude >= Depths and Wastes | FAIL |
| A9 | Level curve (smart+P median level; a run that won earlier counts its final level) | hive L9/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 6/10 runs; depths L9/L17/L22 at 3:00/8:00/11:00, gap over 60 s in 1/10 runs; wastes L10/L16/L20 at 3:00/8:00/11:00, gap over 60 s in 6/10 runs | L9 to 12 at 3:00; L18 to 23 at 8:00; L23 to 28 at 11:00; no gap over 60 s after 1:00 | FAIL |
| A10 | Readable deaths (smart-family deaths; crude in the details) | 99 deaths, median 2.57 s, min 0.42 s | median >= 3.0 s; minimum >= 1.2 s | FAIL |
| A11 | Speed (T0 runs before OVERTIME; streams, charger dash and the boss lunge exempt) | fastest flyer 240, wraith 240, cinderCharger 240 u/s | no enemy over 240 u/s | PASS |
| A12 | Ladder (Hive smart+P) | T0 4/10 (40%), T1 3/10 (30%), T4 0/10 (0%) | T4 win rate <= 15%; T1 <= T0 | PASS |
| A13 | Overtime (Hive OVERTIME sets 1 and 2, runs that won) | 25/33 (76%) dead by 20:00; 4 alive past 24:00 | >= 90% dead by 20:00; none past 24:00 | FAIL |
| A14 | Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection; each with its rerun) | 9 groups, 0 split; reruns match; 21/21 lines | one hash per mode and world across views, settings, reruns | PASS |
| A15 | Perf at 390x844, run alone (perf hive, perf wastes, perf-final hive) | perf hive 60 fps, p95 16.8 ms, max 33.3 ms, >20 ms 1, >33.4 ms 0; perf wastes 60 fps, p95 16.8 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0; perf-final 60 fps, p95 16.8 ms, max 16.8 ms, >20 ms 0, >33.4 ms 0, peak alive 332 | perf: 60 fps, 0 frames over 20 ms; perf-final: p95 <= 16.7 ms, 0 frames over 33.4 ms | FAIL |
| A16 | Allocation: GC pauses in a 10 s perf-final trace (probe-alloc --gc) | max pause 5.149 ms (minor 1, major 0) | no GC pause over 2 ms | FAIL |
| A17 | Human (owner): about 1 win in 3 Hive T0 runs on iPhone | owner | about 1 win in 3 | owner |
| A18 | Build systems (dash = smart+dash+P vs smart+P mean survival; fusion over priority runs that reach 4:00; evolve runs that reach mid2; XP = roam whole-run) | hive dash 1.39x, cc 1.53/min, fusion by 4:00 17/26, evolve 3/4, XP min 0.944; depths dash 1.28x, cc 1.66/min, fusion by 4:00 27/30, evolve 3/4, XP min 0.918; wastes dash 1.5x, cc 2.05/min, fusion by 4:00 27/30, evolve 2/4, XP min 0.863 | dash >= 1.25x; 1 to 4 close calls/min; >= 50% fusion by 4:00; >= 40% evolve; XP >= 90% | FAIL |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|
| smart+P | `smart:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| roam | `roam:SEED:14` | hive, depths, wastes | 30 |
| smart | `smart:SEED:14` | hive, depths, wastes | 30 |
| smart+focus+P | `smart+focus:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart+dash+P | `smart+dash:SEED:14:nova:priority` | hive, depths, wastes | 30 |
| smart+E | `smart:SEED:14:nova:evolve` | hive, depths, wastes | 30 |
| crude | `crude:SEED:14` | hive, depths, wastes | 30 |
| smart+P T1, T4 (Hive) | `smart:SEED:14:nova:priority:T (T 1 and 4)` | hive | 20 |
| smart+P OVERTIME (Hive) | `smart:SEED:25:nova:priority:T:ot` | hive | 120 |

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A4 median alive per minute (smart+P)

Columns are the A7.2 rows (row 0 is 0:00 to 1:00). Each cell: median alive [target band], x outside it, (n) runs alive through the minute.

| World | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hive | 17 [16-28] (10) | 29 [24-56] (10) | 49 [40-84] (9) | 41 [40-98] (8) | 42 cage (8) | 72 [70-147] (7) | 92 [85-175] (7) | 88 cage (7) | 83 [120-224] x (6) | 122 [140-252] x (5) | 161 [170-294] x (4) | 55 cage (2) |
| depths | 16 [14-28] (10) | 24 [20-49] (10) | 35 [30-70] (10) | 32 [30-77] (10) | 37 cage (10) | 50 [50-119] (8) | 67 [60-140] (6) | 64 cage (5) | 75 [80-182] x (5) | 81 [90-203] x (4) | 83 [110-231] x (3) | 37 cage (1) |
| wastes | 15 [14-25] (10) | 18 [16-42] (10) | 29 [22-56] (10) | 27 [26-70] (10) | 34 cage (10) | 34 [36-95] x (9) | 60 [44-109] (5) | 49 cage (4) | 46 [58-137] x (4) | 67 [66-151] (3) | 84 [80-175] (3) | 34 cage (1) |

### A6 fights per world

| World | Focus mid1 | Focus mid2 | Focus final | Default longest | Default fights over 150 s | Default fights ended by death |
|---|---|---|---|---|---|---|
| hive | 22.3 s (8 kills, 11.8 to 32; 0 deaths) | 19 s (5 kills, 12.1 to 22.4; 0 deaths) | 32.5 s (2 kills, 7.7 to 57.3; 0 deaths) | 181.1 s | mid1 158.9 s (kill, hive_smart_3003_priority.json); final 181.13 s (kill, hive_smart_6006_priority.json) | 0/19 |
| depths | 21.3 s (10 kills, 16.3 to 32.6; 0 deaths) | 16.9 s (3 kills, 16.2 to 35.5; 0 deaths) | - s (0 kills, - to -; 0 deaths) | 114.5 s | none | 0/18 |
| wastes | 28.9 s (10 kills, 16.1 to 52.3; 0 deaths) | 21.3 s (5 kills, 16.3 to 29.6; 0 deaths) | 27.9 s (2 kills, 16.8 to 39.1; 0 deaths) | 173.5 s | final 173.51 s (kill, wastes_smart_6006_priority.json) | 0/17 |

### A10 deaths by set and world

| Group | Deaths | Median s | Min s |
|---|---|---|---|
| smart | 25 | 2.83 | 0.63 |
| smart+P | 20 | 3.32 | 0.42 |
| smart+focus+P | 26 | 2.05 | 0.52 |
| smart+dash+P | 5 | 2.07 | 2.03 |
| smart+E | 23 | 2.37 | 0.82 |
| crude | 30 | 1.24 | 0.53 |
| hive (smart family) | 32 | 2.83 | 0.52 |
| depths (smart family) | 37 | 2.02 | 0.42 |
| wastes (smart family) | 30 | 4.38 | 0.83 |

Fastest smart-family deaths (damage by kind in the last 3 s):

- depths_smart_8008_priority.json: 0.42 s at 5:45, {"shot":44.2,"bite":55.4}
- hive_smart_focus_7007_priority.json: 0.52 s at 6:01, {"shot":69.2,"acid":34.2}
- hive_smart_6006.json: 0.63 s at 6:07, {"shot":52.2,"acid":27.9}
- hive_smart_6006_evolve.json: 0.82 s at 6:55, {"shot":53.5,"acid":20.7,"bite":64}
- wastes_smart_6006.json: 0.83 s at 6:46, {"bite":48,"shot":14}
- depths_smart_8008_evolve.json: 0.85 s at 5:50, {"shot":66.6,"bite":62.1}
- depths_smart_8008.json: 0.87 s at 9:00, {"shot":95}
- hive_smart_4004.json: 0.88 s at 6:17, {"shot":70,"acid":22.2,"bite":58}

### A3 by set

| Set | Runs | Off-rule beats | Alive max | Over row max | Saturated share max (run) |
|---|---|---|---|---|---|
| roam | 30 | 0 | 440 | 243 | 0.271 (hive_roam_4004.json) |
| smart | 30 | 0 | 424 | 181 | 0.062 (hive_smart_3003.json) |
| smart+P | 30 | 0 | 424 | 135 | 0.206 (hive_smart_5005_priority.json) |
| smart+focus+P | 30 | 0 | 378 | 198 | 0.27 (hive_smart_focus_3003_priority.json) |
| smart+dash+P | 30 | 0 | 425 | 240 | 0.368 (hive_smart_dash_3003_priority.json) |
| smart+E | 30 | 0 | 420 | 92 | 0.053 (hive_smart_3003_evolve.json) |

### A14 hashes

| Mode and world | Hashes (view) |
|---|---|
| det hive | 642fbc46 (375x667); 642fbc46 (667x375); 642fbc46 (375x667 settings) |
| det depths | 1365ccb6 (375x667); 1365ccb6 (667x375); 1365ccb6 (375x667 settings) |
| det wastes | d3c8cef6 (375x667); d3c8cef6 (667x375); d3c8cef6 (375x667 settings) |
| det-long hive | 49f8452e (375x667); 49f8452e (667x375) |
| det-long depths | b2509c53 (375x667); b2509c53 (667x375) |
| det-long wastes | e27e6638 (375x667); e27e6638 (667x375) |
| det-death hive | 97ec1b8a (375x667, death at 158.98 s); 97ec1b8a (667x375, death at 158.98 s) |
| det-death depths | df152cad (375x667, death at 211.17 s); df152cad (667x375, death at 211.17 s) |
| det-death wastes | 83418332 (375x667, death at 176.77 s); 83418332 (667x375, death at 176.77 s) |

### A15 machine state per perf run

- `390 844 perf nova hive`: load 3.59 4.05 4.01, total = 6144.00M  used = 5223.56M  free = 920.44M  (encrypted); sim 91.2 to 111.9 s; echo ok
- `390 844 perf nova wastes`: load 3.8 4.03 4, total = 6144.00M  used = 5232.31M  free = 911.69M  (encrypted); sim 91.2 to 111.9 s; echo ok
- `390 844 perf-final nova hive`: load 4.75 4.24 4.08, total = 6144.00M  used = 5232.31M  free = 911.69M  (encrypted); sim 600 to 609.9 s; echo ok

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes roam:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+focus:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart+dash:SEED:14:nova:priority (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes smart:SEED:14:nova:evolve (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs depths crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs wastes crude:SEED:14 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:14:nova:priority:1 (SEED = 1001 x 1..10) smart:SEED:14:nova:priority:4 (SEED = 1001 x 1..10) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/playtest/playtest.mjs hive smart:SEED:25:nova:priority:0:ot (SEED = 1001 x 1..60) smart:SEED:25:nova:priority:1:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:2:ot (SEED = 1001 x 1..20) smart:SEED:25:nova:priority:3:ot (SEED = 1001 x 1..20) --out=/tmp/swg-matrix/baseline   # reused from an earlier run of this matrix
node scripts/measure.mjs 375 667 det
node scripts/measure.mjs 667 375 det
node scripts/measure.mjs 375 667 det-long
node scripts/measure.mjs 667 375 det-long
node scripts/measure.mjs 375 667 det-death
node scripts/measure.mjs 667 375 det-death
node scripts/measure.mjs 375 667 det '--settings={"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
node scripts/measure.mjs 375 667 opening 560 996
node scripts/measure.mjs 375 667 opening 996 560
node scripts/measure.mjs 390 844 perf nova hive
node scripts/measure.mjs 390 844 perf nova wastes
node scripts/measure.mjs 390 844 perf-final nova hive
node scripts/probe-alloc.mjs x x --gc --perks=
```

Raw runs: `/tmp/swg-matrix/baseline` (not kept). The JSON next to this file holds every metric's details.

## Notes

- **A15 and A16 on this machine.** The matrix ran three times on this build, with perf and the GC trace alone at the end each time (load average about 4 from other processes, 5.2 GB of 6 GB swap in use). A15: run 1 passed (perf hive and wastes 60 fps, max 16.8 ms, 0 frames over 20 ms; perf-final p95 16.7 ms, 0 over 33.4 ms); run 2 is the table above (one 33.3 ms frame in perf hive, perf-final p95 16.8 ms); run 3 (`--only=A15`) had 0 long frames anywhere but perf-final p95 16.8 ms. The perf-final p95 limit of 16.7 ms sits on the vsync interval (16.67 ms), so 0.1 ms of timer jitter decides it. A16: 4.45 ms (run 1) and 5.15 ms (run 2), one minor GC per 10 s window, as in the W5 note. Both need an idle machine before they count (P20 or the owner).
- **Harness.** The bots plan an escape from telegraphed hazards since this commit (`hazard-dodge.md`). The default bot's longer Hive fights there are in this table too: A6 default longest Hive 181.1 s (final, seed 6006) and 158.9 s (mid1, seed 3003); Wastes 173.5 s (final, seed 6006).
- **Definitions the matrix applies** (section 11 leaves them open): A4 scores only minutes with a band and at least one smart+P run alive through them, and asks for 3 in 4 of those (7 of 9 when every minute has runs). A6's default bot is smart+P. A8 and A18 count a win or a stalemate as surviving the whole 14:00. A9 counts a run that won before the sample time at its final level. A10 is scored on the smart-family deaths (smart, smart+P, focus, dash, evolve); crude is listed beside it. A11 exempts the boss during ROYAL LUNGE (ACTIVE and its RECOVER). A18's dash ratio is the mean survival of smart+dash+P over smart+P, the fusion share counts priority runs (smart+P, focus, dash) that reach 4:00, the evolve share counts evolve runs that reach mid2, and XP is the roam bot's whole-run minimum.
