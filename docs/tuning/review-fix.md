# P19 review fixes

The P19 adversarial review (2026-10-02) listed ten findings against the final matrix (`e60ae5f`). The main session then decided how to answer several of them (the decisions after the P19 review, kept in the workflow's carry-over list). This file records how each finding was checked, what changed, every arm that was measured, and the commands to repeat each step. The final matrix on the result is `final.md` (`final.json`, OVERTIME detail `final-ot.md`).

- Parent commit: `e60ae5f`. The changes below are the commit `v2 P19: review fixes` (src, scripts and docs in one commit). Every run in this file ran on the working tree of that commit, or on the arm values named in its table.
- Dev server: `npx vite --port 5176 --strictPort` (SWG_URL http://localhost:5176). Node 22.23.1.
- Seeds are 1001 x k. "60 seeds" means k = 1 to 60; "holdout" means k = 61 to 120.
- Bot sets: `smart+human:SEED:14:nova:priority` (smart+P), `smart+human:SEED:14` (smart), `smart+focus+human:SEED:14:nova:priority` (focus), `smart+dash+human:SEED:14:nova:priority` (dash), `smart+human:SEED:14:nova:evolve` (smart+E), `crude:SEED:14`, `roam:SEED:14`, OVERTIME `smart+human:SEED:25:nova:priority:T:ot`.
- Arms ran as `node scripts/playtest/playtest.mjs <world> <config>... --out=<dir>` with the arm's value set in the source, one world list at a time; the per-arm numbers below come from the run JSONs (fightStats, a10Stats and the boss-HP curves in each run's chunks).

## 1. Verification of the findings

Checked on the final matrix's runs (the builds pass's 30-seed arm, which equals `final.json` run for run) and on the reviewer's OVERTIME runs (`node scripts/playtest/otreport.mjs <runs> --runs`).

| # | Finding | Verdict | Evidence (old bot, `e60ae5f` values) |
|---|---|---|---|
| 1 | Boss fights tuned against a bot that is never hit by a boss attack | Confirmed | Hazard and lunge HP over 30 seeds per world: 0 for smart, smart+P, smart+focus+P and smart+E in all three worlds; 14.6 HP of lunge (Hive) and 42 HP of hazard (Wastes) for smart+dash+P. 0 of 188 default-bot fights ended in the bot's death. |
| 2 | A10 median passes only pooled | Confirmed | Smart-family medians: Hive 2.65 s (51 deaths), Depths 2.76 s (100), Wastes 5.42 s (65), pooled 3.09 s. Smart+P: Hive 2.72, Depths 2.02, Wastes 3.22 s. Seeds 1 to 10 only: pooled 2.85 s (75 deaths), Hive 2.24 s. |
| 3 | PRIME fights drag for the default bot | Confirmed | Default-bot PRIME, every ending: median 114.3 / 119.4 / 144.9 s, p75 194.6 / 183.7 / 190.1 s (Hive, Depths, Wastes); over 150 s 6/19, 4/8, 8/16. |
| 4 | A13 measured on Hive only; Wastes fails | Confirmed | Reviewer's runs: Wastes 13/15 (87%) dead by 20:00, 6 deaths in cycle 1 (seeds 7007, 10010, 12012, 13013, 14014, 20020); Depths 7/7. |
| 5 | A6 focus medians on 7 to 14 kills | Confirmed | Depths mid2 20.2 s on 14 kills, PRIME 63.5 s on 7; Wastes mid2 18.6 s on 18, PRIME 58.1 s on 11. Seeds 1 to 10: Depths PRIME 133.1 s on 2 kills. |
| 6 | The builds pass's content change undid earlier passes | Confirmed | The section 11 builds note lists A3 0.246 to 0.29, A6 Wastes focus mid2 20.2 to 18.6 s, A7 Wastes smart+P 26/60 to 32/60, A13 set 2 15/16 to 14/17; no pass re-fit the earlier knobs. |
| 7 | Deaths cluster after mid1; Wastes crude wall at 1:35 | Confirmed | Smart and smart+P deaths in minutes 5 and 6: Depths 33 of 48, Wastes 22 of 32, Hive 12 of 28. Wastes crude: 15 of 30 die between 1:30 and 1:46 (builds note). |
| 8 | OVERTIME cycle 2 cliff; heals shrink with no signal | Confirmed in code | `healPlayer` (src/systems/damage.ts) multiplied every heal by `world.healMul`, and the medkit pickup (src/systems/pickups.ts) heals through it; no HUD or banner text says so. 26 of 35 Hive OVERTIME deaths came in cycle 2 (old `final-ot.md`). |
| 9 | Metric redefinitions read as FAIL to PASS | Confirmed | The A4 Change cell said "FAIL to PASS" while the minute-mean measure went 6/9, 6/9, 7/9 to 6/9, 5/9, 5/9; A18 printed "Infinityx" with 0 dash deaths (seeds 1 to 10, Wastes); A12 T2 15/60 against T3 14/60 is one run apart. A3 already printed the row-of-the-minute measure (308) next to the new one. |
| 10 | GRACE.hit 0.5 to 0.8 never got a decision | Confirmed | The deaths pass offered a revert of that one number; `src/config.ts` kept 0.8 and no decision line named it. |

