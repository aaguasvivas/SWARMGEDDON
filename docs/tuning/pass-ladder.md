# P19 pass 'ladder': THREAT ladder and OVERTIME (A12, A13)

A12 (section 11, decided for this pass): on Hive smart+P (`smart:SEED:14:nova:priority:T`), seeds 1001 x 1 to 60, the T4 win rate is at most 15% and T1 wins at least 5 percentage points less often than T0; THREAT must feel harder at every level, so T2 and T3 are measured too. A13: in each OVERTIME set (`smart:SEED:25:nova:priority:T:ot`), 90% or more of the runs that win are dead by 20:00 and none is alive past 24:00. Also in this pass: the next cycle's EVENT 1 must fire after an OT boss retreat, and the OVERTIME bonus rate must not exceed P9's 3 a minute.

- Build under test: `af12f12` plus the src changes of this commit (`v2 P19: THREAT ladder and OVERTIME (A12, A13)`). The matrix headers print `af12f12 (src has uncommitted changes)` because they ran before the commit. The control ran on the `af12f12` values; from its 30th run on, the tree had the new `OVERTIME.healMul` code at the value 1, which multiplies every heal by 1 and changes nothing.
- Harness: this commit's `scripts/`. Dev server: `npx vite --port 5176 --strictPort`, `SWG_URL` default.
- Reuse: the confirm took the control's 14-minute T0, T1, T3 and T4 run files and arm l2's T2 files (the matrix reuses a run file with the same config). Nothing before the win changed for those levels; five configs re-run on the final values (T0 3003 and 12012, T1 1001, T3 4004, T4 2002) matched their control files in every field but the wall time. The OVERTIME sets ran fresh.
- Seeds: A12 Hive 1001 x 1..60 at T0 to T4, 14 minutes, NOVA, priority drafts, evolutions, cores and bonuses live. A13: OVERTIME set 1 (T0 1001 x 1..30, T1 to T3 1001 x 1..10) and set 2 (T0 1001 x 31..60, T1 to T3 1001 x 11..20), 25 minutes; set 3 (T0 1001 x 61..90, T1 to T3 1001 x 21..30) is a holdout that no arm saw.
- Date: 2026-10-02. Machine: 8 GB, load 3 to 11 (system daemons), 4.8 to 5.7 GB of swap in use, 386 to 840 MB free on the data volume (the holdout matrix paused under 400 MB until other processes freed space).

## Result

Before is `ladder-control.md` (and `ladder-control-ot.md`, the OVERTIME detail). After is `ladder-confirm.md` and `ladder-confirm-ot.md`, plus `ladder-holdout.md` and `ladder-holdout-ot.md` for set 3 and `ladder-a14.md` for determinism. `ladder-control.md` was scored again with this commit's matrix after its runs, so its header shows the working tree; its runs used the `af12f12` values.

