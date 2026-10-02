# OVERTIME report: /tmp/swg-ladder/confirm

Command: `node scripts/playtest/otreport.mjs /tmp/swg-ladder/confirm --runs --json=/tmp/swg-ladder/ot-confirm.json --md=docs/tuning/ladder-confirm-ot.md`

| Set | Dead by 20:00 | Alive past 24:00 |
|---|---|---|
| 1 | 19/19 (100%) | 0 |
| 2 | 15/16 (94%) | 0 |

- Death cycle: {"c2":26,"c1":5,"c3":4}; median time in OVERTIME 245.2 s; median caged share 0.08.
- Bonus drops in OVERTIME (per run with 120 s or more of it): median 2.08 a minute, max 2.96; busiest 120 s window 8 (median 5), busiest 180 s 11; runs over 3 a minute: none. The same runs from 2:00 to the win: median 2.11 a minute, max 3.12; busiest 120 s window 12 (median 7).
- OVERTIME beats: 193 fired (the latest 54.05 s late), 0 dropped.

| Run | Set | T | OVERTIME from | End | Cycle | Caged | Bonus drops (per min) | OT boss kills, retreats | Damage / healing per cycle |
|---|---|---|---|---|---|---|---|---|---|
| hive_smart_1001_priority_ot | 1 | 0 | 12:10 | dead 15:44 | 2 | 0.04 | 10 (2.81) | 1, 0 | c1 450/462, c2 108/8 |
| hive_smart_3003_priority_ot | 1 | 0 | 13:03 | dead 16:51 | 2 | 0.13 | 5 (1.31) | 1, 0 | c1 473/473, c2 274/49 |
| hive_smart_5005_priority_ot | 1 | 0 | 13:09 | dead 16:51 | 2 | 0.17 | 6 (1.62) | 1, 0 | c1 201/201, c2 395/195 |
| hive_smart_7007_priority_ot | 1 | 0 | 10:36 | dead 13:48 | 2 | 0.05 | 7 (2.19) | 1, 0 | c1 508/507, c2 180/79 |
| hive_smart_9009_priority_ot | 1 | 0 | 13:49 | dead 17:32 | 2 | 0.14 | 6 (1.62) | 1, 0 | c1 0/0, c2 346/145 |
| hive_smart_12012_priority_ot | 1 | 0 | 11:55 | dead 15:47 | 2 | 0.21 | 11 (2.85) | 1, 0 | c1 617/582, c2 251/184 |
| hive_smart_15015_priority_ot | 1 | 0 | 11:55 | dead 15:04 | 2 | 0.04 | 9 (2.86) | 1, 0 | c1 315/315, c2 106/5 |
| hive_smart_17017_priority_ot | 1 | 0 | 12:39 | dead 16:52 | 2 | 0.05 | 11 (2.61) | 1, 0 | c1 741/743, c2 526/351 |
| hive_smart_19019_priority_ot | 1 | 0 | 12:53 | dead 13:17 | 1 | 0 | 1 (-) | 0, 0 | c1 322/228 |
| hive_smart_22022_priority_ot | 1 | 0 | 11:25 | dead 16:16 | 2 | 0.02 | 10 (2.06) | 1, 0 | c1 544/544, c2 279/178 |
| hive_smart_24024_priority_ot | 1 | 0 | 12:02 | dead 16:15 | 2 | 0.27 | 7 (1.66) | 1, 0 | c1 933/934, c2 273/98 |
| hive_smart_25025_priority_ot | 1 | 0 | 13:58 | dead 18:21 | 2 | 0.3 | 10 (2.28) | 0, 1 | c1 793/843, c2 454/231 |
| hive_smart_29029_priority_ot | 1 | 0 | 12:47 | dead 17:06 | 2 | 0.31 | 6 (1.39) | 0, 1 | c1 409/409, c2 242/43 |
| hive_smart_30030_priority_ot | 1 | 0 | 13:53 | dead 17:58 | 2 | 0.12 | 8 (1.96) | 1, 0 | c1 12/37, c2 243/93 |
| hive_smart_4004_priority_t1_ot | 1 | 1 | 12:59 | dead 13:37 | 1 | 0 | 1 (-) | 0, 0 | c1 265/143 |
| hive_smart_5005_priority_t1_ot | 1 | 1 | 13:34 | dead 14:25 | 1 | 0 | 2 (-) | 0, 0 | c1 576/401 |
| hive_smart_7007_priority_t1_ot | 1 | 1 | 11:22 | dead 14:52 | 2 | 0.12 | 10 (2.87) | 1, 0 | c1 1166/1166, c2 267/167 |
| hive_smart_8008_priority_t1_ot | 1 | 1 | 11:06 | dead 18:23 | 3 | 0.37 | 15 (2.06) | 0, 2 | c1 516/517, c2 361/361, c3 217/42 |
| hive_smart_7007_priority_t3_ot | 1 | 3 | 12:53 | dead 18:17 | 2 | 0.05 | 16 (2.96) | 1, 0 | c1 468/469, c2 832/631 |
| hive_smart_32032_priority_ot | 2 | 0 | 12:20 | dead 15:43 | 2 | 0.08 | 6 (1.77) | 1, 0 | c1 374/363, c2 284/70 |
| hive_smart_39039_priority_ot | 2 | 0 | 12:40 | dead 19:31 | 3 | 0.24 | 14 (2.04) | 2, 0 | c1 1144/1144, c2 786/709, c3 239/92 |
| hive_smart_41041_priority_ot | 2 | 0 | 12:51 | dead 16:33 | 2 | 0.04 | 8 (2.16) | 1, 0 | c1 180/180, c2 321/96 |
| hive_smart_43043_priority_ot | 2 | 0 | 11:58 | dead 16:47 | 2 | 0.17 | 10 (2.08) | 1, 0 | c1 190/190, c2 455/355 |
| hive_smart_47047_priority_ot | 2 | 0 | 13:00 | dead 17:18 | 2 | 0.05 | 7 (1.62) | 1, 0 | c1 227/227, c2 271/146 |
| hive_smart_48048_priority_ot | 2 | 0 | 12:46 | dead 19:50 | 3 | 0.22 | 11 (1.56) | 2, 0 | c1 0/0, c2 789/706, c3 312/221 |
| hive_smart_52052_priority_ot | 2 | 0 | 13:43 | dead 18:48 | 2 | 0.06 | 8 (1.58) | 1, 0 | c1 48/48, c2 286/61 |
| hive_smart_57057_priority_ot | 2 | 0 | 12:14 | dead 16:58 | 2 | 0.02 | 10 (2.11) | 1, 0 | c1 676/676, c2 536/360 |
| hive_smart_58058_priority_ot | 2 | 0 | 10:45 | dead 16:06 | 2 | 0.14 | 12 (2.25) | 1, 0 | c1 388/392, c2 605/513 |
| hive_smart_59059_priority_ot | 2 | 0 | 11:18 | dead 13:52 | 1 | 0 | 6 (2.34) | 0, 0 | c1 483/308 |
| hive_smart_60060_priority_ot | 2 | 0 | 11:54 | dead 17:17 | 2 | 0.01 | 15 (2.79) | 1, 0 | c1 617/619, c2 852/676 |
| hive_smart_16016_priority_t1_ot | 2 | 1 | 13:24 | dead 18:49 | 2 | 0.25 | 8 (1.48) | 0, 1 | c1 117/117, c2 592/417 |
| hive_smart_13013_priority_t2_ot | 2 | 2 | 12:38 | dead 16:08 | 2 | 0.07 | 8 (2.28) | 1, 0 | c1 836/838, c2 278/178 |
| hive_smart_15015_priority_t2_ot | 2 | 2 | 11:15 | dead 11:33 | 1 | 0 | 0 (-) | 0, 0 | c1 181/89 |
| hive_smart_11011_priority_t3_ot | 2 | 3 | 13:32 | dead 20:13 | 3 | 0.35 | 12 (1.8) | 1, 1 | c1 359/358, c2 835/835, c3 181/32 |
| hive_smart_15015_priority_t3_ot | 2 | 3 | 11:37 | dead 15:39 | 2 | 0.17 | 11 (2.73) | 1, 0 | c1 613/613, c2 190/89 |