## 2. What changed

### Instrument (scripts/)

- **Human hazard model** (finding 1). `harness.js`: with `cfg.human` (config token `+human`) the hazard escape sees a hazard only 0.27 s after it appears (`HZ_REACT`) and ignores 10% of hazards (`HZ_MISS`), drawn per hazard from the run seed and the sim's hazard sequence number, so the sim's RNG is untouched. Every smart-family set of the matrix now runs with it (`smart+human`, `smart+focus+human`, `smart+dash+human`); old config strings still mean the old bot. The harness records the HP lost per boss fight by kind (`fightDmg`), and `analyze.mjs` puts `bossAtk` (hazard plus lunge) and `dmg` on each fight.
- **Sample sizes** (findings 2, 5). A6's focus set runs 90 seeds per world (`--focus-seeds`, default 90) and a stage median is scored only on 20 kills or more (`*` marks the rest). A7, A8, the A6 default-bot clauses, A10's per-world clause and A18's dash clause run 60 seeds (`--rate-seeds`, default 60); A7 prints both 30-seed halves.
- **Scoring** (the decisions after the review). A6: the default bot's PRIME median over every ending at most 120 s, with p75, boss-attack HP per fight and fight deaths reported. A8: the busiest minute holds at most 35% of a world's smart+P deaths; the matrix prints deaths per minute. A10: pooled over the smart family and per world over smart+P. A12: two levels less than two standard errors apart are reported as equal. A13: Depths and Wastes run the T0 part of OVERTIME sets 1 and 2 and are scored on them pooled (`--ot-worlds`); `otreport.mjs` counts sets and death cycles per world. A18: minutes per death only with 5 or more deaths in each set; otherwise the mean-survival ratio, which passes at 1.25x or at a dash mean survival of 13:00 or more (the 14:00 end caps it).
- **Report** (finding 9). A Change cell starts with "re-scored" when the measure or target changed since the baseline. The A3 replay accepts a lull that fires one tick after a kill logged at its own time (Wastes roam seed 5005: mid2 killed at 580.00, the 9:40 lull fired at 580.017), as it already did for elites and events.

### Game (src/), all decided after the review

