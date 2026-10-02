# P19 ladder-a14 matrix

- Commit: `af12f12` (src has uncommitted changes); the harness in scripts/ is the working tree, committed with this report, 2026-10-02T01:29:49.356Z
- Command: `node scripts/playtest/matrix.mjs --only=A14 --label=ladder-a14 --runs=/tmp/swg-ladder/a14` (dev server at http://localhost:5176)
- Seeds: 1001 x 1..10 per world; A12 Hive 1001 x 1..60; A13 OVERTIME sets 1, 2 (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n)
- Machine at the end: load 8.27 6.94 6.36, swap total = 5632.00M  used = 5162.88M  free = 469.12M  (encrypted)

| ID | Metric | Value | Target | Result |
|---|---|---|---|---|
| A14 | Determinism (det, det-long, det-death at 375x667 and 667x375, det with the settings injection; each with its rerun) | 9 groups, 0 split; reruns match; 21/21 lines | one hash per mode and world across views, settings, reruns | PASS |

## Bot sets

| Set | Config | Worlds | Runs |
|---|---|---|---|

SEED is 1001 x k. Each set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>`; the matrix command above repeats every step.

## Details

### A14 hashes

| Mode and world | Hashes (view) |
|---|---|
| det hive | 642fbc46 (375x667); 642fbc46 (667x375); 642fbc46 (375x667 settings) |
| det depths | 1365ccb6 (375x667); 1365ccb6 (667x375); 1365ccb6 (375x667 settings) |
| det wastes | d3c8cef6 (375x667); d3c8cef6 (667x375); d3c8cef6 (375x667 settings) |
| det-long hive | 4b54dab1 (375x667); 4b54dab1 (667x375) |
| det-long depths | be186edf (375x667); be186edf (667x375) |
| det-long wastes | 7a87fa18 (375x667); 7a87fa18 (667x375) |
| det-death hive | 7408614a (375x667, death at 159 s); 7408614a (667x375, death at 159 s) |
| det-death depths | 5739e8a2 (375x667, death at 141.87 s); 5739e8a2 (667x375, death at 141.87 s) |
| det-death wastes | 224be1c (375x667, death at 168.1 s); 224be1c (667x375, death at 168.1 s) |

## Commands run

Each config pattern stands for one config per seed in its range (meta.commands in the JSON lists them in full).

```
node scripts/measure.mjs 375 667 det
node scripts/measure.mjs 667 375 det
node scripts/measure.mjs 375 667 det-long
node scripts/measure.mjs 667 375 det-long
node scripts/measure.mjs 375 667 det-death
node scripts/measure.mjs 667 375 det-death
node scripts/measure.mjs 375 667 det '--settings={"shake":0,"reduceMotion":true,"damageNumbers":"off","flashes":false,"glow":0}'
```

Raw runs: `/tmp/swg-ladder/a14` (not kept). The JSON next to this file holds every metric's details.