| ID | Target | Before | After | Result |
|---|---|---|---|---|
| A12 | T4 <= 15%; T1 at least 5 points under T0 (60 seeds) | T0 25/60 (42%), T1 18/60 (30%), T4 2/60 (3%) | T0 25/60 (42%), T1 18/60 (30%), T4 2/60 (3%) | PASS (HUNTERS unchanged) |
| A12 ladder | each level wins no more than the one below | T2 20/60 (33%) over T1; T3 11/60 (18%) | T2 13/60 (22%), T3 11/60 (18%): 42, 30, 22, 18, 3% | PASS |
| A13 set 1 | >= 90% dead by 20:00, none past 24:00 | 12/19 (63%), 4 past 24:00 | 19/19 (100%), 0 | PASS |
| A13 set 2 | same | 5/16 (31%), 5 past 24:00 | 15/16 (94%), 0 | PASS |
| A13 set 3 (holdout) | same | not run | 18/18 (100%), 0 past 24:00 | PASS |
| A13 last death | | alive at 25:00 (9 runs); last death 24:42 | 20:13 | |
| Cycle 1 deaths (sets 1 and 2) | no harsher than before | 5 of 35 (0:24 to 2:06 into OVERTIME) | 5 of 35 (0:18 to 2:34) | unchanged in count |
| OT beats after a retreat | EVENT 1 and its mirror fire | 26 dropped (EVENT 1 and mirror, 60.0 and 64.0 s late) | 0 dropped of 193; latest 54.05 s late | PASS |
| OT bonus rate (per run with 120 s or more of OVERTIME) | at most 3 a minute (P9 band 1.5 to 3) | median 2.21, max 3.66; 2 runs over 3 | median 2.08, max 2.96; none over 3 | PASS |
| OT bonus, busiest 120 s window | no busier than the same runs before the win | median 6, max 9 (before the win: median 7, max 12) | median 5, max 8 (before the win: median 7, max 12) | PASS |
| A14 | one hash per mode and world | det 642fbc46, 1365ccb6, d3c8cef6; det-long 4b54dab1, be186edf, 7a87fa18; det-death 7408614a, 5739e8a2, 224be1c | the same hashes; 21/21 lines agree at 375x667, 667x375, the rerun and the settings injection (`ladder-a14.md`) | PASS |

The A12 control already passes the decided T1 clause (12 points). The pass changed BROOD TIDE because T2 won more often than T1, which breaks "harder at every level". A13 changes touch only OVERTIME, so they cannot move A12, A1 to A11 or A18 (the 14-minute runs are byte-identical except the wall time; checked on five configs at T0, T1, T3 and T4).

## Chosen values

| Knob | Before | After | Why |
|---|---|---|---|
| `THREAT_LEVELS[2].hpMul` (BROOD TIDE, A11) | 1.20 | 1.30 | T2 won 20/60 against T1's 18/60. Its mirror events bring more kills and XP, which offset 10% more HP. 1.25 (l1) still won 19/60; 1.30 (l2) wins 13/60. T3 keeps 1.30, so T2 and T3 share the HP multiplier and T3 stays harder through its rules (2 affixes, boss cadence x1.2, damage x1.10): 11/60. |
| HUNTERS (T1: hpMul 1.10, teaching elite 1 affix, +1 elite from 6:15) | | unchanged | The decided clause passes at 60 seeds: T0 25/60, T1 18/60. |
| `OVERTIME.healMul` (new, section 4.1) | none (1) | 0.25, as `healMul^(c-1)` | Every heal in cycle c takes x0.25^(c-1): x1 in cycle 1, x0.25 in cycle 2, x0.0625 in cycle 3. The survivors past 20:00 healed back every HP they lost in a cycle (for example seed 41041: 1,776 of 1,776 in cycle 2, 2,074 of 2,158 in cycle 3) on Regrowth 4, Vampiric 3 and BLOODRUSH. `healPlayer` applies it, so every heal source takes it. |
| `OVERTIME.speedMul` | 1.3 | 1.4 | Heal cuts alone left the late OVERTIME starters (OVERTIME from 13:17 to 13:58, so 6 to 7 minutes before 20:00) alive through cycle 2: they take only 200 to 900 HP there, which even 20% healing covers (o6). x1.4 in cycle 2 gets the swarm onto the kiters; the 240 u/s ceiling becomes 336 u/s in cycle 2 and 470 u/s in cycle 3 (312 and 406 before). |
| `OVERTIME.bossStay` | 90 s | 80 s | The EVENT 1 fix (below). At 80 s EVENT 1 fires 50 s late and its mirror 54 s late after a retreat, 6 s inside `DEFER_DROP_LATE`. 85 s also fires both (the mirror 59.05 s late, 1 s of margin); 60 s (o4) changed nothing in A13. The P11 retreat rule stays. |
| `OVERTIME.bonusMul` | 0.6 | 0.4 | At 0.6 the runs that die in cycle 2 drew up to 3.66 bonuses a minute in OVERTIME, almost all in cycle 1 (up to 11 in 180 s). The 8 s `minGap` takes a large share of each drop interval at OVERTIME kill rates, so the chance acts weakly: 0.5 (o9) still left 4 runs over 3. At 0.4 the OVERTIME rate matches the same runs before the win (median 2.08 against 2.11 a minute), and the 40 s pity drop keeps the floor near 1.5. |
| `OVERTIME` HP, damage, aliveMul, xpMul, bossHpMul | | unchanged | They all act from cycle 1. A cycle-2 HP step (o7, HP x2 per later cycle, a formula change) did not help: the late builds still cleared the field. It was reverted. |