| Item | Old | New | Why |
|---|---|---|---|
| `GRACE.hit` (finding 10) | 0.8 s | 0.8 s, kept | Main-session decision: readable deaths (A10) are the most fun-critical metric. Recorded in the C3 decision row. |
| Medkit and OVERTIME heal cut (finding 8) | every heal x `healMul^(c-1)` | a medkit heals in full (`healPlayer(w, heal, false)`); regen, kill healing and draft heals keep the cut | Main-session decision: a medkit heals what it shows. |
| `OVERTIME.medkitMul` (new) | none | 0.25: a kill's medkit drop chance x `0.25^(c-1)` | With the exemption alone, kill medkits (300 to 2,500 picked up in a long OVERTIME run) cancelled the heal cut: Hive set 2 fell to 17/25 (68%) dead by 20:00 with 3 alive past 24:00. Thinning the drops keeps "a medkit heals what it shows" and gives the player fewer medkits, never weaker ones. |
| `OVERTIME.healMul` | 0.25 | 0.25, kept | The A13 arm at 0.2 left Wastes at 21/25 dead by 20:00 (section 3.5), so the ladder pass's value stays. |
| Depths `psychic` projectileDamage (finding 7) | 18 | 14 | Approved content change for the Depths minute 5 and 6 death spike. |
| Depths `abyssalWarden` projectileDamage (finding 7) | 26 | 20 | Same. |
| Wastes teaching elite HP (`WorldScript.teachHpMul`, new per-world factor on THREAT's `teachHpMul`) (finding 7) | 1 (0.6 at T0) | 0.5 (0.3 at T0) | Approved content change for unskilled play; arms in section 3.3. |
| Wastes `worldMul` (finding 1) | 0.9 | 1.0 | Re-measured with the human hazard model; arms in section 3.2. |

## 3. Arms

### 3.1 Human hazard model against the old bot (final values, 30 seeds per world)

`node scripts/playtest/playtest.mjs <world> smart:SEED:14:nova:priority smart+human:SEED:14:nova:priority smart+focus:SEED:14:nova:priority smart+focus+human:SEED:14:nova:priority smart+human:SEED:14 --out=<dir>` (SEED = 1001 x 1..30). The old-bot runs equal the final matrix's run for run (60 of 60 Hive files compared).

| World | smart+P wins, old / human | Boss-attack HP per default fight, old / human (fights hit) | Default fights ended by death, old / human | Focus PRIME median, old / human (kills) | smart wins, old / human |
|---|---|---|---|---|---|
| Hive | 13/30 / 12/30 | 0 / 5.5 (13/75) | 0/71 / 0/75 | 59.2 s (22) / 48.8 s (17) | 5/30 / 8/30 |
| Depths | 7/30 / 6/30 | 0 / 32.4 (32/51) | 0/50 / 0/51 | 63.5 s (7) / 74.5 s (8) | 3/30 / 2/30 |
| Wastes | 15/30 / 13/30 | 0 / 34.1 (40/67) | 0/67 / 3/67 | 58.1 s (11) / 33.8 s (10) | 8/30 / 9/30 |

The human model lets the boss attacks land (5 to 34 HP a fight) and kill in Wastes, and moves each win count by 1 or 2 of 30, inside the noise of a 30-seed set. It is the scoring bot from here on.

### 3.2 Wastes worldMul with the human model (old content otherwise)

smart+P, smart and focus on 60 seeds; smart+P on the holdout as well.

| worldMul | smart+P wins (holdout) | smart wins | Focus mid1 / mid2 / PRIME (kills) | Default PRIME median (holdout) | Default mid fights over 150 s |
|---|---|---|---|---|---|
| 0.9 (old) | 31/60 (29/60) | 12/60 | 22.7 / 20.7 / 43.9 s (60/42/31) | 114.2 s (144.0 s) | 0/105 |
| 0.95 | 33/60 | 12/60 | 24.5 / 22.5 / 52.9 s | 165.2 s | 1/108 |
| 1.0 (chosen) | 25/60 (23/60) | 6/60 | 25.4 / 20.7 / 59.1 s (59/47/39) | 167.9 s (148.2 s) | 5/110 |

0.95 sits inside the noise of 0.9; 1.0 cuts the smart+P wins by 6 of 60 on both seed halves (52% to 40% over 120 seeds), which puts A7 in its band.

### 3.3 Wastes teaching elite (crude bot, 60 seeds)

| Teaching elite HP factor | Crude median survival | Crude deaths before 1:50 | Dead by 2:30 |
|---|---|---|---|
| 1 (old) | 1:43 | 38/60 | 59/60 |
| 0.5 (chosen) | 2:10 | 24/60 | 59/60 |
| 0.25 | 2:12 | 18/60 | 60/60 |

Past 0.5 the row 2 stingers and the 2:30 CINDER WALL kill the crude bot whatever the LEVIATHAN's HP, so A8's crude clause (2:30) needs row 2 content, which no decision covers.

### 3.4 Default PRIME median of 120 s against A7 (60 seeds per world)

The decided A6 clause asks the default bot's PRIME median (every ending) to be 120 s or less. On the decided content it measures 166.7 s in Hive and 162.2 s in Wastes, while A7 sits at 29/60 and 23/60. Each arm below set the PRIME's HP factor and added pressure before the PRIME (row values in the comment of each row) to hold A7.

| Arm | Hive: reached PRIME, smart+P wins, default PRIME median, focus PRIME (kills), smart wins | Wastes: same |
|---|---|---|
| decided content | 46, 29/60, 166.7 s, 58.7 s (39), 14/60 | 36, 23/60, 162.2 s, 64.8 s (39), 11/60 |
| r1: Hive primeHpMul 0.78, rows 8 to 10 minAlive x1.35; Wastes primeHpMul 0.72, rows 8 to 10 minAlive x1.25 | 45, 38/60, 115.3 s, 43.5 s (39), 16/60 | 34, 27/60, 138.3 s, 38.2 s (35), 15/60 |
| r2: Hive 0.8, rows 5 to 9 minAlive x1.3 and pulses 15 to 20% faster; Wastes 0.8, FLAK_TURRETS count 2 and maxAlive 4 | 36, 29/60, 124.3 s, 48.4 s (36), 18/60 | 39, 34/60, 128.3 s, 52.4 s (39), 14/60 |
| r3: Hive 0.78, rows 5 to 9 minAlive x1.4, pulses 25% faster, maxAlive +5 to 12%; Wastes 0.72, turrets 2 and 4, rows 7 to 9 minAlive x1.2 to 1.4 and pulses 20% faster | 44, 41/60, 123.3 s, 47.5 s (44), 17/60 | 35, 34/60, 127.6 s, 42.9 s (33), 16/60 |

A projection from each run's boss-HP curve (the PRIME's HP sampled every 30 s; a fight ends where the curve crosses the HP factor, or at the 210 s stalemate) gives the same picture without the re-roll: on the decided Hive content, a PRIME HP factor of 0.8 puts the default median at 121 s and the focus median at 47 s, and raises the smart+P wins from 29 to 39 of 60.

