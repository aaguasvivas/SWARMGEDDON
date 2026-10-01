# P19 pass 'deaths': readable deaths (A10)

A10 (section 11): from the last step at 50% HP or more to death, the median must be 3.0 s or more and the minimum 1.2 s or more. The matrix scores the smart-family deaths (smart, smart+P, smart+focus+P, smart+dash+P, smart+E) and lists crude apart.

- Build under test: `e49114b` plus the src changes of this commit (`v2 P19: readable deaths (A10)`). The matrix headers print `e49114b (src has uncommitted changes)` because they ran before the commit.
- Harness: this commit's `scripts/` (the A10 window counters below). Dev server: `npx vite --port 5176 --strictPort`, `SWG_URL` default.
- Seeds: 1001 x k per world, T0, 14 minutes. Search arms k = 1..10, confirm and control k = 1..30.
- Date: 2026-10-01. Machine: 8 GB, load about 4, 5 GB of swap in use; the data volume ran out of space twice during the pass (other processes), and the matrix paused or stopped until it recovered. The runs it resumed reuse finished run files, so no number mixes two configs.

## Result

Seeds 1001 x 1..30 per world (control30 reused k = 1..10 from the baseline matrix runs; the a0-control arm below reran them and got the same end time, kills and A10 seconds in 180 of 180 runs).

| Arm | capFracOfMaxHp | ACID.maxStack | GRACE.hit | DMG_RAMP_PER_MIN | BITE.scale | A10 deaths | median s | min s | under 1.2 s | under 3.0 s | A10 median by world (hive, depths, wastes) | A7 smart+P (hive, depths, wastes) | A7 smart (hive, depths, wastes) | A8 smart (hive, depths, wastes) | A8 smart+P (hive, depths, wastes) | A8 crude (hive, depths, wastes) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| control30 (before) | 0.16 | every pool | 0.5 | 0.04 | 0.4 | 316 | 2.12 | 0.42 | 66 | 197 | 2.00, 1.99, 2.73 | 8/30, 7/30, 6/30 | 4/30, 3/30, 5/30 | 6:50, 6:15, 6:48 | 8:40, 6:58, 7:07 | 2:07, 2:09, 1:40 |
| deaths-confirm (after) | **0.08** | **1** | **0.8** | 0.04 | 0.4 | 207 | 3.83 | 0.82 | 7 | 81 | 6.25, 3.05, 5.52 | 23/30, 7/30, 17/30 | 12/30, 4/30, 11/30 | 9:35, 6:46, 10:16 | 14:00, 8:25, 14:00 | 2:08, 2:10, 1:43 |

| ID | Target | Before (control30) | After (deaths-confirm) | Result |
|---|---|---|---|---|
| A10 median | >= 3.0 s | 2.12 s | 3.83 s | PASS |
| A10 minimum | >= 1.2 s | 0.42 s (66 of 316 deaths under 1.2 s) | 0.82 s (7 of 207 under 1.2 s) | FAIL |
| A7 smart+P | 25 to 45% per world | 27%, 23%, 20% | 77%, 23%, 57% | FAIL (Hive and Wastes over, Depths under) |
| A7 smart | 5 to 25% per world | 13%, 10%, 17% | 40%, 13%, 37% | FAIL (Hive and Wastes over) |
| A8 smart | >= 5:30 | 6:50, 6:15, 6:48 | 9:35, 6:46, 10:16 | PASS |
| A8 smart+P | >= 8:00 | 8:40, 6:58, 7:07 | 14:00, 8:25, 14:00 | PASS (was FAIL in Depths and Wastes) |
| A8 crude | >= 2:30, Hive >= the others | 2:07, 2:09, 1:40 | 2:08, 2:10, 1:43 | FAIL (unchanged: the crude bot still dies in its third minute; its deaths got slower, not later) |

A10 by set after: smart 60 deaths, median 3.36 s, min 0.87 s; smart+P 42, 3.95, 0.90; smart+focus+P 48, 4.88, 0.82; smart+dash+P 10, 5.32, 2.28; smart+E 47, 3.83, 0.85. Crude (not scored): 90 deaths, median 1.69 s before and 3.27 s after.

