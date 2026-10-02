# HUD digit contrast (P19 copy and polish)

Every HUD DigitStrip measured against the fill under it, from rendered pixels,
before and after the P19 digit polish.

- Before: commit `a5fbf82` (v2 P19: review fixes), the outlined `numMono` atlas
  on every strip.
- After: the commit 'v2 P19: store and privacy copy, HUD digit polish' (parent
  `a5fbf82`): the flat `numMonoFlat` atlas for the level digit, the LEVEL UP
  `x2` and the HP number, and a dark pill (plate token, INK at 0.85, 14 px
  high, 6 px past the digits) under the HP number. The other strips are
  unchanged.

## How to re-run

```bash
cd ~/Desktop/personal/SWARMGEDDON
npx vite --port 5176 --strictPort     # dev server, if none is running
node scripts/probe-hud-digits.mjs p375,l667 --out=/tmp/hud-digits
node scripts/hud-shots.mjs p375,l667,p320 --out=/tmp/hud-shots   # overlap and text-size checks
```

The probe starts a NOVA Standard run in Hive (fresh save, the run seed that
`startRun` draws; the HUD state does not depend on it), jumps to 236 s, steps
until the mid boss is up, and gives rockets. A rAF hook then holds level 12,
LEVEL UP x2, the three bonus rings, the boss at 64% and the HP state:

| state | HP | overshield | what the HP digits sit on |
|---|---|---|---|
| full | 100 / 100 | 0 | green fill #2ee6a6 |
| busy | 62 / 100 | 18 | green fill, cyan overshield strip |
| half | 48 / 100 | 0 | yellow fill #e8c64a ending under the digits |
| low | 20 / 100 | 0 | red fill #e8434a, dark track #10231d under the digits |

Per state it pauses the sim and takes a DPR 2 screenshot with the digits shown
(A) and one with every strip at alpha 0 (B). Pixels that differ by 60 or more
in a channel are glyph pixels; the glyph pixels within 40 of the strip's tint
are its ink. The ratio is WCAG contrast between the median ink color and B at
each ink pixel (the ground under that pixel); the table gives the median and
the minimum over the ink pixels. Target: 4.5:1 for every HUD digit.

## Results

"ground" is the median color under the ink. The strips this pass did not
change (time, score, boss %, ammo on dark plates; the bonus ring seconds) pass
in both runs: lowest minimum 4.66 before (667x375 busy, the FREEZE ring, whose
disc is INK at 0.6 over a bright part of the scene) and 6.82 after (667x375
full, the OVERDRIVE ring). The ring grounds follow the live scene, so these two
numbers differ by scene, not by code. Full tables below.

### Digits on a fill (the ones this pass changed)

| view | state | digit | before: ground, median / min | after: ground, median / min | result |
|---|---|---|---|---|---|
| 375x667 | full | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 375x667 | full | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 375x667 | full | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.33 / 14.33 | FAIL to PASS |
| 375x667 | busy | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 375x667 | busy | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 375x667 | busy | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.58 / 14.58 | FAIL to PASS |
| 375x667 | busy | shieldNum | #2ee6a6, 1.03 / 1.03 | #0b2924, 9.87 / 9.87 | FAIL to PASS |
| 375x667 | half | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 375x667 | half | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 375x667 | half | hpNum | #10231d, 15.46 / 1.57 | #070b0f, 18.6 / 14.61 | FAIL to PASS |
| 375x667 | low | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 375x667 | low | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 375x667 | low | hpNum | #10231d, 15.59 / 15.59 | #070b0f, 18.76 / 18.76 | PASS (outlined) to PASS |
| 667x375 | full | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 667x375 | full | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 667x375 | full | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.33 / 14.33 | FAIL to PASS |
| 667x375 | busy | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 667x375 | busy | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 667x375 | busy | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.58 / 14.58 | FAIL to PASS |
| 667x375 | busy | shieldNum | #2ee6a6, 1.03 / 1.03 | #0b2924, 9.87 / 9.87 | FAIL to PASS |
| 667x375 | half | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 667x375 | half | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 667x375 | half | hpNum | #10231d, 15.46 / 1.57 | #070b0f, 18.6 / 14.61 | FAIL to PASS |
| 667x375 | low | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 | ratio pass, smeared, to PASS |
| 667x375 | low | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 | ratio pass, smeared, to PASS |
| 667x375 | low | hpNum | #10231d, 15.59 / 15.59 | #070b0f, 18.76 / 18.76 | PASS (outlined) to PASS |