## The EVENT 1 drop

The OT boss arrives at cycle offset +160 s, so a boss that stays `bossStay` retreats `bossStay - 20` s into the next cycle. `scheduleHeld` fires the held EVENT 1 (due at +20) `DEFER_AFTER_KILL` (10 s) after the retreat and its mirror (due at +28, from cycle 2) `DEFER_GAP` (12 s) after that, so they come `bossStay - 30` and `bossStay - 26` s late. At 90 s that is 60.0 and 64.0 s, past `DEFER_DROP_LATE` (60 s), so both were dropped after every retreat: 26 dropped beats in the control's 35 OVERTIME runs. The elite beat at +70 fires on time once the stay is under 90 s. At 80 s: 0 dropped in 193 OVERTIME beats; the latest fired 54.05 s late. A kill before the stay ends schedules them earlier, so 54 s is the bound.

## Arms

### A12 (Hive smart+P, 60 seeds; only the changed level re-runs, the others reuse the control's run files)

| Arm | Change from the control | T0 | T1 | T2 | T3 | T4 |
|---|---|---|---|---|---|---|
| control | `af12f12` values | 25/60 (42%) | 18/60 (30%) | 20/60 (33%) | 11/60 (18%) | 2/60 (3%) |
| l1 | T2 hpMul 1.25 | | | 19/60 (32%): 7/30 + 12/30 | | |
| l2 | T2 hpMul 1.30 | | | 13/60 (22%): 5/30 + 8/30 | | |
| confirm | l2 | 25/60 | 18/60 | 13/60 | 11/60 | 2/60 |

### A13 (the 35 runs that won in OVERTIME sets 1 and 2 of the control)

The values before the win do not change in these arms (every OVERTIME knob acts after `startOvertime`), so each arm re-ran only the 35 winning configs: same seeds, same win time. Each row changes one knob from the row above unless it says otherwise. "Late" is dead after 20:00. Bonus is the per-run OVERTIME rate over runs with 120 s or more of it.