The full matrix reports are `docs/tuning/deaths-confirm.md` (A2 to A11 and A18 on the new values) and `docs/tuning/control30.md` (A6 to A10 on the old values).

## Chosen values

| Knob (`src/config.ts`, A1.1) | Before | After | Why |
|---|---|---|---|
| `BITE.capFracOfMaxHp` | 0.16 | 0.08 | Bites were half of the window damage and hit the cap in every engulf: 0.16 x maxHp per 0.4 s is 40 dps for NOVA, so two capped bites and one shot took 50% HP in 0.42 s. At 0.08 an engulf deals 20 dps: 2.5 s from half HP on bites alone. 0.10 gave the best single-knob median but kept 13 of 93 deaths under 1.2 s; 0.08 with the acid rule took that to 5 of 77. |
| `ACID.maxStack` (new) | every overlapping pool | 1 | Up to 4 pools hurt at once (seen: 67.5 HP of acid in 0.7 s in one window). Now one overlapping pool hurts per tick (the first in pool order; pools differ only by the time ramp at landing, under 0.4% over a pool's 5 s life). The pool dps (16 x dmgMul at landing) moved from `acid.ts` to `ACID.dps`, unchanged. |
| `GRACE.hit` | 0.5 s | 0.8 s | Shots, charger rams and hazards (discrete hits) were 44% of the window damage (shots 41%, rams 3%), 17 to 36 HP each after the time ramp, one every 0.5 s. At 0.8 s a window under 1.2 s holds 2 discrete hits, not 3. Not one of the three knobs the pass named: it is the cadence of the second-largest source, a number in `config.ts`. Without it (arm c4) the 10-seed tail was 5 of 77 under 1.2 s and min 0.68 s; with it (c5) 2 of 75 and min 0.90 s, at the same A7 rates within noise. Revert this one number if the owner wants the pass to stay inside the named knobs. |
| `BITE.scale` | 0.4 | 0.4 (kept) | 0.32 lowered every bite, including single contacts, but not the capped engulf bites that make the tail (18 of 98 under 1.2 s, median 2.85 s). |
| `DMG_RAMP_PER_MIN` | 0.04 | 0.04 (kept) | 0.02 alone left 13 of 94 deaths under 1.2 s; on top of the other three it made Hive smart+P win 9 of 10 and smart 6 of 10 (arm c7). |

Code change (allowed by the pass for the acid rule): `src/systems/acid.ts` counts the overlapping pools that hurt in a tick and stops at `ACID.maxStack`; at `maxStack` 64 (`MAX_ACID`) it is the old loop, call for call.

## What kills fast (old values)

The harness now records the A10 window itself: HP at the last step at 50% or more, then the damage by kind and the healing until death (`death.hpAtHalf`, `dmgFromHalfByKind`, `healFromHalf`). Control30, seeds k = 11..30 (k = 1..10 are the baseline runs, which predate the counters), summed over the windows: bite 10258 HP (49%), shot 8416 (41%), acid 1541 (7%), ram 522 (3%). Hazards: 0 (the hazard escape of the previous P19 commit).

Fastest deaths before (seconds, HP at the window start / max HP, damage in the window):

- depths_smart_8008_priority: 0.42 s, 52/100, two capped bites (16 each) and one psychic shot (22.1)
- depths_smart_25025: 0.42 s, 54.9/100, bite 31.7, shot 31.8
- depths_smart_dash_11011_priority: 0.42 s, 58.2/100, bite 30.1, shot 32.8
- hive_smart_16016_priority: 0.48 s, 62.8/125, acid 30.3, bite 34, shot 15.9
- hive_smart_focus_7007_priority: 0.52 s, spitter shots and stacked acid (a baseline run without the window counters; last 3 s: shot 69.2, acid 34.2)

Damage one window under 1.2 s can hold, by the rules (NOVA, 100 HP, at 9:00 where dmgMul is 1.36):

| Source | Before | After |
|---|---|---|
| Bites (one per 0.4 s: 3 in the window) | 3 x 16 = 48 | 3 x 8 = 24 |
| Discrete hits (one per GRACE.hit) | 3 at 0.5 s: spitter 19, psychic 24.5, Warden or charger ram 35.4 each | 2 at 0.8 s, same sizes |
| Acid (16 x 1.36 dps per pool) | up to 4 pools: 104 | 1 pool: 26 |

## Why the minimum still fails

All 7 deaths under 1.2 s on the new values are two discrete hits 0.8 s apart plus one to three capped bites:

- depths_smart_focus_20020_priority: 0.82 s at 5:12, 50.4/100 HP, two psychic shots (43.4), bite 14.8
- hive_smart_28028_evolve: 0.85 s at 10:25, 61.3/100, two spitter shots (39.6), acid 19.2, bite 16
- depths_smart_27027: 0.87 s at 6:42, 57.9/100, two psychic shots (45.6), bite 16
- depths_smart_focus_15015_priority: 0.88 s at 9:32, 60.1/100, a Warden shot and a psychic shot (60.7), bite 16
- wastes_smart_6006_priority: 0.90 s at 9:21, 55.3/100, two cinder charger rams (71.4), bite 16
- depths_smart_4004: 0.95 s at 5:41, 56.1/100, two psychic shots (44.2), three bites (24)
- hive_smart_29029: 1.13 s at 5:24, 53.4/100, two spitter shots (34), bites 22.6, acid 3.9

Any `GRACE.hit` under 1.2 s lets two discrete hits into one window, and two Warden shots or two charger rams (35.4 HP each at 9:00) are 70% of NOVA's HP before any bite. No value of the knobs in this pass bounds that without making shots harmless. A guaranteed 1.2 s needs the discrete hits capped near 15% of max HP each: enemy `projectileDamage` and the charger's `damage` in `src/content/enemies.ts` (content), or a cap on all damage per window across sources (a rule change). That is the owner's or a later pass's decision; this pass leaves it open.

## Side effects for the next passes

- **A7 (win rates) overshoot in Hive and Wastes**, as the pass brief expected: smart+P 77% and 57%, smart 40% and 37%. Depths stays at 23% and 13%; its windows carry the largest shot share after the change (shots 51% of the window damage in Depths, 43% Wastes, 38% Hive). At 10 seeds Hive smart+P won 4 of 10 on the old values and 5 to 7 of 10 in the arms, with or without a lower cap, so the 10-seed rates cannot separate the cap values. The boss-HP and density passes take the overshoot.
- **A8**: smart and smart+P pass everywhere now. Crude does not move (about 2:08: its deaths got slower, A10 median 1.69 to 3.27 s, but not later), and Hive crude (2:08) is under Depths (2:10), so the order clause fails as before.
- **A6** (from `deaths-confirm.md`): focus finals got shorter, Hive 25.8 to 19.7 s and Wastes 37.8 to 31.6 s (more levels at the final), so the 40 s floor fails further; the default bot's longest fight goes from 181.1 to 173.5 s in Hive and from 173.5 to 210 s in Wastes (a 180 s ascend and a 210 s open final), against the 150 s cap; kill-to-next-arrival min is 20 s (the BOSS_MIN_GAP floor, was 51.1 s).
- **A3**: alive max 477, over row maxAlive 269, saturated share max 0.352 (baseline, 10 seeds: 440, 243, 0.368). These are maxima over 30 runs per set against 10, and more runs live through the dense rows 8 to 10.
- **A9**: smart+P median level Hive L8/L17/L21, Depths L9/L17.5/L21, Wastes L10/L17/L19 at 3:00/8:00/11:00; gaps over 60 s in Hive 20 of 30 runs, Depths 8 of 30, Wastes 19 of 30 (baseline, 10 seeds: 6, 1 and 6 of 10).
- **A18**: dash ratio Hive 1.12x, Depths 1.42x, Wastes 1.22x (baseline 1.39, 1.28, 1.50; smart+P lives to 14:00 more often, so the ratio saturates); fusion by 4:00 and evolve rates pass; roam XP whole-run min 0.845 Hive, 0.914 Depths, 0.822 Wastes (baseline 0.944, 0.918, 0.863 over 10 seeds; this is a minimum over 30 runs of the invincible roam bot, which the damage values reach only through which enemy shots hit and vanish).
- **A12 and A13** on the new values: see the last section.

## Arms (10 seeds per world, one knob at a time, then combined)

Bold marks the knob changed from the old values. Each arm reran the A6 to A10 sets (smart, smart+P, smart+focus+P, smart+dash+P, smart+E, crude) on seeds 1001 x 1..10. The a0-control arm reran the old values and matched the baseline matrix in 180 of 180 runs.

| Arm | capFracOfMaxHp | ACID.maxStack | GRACE.hit | DMG_RAMP_PER_MIN | BITE.scale | A10 deaths | median s | min s | under 1.2 s | under 3.0 s | A10 median by world (hive, depths, wastes) | A7 smart+P (hive, depths, wastes) | A7 smart (hive, depths, wastes) | A8 smart (hive, depths, wastes) | A8 smart+P (hive, depths, wastes) | A8 crude (hive, depths, wastes) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| a0-control | 0.16 | every pool | 0.5 | 0.04 | 0.4 | 99 | 2.57 | 0.42 | 15 | 58 | 2.83, 2.02, 4.38 | 4/10, 3/10, 3/10 | 1/10, 1/10, 3/10 | 6:19, 6:21, 6:53 | 9:44, 8:19, 6:57 | 2:07, 2:07, 1:39 |
| cap10 | **0.10** | every pool | 0.5 | 0.04 | 0.4 | 93 | 3.97 | 0.52 | 13 | 40 | 3.11, 2.82, 6.50 | 5/10, 2/10, 3/10 | 1/10, 1/10, 4/10 | 8:41, 6:50, 8:38 | 12:11, 7:05, 8:02 | 2:07, 2:07, 1:41 |
| cap12 | **0.12** | every pool | 0.5 | 0.04 | 0.4 | 95 | 2.42 | 0.6 | 16 | 55 | 1.69, 2.28, 4.92 | 5/10, 2/10, 2/10 | 1/10, 1/10, 2/10 | 6:19, 6:44, 7:19 | 14:00, 9:09, 7:14 | 2:07, 2:07, 1:40 |
| acid1 | 0.16 | **1** | 0.5 | 0.04 | 0.4 | 97 | 2.42 | 0.42 | 11 | 58 | 1.83, 2.02, 5.03 | 5/10, 3/10, 2/10 | 1/10, 1/10, 3/10 | 6:23, 6:21, 6:53 | 12:11, 8:19, 6:57 | 2:08, 2:07, 1:39 |
| ramp02 | 0.16 | every pool | 0.5 | **0.02** | 0.4 | 94 | 2.81 | 0.42 | 13 | 50 | 3.08, 1.92, 5.05 | 5/10, 2/10, 2/10 | 2/10, 0/10, 2/10 | 7:20, 6:27, 6:42 | 11:21, 6:42, 6:57 | 2:08, 2:07, 1:39 |
| scale32 | 0.16 | every pool | 0.5 | 0.04 | **0.32** | 98 | 2.85 | 0.5 | 18 | 49 | 2.05, 3.05, 4.29 | 6/10, 1/10, 1/10 | 1/10, 1/10, 3/10 | 6:24, 6:55, 6:58 | 14:00, 7:12, 8:11 | 2:07, 2:07, 1:39 |
| grace06 | 0.16 | every pool | **0.6** | 0.04 | 0.4 | 91 | 2.57 | 0.42 | 17 | 57 | 2.23, 2.07, 3.73 | 6/10, 4/10, 2/10 | 2/10, 1/10, 3/10 | 6:36, 6:21, 6:47 | 14:00, 9:34, 6:57 | 2:08, 2:07, 1:39 |
| grace08 | 0.16 | every pool | **0.8** | 0.04 | 0.4 | 96 | 2.49 | 0.42 | 11 | 59 | 3.02, 2.02, 2.92 | 4/10, 2/10, 2/10 | 3/10, 1/10, 3/10 | 8:19, 6:37, 6:47 | 9:11, 6:35, 6:32 | 2:08, 2:07, 1:39 |
| c1-cap10-acid1 | **0.10** | **1** | 0.5 | 0.04 | 0.4 | 85 | 3.5 | 0.52 | 11 | 38 | 2.13, 2.82, 5.79 | 6/10, 2/10, 3/10 | 3/10, 1/10, 4/10 | 9:11, 6:50, 8:38 | 14:00, 7:05, 8:02 | 2:08, 2:07, 1:41 |
| c4-cap08-acid1 | **0.08** | **1** | 0.5 | 0.04 | 0.4 | 77 | 3.57 | 0.68 | 5 | 32 | 4.33, 2.72, 4.10 | 6/10, 3/10, 3/10 | 3/10, 2/10, 4/10 | 8:14, 6:52, 12:07 | 14:00, 6:50, 8:11 | 2:08, 2:07, 1:42 |
| c2-cap10-acid1-grace08 | **0.10** | **1** | **0.8** | 0.04 | 0.4 | 80 | 3.21 | 0.82 | 8 | 36 | 4.15, 2.82, 6.02 | 7/10, 2/10, 4/10 | 5/10, 1/10, 2/10 | 12:00, 6:52, 7:03 | 14:00, 6:33, 9:19 | 2:08, 2:07, 1:41 |
| c3-cap10-acid1-ramp02 | **0.10** | **1** | 0.5 | **0.02** | 0.4 | 75 | 3.23 | 0.82 | 6 | 33 | 3.03, 2.51, 12.14 | 7/10, 0/10, 4/10 | 4/10, 0/10, 2/10 | 9:14, 6:26, 9:29 | 14:00, 6:33, 12:07 | 2:08, 2:07, 1:41 |
| c5-cap08-acid1-grace08 (chosen) | **0.08** | **1** | **0.8** | 0.04 | 0.4 | 75 | 3.72 | 0.9 | 2 | 30 | 6.83, 3.03, 4.38 | 7/10, 3/10, 5/10 | 4/10, 1/10, 3/10 | 9:56, 6:53, 9:32 | 14:00, 6:49, 11:40 | 2:08, 2:07, 1:42 |
| c6-cap10-acid1-grace08-ramp02 | **0.10** | **1** | **0.8** | **0.02** | 0.4 | 65 | 3.27 | 0.83 | 6 | 27 | 4.91, 2.83, 8.22 | 7/10, 0/10, 6/10 | 5/10, 0/10, 2/10 | 11:50, 6:52, 8:24 | 14:00, 6:29, 14:00 | 2:09, 2:07, 1:41 |
| c7-cap08-acid1-grace08-ramp02 | **0.08** | **1** | **0.8** | **0.02** | 0.4 | 64 | 4.73 | 0.87 | 2 | 20 | 4.12, 3.62, 8.26 | 9/10, 1/10, 5/10 | 6/10, 2/10, 3/10 | 14:00, 6:52, 7:48 | 14:00, 6:44, 11:28 | 2:09, 2:07, 1:42 |

Reading the arms:

- The 10-seed medians move by about 0.4 s from run divergence alone: cap12, which can only lower damage, gave 2.42 s against the control's 2.57 s. The count under 1.2 s and the damage inside the failing windows were the readable signals, and the decisions rest on them and on the 30-seed confirm.
- No single knob touched the tail: 11 to 18 deaths under 1.2 s in every single-knob arm (control 15). The same death (depths 8008, two capped bites and a shot in 0.42 s) came back unchanged in the acid1, grace06 and grace08 arms, which do not touch it.
- The bite cap is the only single knob that moved the median (cap10: 3.97 s). The acid rule and the hit grace cut the tail only together with it (c4, c5).
- The minimum over the 30-seed confirm can only be equal to or lower than the 10-seed minimum of the same values (seeds 1..10 are in it): c5 gave 0.90 s at 10 seeds and 0.82 s at 30.

## A12 and A13 on the new values

Seeds as in the matrix: A12 Hive `smart:SEED:14:nova:priority:T`, k = 1..30 (T0 is the smart+P set); A13 the OVERTIME sets 1 and 2 (`smart:SEED:25:nova:priority:T:ot`). Report: `docs/tuning/deaths-confirm-a12-a13.md`.

| ID | Target | Before (baseline matrix, 10 seeds for A12) | After (30 seeds for A12) | Result |
|---|---|---|---|---|
| A12 | T4 <= 15%; T1 <= T0 | T0 4/10, T1 3/10, T4 0/10 | T0 23/30 (77%), T1 19/30 (63%), T4 2/30 (7%) | PASS |
| A13 | >= 90% of the runs that won dead by 20:00; none past 24:00 | 25/33 (76%), 4 alive past 24:00 | 47/72 (65%), 18 alive past 24:00 | FAIL, worse |

A13 gets worse for the same reason as A7: more runs win (72 against 33 in the same sets), and the capped bites, the single acid pool and the slower discrete hits also apply in OVERTIME, where `otDmgMul` raises the damage per hit but not the cadence or the bite cap (the cap is a share of max HP). The OVERTIME pass needs these values in view.

## A14 determinism on the new values

`node scripts/playtest/matrix.mjs --only=A14 --label=deaths-a14 --runs=/tmp/swg-deaths/a14 --out=/tmp/swg-deaths/reports` (report: `docs/tuning/deaths-a14.md`): 21 of 21 lines, 0 splits. det at 375x667, 667x375 and with the settings injection: hive 642fbc46, depths 1365ccb6, wastes d3c8cef6 (the W5 hashes: the det window has no player damage). det-long at both views: 8c3766b0, 54a5737, 51ca7954. det-death at both views: 7408614a (death at 159 s), 5739e8a2 (141.87 s), 224be1c (168.1 s).

## Harness and script changes (this commit)

- `scripts/playtest/harness.js`: the A10 window counters (`death.hpAtHalf`, `dmgFromHalfByKind`, `healFromHalf`). Read only; the sim is unchanged.
- `scripts/playtest/matrix.mjs`: the A10 details count the deaths under 1.2 s and 3.0 s, sum the window damage by kind, and list the fastest deaths with their window; `mmss` no longer prints `11:60` for 719.6 s.

## Commands

```
# dev server (never killed)
cd /Users/Adelson/Desktop/personal/SWARMGEDDON && npx vite --port 5176 --strictPort

# one search arm: set the arm's values in src/config.ts, then
node scripts/playtest/matrix.mjs --seeds=10 --only=A6,A7,A8,A9,A10 --label=<arm> --runs=/tmp/swg-deaths/<arm> --out=/tmp/swg-deaths/reports
#   the values per arm are in the arms table; ACID.maxStack 64 (= MAX_ACID) is the old "every pool"

# confirm (this commit's values)
node scripts/playtest/matrix.mjs --seeds=30 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=deaths-confirm --runs=/tmp/swg-deaths/confirm --out=/tmp/swg-deaths/reports
node scripts/playtest/matrix.mjs --seeds=30 --only=A12,A13 --label=deaths-confirm-a12-a13 --runs=/tmp/swg-deaths/confirm --out=/tmp/swg-deaths/reports

# control (old values: GRACE.hit 0.5, BITE.capFracOfMaxHp 0.16, ACID.maxStack 64)
node scripts/playtest/matrix.mjs --seeds=30 --only=A6,A7,A8,A9,A10 --label=control30 --runs=/tmp/swg-deaths/control30 --out=/tmp/swg-deaths/reports
```

Each bot set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>` with the configs `smart:SEED:14`, `smart:SEED:14:nova:priority`, `smart+focus:SEED:14:nova:priority`, `smart+dash:SEED:14:nova:priority`, `smart:SEED:14:nova:evolve`, `crude:SEED:14` (and `roam:SEED:14` for A3 and A18), SEED = 1001 x k. Every command, config by config, is in `meta.commands` of `deaths-confirm.json` and `control30.json`.