**Result: the two clauses do not hold together with the boss-HP and density knobs.** A default PRIME median of 120 s or less means most default PRIME fights end in a kill before the 210 s stalemate, so the smart+P win rate becomes the share that reaches the PRIME times 85 to 90%. Holding A7 (45% at most) then needs 10 to 15 more of 60 runs to die before 10:30, and no density arm did that reliably: denser rows also bring more XP, and the reach count moved 46, 45, 36, 44 across the Hive arms. In Wastes the flak turrets hold the default bot's fire, so its PRIME fight runs 3.6 times the focus bot's at 3 turrets (2.45 times at 2), and no HP factor gives 120 s or less with the focus bot at 40 s or more. The committed values are the decided content (no PRIME or density change); A6 fails its PRIME clause in Hive and Wastes, and the owner chooses (section 5).

### 3.5 OVERTIME

OVERTIME sets 1 and 2 (Hive T0 1001 x 1..60 and T1 to T3 1001 x 1..20; Depths and Wastes T0 1001 x 1..60), `smart+human:SEED:25:nova:priority:T:ot`, every other value as committed.

| Arm | Hive set 1 | Hive set 2 | Depths (sets pooled) | Wastes (sets pooled) | Deaths in cycle 1 (Hive, Depths, Wastes) |
|---|---|---|---|---|---|
| Old content, human model (before the review changes) | 17/19 (89%) | 22/25 (88%) | 15/15 (100%) | 30/31 (97%) | 12/44, 6/15, 13/31 |
| Decided content, medkit exempt, no medkitMul | 17/19 (89%), 1 past 24:00 | 17/25 (68%), 3 past 24:00 | 22/24 (92%) | 20/25 (80%) | 12/44, 3/24, 3/25 |
| medkitMul 0.25, healMul 0.25 (committed) | 18/19 (95%) | 23/25 (92%) | 24/24 (100%) | 21/25 (84%) | 12/44, 3/24, 3/25 |
| medkitMul 0.25, healMul 0.2 (stopped after Wastes and 21 Depths winners) | - | - | 21/21 (100%) | 21/25 (84%) | -, 3/21, 3/25 |