The ratio misses the smear: `lvNum` and `chipNum` measured 10.66 and 12.6
before, but the INK-tinted outline doubled the stroke weight and closed the
counters of `12` and `x2` (crops below). The flat atlas keeps the ratio
(10.66, 12.45) and draws the digits at the weight of the `LV` and `LEVEL UP`
labels next to them.

### Every strip, both views

**375x667**

| state | digit | before: ground, median / min | after: ground, median / min |
|---|---|---|---|
| full | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| full | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.33 / 14.33 |
| full | time | #05070e, 19.13 / 17.27 | #100813, 18.72 / 17.41 |
| full | score | #110813, 14.75 / 13.69 | #04070d, 15.13 / 15.1 |
| full | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| full | bossPct | #04070e, 18.06 / 17.98 | #04070e, 18.06 / 18.06 |
| full | ammo | #04070d, 18.88 / 18.56 | #04070d, 18.88 / 18.86 |
| full | ring0 | #030a11, 14.07 / 14.07 | #030a11, 14.07 / 14.07 |
| full | ring1 | #030a11, 11.72 / 11.58 | #030a11, 11.72 / 10.63 |
| full | ring2 | #030910, 15.23 / 15.23 | #030910, 15.23 / 15.23 |
| busy | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| busy | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.58 / 14.58 |
| busy | shieldNum | #2ee6a6, 1.03 / 1.03 | #0b2924, 9.87 / 9.87 |
| busy | time | #06070e, 18.99 / 17.16 | #100813, 18.59 / 17.23 |
| busy | score | #120814, 14.69 / 13.68 | #04070d, 15.13 / 15.1 |
| busy | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| busy | bossPct | #04080e, 17.99 / 17.9 | #04070e, 18.06 / 18.06 |
| busy | ammo | #05070e, 18.85 / 18.47 | #04070d, 18.88 / 18.86 |
| busy | ring0 | #030910, 14.13 / 14.07 | #030910, 14.13 / 14.07 |
| busy | ring1 | #030a11, 11.72 / 11.58 | #030910, 11.77 / 10.61 |
| busy | ring2 | #030910, 15.23 / 15.23 | #030910, 15.23 / 15.15 |
| half | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| half | hpNum | #10231d, 15.46 / 1.57 | #070b0f, 18.6 / 14.61 |
| half | time | #06070e, 18.99 / 17.61 | #08080f, 18.9 / 17.23 |
| half | score | #04070d, 15.13 / 15.13 | #27091d, 13.8 / 13.73 |
| half | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| half | bossPct | #04070e, 18.06 / 17.99 | #04070e, 18.06 / 17.98 |
| half | ammo | #050910, 18.67 / 18.07 | #04070d, 18.88 / 18.88 |
| half | ring0 | #03080f, 14.2 / 14.2 | #03080f, 14.2 / 12.94 |
| half | ring1 | #03080f, 11.83 / 11.82 | #030911, 11.76 / 11.69 |
| half | ring2 | #03080f, 15.3 / 15.3 | #03080f, 15.3 / 15.3 |
| low | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| low | hpNum | #10231d, 15.59 / 15.59 | #070b0f, 18.76 / 18.76 |
| low | time | #09070f, 19.01 / 17.65 | #0a0810, 18.94 / 17.35 |
| low | score | #06070e, 15.08 / 15.06 | #27091c, 13.79 / 13.69 |
| low | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| low | bossPct | #05070e, 18.04 / 18.02 | #05070e, 18.02 / 17.95 |
| low | ammo | #060a11, 18.56 / 17.45 | #05080e, 18.77 / 18.77 |
| low | ring0 | #04060f, 14.3 / 14.3 | #04060f, 14.3 / 13.04 |
| low | ring1 | #03060f, 11.92 / 11.76 | #030710, 11.87 / 11.75 |
| low | ring2 | #03060f, 15.42 / 15.41 | #03060f, 15.42 / 15.41 |

**667x375**

