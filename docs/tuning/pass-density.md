# P19 pass 'density': density, survival and level curve (A3, A4, A8, A9, A18 XP)

Targets (section 11): A3 alive at most `row.maxAlive + 160` and at most 610, saturated share (steps outside a cage and an event window at 95% or more of maxAlive) at most 0.25 in every run; A4 smart+P median alive inside the A7.2 band in 7 of 9 scored minutes; A8 median survival smart 5:30, smart+P 8:00, crude 2:30 or more, Hive crude at least Depths and Wastes; A9 smart+P median level L9 to 12 at 3:00, L18 to 23 at 8:00, L23 to 28 at 11:00, no gap over 60 s after 1:00; A18 XP collected 90% or more.

- Build under test: `7eaf81b` plus the src changes of this commit (`v2 P19: density, survival and level curve (A3, A4, A8, A9, A18 XP)`). The matrix headers print `7eaf81b (src has uncommitted changes)` because they ran before the commit; `density-control30` prints `(src clean)`, the control values.
- Harness: this commit's `scripts/` (changes below). Dev server: `npx vite --port 5176 --strictPort`, `SWG_URL` default.
- Seeds: 1001 x k per world, T0, 14 minutes, NOVA, evolutions, cores and bonuses live. Search arms k = 1..10 or 1..30; confirm k = 1..30; holdout k = 31..60 (`--seed-from=31`) for A6, A7 and A8.
- Date: 2026-10-01. Machine: 8 GB, load 3.5 to 5, 5 to 5.5 GB of swap in use, 330 MB to 1.7 GB free on the data volume (the matrix paused once under 400 MB).
- The confirm reused, file for file, the arm runs made on the same source: Hive from arm h150, Depths and Wastes smart, smart+P, focus and crude from arm gs150-dw (the matrix reuses a run file with the same config). The sim is deterministic, and the det hashes below agree across views and reruns.

## Result

