# P19 pass 'bosshp': boss HP and fight length (A6, A7)

A6 (section 11): the boss-focus bot (`smart+focus:SEED:14:nova:priority`) kills mid1 and mid2 in a median of 20 to 40 s and the PRIME in 40 to 75 s; the default bot (`smart:SEED:14:nova:priority`, smart+P) has no fight over 150 s except a stalemate; kill to next arrival at least 20 s. A7: smart+P wins 25 to 45%, smart 5 to 25%, per world.

- Build under test: `56dd2d9` plus the src changes of this commit (`v2 P19: boss HP and fight length (A6, A7)`). The matrix headers print `56dd2d9 (src has uncommitted changes)` because they ran before the commit. The control ran on `56dd2d9` with a clean tree.
- Harness: this commit's `scripts/`. Dev server: `npx vite --port 5176 --strictPort`, `SWG_URL` default.
- Seeds: 1001 x k per world, T0, 14 minutes, NOVA, with evolutions, cores and bonuses live. Search arms k = 1..10 (a1 to a3) or 1..30; confirm k = 1..30; holdout k = 31..60 (`--seed-from=31`).
- Date: 2026-10-01. Machine: 8 GB, load about 4, 5 GB of swap in use, 1.5 to 3 GB free on the data volume.
- An earlier attempt of this pass ran the control and arms a1 to a8 and was stopped by a usage limit during its confirm. This pass reran the confirm from scratch on the same values and got the same numbers line for line (the sim is deterministic: every A2 to A18 line of the two confirm runs matches), then added arms b1, b2, c1 and c2 and the holdout set.

## Result

Before is the control (`docs/tuning/bosshp-control30.md`, the values of `56dd2d9`). That report ran before the analyzer's run-end stalemate rule (below), so it lists the Wastes default longest as 210 s, a PRIME still alive when the 14-minute run ended at 209.98 s; this table counts that fight as the stalemate it was about to be, which leaves the 180 s mid2 ascend as the longest. After is `docs/tuning/bosshp-confirm.md` (seeds 1..30) and, for A6 and A7, the 60-seed union with `docs/tuning/bosshp-holdout.md` (seeds 31..60).

| ID | Target | Before (control, seeds 1..30) | After (seeds 1..30) | After (seeds 1..60) | Result |
|---|---|---|---|---|---|
| A6 focus mid1 / mid2 / final, Hive | 20-40 / 20-40 / 40-75 s | 23.6 / 18.5 / 19.7 | 26.6 / 26.7 / 60.6 | 24.9 / 24.5 / 53.2 | PASS |
| A6 focus, Depths | same | 21.8 / 17.9 / 26.9 | 24.0 / 22.0 / 64.2 | 23.4 / 21.0 / 54.3 | PASS |
| A6 focus, Wastes | same | 27.3 / 26.0 / 31.6 | 25.1 / 23.3 / 59.2 | 24.3 / 20.9 / 52.3 | PASS |
| A6 default bot, fights over 150 s (mid1 / mid2 / final; Hive, Depths, Wastes) | none, stalemates excepted | 0/1/2, 0/0/0, 0/1/1 | 0/1/2, 1/0/4, 0/0/6 | 0/1/10, 1/0/9, 0/2/10 | FAIL (the PRIME clause has no feasible HP; see below) |
| A6 default bot, longest fight | <= 150 s | 173.5, 101.6, 180.0 s | 176.4, 202.2, 195.8 s | 206.9, 202.2, 202.8 s | FAIL |
| A6 kill to next arrival | >= 20 s | 20.0 s | 20.1 s | 20.1 s | PASS |
| A7 smart+P | 25-45% | 23/30, 7/30, 17/30 (77, 23, 57%) | 13/30, 9/30, 12/30 (43, 30, 40%) | 28/60, 26/60, 26/60 (47, 43, 43%) | 30 seeds PASS; 60 seeds FAIL in Hive by 1 run |
| A7 smart | 5-25% | 12/30, 4/30, 11/30 (40, 13, 37%) | 7/30, 0/30, 6/30 (23, 0, 20%) | 13/60, 5/60, 12/60 (22, 8, 20%) | 30 seeds FAIL in Depths (0/30); 60 seeds PASS |