| Arm | Change | Set 1 by 20:00 | Set 2 by 20:00 | Past 24:00 | Death cycle c1 / c2 / c3 / c4+ / alive | Median OT s | Dropped OT beats | Bonus median, max (runs over 3) |
|---|---|---|---|---|---|---|---|---|
| control | speed 1.3, stay 90, heal 1, bonus 0.6 | 12/19 | 5/16 | 9 | 5 / 9 / 10 / 3 / 8 | 427 | 26 | 2.21, 3.66 (2) |
| o1 | bossStay 85 | 12/19 | 5/16 | 8 | 5 / 9 / 10 / 4 / 7 | 427 | 0 (latest 59.05 s late) | 2.16, 3.66 (2) |
| o2 | healMul 0.5 | 13/19 | 10/16 | 1 | 5 / 12 / 14 / 4 / 0 | 382 | 0 | 2.26, 3.66 (4) |
| o3 | healMul 0.3 | 18/19 | 13/16 | 0 | 5 / 20 / 10 / 0 / 0 | 259 | 0 | 2.36, 3.48 (4) |
| o4 | bossStay 60 | 18/19 | 13/16 | 0 | 5 / 20 / 10 / 0 / 0 | 259 | 0 (latest 34.05 s) | 2.31, 3.48 (4) |
| o5 | speedMul 1.45 and bossStay 80 (from o4) | 17/19 | 16/16 | 0 | 5 / 24 / 6 / 0 / 0 | 249 | 0 (latest 54.05 s) | 2.37, 3.47 (5) |
| o6 | from o5: speedMul 1.3, healMul 0.2 | 17/19 | 13/16 | 0 | 5 / 22 / 7 / 1 / 0 | 255 | 0 | 2.35, 3.53 (4) |
| o7 | from o6: healMul 0.3, enemy HP from cycle 2 x2.0 per cycle (formula change, reverted) | 18/19 | 12/16 | 0 | 5 / 21 / 9 / 0 / 0 | 260 | 0 | 2.36, 3.62 (5) |
| o8 | from o7 without the HP step: speedMul 1.4 | 19/19 | 15/16 | 0 | 5 / 24 / 6 / 0 / 0 | 248 | 0 | 2.35, 3.52 (4) |
| o9 | bonusMul 0.5 | 19/19 | 13/16 | 0 | 6 / 23 / 5 / 1 / 0 | 257 | 0 | 2.20, 3.20 (4) |
| o10 | bonusMul 0.4 | 19/19 | 14/16 | 0 | 5 / 22 / 8 / 0 / 0 | 248 | 0 | 1.93, 2.86 (0) |
| o11 | healMul 0.25 | 19/19 | 15/16 | 0 | 5 / 26 / 4 / 0 / 0 | 245 | 0 | 2.06, 2.96 (0) |
| confirm | o11 values with T2 hpMul 1.30, full sets re-run | 19/19 | 15/16 | 0 | 5 / 26 / 4 / 0 / 0 | 245 | 0 of 193 (latest 54.05 s) | 2.08, 2.96 (0) |
| holdout | confirm values, set 3 (T0 k = 61..90, T1 to T3 k = 21..30; 18 winners) | set 3: 18/18 | | 0 | 5 / 8 / 5 / 0 / 0 | 243 | 0 of 103 (latest 54.05 s) | 1.94, 2.55 (0) |

Reading the arms:

- Healing decides whether a sustain build dies at all: past a cut of 0.5 nobody lives to 24:00. But the late OVERTIME starters take little damage in cycle 2 (they clear the field: up to 2,500 kills per 30 s), so a deeper cut there (0.3, 0.2) does not move them; they die early in cycle 3, a minute after 20:00.
- Swarm speed in cycle 2 is what reaches them (o5, o8). An HP step from cycle 2 (o7) did not: the field stayed clear.
- `bossStay` does not move A13 between 60 and 90 s (o3 and o4 are equal), so it is set for the EVENT 1 fix alone.
- `bonusMul` changes the loot stream from the first OVERTIME kill, so the runs diverge in cycle 1: o9 had 6 cycle-1 deaths. At the chosen values the cycle-1 count is the control's 5 of 35; two runs swapped (T1 seed 4004 now dies 0:38 into OVERTIME, T0 seed 29029 lives past cycle 1), which is the loot stream, not a harder cycle 1 (speed and healing are x1 there).
- Set 2 moves by 1 to 4 runs between arms that differ in one late knob (12 to 16 of 16 from o3 on), so a single arm cannot separate close values; the confirm and the holdout carry the decision.

## Bonus rate criterion

P9's band (1.5 to 3 a minute) is a run average from 2:00 to the win, and short windows go over it before the win too: the same 35 runs drew up to 12 bonuses in a 120 s window and up to 3.12 a minute over a whole run before their win. So this pass scores OVERTIME as P9 does: the rate per run over its OVERTIME, for runs with 120 s or more of it, at most 3 a minute; and the busiest 120 s window no busier than the same runs before the win. `otreport.mjs` prints both.

## Harness and script changes (this commit)