Before is `density-control30.md` (the control values, rescored with this commit's scripts). After is `density-confirm.md`, `density-holdout.md` (A6 to A8 on seeds 31..60), `density-confirm-a12-a13.md` and `density-a14.md`.

| ID | Target | Before | After | Result |
|---|---|---|---|---|
| A3 over row | <= 160 (inside a cage, the row in force when it rose) | 285 by the row of the minute; 45 by the cage's row | 68 by the cage's row (314 by the row of the minute) | PASS (rule below) |
| A3 alive max | <= 610 | 465 | 518 | PASS |
| A3 saturated share | <= 0.25 in every run | 0.343 (Hive roam 14014; focus 0.341, dash 0.307, smart+P 0.26) | 0.246 (Hive smart 14014) | PASS |
| A3 beats off-rule | 0 | 0 | 0 | PASS |
| A4 | 7 of 9 scored minutes | minute mean 6/9, 6/9, 7/9; free field (seeds 1..10, `density-c10.md`) 7/9, 9/9, 9/9 | free field 9/9, 9/9, 9/9 (minute mean 6/9, 6/9, 5/9) | PASS (rule below) |
| A5 | 250-340 u, cage the same tick | 399 arrivals, 294-305 u | 380 arrivals, 2 PRIME ascends, 295-306 u | PASS |
| A8 smart | >= 5:30 | 9:18, 6:50, 8:51 | 14:00, 7:02, 10:07 (holdout 11:48, 8:02, 6:49) | PASS |
| A8 smart+P | >= 8:00 | 14:00, 9:19, 14:00 | 14:00, 9:02, 12:12 (holdout 14:00, 11:48, 14:00) | PASS |
| A8 crude | >= 2:30, Hive >= the others | 2:08, 2:10, 1:43 | 2:09, 2:13, 1:43 | FAIL (unchanged; out of reach of these knobs) |
| A9 levels | L9-12 / L18-23 / L23-28 | L8/16/20, L9/17/22, L10/17/20 | L9/16/19, L9/17/22, L10/17/22 | FAIL (xpScale unchanged, see A9) |
| A9 gaps | no gap > 60 s after 1:00 | 23, 14, 19 of 30 runs | 25, 13, 20 of 30 runs | FAIL |
| A18 XP | >= 0.90 (roam, up to the PRIME kill) | 0.926, 0.875, 0.899 (whole run 0.865, 0.885, 0.833) | 0.967, 0.913, 0.927 (whole run 0.907, 0.906, 0.913) | PASS |

Hive, Depths, Wastes in that order in every cell.

The earlier passes, re-checked:

| ID | Target | Before | After | Result |
|---|---|---|---|---|
| A6 focus mid1 / mid2 / final | 20-40 / 20-40 / 40-75 s | Hive 26.6/26.7/60.6, Depths 24.0/22.0/64.2, Wastes 25.1/23.3/59.2 | seeds 1..30: 25.6/23.1/56.7, 22.8/28.0/44.8, 25.1/22.3/70.1; seeds 1..60: 26.3/24.4/58.2, 22.7/27.1/55.6, 24.0/20.2/54.3 | PASS (the 31..60 half alone: Wastes 19.9/18.5 s, as in the bosshp holdout) |
| A6 default mid fights over 150 s | <= 5% (decided rule) | 1 of 77, 1 of 56, 0 of 68 fights (all stages) | mid1 and mid2: 2 of 52 (two 180 s mid2 ascends), 0 of 45, 1 of 51 | PASS |
| A6 kill to next arrival | >= 20 s | 20.1 s | 20.0 s | PASS |
| A7 smart+P | 25-45% | 13/30, 9/30, 12/30 | 14/30, 8/30, 11/30; seeds 1..60 25/60, 22/60, 26/60 (42, 37, 43%) | 30 seeds FAIL in Hive by one run; 60 seeds PASS |
| A7 smart | 5-25% | 7/30, 0/30, 6/30 | 7/30, 2/30, 6/30; seeds 1..60 14/60, 9/60, 9/60 | PASS |
| A10 | median >= 3.0 s, min >= 1.2 s | 205 deaths, 3.88 s, 0.82 s | 191 deaths, 3.83 s, 0.88 s | FAIL (minimum, as before) |
| A12 | T4 <= 15%, T1 <= T0 | T0 13/30, T1 11/30, T4 0/30 | T0 14/30, T1 8/30, T4 0/30 | PASS |
| A13 | >= 90% dead by 20:00, none past 24:00 | 23/40 (58%), 10 past 24:00 | 17/35 (49%), 9 past 24:00 | FAIL (OVERTIME uses rows 8 to 10; see side effects) |
| A14 | one hash per mode and world | det-long bc906b30, 65945a0d, 3e2a9a51 | det 642fbc46, 1365ccb6, d3c8cef6 and det-death 7408614a, 5739e8a2, 224be1c unchanged; det-long 4b54dab1, be186edf, 7a87fa18; 21/21 lines agree at 375x667, 667x375, the rerun and the settings injection | PASS |
| A2, A11 | | 6.02 s; 240 u/s | 6.02 s; 240 u/s | PASS |
| A18 other clauses | dash >= 1.25x, 1-4 cc/min, fusion >= 50%, evolve >= 40% | dash 1.12, 1.31, 1.26x | dash 1.14, 1.39, 1.26x; cc 1.76, 1.68, 2.06; fusion 58/88, 64/86, 66/90; evolve 18/23, 17/19, 18/22 | FAIL (Hive dash, not this pass) |

## Chosen values

| Knob | Before | After | Why |
|---|---|---|---|
| Hive rows 5 to 10 `maxAlive` (A7.2) | 210, 250, 280, 320, 360, 420 | 250, 330, 360, 400, 440, 450 | With higher caps a build that clears the swarm slowly fills them later. Row 5: the BROOD RING at 5:30 pushed the field over 0.95 x 210. Row 10 is held by PRACTICAL_CAP (450). |
| Hive rows 6 to 9 `every` (batch unchanged) | 0.6, 0.55, 0.5, 0.45 | 1.0, 0.95, 0.75, 0.8 | Pulse rate 10.0, 10.9, 14.0, 15.6 units/s to 6.0, 6.3, 9.3, 8.8. The old rates were above the kill rate of a slow-clearing build (a single-target boss build at 4 to 6 kills/s, the invincible roam bot at about 4), so the field sat at maxAlive with no cage and no event. Row 10 keeps 0.4: the FINAL SWARM fills that field anyway, and its free time is about 15 s per run. |
| Hive "Target alive" tops | 147, 175, cage, 224, 252, 294 | 175, 231, cage, 280, 308, 315 | The band is `minAlive` to `0.7 x maxAlive` in every row; the tops follow the caps. |
| `XP.gemSoftCap` (A6) | 200 | 150 | A18 XP. Gems left behind under 200 never joined the bank gem, so a wandering player lost up to 12.5% of the XP. 120 also passed but cut the smart+P wins in Depths and Wastes by 4 to 5 of 30 (the bots chase the nearest gem within 450 u when threat is low, and fewer gems change their path). |
| Row 11 `maxAlive` | 160 | 160 (kept) | The A3 rule below measures the PRIME fight against row 10. No pulse runs in a cage, and none of the 630 confirm runs had row 11 in force without one. |
| xpScale | appendix values | unchanged | See A9. |
| Depths and Wastes rows | | unchanged | A3 and A4 pass there on the control (share 0.212 and 0.191 at most; free field 9/9). |

## Rules written in section 11

- **A3 over row.** Inside a cage the field is measured against the maxAlive of the row in force when that cage rose; a row step inside a cage takes effect when it drops. The control's 285 over row came from the 11:00 step from row 10 (420) to row 11 (160) during the PRIME fight, which changes no spawn (no pulses in a cage). Before 11:00 the excess was at most 45. The task offered two options: raise row 11's maxAlive, or measure from the cage. They play the same in every confirm run (none ran row 11 uncaged), and a raised row 11 would refill a late PRIME's approach at row 11's rate. So the rule is the measure, and row 11 stays at 160.
- **A4 free field.** A minute is scored on the smart+P field over the steps with no cage and no lull, where `row.minAlive` is the floor; a run counts in a minute it lived through with 10 s or more of free field. The band's floor is `minAlive`, which a cage (`CAGE_OUTSIDE_MIN`) and a lull (`lullMin`) replace, so their steps cannot be judged against it. Since the bosshp pass the default bot's mid fights (median about 60 s) spill into rows 5 and 8. On the control's minute mean, rows 5 and 8 fail low (cage and lull), while the free field shows the opposite problem in Hive: rows 8 and 9 sit above the band at the caps (246 and 280 on seeds 1..10), which is the A3 saturation. Both measures are in the report.
- **A5.** A PRIME that ascends from a living mid2 boss spawns in its place (section 4.1), so its distance is not an arrival distance. Arm f1 logged one at 437 u (Hive seed 9009) and one at 347 u.
- **A18 XP.** Measured up to the PRIME kill: the XP dropped and collected just before the kill step (the harness records both in the bossKill event); a run with no PRIME kill counts the whole run. A win ends the run 2 s after the kill, so the PRIME's own gem (240 to 260 XP) cannot be collected: Hive roam seed 14014 killed the PRIME 0.5 s before the 14:00 end and scored 0.865 whole-run against 0.964 before the kill. The rule alone left Depths at 0.875 and Wastes at 0.899, so the value change was needed too.
- **A3 beat replay fixes (analyze.mjs).** A kill logged at a beat's own time (event times are rounded to 0.01 s) may come a tick before the beat is due; and a beat due within a tick of the run's end may not have fired. Both had flagged a beat that fired by the rules (Wastes roam seed 10010: mid2 killed at 550.00 and the 9:10 elite fired at 550.017; Hive seed 4004 died at 374.98 before the 6:15 elite).

## A9: why xpScale is unchanged

The smart+P curve sits 1 to 2 levels under A9 at 3:00 and 8:00 and 1 to 4 under it at 11:00. Arms that raised fodder XP into the bands broke A6 and A7, which the bosshp pass set on the old curve:

| Arm (30 seeds) | XP change | A9 levels at 3:00/8:00/11:00 | A7 smart+P (smart) | A6 focus | Reached the PRIME, level there |
|---|---|---|---|---|---|
| control | none | L8/16/20, L9/17/22, L10/17/20 | 13/30 (7), 9/30 (0), 12/30 (6) | in band | Hive 21/30 at L19; Depths 9/30 at L21; Wastes 16/30 at L19.5 |
| k1 | Hive rows 1-2 x1.6, 3-6 x2.0, 7-11 x2.56; Depths x1.6; Wastes 1-2 x1.6, 3-6 x2.0, 7-11 x2.56 | L9/20/25, L11/20.5/24, L11/20.5/26.5 | 18/30 (7), 13/30 (3), 16/30 (5) | in band (PRIME 62.6, 53.8, 55.3 s) | Hive 24/30 at L24; Depths 14/30 at L24; Wastes 18/30 at L25.5 |
| k2 | k1 with Hive and Wastes rows 3-11 x0.8 | L9/19/23, -, L11/20/24 | 20/30 (8), -, 16/30 (4) | | Hive 25/30 at L22 |
| k4 | k2 with Hive rows 3-11 x1.1, Wastes x0.88 | L9/20/25, -, L11/19/23 | 19/30 (6), -, 14/30 (7) | Hive PRIME 43.4 s; Wastes PRIME 36.1 s (under 40) | Hive 26/30 at L24; Wastes 15/30 at L23 |
| f1 | k1 Depths, k4-like Hive and Wastes, plus primeHpMul 1.45, 1.15, 1.35 | L10/20/24, L11/21/26.5, L11/19/24 | 5/30 (2), 12/30 (7), 15/30 (3) | Hive PRIME 81.8 s (over 75); Depths mid2 16.7 s, PRIME 36.4 s (under); Wastes PRIME 73.9 s | Hive 21/30 at L24 (16 stalemates) |

- More levels mean more of the default bot's runs reach the PRIME and kill it: boss HP follows `buildScale ** 0.75`, and `buildScale` counts only the base weapon, not the perks, evolutions and pickup weapons the extra drafts buy.
- In Wastes no PRIME factor fits both A6 and A7 on the A9 curve: `fightwindow.mjs` on f1 gives a focus window of 0.55 to 1.01 times f1's PRIME HP and an A7 smart+P window of 1.22 to 2.01. Hive and Depths would need a refit (Hive 1.35 to 1.72 times the bosshp HP on k4, Depths 1.0 to 1.39 on k1) and Depths' mid2 more HP.
- On the A9 curve the gaps over 60 s sit inside boss fights: k1 has none outside a fight, the other curve arms at most 7 per world (at the control XP 3 to 16 per world fall outside, most in Hive rows 6 to 9, whose xpScale is the lowest). Inside a cage the bot earns about 2.5 XP/s (the swarm outside is held at `CAGE_OUTSIDE_MIN`), against 216 to 249 XP per level at mid1, 408 to 477 at mid2 and 605 to 717 at the PRIME, so xpScale outside fights cannot close them.
- Density does not trade against it inside the A3 bound: in Hive, k5 put rows 6 and 7 back at the control rates and still won 20/30 (A3 0.286).

Owner decision: lower A9's band to the measured curve, or a joint pass that raises xpScale and refits boss HP per stage and world (Wastes needs its A6 or A7 band relaxed); for the gaps, more XP inside fights (`CAGE_OUTSIDE_MIN` or the SURGE constants) or a gap clause scored outside fights.

## A8 crude

The crude bot (flees the swarm centroid, never dodges) dies in its third minute to the row 2 shooters: in Hive it stands in spitter acid at 2:05 to 2:15 (about 18 HP/s), in Depths psychic and spitter shots kill it at 2:05 to 2:15, in Wastes charger rams and bites at 1:35 to 1:45. xpScale cannot move it: rows 1 and 2 at three times their xpScale (arm crude-xp3) gave 2:09, 2:10 and 1:44, and every XP arm left it at 2:07 to 2:11, 1:42 to 1:45. A fix needs rows 1 and 2 content (mix, minAlive), `ACID.dps` or enemy shot damage, or a crude bot that leaves acid. Owner or a later pass.

## Side effects

- A13 falls from 58% to 49% dead by 20:00: OVERTIME plays rows 8 to 10 at x1.1^c, and the slower Hive rows 8 and 9 lower its pressure. A13 belongs to the OVERTIME knobs (`speedMul`, `bossStay`, sustain).
- A7 Hive smart+P is 14/30 on seeds 1..30 (one over the band; the control had 13/30 and the bosshp 60-seed union 28/60); 25/60 on seeds 1..60.
- det-long changes in every world (the gem cap acts in all of them); det and det-death keep their hashes because det plays 10 s and det-death ends at 2:22 to 2:48, before row 5 and under 150 gems.

## Arms

Each cell lists Hive; Depths; Wastes (`-` = not run). A3: saturated share, the worst run of the arm. A4: free-field minutes in band / scored, with the minute-mean count in brackets (a1 and a2 scored the minute mean, before the free-field counters). A7: smart+P, smart wins. A8: smart+P, crude median survival. A9: median level at 3:00/8:00/11:00 and runs with a gap over 60 s. A18: roam XP up to the PRIME kill, minimum.

| Arm | Seeds | Change (from the row above unless it says otherwise) | A3 | A4 | A7 | A8 | A9 | A18 XP |
|---|---|---|---|---|---|---|---|---|
| density-control30 | 1..30 | control: `7eaf81b` values | 0.343 | minute mean 6/9; 6/9; 7/9 | 13/30, 7/30; 9/30, 0/30; 12/30, 6/30 | 14:00, 2:08; 9:19, 2:10; 14:00, 1:43 | L8/16/20, gaps 23; L9/17/22, gaps 14; L10/17/20, gaps 19 | 0.926; 0.875; 0.899 |
| c10 | 1..10 | control, harness with the free-field counters | 0.339 | 7/9 (6); 9/9 (6); 9/9 (7) | 4/10, 2/10; 2/10, 0/10; 1/10, 2/10 | 14:00, 2:08; 8:07, 2:07; 8:47, 1:42 | L9/16/19, gaps 7; L9/17/22.5, gaps 5; L10/16/19, gaps 5 | - |
| a1 | 1..10 | from control: Hive rows 6-10 maxAlive x1.2 (300, 336, 384, 432, 450); Depths rows 8-10 batch x1.25 (30, 32, 38) | 0.327 | 6/9; 5/7; - | 4/10, 2/10; 0/10, 0/10; - | 14:00, 2:08; 8:08, 2:07; - | L9/16/19.5, gaps 7; L9/17/-, gaps 4; - | - |
| a2 | 1..10 | from control: Hive rows 6, 7, 9, 10 every x1.25 (0.75, 0.69, 0.56, 0.5), caps as control | 0.321 | 6/9; -; - | 5/10, 2/10; -; - | 14:00, 2:08; -; - | L9/16/19, gaps 8; -; - | - |
| a3b | 1..10 | from control: Hive rows 6-7 every 0.9, 0.85, caps 300, 330; row 8 cap 380; rows 9-10 every 0.65, 0.62, caps 430, 450 | 0.304 | 8/9 (5); -; - | 5/10, 1/10; -; - | 14:00, 2:08; -; - | L9/15.5/19, gaps 8; -; - | - |
| x1 | 1..10 | a3b + xpScale x1.6 on rows 1-11 in every world | 0.319 | 9/9 (5); 9/9 (6); 9/9 (7) | 2/10, 2/10; 4/10, 1/10; 4/10, 1/10 | 14:00, 2:09; 11:42, 2:07; 12:07, 1:43 | L10/18/20.5, gaps 7; L11/20.5/26, gaps 2; L11/18/21, gaps 7 | - |
| a4 | 1..10 | x1 + Hive rows 6-10 every 1.0, 0.95, 0.75, 0.8, 0.75, caps 330, 360, 400, 440, 450 | 0.23 | 9/9 (5); -; - | 4/10, 1/10; -; - | 14:00, 2:09; -; - | L10/18/21, gaps 9; -; - | - |
| x2 | 1..10 | a4 + Hive and Wastes xpScale rows 3-6 x1.25, rows 7-11 x1.6 | 0.242 | 9/9 (5); -; 9/9 (5) | 6/10, 1/10; -; 5/10, 4/10 | 14:00, 2:09; -; 14:00, 1:43 | L10/20/26, gaps 9; -; L11/22/27, gaps 5 | - |
| d1 | 1..10 | x2 + Hive rows 6-10 every as control (caps of a4); Wastes rows 5-10 every x0.8 | 0.282 | 7/9 (6); -; 9/9 (7) | 5/10, 2/10; -; 5/10, 1/10 | 14:00, 2:09; -; 11:48, 1:43 | L10/19/24, gaps 6; -; L11/20/24, gaps 4 | - |
| c1h | 1..10 | d1 Hive with every 0.7, 0.65, 0.59, 0.53, 0.47 | 0.267 | 9/9 (8); -; - | 4/10, 2/10; -; - | 14:00, 2:09; -; - | L10/19.5/24, gaps 6; -; - | - |
| c2h | 1..10 | c1h + Hive row 5 cap 250, rows 6-7 every 0.8, 0.75 | 0.302 | 9/9 (6); -; - | 5/10, 2/10; -; - | 14:00, 2:09; -; - | L10/19.5/23, gaps 8; -; - | - |
| k1 | 1..30 | Hive: a4 rates, row 5 cap 250, x2 XP; Wastes: d1; Depths: x1 XP | 0.292 | 9/9 (5); 9/9 (6); 9/9 (5) | 18/30, 7/30; 13/30, 3/30; 16/30, 5/30 | 14:00, 2:09; 9:29, 2:11; 14:00, 1:44 | L9/20/25, gaps 21; L11/20.5/24, gaps 9; L11/20.5/26.5, gaps 9 | 0.933; 0.892; 0.885 |
| k2 | 1..30 | k1 with Hive XP rows 3-11 x0.8; Wastes XP rows 3-6 x0.83 and 7-11 x0.77, every x0.9 of control | 0.267 | 9/9 (5); -; 9/9 (7) | 20/30, 8/30; -; 16/30, 4/30 | 14:00, 2:09; -; 14:00, 1:44 | L9/19/23, gaps 24; -; L11/20/24, gaps 16 | 0.929; -; 0.874 |
| k3 | 1..30 | k2 + Hive row 10 every 0.4, XP rows 3-11 x1.1; Wastes rows 5-9 every as control, row 10 every 0.4, batch 6, cap 350 | 0.261 | 9/9 (6); -; 9/9 (7) | 20/30, 6/30; -; 15/30, 8/30 | 14:00, 2:09; -; 14:00, 1:44 | L9/20/24.5, gaps 25; -; L11/20/25, gaps 15 | 0.939; -; 0.888 |
| k4 | 1..30 | k3 + Hive rows 8-9 every 0.55; Wastes caps rows 5-9 170, 200, 220, 240, 260, XP rows 3-11 x0.88 | 0.251 | 9/9 (6); -; 9/9 (6) | 19/30, 6/30; -; 14/30, 7/30 | 14:00, 2:09; -; 12:12, 1:44 | L9/20/25, gaps 23; -; L11/19/23, gaps 15 | 0.922; -; 0.871 |
| k5 | 1..30 | k4 + Hive rows 6-7 every 0.6, 0.55 (control rates) | 0.286 | 9/9 (6); -; - | 20/30, 5/30; -; - | 14:00, 2:09; -; - | L9/20/24, gaps 22; -; - | - |
| f1 | 1..30 | k3 Hive, k4 Wastes (XP rows 7-11 x1.05), x1 Depths; primeHpMul 1.45, 1.15, 1.35; gemSoftCap 120 | 0.212 | 9/9 (4); 9/9 (6); 9/9 (7) | 5/30, 2/30; 12/30, 7/30; 15/30, 3/30 | 14:00, 2:08; 9:23, 2:10; 14:00, 1:45 | L10/20/24, gaps 21; L11/21/26.5, gaps 15; L11/19/24, gaps 18 | 0.962; 0.956; 0.927 |
| g1 | 1..30 | f1 rows with control xpScale and primeHpMul; gemSoftCap 120 | 0.228 | 9/9 (5); 9/9 (7); 9/9 (6) | 16/30, 5/30; 5/30, 3/30; 6/30, 6/30 | 14:00, 2:08; 7:45, 2:09; 9:31, 1:44 | L9/16/19, gaps 25; L10/18/21, gaps 9; L10/16/20, gaps 19 | 0.965; 0.952; 0.919 |
| f2 | 1..30 | g1 Hive rows; Depths and Wastes rows as control; control xpScale; gemSoftCap 120 | 0.228 | 9/9 (5); 9/9 (7); 9/9 (5) | 16/30, 5/30; 5/30, 3/30; 7/30, 6/30 | 14:00, 2:08; 7:45, 2:09; 9:29, 1:44 | L9/16/19, gaps 25; L10/18/21, gaps 9; L10/16/20, gaps 18 | 0.965; 0.952; 0.909 |
| gs200-depths-h | 31..60 | Depths, control values (gemSoftCap 200) | - | - | -; 17/30, 5/30; - | -; 14:00, 2:10; - | - | - |
| gs120-depths-h | 31..60 | Depths, control rows, gemSoftCap 120 | - | - | -; 12/30, 4/30; - | -; 7:58, 2:09; - | - | - |
| gs150-dw | 1..30 | Depths and Wastes, control rows, gemSoftCap 150 | - | - | -; 8/30, 2/30; 11/30, 6/30 | -; 9:02, 2:13; 12:12, 1:43 | - | - |
| h150 | 1..30 | Hive, chosen rows, gemSoftCap 150 | 0.246 | 9/9 (6); -; - | 14/30, 7/30; -; - | 14:00, 2:09; -; - | L9/16/19, gaps 25; -; - | 0.967; -; - |
| crude-xp3 | 1..30 | chosen values + xpScale x3 on rows 1-2 in every world (A8 only) | - | - | - | 14:00, 2:09; 12:06, 2:10; 14:00, 1:44 | - | - |
| density-confirm | 1..30 | chosen values (h150 and gs150-dw runs reused, roam, dash and evolve added) | 0.246 | 9/9 (6); 9/9 (6); 9/9 (5) | 14/30, 7/30; 8/30, 2/30; 11/30, 6/30 | 14:00, 2:09; 9:02, 2:13; 12:12, 1:43 | L9/16/19, gaps 25; L9/17/22, gaps 13; L10/17/22, gaps 20 | 0.967; 0.913; 0.927 |
| density-holdout | 31..60 | chosen values (A6, A7, A8) | - | - | 11/30, 7/30; 14/30, 7/30; 15/30, 3/30 | 14:00, 2:08; 11:48, 2:10; 14:00, 1:42 | - | - |

Roam XP arms (`roam:SEED:14`, 30 seeds per world; XP up to the PRIME kill, minimum per world):

| Arm | Values | Hive | Depths | Wastes |
|---|---|---|---|---|
| rx0 | f1 rows and XP, gemSoftCap 200 | 0.939 | 0.882 | 0.875 |
| rx1 | same, gemSoftCap 120 | 0.962 | 0.956 | 0.927 |
| rx2 | same, gemSoftCap 150 | 0.945 | 0.949 | 0.906 |
| rxc140 | control rows and XP, captureRadius 140, gemSoftCap 200 | 0.953 | 0.939 | 0.866 |
| rxg150 | control rows and XP, gemSoftCap 150 | 0.959 | 0.913 | 0.927 |

Reading the arms:

- A3 needs both knobs in Hive: higher caps alone (a1) or slower pulses alone (a2) leave 0.32 to 0.33, and the worst run moves between a slow single-target build, the roam bot and the plain smart bot as the rates change (a3b 0.304, c2h 0.302, k5 0.286). With the chosen rates the worst runs of every set sit at 0.19 to 0.25.
- XP drives A7 more than density does: on the A9 curve (k1 to k5) Hive smart+P won 18 to 20 of 30 whatever the rows 6 to 10 rates (k5 put rows 6 and 7 back at the control rates).
- The gem cap changes the bots' paths: 120 cut the Depths and Wastes smart+P wins by 4 to 5 of 30 on two seed halves (g1, f2, gs120-depths-h against the control and gs200-depths-h); 150 stays within 1 (gs150-dw).

## Harness and script changes (this commit)

- `scripts/playtest/harness.js` (read-only counters): per-chunk A3 base and saturated steps; the over-row value against the row in force when the current cage rose (`overRowCage`, per chunk and per run); the free-field alive sum and steps (no cage, no lull) per chunk; XP dropped and collected before the step of each boss kill and at a stalemate.
- `scripts/playtest/analyze.mjs`: `xpCollectFracPrime` (A18 up to the PRIME kill); `overRowCage` in the A3 density; per-minute free-field mean; per-chunk A3 counts for the row table; A5 leaves PRIME ascends out of the distance; the two A3 replay fixes above.
- `scripts/playtest/matrix.mjs`: A3 scores the over-row by the cage's row and prints both, plus the saturated share per world and row; A4 scores the free field and prints the minute mean beside it (no scored minute is a failure); A5 counts ascends; A18 scores XP up to the PRIME kill and lists the runs under 0.90 and the whole-run minimum.

## Commands

```
# dev server (never killed)
cd /Users/Adelson/Desktop/personal/SWARMGEDDON && npx vite --port 5176 --strictPort

# control (7eaf81b values; rescored with this commit's scripts)
node scripts/playtest/matrix.mjs --seeds=30 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=density-control30 --runs=/tmp/swg-density/control --out=/tmp/swg-density/reports

# one arm: set the arm's rows in src/content/runScripts.ts (and src/config.ts for the gem cap), then
node scripts/playtest/matrix.mjs --seeds=10 --worlds=<worlds> --only=A2,A3,A4,A7,A8,A9 --label=<arm> --runs=/tmp/swg-density/<arm> --out=/tmp/swg-density/reports
#   30-seed arms: --seeds=30 and add A18; holdout arms: --seeds=30 --seed-from=31 --only=A6,A7,A8
node scripts/playtest/fightwindow.mjs /tmp/swg-density/<arm>        # A6/A7 per stage and the PRIME HP windows
# roam XP arms: node scripts/playtest/playtest.mjs <world> roam:SEED:14 ... --out=<dir>, SEED = 1001 x 1..30

# confirm (this commit's values)
node scripts/playtest/matrix.mjs --seeds=30 --only=A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A18 --label=density-confirm --runs=/tmp/swg-density/confirm --out=/tmp/swg-density/reports
node scripts/playtest/matrix.mjs --seeds=30 --seed-from=31 --only=A6,A7,A8 --label=density-holdout --runs=/tmp/swg-density/holdout --out=/tmp/swg-density/reports
node scripts/playtest/matrix.mjs --seeds=30 --only=A12,A13 --label=density-confirm-a12-a13 --runs=/tmp/swg-density/confirm --out=/tmp/swg-density/reports
node scripts/playtest/matrix.mjs --only=A14 --label=density-a14 --runs=/tmp/swg-density/a14 --out=/tmp/swg-density/reports
```

The reports in `docs/tuning/`: `density-control30`, `density-c10` (control, seeds 1..10, with the free-field counters), `density-k1` and `density-f1` (the A9-curve arms), `density-confirm`, `density-holdout`, `density-confirm-a12-a13`, `density-a14`, each `.md` and `.json`. Every command, config by config, is in `meta.commands` of each JSON. Raw runs were in `/tmp/swg-density` (not kept).
