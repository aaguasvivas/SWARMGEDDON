# OVERTIME report: /tmp/swg-ladder/holdout

Command: `node scripts/playtest/otreport.mjs /tmp/swg-ladder/holdout --md=docs/tuning/ladder-holdout-ot.md`

| Set | Dead by 20:00 | Alive past 24:00 |
|---|---|---|
| 3 | 18/18 (100%) | 0 |

- Death cycle: {"c2":8,"c1":5,"c3":5}; median time in OVERTIME 243.2 s; median caged share 0.1.
- Bonus drops in OVERTIME (per run with 120 s or more of it): median 1.94 a minute, max 2.55; busiest 120 s window 8 (median 4.5), busiest 180 s 9; runs over 3 a minute: none. The same runs from 2:00 to the win: median 2.06 a minute, max 3.23; busiest 120 s window 10 (median 6.5).
- OVERTIME beats: 103 fired (the latest 54.05 s late), 0 dropped.

| Run | Set | T | OVERTIME from | End | Cycle | Caged | Bonus drops (per min) | OT boss kills, retreats | Damage / healing per cycle |
|---|---|---|---|---|---|---|---|---|---|
| hive_smart_62062_priority_ot | 3 | 0 | 13:49 | dead 18:49 | 2 | 0.27 | 8 (1.6) | 0, 1 | c1 737/765, c2 688/464 |
| hive_smart_65065_priority_ot | 3 | 0 | 12:51 | dead 18:02 | 2 | 0.26 | 10 (1.93) | 0, 1 | c1 322/345, c2 333/209 |
| hive_smart_66066_priority_ot | 3 | 0 | 10:41 | dead 14:43 | 2 | 0.05 | 6 (1.49) | 1, 0 | c1 462/468, c2 380/206 |
| hive_smart_67067_priority_ot | 3 | 0 | 13:19 | dead 14:12 | 1 | 0 | 3 (-) | 0, 0 | c1 306/181 |
| hive_smart_68068_priority_ot | 3 | 0 | 12:29 | dead 19:39 | 3 | 0.14 | 14 (1.95) | 2, 0 | c1 447/427, c2 468/381, c3 184/116 |
| hive_smart_69069_priority_ot | 3 | 0 | 12:32 | dead 19:44 | 3 | 0.33 | 11 (1.53) | 1, 1 | c1 115/115, c2 0/0, c3 238/13 |
| hive_smart_72072_priority_ot | 3 | 0 | 12:22 | dead 15:49 | 2 | 0.03 | 8 (2.32) | 1, 0 | c1 1010/1011, c2 426/275 |
| hive_smart_88088_priority_ot | 3 | 0 | 12:19 | dead 19:53 | 3 | 0.24 | 12 (1.59) | 1, 1 | c1 0/0, c2 443/406, c3 267/129 |
| hive_smart_90090_priority_ot | 3 | 0 | 13:22 | dead 14:51 | 1 | 0 | 3 (-) | 0, 0 | c1 713/550 |
| hive_smart_21021_priority_t1_ot | 3 | 1 | 13:41 | dead 15:33 | 1 | 0 | 3 (-) | 0, 0 | c1 370/301 |
| hive_smart_26026_priority_t1_ot | 3 | 1 | 13:16 | dead 15:37 | 1 | 0 | 6 (2.55) | 0, 0 | c1 1655/1428 |
| hive_smart_29029_priority_t1_ot | 3 | 1 | 12:43 | dead 15:58 | 2 | 0.02 | 8 (2.46) | 1, 0 | c1 461/462, c2 187/12 |
| hive_smart_22022_priority_t2_ot | 3 | 2 | 10:59 | dead 17:05 | 3 | 0.19 | 14 (2.29) | 2, 0 | c1 623/603, c2 521/490, c3 237/115 |
| hive_smart_26026_priority_t2_ot | 3 | 2 | 11:18 | dead 15:50 | 2 | 0.29 | 7 (1.54) | 0, 1 | c1 503/444, c2 345/230 |
| hive_smart_29029_priority_t2_ot | 3 | 2 | 13:02 | dead 16:18 | 2 | 0.06 | 7 (2.15) | 1, 0 | c1 0/0, c2 229/54 |
| hive_smart_22022_priority_t3_ot | 3 | 3 | 11:12 | dead 18:19 | 3 | 0.36 | 15 (2.11) | 1, 1 | c1 331/331, c2 261/262, c3 102/2 |
| hive_smart_25025_priority_t3_ot | 3 | 3 | 13:24 | dead 17:29 | 2 | 0.3 | 6 (1.47) | 1, 0 | c1 1278/1159, c2 370/264 |
| hive_smart_29029_priority_t3_ot | 3 | 3 | 11:42 | dead 11:59 | 1 | 0 | 1 (-) | 0, 0 | c1 230/54 |