| state | digit | before: ground, median / min | after: ground, median / min |
|---|---|---|---|
| full | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| full | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.33 / 14.33 |
| full | time | #07070f, 19.05 / 17.41 | #04070d, 19.16 / 17.29 |
| full | score | #09070f, 15.02 / 14.82 | #05070d, 15.1 / 14.67 |
| full | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| full | bossPct | #04080e, 17.99 / 17.99 | #04070d, 18.07 / 17.38 |
| full | ammo | #04070d, 18.88 / 18.88 | #04070d, 18.88 / 18.87 |
| full | ring0 | #236065, 5.13 / 4.7 | #050b13, 13.96 / 13.65 |
| full | ring1 | #1d091b, 11.17 / 10.82 | #65174b, 6.96 / 6.82 |
| full | ring2 | #030810, 15.29 / 15.29 | #030810, 15.29 / 15.29 |
| busy | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| busy | hpNum | #2ee6a6, 1.51 / 1.51 | #0b2924, 14.58 / 14.58 |
| busy | shieldNum | #2ee6a6, 1.03 / 1.03 | #0b2924, 9.87 / 9.87 |
| busy | time | #08070f, 19 / 17.41 | #05070d, 19.14 / 17.29 |
| busy | score | #0f0712, 14.86 / 14.75 | #05070d, 15.1 / 14.7 |
| busy | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| busy | bossPct | #04080e, 17.99 / 17.95 | #04070d, 18.07 / 18.06 |
| busy | ammo | #04070d, 18.88 / 18.88 | #04070d, 18.87 / 18.82 |
| busy | ring0 | #256568, 4.73 / 4.66 | #050b13, 13.96 / 13.62 |
| busy | ring1 | #110716, 11.56 / 10.99 | #651246, 7.18 / 7.01 |
| busy | ring2 | #03070f, 15.36 / 15.36 | #03070f, 15.36 / 15.36 |
| half | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| half | hpNum | #10231d, 15.46 / 1.57 | #070b0f, 18.6 / 14.61 |
| half | time | #04070d, 19.05 / 18.53 | #05070e, 18.94 / 17.24 |
| half | score | #04060d, 15.19 / 15.13 | #0e2329, 12.2 / 11.25 |
| half | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| half | bossPct | #04070d, 18.07 / 17.58 | #04070d, 18.07 / 17.98 |
| half | ammo | #04070d, 18.88 / 18.88 | #04070d, 18.88 / 18.73 |
| half | ring0 | #0f0713, 14 / 13.23 | #03060d, 14.33 / 14.33 |
| half | ring1 | #03060d, 11.94 / 11.94 | #03060d, 11.94 / 11.94 |
| half | ring2 | #03060d, 15.44 / 15.36 | #03060d, 15.44 / 15.28 |
| low | lvNum | #57c8ff, 10.66 / 10.66 | #57c8ff, 10.66 / 10.66 |
| low | hpNum | #10231d, 15.59 / 15.59 | #070b0f, 18.76 / 18.76 |
| low | time | #06070e, 19.09 / 18.6 | #07070e, 19.06 / 17.35 |
| low | score | #06070d, 15.09 / 15.09 | #11262c, 11.78 / 11.44 |
| low | chipNum | #ffc24a, 12.6 / 12.6 | #ffc24a, 12.45 / 12.45 |
| low | bossPct | #05070d, 18.05 / 17.12 | #05070d, 18.05 / 17.95 |
| low | ammo | #05070d, 18.85 / 18.78 | #0d0912, 18.46 / 18.44 |
| low | ring0 | #150715, 13.87 / 13.08 | #06060e, 14.27 / 14.23 |
| low | ring1 | #05060d, 11.91 / 11.91 | #05060d, 11.91 / 11.91 |
| low | ring2 | #05050d, 15.47 / 15.31 | #05050d, 15.47 / 15.3 |

## Visual check (screenshots looked at)

- Before, 375x667 busy: `LV 12` and `x2` read as dark blobs on the light
  chips; `62 +18` is white and cyan on the bright green fill with a thick dark
  outline, blotchy; at 48 HP the `48` straddles the yellow fill end and the
  dark track (667x375 half). Same as `docs/v2-shots/w4-live-run-375x667.png`.
- After, 375x667 and 667x375, all four states, and the 320x568 hud-shots
  capture: `LV 12` and `x2` are clean INK digits; the HP number sits on a dark
  pill and reads the same over green, yellow, red and the track. At 320 wide the
  pill with `62 +18` fills most of the 122 px bar and stays inside it.
- `node scripts/hud-shots.mjs p375,l667,p320`: no fails at any size (HUD box
  overlaps with DigitStrips included, 12 px text, DASH circle, pause input).

## Determinism (presentation only)

`node scripts/measure.mjs 375 667 det`, `667 375 det`, `375 667 det-death`,
`667 375 det-death` on the changed tree: det 642fbc46 (hive), 1365ccb6
(depths), d3c8cef6 (wastes); det-death 4e549672 (hive, 142.5 s), 6409cc9d
(depths, 252.48 s), 7515552a (wastes, 146.42 s). Every line has
`rerunMatch: true`, both views agree, and the hashes equal the review-fix
values in `review-fix.md` (A14 row).