The four Wastes runs alive at 20:00 with healMul 0.25 die between 20:07 and 20:45, in cycle 3. They won late, so OVERTIME started between 13:16 and 14:01 and 20:00 came 6 to 7 minutes into it; they carry Vampiric 3 and Regrowth 4 and spend 22 to 34% of OVERTIME caged with the OT boss, whose HP rose with Wastes' worldMul 1.0. With healMul 0.2 the same four runs died at 20:21 to 20:58, so a cut to kill healing and regen does not reach them; what they need is a faster end of cycle 2 (speed, which the phone check of finding 8 covers) or an A13 clause measured from the OVERTIME start. Both are owner decisions (section 5).

**Wastes cycle-1 deaths (finding 4).** In the reviewer's runs and in the old-content human runs, 40% of the Wastes winners died in cycle 1, 35 to 128 s after the win. The death windows are mostly shots (row 8 stingers at x1.2 damage) right after EVENT 1, the CINDER WALL at +20 s, which pushes the bot into the stingers' lines. On the committed content 3 of 25 Wastes winners die in cycle 1 (the winners changed with worldMul 1.0 and the teaching elite). OVERTIME's multipliers are per cycle from c = 1, so a gentler cycle 1 alone needs a rule change (for example `dmgMul^(c-1)`); none is decided.

## 4. Final matrix

`final.md` holds the table, with the baseline (`baseline.json`, `15c16b9`) and the Change column. The section 11 "P19 review fix note" in docs/NEXT-LEVEL.md summarizes it.

Command: `node scripts/playtest/matrix.mjs --seeds=30 --threat-seeds=60 --ot-sets=1,2 --daily=2026-10-02 --baseline=docs/tuning/baseline.json --label=final --runs=/tmp/swg-rf/final`. The T0 runs were copied from the arm that ran the committed T0 values (the decided content; the medkit drop multiplier only acts from OVERTIME cycle 2), after 7 spot reruns on the committed build matched it run for run (end time, kills, score, XP); the matrix ran every OVERTIME set, the A14 det steps (31 lines), the opening probe and the timing steps itself. A15 was run a second time alone (`--only=A15`) with the same result.