Default bot fights that ended in the bot's death: 0 of 427 over 60 seeds (the hazard escape of the P19 baseline holds). The focus bot died in 1 of 412 (Wastes mid2, seed 4004, 37.8 s).

A7 on 10 seeds per world (the table's sample size, seeds 1..10): smart+P 4/10, 2/10, 1/10; smart 2/10, 0/10, 2/10. Ten seeds cannot resolve this band: the two 30-seed halves of the same values differ by 2 to 8 wins per world (Depths smart+P 9/30 and 17/30).

## Chosen values

| Knob | Before | After | Why |
|---|---|---|---|
| `BOSS_STAGES.mid1.hpBase` (A10.2) | 2400 | 2760 | Margin over the 20 s floor. At 2400 the Depths focus median was 21.8 s, and the 10-seed arm a2 put every world at 25 to 33 s. Arm b1 (2560) removed the Depths mid1 tail (159.5 to 107.8 s) but moved everything after it: Hive mid2 focus 18.3 s (fail) and smart+P wins 15/30 and 16/30 in Hive and Wastes (over). |
| `BOSS_STAGES.mid2.hpBase` | 2600 | 3380 | The focus medians failed the 20 s floor (Hive 18.5, Depths 17.9 s). At 3380 they are 26.7, 22.0 and 23.3 s (60 seeds: 24.5, 21.0, 20.9 s). Arm b2 (3150) fixed the one Hive mid2 tail fight but dropped Depths to 19.8 s (fail) and Depths smart+P to 7/30 (under). |
| `BOSS_STAGES.overtime` | the mid2 object | `{ ...MID2, hpBase: 2600 }` | The OVERTIME boss shared mid2's object, so raising mid2 would have raised every OT boss by 30% and moved A13. It keeps 2600 as its own `hpBase`; A13 stays with the OVERTIME knobs. |
| `BOSS_STAGES.final.hpBase` | 4200 | 9800 | See "Why the PRIME needs 9800" below. 7000 (a4) left the Depths focus median at 39.4 s and Hive smart+P at 21/30 (70%). 10300 (c1) and 11300 (c2) did not improve A7 on 60 seeds (Hive smart+P 30/60 and 27/60, against 28/60) and pushed the focus PRIME toward 75 s on seeds 1..30 (Hive 74.4, Wastes 74.8 s at 11300). |
| `WorldScript.boss.primeHpMul` (new, A10.1) | none | Hive 1.0, Depths 1.0, Wastes 0.95 | The decided per-world PRIME factor. Depths 1.15 (a6) put the Depths smart+P wins at 6/30 (20%, under the band); at 1.0 the Matron PRIME already measures like the Queen PRIME (focus 64.2 against 60.6 s; 60 seeds 54.3 against 53.2 s). Wastes: 1.0 (a5) focus 68.1 s, A7 11/30 and 7/30; 0.95 (a8) 59.2 s, 12/30 and 6/30; 0.9 (a7) 51.2 s but smart 8/30 (27%, over). 0.95 is the one value of the three that passes both A7 bands, and it puts the PRIME near the middle of the 40 to 75 s band. |
| Wastes `worldMul` (A7.2) | 1.15 | 0.9 | 1.15 dates from before the hazard escape, when the bot died in 15 of 28 Wastes mid1 fights (W3 numbers). With the hazard escape the bot lives through them, and at 1.15 (a2, 10 seeds) the Wastes focus medians were 33.0 / 39.9 s and the default bot had a 180 s mid2 ascend and a 173 s mid2 kill. At 0.9 (a3): 28.6 / 24.4 s and a longest default fight of 139.3 s. `worldMul` also scales the Wastes OVERTIME boss, which now has 22% less HP; A13 is measured in Hive only. |

Code change (the decided knob): `beginFight` in `src/systems/director.ts` multiplies the boss HP by `script.boss.primeHpMul` when the stage is `'final'`, and by 1 for mid1, mid2 and OVERTIME. It is the one place boss HP is set, so the factor applies once per PRIME (the ascend path calls the same function with `'final'`).

## Why the PRIME needs 9800

At 4200 on the deaths-pass build the focus PRIME took 19.7, 26.9 and 31.6 s (band 40 to 75 s), and smart+P won 77% of Hive runs. Two things moved it there:

- **The deaths pass made the player sturdier.** More bots reach the PRIME, with more levels: focus PRIME medians fell from 25.8 to 19.7 s (Hive) and 37.8 to 31.6 s (Wastes) across that pass, and Hive smart+P survival went from 8:40 to 14:00 (`pass-deaths.md`).
- **Damage at the PRIME outgrows `buildScale`.** Boss HP grows with `buildScale ** 0.75`, and `buildScale` counts only the base weapon's damage per second. The focus bot's damage per second on the boss (boss HP over fight length, median per world), divided by `88 x buildScale`, is 0.95 to 0.99 at mid1 in every world on the control and the confirm (no cores yet) and 1.13 to 1.61 at the PRIME on the control (median 2 cores taken before the PRIME; evolutions, fusions and pickup weapons are not in `buildScale`). With `buildScale` about 6 at the PRIME against 2 at mid1, a fight lasts `hpBase / (88 x buildScale ** 0.25 x ratio)`, so the PRIME gets about 0.55 of mid1's seconds per unit of `hpBase`. The old 4200 / 2400 (1.75x) gave a PRIME about as long as mid1; 9800 / 2760 (3.55x) gives about twice mid1 (25 s to 50 to 60 s).

A7 sets the same floor on its own: Hive smart+P won 23/30 at 4200, 21/30 at 7000 and 13/30 at 9800.

## Why the default-bot clause cannot pass at the PRIME

`fightwindow.mjs` computes, for one HP factor k on the PRIME, the window each clause leaves (fight length about proportional to HP; a stalemate stays a stalemate for k >= 1). On the 60 seeds at the chosen values:

| World | focus 40-75 s | default none over 150 s | A7 smart+P | A7 smart | all clauses | all but the default clause |
|---|---|---|---|---|---|---|
| Hive | 0.76-1.40 | 3.68-4 | 1.02-1.57 | 1-1.79 | none | 1.02-1.40 |
| Depths | 0.74-1.38 | 0.40-0.74 | 0.40-1.79 | 0.40-2.10 | 0.74 | 0.74-1.38 |
| Wastes | 0.77-1.43 | 2.65-3.12 | 1-1.54 | 1-2.21 | none | 1-1.43 |

A7 wants 55 to 75% of smart+P runs to end without a PRIME kill, and most smart+P runs reach the PRIME (45, 26 and 38 of 60), so in Hive at least 18 of its 45 PRIME fights must end without a kill, which in practice means the 210 s stalemate. The default bot's PRIME lengths spread from 11 to 210 s with no gap: at the chosen values 18, 17 and 16 kills are under 150 s, 10, 9 and 10 kills are between 150 and 210 s, and 17, 0 and 12 fights are stalemates (Hive, Depths, Wastes, 60 seeds). Every PRIME value tested left kills between 150 and 210 s in at least two worlds (4200: 2, 0, 1 on 30 seeds; 7000: 5, 0, 2; 9800: 2, 4, 6; 11300: 4, 0, 3). One fight's length is also not a smooth function of HP: from 9800 to 10300 the same seeds' PRIME kills took 0.45 to 5.45 times as long, and 15 of the 109 smart+P PRIME fights changed between kill and stalemate (7 kills became stalemates, 8 stalemates became kills, though the PRIME had 5% more HP). No PRIME HP passes this clause together with A7 and the focus band. Options for the owner: count the PRIME fight as passing when it ends by kill or by the 210 s stalemate (the stalemate is the PRIME's timeout), cap the default bot's median instead of its maximum, or move the stalemate to 150 s (a rule change: the run's 14:00 end, `UNCLEARED_MAX_MS` and the clear-speed score depend on it).