- `scripts/playtest/harness.js` (read-only): an `otBeat` event per OVERTIME beat that fires or drops, with its cycle, due time and lateness (`result` fired, dropped, or off for a mirror before its first cycle); `otSteps` and `otCagedSteps` (steps in OVERTIME, and those inside a boss cage).
- `scripts/playtest/otreport.mjs` (new): A13 per OVERTIME set, death cycle, caged share, damage and healing per cycle, the OVERTIME bonus rate against the same runs before the win, and the OVERTIME beats late or dropped. `--md` writes the tables in this folder.
- `scripts/playtest/matrix.mjs`: A12 runs T0 to T4 on `--threat-seeds` (default 60) and scores the decided clause (T1 at least 5 points under T0), reporting every step of the ladder; A13 scores each OVERTIME set on its own; `--ot-sets=3` runs the holdout set (set n: T0 1001 x 30(n-1)+1..30n, T1 to T3 1001 x 10(n-1)+1..10n).
- `scripts/playtest/analyze.mjs`: `a13Stats` counts per OVERTIME set.

## Commands

```
npx vite --port 5176 --strictPort &
# A12 and A13 control (on af12f12) and confirm (this commit); the matrix reuses a run file with the same config
node scripts/playtest/matrix.mjs --worlds=hive --only=A12,A13 --label=ladder-control --runs=/tmp/swg-ladder/control
node scripts/playtest/matrix.mjs --worlds=hive --only=A12,A13 --label=ladder-confirm --runs=/tmp/swg-ladder/confirm
node scripts/playtest/matrix.mjs --worlds=hive --only=A13 --ot-sets=3 --label=ladder-holdout --runs=/tmp/swg-ladder/holdout
node scripts/playtest/otreport.mjs /tmp/swg-ladder/confirm --runs --md=docs/tuning/ladder-confirm-ot.md
# A13 arms: the 35 winning configs of the control, one playtest call per arm after editing src/config.ts
node scripts/playtest/playtest.mjs hive smart:1001:25:nova:priority:0:ot ... --out=/tmp/swg-ladder/<arm>   # the 35 configs listed below
node scripts/playtest/otreport.mjs /tmp/swg-ladder/<arm> --runs
# A12 arms: T2 only
node scripts/playtest/playtest.mjs hive smart:1001:14:nova:priority:2 ... smart:60060:14:nova:priority:2 --out=/tmp/swg-ladder/<arm>
# A14
node scripts/playtest/matrix.mjs --only=A14 --label=ladder-a14
```

The 35 winning configs (`smart:SEED:25:nova:priority:T:ot`, SEED = 1001 x k): T0 k = 1, 3, 5, 7, 9, 12, 15, 17, 19, 22, 24, 25, 29, 30 (set 1) and 32, 39, 41, 43, 47, 48, 52, 57, 58, 59, 60 (set 2); T1 k = 4, 5, 7, 8 (set 1) and 16 (set 2); T2 k = 11, 15 (set 2); T3 k = 7 (set 1) and 11, 15 (set 2). The confirm's T2 winners are k = 13 and 15 (BROOD TIDE's HP changes T2 runs before the win).

Raw runs were in `/tmp/swg-ladder` (not kept).

## Side effects and open items

- OVERTIME feel on a phone: the flyer ceiling is now 336 u/s in cycle 2 and 470 u/s in cycle 3 (312 and 406 before), and healing in cycle 2 is a quarter. Most runs now die in cycle 2 (26 of 35; median 4:05 in OVERTIME, 7:07 before). The owner's phone check of OVERTIME (carry-over P20) should judge both.
- The median time in a cage fell from 0.14 to 0.08 of OVERTIME: runs die before the second OT boss.
- A12's 60-seed halves differ by up to 3 wins at one level (T2 1.25: 7/30 and 12/30), so a step under about 8 points is not resolved by 60 seeds.