| ID | Result | Against the pre-review final (`e60ae5f`) |
|---|---|---|
| A1 | PASS | same |
| A2 | PASS | same |
| A3 | FAIL | saturated share 0.29 to 0.274 (Hive roam seed 11011; the roam bot is invincible and did not change) |
| A4 | PASS | same (free field 9/9 in every world) |
| A5 | PASS | 400 arrivals at 294 to 306 u |
| A6 | FAIL, re-scored | focus medians in band on 36 to 89 kills a stage: Hive 23.4/24.3/55.7 s, Depths 21.6/24.1/44.6 s, Wastes 23.7/25.6/68.4 s (Depths mid2 and PRIME and Wastes mid2 were under 20 kills or under the floor before); default mid fights over 150 s 5/112, 0/98, 2/104 (pass); **default PRIME median 166.7, 106.7 and 162.2 s: Hive and Wastes fail the decided 120 s**; boss-attack HP per default fight 7.1, 37.1, 36.0, fights ended by death 0, 2, 1 |
| A7 | FAIL, re-scored | 60 seeds: smart+P 29/60 (48%), 24/60 (40%), 23/60 (38%); smart 14/60, 13/60, 11/60. Hive smart+P is 2 runs over 45% (halves 12/30 and 17/30). Before: Depths smart+P 7/30 (23%) and Wastes 15/30 (50%) failed. |
| A8 | FAIL, re-scored | smart+P 14:00, 9:55, 14:00 (Depths was 6:59); Wastes crude 1:43 to 2:10 (under 2:30); Hive crude 3:12 under Depths 3:17; busiest death minute of smart+P 0.29, 0.31, **0.38** (Wastes 6:00 to 7:00, 9 of 24) |
| A9 | FAIL | Hive L8 at 3:00; runs with a gap over 60 s outside fights 5, 0, 4 of 30 |
| A10 | FAIL, re-scored | pooled 3.09 to 4.1 s; smart+P per world 5.22, **2.72**, 6.29 s; minimum 0.42 s (Hive smart seed 8008: a bite, acid and a shot in 0.42 s from 37.7 of 75 HP) |
| A11 | PASS | same |
| A12 | PASS | T0 48%, T1 43%, T4 2%; T0 and T1, and T2 and T3, are within two standard errors |
| A13 | FAIL, re-scored | Hive 18/19 and 23/25, Depths 24/24, **Wastes 21/25 (84%)**; none past 24:00 |
| A14 | PASS | 31/31 lines; det keeps 642fbc46, 1365ccb6, d3c8cef6; det-long Hive and Depths keep af0a9917 and ba6215aa, Wastes ab4f477 to 2ee8fbee; det-death Hive keeps 4e549672, Depths 7f0eec9a to 6409cc9d (death 201.7 to 252.48 s), Wastes 224be1c to 7515552a (168.1 to 146.42 s); Daily det keeps 552a87a2, det-death cbcd258d to 997bf89c |
| A15 | FAIL | perf-final p95 16.8 ms (one 0.1 ms step of the vsync-locked frame), 0 frames over 20 ms, on both invocations, with Spotlight indexing holding the 1-minute load at 4.5 to 12; Hive's content did not change in this commit |
| A16 | FAIL | 3.056 ms GC pause (owner: idle machine) |
| A17 | owner | |
| A18 | PASS, re-scored | Hive and Wastes on the mean ratio (2 and 4 dash deaths in 60): dash mean survival 13:54 and 13:35; Depths 5.62x per death; Wastes roam XP 0.893 to 0.921 |

## 5. Owner decisions left open