The mid fights fail the clause on single fights: Hive mid2 seed 9009 (159.9 s) and Depths mid1 seed 6006 (159.5 s) on seeds 1..30, plus a Wastes mid2 ascend (180 s) and a 152.2 s mid2 kill on seeds 31..60. The mid2 window is empty on 60 seeds (Hive needs k <= 0.94 for its tail, Depths and Wastes need k >= 0.95 and 0.96 for the focus floor). The mid1 window is 0.85 to 0.94 (2350 to 2590), but the arm inside it (b1, 2560) moved mid2 and A7 out of their bands: a 7% HP step on a mid fight reshuffles every later fight by more than it moves the tail.

## Depths smart (A7, 0/30 on seeds 1..30)

29 of 30 Depths smart runs died before the PRIME, all outside boss fights (deaths at 3:56 to 10:12, median survival 6:50); the one that reached it stalemated. The wins can only come from the runs that reach the PRIME, and across the arms that is 1 to 6 Depths smart runs of 30 (a4, c1 and c2: 1; b2: 3; b1: 5; seeds 31..60 at the chosen values: 6, of which 5 won). On seeds 31..60 the chosen values give 5/30, and 5/60 over both halves (8%, in band). Depths smart survival to 10:30 belongs to the density pass (rows 5 to 10), not to boss HP.

