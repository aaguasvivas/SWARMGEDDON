# P19 harness: hazard escape A/B

The smart and roam bots (`scripts/playtest/harness.js`) used to add one push away from each damaging hazard circle. Inside the magma mortar's 5 circles (one on the ship, 4 on a ring of 120 u) the pushes cancel, so the bot stood still and took the hit. The scorch sweep (`HZ_SWEEP`) was handled as a circle of r 30 on the boss, not as a flame line that turns through 120 degrees. The new `hazardEscape` plays each candidate move (the planned move, the last escape, 16 headings at full speed, standing still) forward in a straight line, clamped to the arena and the cage, and tests it against each hazard's shape over the hazard's live window: circles by center distance, lanes by distance to the segment, and sweeps by distance to the flame line at that moment's angle. The planned move stands when it clears every hazard by 14 u; otherwise the bot takes the cheapest candidate (least damage, then more clearance, then closest to the plan). Damage-0 lanes count as threats too (the ROYAL LUNGE lane is the boss body's path, the PSI LANCE lanes the bolts' path).

## Result

Build: main `15c16b9` (src unchanged by this commit). Bots: `smart:SEED:7.5:nova:priority` (default bot) and `smart+focus:SEED:7.5:nova:priority`, SEED = 1001 x 1..30, 7.5 minutes (every mid1 fight ends by then). "before" is the bot at `15c16b9`; "after" is the bot of this commit. Both arms carry the two read-only counters added here (`hzDmg`, `dmgByKind`); the before arm gives the same end time and kills with and without them in 30 of 30 Wastes runs.

| World | Bot | Arm | mid1 fights ended by death | mid1 kills/deaths | mid1 median s | mid1 longest s | mid2 kills/deaths | Hazard HP lost (30 runs) | Lunge HP lost | Deaths by a hazard hit | Escape steps |
|---|---|---|---|---|---|---|---|---|---|---|---|
| wastes | smart+P | before | 9/29 | 20k/9d | 70.5 | 128.2 | 0k/0d | 4492 | - | 9/17 | - |
| wastes | smart+P | after | 0/29 | 29k/0d | 66.9 | 116.7 | 0k/0d | 0 | - | 0/17 | 17293 |
| wastes | smart+focus+P | before | 3/29 | 26k/3d | 25.3 | 43.3 | 0k/0d | 1544 | - | 3/15 | - |
| wastes | smart+focus+P | after | 0/29 | 29k/0d | 28.4 | 52.3 | 0k/0d | 0 | - | 0/16 | 5735 |
| depths | smart+P | before | 0/28 | 28k/0d | 53.2 | 121.0 | 0k/0d | 208 | - | 0/15 | - |
| depths | smart+P | after | 0/28 | 28k/0d | 51.4 | 101.6 | 0k/0d | 0 | - | 0/18 | 14043 |
| depths | smart+focus+P | before | 0/28 | 28k/0d | 19.7 | 41.2 | 0k/0d | 208 | - | 0/19 | - |
| depths | smart+focus+P | after | 0/28 | 28k/0d | 21.8 | 38.0 | 0k/0d | 0 | - | 0/20 | 6351 |
| hive | smart+P | before | 0/26 | 26k/0d | 53.6 | 93.8 | 0k/0d | 0 | 441 | 0/12 | - |
| hive | smart+P | after | 0/26 | 26k/0d | 58.6 | 158.9 | 0k/0d | 0 | 30 | 0/12 | 6461 |
| hive | smart+focus+P | before | 0/26 | 26k/0d | 24.6 | 42.5 | 0k/0d | 0 | - | 0/14 | - |
| hive | smart+focus+P | after | 0/26 | 26k/0d | 25.2 | 57.1 | 0k/0d | 0 | - | 0/13 | 2958 |

- Wastes, default bot: mid1 fights that end in the bot's death fall from 9 of 29 to 0 of 29 (the W3 note's 15 of 28 was the W3 build; this build's before arm gives 9 of 29). All 9 before-arm deaths in a mid1 fight were a hazard hit (`death.lastHitBy` -3). The focus bot's Wastes mid1 deaths fall from 3 to 0.
- Hazard HP lost falls to 0 in every world. The before arm shows the counter sees hazard hits (4492 HP in Wastes). Hive has no damaging hazard circle, but the ROYAL LUNGE lane: lunge HP lost 441 before, 30 after (Hive default bot, read from the ram hits at the boss's spot during the lunge).
- The escape acts in 2958 to 17293 steps per 30 runs (1.6 to 9.6 s of a 7.5 minute run on average), so it only steers inside telegraph windows.
- Side effect to keep in view for A6: the Hive default bot's mid1 fights got longer (median 53.6 to 58.6 s, longest 93.8 to 158.9 s on seed 3003) while it took 93% less lunge damage. The bot now leaves the lunge lane for the lane's whole window. One candidate cause, not measured: the default bot shoots the nearest enemy, so time spent away from the boss goes to the swarm at the fence. The runs of one seed diverge after the first escape, so per-seed differences are not attributable one by one; the focus bot's Hive median moved 24.6 to 25.2 s.

## Commands

```
# after (this commit's harness), per world W and bot B in {smart, smart+focus}
node scripts/playtest/playtest.mjs W B:1001:7.5:nova:priority B:2002:7.5:nova:priority ... B:30030:7.5:nova:priority --out=/tmp/ab/after-W-B
# before (the bot at 15c16b9; add the hzDmg and dmgByKind counters of this commit to read the HP columns)
git show 15c16b9:scripts/playtest/harness.js > /tmp/harness-before.js
node scripts/playtest/playtest.mjs W <the same configs> --harness=/tmp/harness-before.js --out=/tmp/ab/before-W-B
node scripts/playtest/analyze.mjs /tmp/ab/after-W-B      # A6 lines: fights and how they ended
```