1. **A6 PRIME against A7** (section 3.4). Keep the committed values (default PRIME median 167 and 162 s in Hive and Wastes, focus PRIME 56 and 68 s), or shorten the PRIME for the default bot (Hive primeHpMul 0.78 gave 115 s and a focus PRIME of 43.5 s) and accept about 38 of 60 smart+P wins, or change a rule (a 150 s PRIME stalemate; the 14:00 run end, `UNCLEARED_MAX_MS` and the clear score depend on it). A player aims, as the focus bot does, so the phone check (A17) can settle how long the PRIME feels.
2. **A7 Hive smart+P 29/60 (48%).** Two runs over the band on 60 seeds; the halves read 40% and 57%. The A17 rule (rows 5 to 10 maxAlive and hpBase x1.1 after 3 wins in 3) is the designed response.
3. **A13 Wastes 21/25.** The four runs alive at 20:00 won late and die by 20:45. Options: measure A13 from the OVERTIME start (for example dead within 6:00 of it), or a faster cycle 2 (`speedMul`), which the phone check of finding 8 covers.
4. **Wastes OVERTIME cycle 1.** On the old content 40% of the Wastes winners died in cycle 1, after the CINDER WALL at +20 s into the row 8 stingers; on the committed content 3 of 25. A gentler cycle 1 needs a rule change (`dmgMul^(c-1)`).
5. **A8 crude in Wastes, 2:10.** The teaching elite ease is in; the rest is row 2 (stingers and the 2:30 CINDER WALL).
6. **A8 Wastes death minute, 38% at 6:00 to 7:00** (9 of 24 smart+P deaths), the row 5 and 6 content after mid1 (cinderMortarch debut, brutes).
7. **A10 Depths smart+P, 2.72 s.** After the psychic and Warden ease, the shots inside the death windows fell from 2,711 to 1,627 HP and bites (2,578 HP) lead: engulfs by wraiths under the deepCaller's speed aura (x1.55). The next knob is that aura; no decision covers it.
8. **Heal cut signal (finding 8).** Medkits now heal in full and drop less often from cycle 2; regen and kill healing are still cut with no player-facing text. The cycle-2 speed (336 u/s against NOVA's 285) stays a phone check.
9. **OVERTIME bonus rate.** 2 of the 93 OVERTIME runs drop more than 3 bonuses a minute (Hive 20020 3.24, Depths 13013 3.57); the Depths sets are new to this report.
10. Unchanged from the final note: A3 (roam saturation), A9 (Hive L8 at 3:00 and the gaps), A15 and A16 on an idle machine.

## 6. Commands

```
# 3.1 (per world, SEED = 1001 x 1..30)
node scripts/playtest/playtest.mjs <world> smart:SEED:14:nova:priority smart+human:SEED:14:nova:priority smart+focus:SEED:14:nova:priority smart+focus+human:SEED:14:nova:priority smart+human:SEED:14 --out=/tmp/swg-rf/ab1
# 3.2 (Wastes, worldMul set in src/content/runScripts.ts; SEED = 1001 x 1..60, holdout 61..120)
node scripts/playtest/playtest.mjs wastes smart+human:SEED:14:nova:priority smart+human:SEED:14 smart+focus+human:SEED:14:nova:priority --out=/tmp/swg-rf/w<value>
# 3.3 (Wastes, teachHpMul set in src/content/runScripts.ts)
node scripts/playtest/playtest.mjs wastes crude:SEED:14 --out=/tmp/swg-rf/crude-t<value>
# 3.4 (Hive and Wastes, arm values in src/content/runScripts.ts and src/content/bosses.ts)
node scripts/playtest/playtest.mjs <world> smart+human:SEED:14:nova:priority smart+human:SEED:14 smart+focus+human:SEED:14:nova:priority --out=/tmp/swg-rf/r<n>
# 3.5 (OVERTIME values in src/config.ts)
node scripts/playtest/playtest.mjs hive smart+human:SEED:25:nova:priority:T:ot ... --out=/tmp/swg-rf/ot<n>   # T0 1..60, T1 to T3 1..20
node scripts/playtest/playtest.mjs depths|wastes smart+human:SEED:25:nova:priority:0:ot ... --out=/tmp/swg-rf/ot<n>   # 1..60
node scripts/playtest/otreport.mjs /tmp/swg-rf/ot<n> --runs
# 4
node scripts/playtest/matrix.mjs --seeds=30 --threat-seeds=60 --ot-sets=1,2 --daily=2026-10-02 --baseline=docs/tuning/baseline.json --label=final --runs=/tmp/swg-rf/final
node scripts/playtest/otreport.mjs /tmp/swg-rf/final --md=docs/tuning/final-ot.md
```

Raw runs are in /tmp and are deleted after this report; the tables above are the record.