## Arms

Each cell lists the three worlds (Hive; Depths; Wastes). Focus: the boss-focus bot's median kill time mid1 / mid2 / final, in s. Kills: focus kills per stage. Over 150: default-bot fights over 150 s per stage (mid1/mid2/final), stalemates excepted. Longest: the default bot's longest non-stalemate fight. Values not listed in a row are the row above's, except where the arm says "from".

| Arm | Seeds | Change | Focus (s) | Focus kills | Over 150 | Longest (s) | A7 smart+P | A7 smart |
|---|---|---|---|---|---|---|---|---|
| control | 1..30 | `56dd2d9`: mid1 2400, mid2 2600, final 4200, Wastes worldMul 1.15 | 23.6 / 18.5 / 19.7; 21.8 / 17.9 / 26.9; 27.3 / 26 / 31.6 | 30/23/19; 28/14/10; 30/23/13 | 0/1/2; 0/0/0; 0/1/1 | 173.5, 101.6, 180.0 | 23/30, 7/30, 17/30 | 12/30, 4/30, 11/30 |
| a1 | 1..10 | mid2 3380 | 22.5 / 26.3 / 27.4; 21.6 / 23.5 / 23.2; 30.2 / 34.5 / 36.8 | 10/9/7; 10/4/2; 10/9/5 | 0/2/1; 0/0/0; 0/2/2 | 167.3, 120.6, 200.3 | 5/10, 2/10, 4/10 | 4/10, 1/10, 3/10 |
| a2 | 1..10 | mid1 2760 | 26.3 / 28 / 25.9; 25.3 / 27.9 / 32.7; 33 / 39.9 / 48.4 | 10/9/7; 10/5/2; 10/6/3 | 0/1/0; 1/0/0; 1/2/2 | 159.9, 159.5, 180.0 | 6/10, 2/10, 6/10 | 2/10, 0/10, 4/10 |
| a3 | 1..10 | Wastes worldMul 0.9 | 26.3 / 28 / 25.9; 25.3 / 27.9 / 32.7; 28.6 / 24.4 / 31.2 | 10/9/7; 10/5/2; 10/7/6 | 0/1/0; 1/0/0; 0/0/0 | 159.9, 159.5, 139.3 | 6/10, 2/10, 3/10 | 2/10, 0/10, 4/10 |
| a4 | 1..30 | final 7000 | 26.6 / 26.7 / 42.9; 24 / 22 / 39.4; 25.1 / 23.3 / 42.8 | 30/24/20; 28/17/10; 30/22/16 | 0/1/5; 1/0/0; 0/0/2 | 192.3, 159.5, 164.7 | 21/30, 9/30, 14/30 | 6/30, 1/30, 10/30 |
| a5 | 1..30 | final 9800 (from a3) | 26.6 / 26.7 / 60.6; 24 / 22 / 64.2; 25.1 / 23.3 / 68.1 | 30/24/20; 28/17/10; 30/22/16 | 0/1/2; 1/0/4; 0/0/6 | 176.4, 202.2, 204.6 | 13/30, 9/30, 11/30 | 7/30, 0/30, 7/30 |
| a6 | 1..30, Depths | Depths primeHpMul 1.15 | -; 24 / 22 / 59.8; - | -; 28/17/10; - | -; 1/0/1; - | 196.5 | 6/30 | 0/30 |
| a7 | 1..30, Wastes | Wastes primeHpMul 0.9 | -; -; 25.1 / 23.3 / 51.2 | 30/22/16 | 0/0/3 | 171.3 | 11/30 | 8/30 |
| a8 = chosen | 1..30, Wastes | Wastes primeHpMul 0.95 | -; -; 25.1 / 23.3 / 59.2 | 30/22/16 | 0/0/6 | 195.8 | 12/30 | 6/30 |
| confirm (chosen) | 1..30 | a5 with Wastes primeHpMul 0.95 | 26.6 / 26.7 / 60.6; 24 / 22 / 64.2; 25.1 / 23.3 / 59.2 | 30/24/20; 28/17/10; 30/22/16 | 0/1/2; 1/0/4; 0/0/6 | 176.4, 202.2, 195.8 | 13/30, 9/30, 12/30 | 7/30, 0/30, 6/30 |
| holdout (chosen) | 31..60 | same values | 24.8 / 20.6 / 45.9; 22.5 / 17.2 / 44.8; 19.9 / 20.2 / 40.6 | 29/24/21; 30/18/13; 30/27/22 | 0/0/8; 0/0/5; 0/2/4 | 206.9, 170.1, 202.8 | 15/30, 17/30, 14/30 | 6/30, 5/30, 6/30 |
| chosen, union | 1..60 | same values | 24.9 / 24.5 / 53.2; 23.4 / 21 / 54.3; 24.3 / 20.9 / 52.3 | 59/48/41; 58/35/23; 60/49/38 | 0/1/10; 1/0/9; 0/2/10 | 206.9, 202.2, 202.8 | 28/60, 26/60, 26/60 | 13/60, 5/60, 12/60 |
| b1 | 1..30 | mid1 2560 (from chosen) | 23.4 / 18.3 / 57.1; 23.6 / 24.3 / 61.3; 23.5 / 22.1 / 48.3 | 30/27/24; 28/17/9; 30/22/16 | 0/2/8; 0/0/2; 0/1/5 | 206.4, 209.7, 198.3 | 15/30, 7/30, 16/30 | 6/30, 4/30, 6/30 |
| b2 | 1..30 | mid2 3150 (from chosen) | 26.6 / 22.4 / 65.7; 24 / 19.8 / 49.7; 25.1 / 20.4 / 54 | 30/24/18; 28/17/10; 30/21/15 | 0/0/2; 1/0/2; 0/0/2 | 208.5, 202.6, 200.5 | 11/30, 7/30, 13/30 | 7/30, 3/30, 6/30 |
| c1 | 1..60 | final 10300 (from chosen) | 24.9 / 24.5 / 62.9; 23.4 / 21 / 56.9; 24.3 / 20.9 / 47.4 | 59/48/41; 58/35/23; 60/49/38 | 0/1/15; 1/0/5; 0/2/13 | 205.5, 201.3, 205.3 | 30/60 (16 + 14), 24/60 (8 + 16), 27/60 (11 + 16) | 8/60 (3 + 5), 6/60 (0 + 6), 12/60 (6 + 6) |
| c2 | 1..60 | final 11300 (from chosen) | 24.9 / 24.5 / 70.6; 23.4 / 21 / 59.2; 24.3 / 20.9 / 58.8 | 59/48/41; 58/35/23; 60/49/38 | 0/1/15; 1/0/2; 0/2/11 | 205.8, 207.3, 208.8 | 27/60 (12 + 15), 21/60 (6 + 15), 21/60 (9 + 12) | 8/60 (3 + 5), 4/60 (0 + 4), 9/60 (5 + 4) |

c1 and c2 by half (seeds 1..30 / 31..60), focus PRIME: c1 Hive 65.6 / 57.6, Depths 59.8 / 48.4, Wastes 60.6 / 44.2 s; c2 Hive 74.4 / 55.1, Depths 60.7 / 57.5, Wastes 74.8 / 47.6 s.

Reading the arms:

- A change to the final changes nothing before 10:30, so the mid columns of a4, a5, c1 and c2 match the chosen values exactly; the PRIME columns still move by chance inside the fight (see the 9800 to 10300 flips above).
- A change to a mid stage reshuffles every later fight and the A7 counts by about 3 of 30 per world (b1, b2), more than the step's own effect on the tails it targets.
- The two halves of the chosen values differ as much as the arms do: focus PRIME 60.6 / 45.9 s (Hive), Depths smart+P 9/30 / 17/30. The 60-seed union is the estimate this pass trusts; the 10-seed arms a1 to a3 only set the direction.

## Other metrics on the chosen values

From `bosshp-confirm.md` (seeds 1..30), before = `deaths-confirm.md` (the same seeds on `56dd2d9`):

| ID | Target | Before | After | Result |
|---|---|---|---|---|
| A2 | median 6-12 s, max <= 20 s | 6.02 s | 6.02 s | PASS |
| A3 | alive <= row + 160 and <= 610; share <= 0.25 | 477 alive, 269 over row, share 0.352 | 465, 285, 0.343 | FAIL (density pass) |
| A4 | 7 of 9 minutes in band | 6/9, 7/9, 5/9 | 6/9, 6/9, 7/9 | FAIL (density pass) |
| A5 | 250-340 u, cage the same tick | 388 arrivals, 287-306 u | 399 arrivals, 294-305 u | PASS |
| A8 | smart >= 5:30, smart+P >= 8:00, crude >= 2:30 | smart 9:35, 6:46, 10:16; smart+P 14:00, 8:25, 14:00; crude 2:08, 2:10, 1:43 | smart 9:18, 6:50, 8:51; smart+P 14:00, 9:19, 14:00; crude 2:08, 2:10, 1:43 | FAIL (crude only, unchanged) |
| A9 | L9-12 / L18-23 / L23-28, no gap > 60 s | Hive L8/L17/L21, Depths L9/L17.5/L21, Wastes L10/L17/L19; gaps 20, 8, 19 of 30 | L8/L16/L20, L9/L17/L22, L10/L17/L20; gaps 23, 14, 19 of 30 | FAIL (as before) |
| A10 | median >= 3.0 s, min >= 1.2 s | 207 deaths, 3.83 s, 0.82 s | 205 deaths, 3.88 s, 0.82 s | FAIL (minimum, as before) |
| A11 | <= 240 u/s | 240 | 240 | PASS |
| A12 | T4 <= 15%, T1 <= T0 | T0 23/30, T1 19/30, T4 2/30 | T0 13/30, T1 11/30, T4 0/30 | PASS |
| A13 | >= 90% dead by 20:00, none past 24:00 | 47/72 (65%), 18 past 24:00 | 23/40 (58%), 10 past 24:00 | FAIL (OVERTIME pass; fewer runs win, so fewer enter OVERTIME) |
| A14 | one hash per mode and world | det-long 8c3766b0, 54a5737, 51ca7954 | det 642fbc46, 1365ccb6, d3c8cef6 (unchanged: no boss in the window); det-long bc906b30, 65945a0d, 3e2a9a51; det-death 7408614a, 5739e8a2, 224be1c (unchanged: deaths before mid1); 21/21 lines agree at 375x667, 667x375, the rerun and the settings injection | PASS |
| A18 | dash >= 1.25x, XP >= 0.90 | dash 1.12x, 1.42x, 1.22x; XP min 0.845, 0.914, 0.822 | dash 1.12x, 1.31x, 1.26x; XP min 0.865, 0.885, 0.833; fusion by 4:00 62/90, 64/86, 66/90; evolve 13/21, 16/18, 22/25 | FAIL (Hive dash, XP) |

## Harness and script changes (this commit)

- `scripts/playtest/fightwindow.mjs` (new): per world and stage, the focus bot's kill median and spread, the default bot's longest fight and every fight over 150 s, the HP-factor window each A6 clause leaves, and the PRIME factor windows for A6 and A7 together (the table above). `--seeds=N` reads seeds 1..N of a folder; `--json` prints the data.
- `scripts/playtest/analyze.mjs`: a PRIME that arrives on its beat (630.02 s) reaches the 210 s stalemate 0.02 s after a 14-minute run ends; a final still open within 0.1 s of 210 s at the run's end now counts as the stalemate, not an open fight over 150 s. A PRIME delayed by a late mid2 kill still ends the run open (one Wastes run on seeds 1..30 of b1, open at 198.3 s): the 14-minute harness cuts it before its stalemate.
- `scripts/playtest/matrix.mjs`: `--seed-from=K` runs the bot sets on seeds 1001 x K.. (the holdout set).

## Commands

```
# dev server (never killed)
cd /Users/Adelson/Desktop/personal/SWARMGEDDON && npx vite --port 5176 --strictPort

# control (56dd2d9, clean tree)
node scripts/playtest/matrix.mjs --seeds=30 --only=A5,A6,A7,A8 --label=bosshp-control30 --runs=/tmp/swg-bosshp/control --out=/tmp/swg-bosshp/reports

# one arm: set the arm's values (arms table) in src/content/bosses.ts or src/content/runScripts.ts, then
node scripts/playtest/matrix.mjs --seeds=30 --only=A6,A7 --label=<arm> --runs=/tmp/swg-bosshp/<arm> --out=/tmp/swg-bosshp/reports
#   a1 to a3: --seeds=10; a6: --worlds=depths; a7, a8: --worlds=wastes
#   c1, c2 second half: --seeds=30 --seed-from=31 --label=<arm>-holdout --runs=/tmp/swg-bosshp/<arm>-holdout
node scripts/playtest/fightwindow.mjs /tmp/swg-bosshp/<arm>            # windows and fights over 150 s; --seeds=10 for the 10-seed view
#   60-seed union: symlink both halves' run JSONs into one folder and point fightwindow at it

# confirm (this commit's values)
node scripts/playtest/matrix.mjs --seeds=30 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=bosshp-confirm --runs=/tmp/swg-bosshp/confirm2 --out=/tmp/swg-bosshp/reports
node scripts/playtest/matrix.mjs --seeds=30 --only=A12,A13 --label=bosshp-confirm-a12-a13 --runs=/tmp/swg-bosshp/confirm2 --out=/tmp/swg-bosshp/reports
node scripts/playtest/matrix.mjs --only=A14 --label=bosshp-a14 --runs=/tmp/swg-bosshp/a14 --out=/tmp/swg-bosshp/reports
node scripts/playtest/matrix.mjs --seeds=30 --seed-from=31 --only=A6,A7 --label=bosshp-holdout --runs=/tmp/swg-bosshp/holdout --out=/tmp/swg-bosshp/reports
```

The reports were copied into `docs/tuning/` (`bosshp-control30`, `bosshp-confirm`, `bosshp-confirm-a12-a13`, `bosshp-a14`, `bosshp-holdout`, each `.md` and `.json`). Each bot set runs as `node scripts/playtest/playtest.mjs <world> <config>... --out=<runs dir>` with `smart:SEED:14` (smart), `smart:SEED:14:nova:priority` (smart+P, the default bot) and `smart+focus:SEED:14:nova:priority` (the focus bot), SEED = 1001 x k; every command, config by config, is in `meta.commands` of each JSON.
