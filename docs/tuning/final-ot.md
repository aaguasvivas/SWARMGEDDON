# OVERTIME report: /tmp/swg-final/runs

Command: `node scripts/playtest/otreport.mjs /tmp/swg-final/runs --md=docs/tuning/final-ot.md`

| Set | Dead by 20:00 | Alive past 24:00 |
|---|---|---|
| 1 | 18/18 (100%) | 0 |
| 2 | 14/17 (82%) | 0 |

- Death cycle: {"c2":26,"c3":6,"c1":2,"c4":1}; median time in OVERTIME 255.1 s; median caged share 0.12.
- Bonus drops in OVERTIME (per run with 120 s or more of it): median 2.13 a minute, max 2.82; busiest 120 s window 9 (median 6), busiest 180 s 9; runs over 3 a minute: none. The same runs from 2:00 to the win: median 2.11 a minute, max 2.7; busiest 120 s window 10 (median 7).
- OVERTIME beats: 207 fired (the latest 54.03 s late), 0 dropped.

| Run | Set | T | OVERTIME from | End | Cycle | Caged | Bonus drops (per min) | OT boss kills, retreats | Damage / healing per cycle |
|---|---|---|---|---|---|---|---|---|---|
| hive_smart_1001_priority_ot | 1 | 0 | 11:26 | dead 16:59 | 2 | 0.19 | 12 (2.16) | 1, 0 | c1 414/388, c2 544/422 |
| hive_smart_4004_priority_ot | 1 | 0 | 12:26 | dead 18:06 | 2 | 0.24 | 10 (1.77) | 0, 1 | c1 341/363, c2 614/390 |
| hive_smart_5005_priority_ot | 1 | 0 | 12:08 | dead 15:34 | 2 | 0.12 | 5 (1.45) | 1, 0 | c1 230/230, c2 366/140 |
| hive_smart_7007_priority_ot | 1 | 0 | 10:54 | dead 14:45 | 2 | 0.2 | 8 (2.08) | 1, 0 | c1 693/670, c2 220/118 |
| hive_smart_9009_priority_ot | 1 | 0 | 12:57 | dead 17:15 | 2 | 0.24 | 9 (2.09) | 1, 0 | c1 0/0, c2 320/95 |
| hive_smart_12012_priority_ot | 1 | 0 | 12:21 | dead 15:31 | 2 | 0.08 | 7 (2.22) | 1, 0 | c1 533/507, c2 136/62 |
| hive_smart_13013_priority_ot | 1 | 0 | 11:28 | dead 14:50 | 2 | 0.03 | 9 (2.68) | 1, 0 | c1 778/756, c2 191/115 |
| hive_smart_21021_priority_ot | 1 | 0 | 12:42 | dead 16:48 | 2 | 0.23 | 8 (1.95) | 1, 0 | c1 330/330, c2 181/81 |
| hive_smart_22022_priority_ot | 1 | 0 | 12:03 | dead 16:19 | 2 | 0.12 | 11 (2.58) | 1, 0 | c1 29/29, c2 232/107 |
| hive_smart_23023_priority_ot | 1 | 0 | 12:47 | dead 17:28 | 2 | 0.06 | 11 (2.34) | 1, 0 | c1 37/37, c2 493/393 |
| hive_smart_26026_priority_ot | 1 | 0 | 11:27 | dead 19:13 | 3 | 0.18 | 13 (1.67) | 1, 1 | c1 803/803, c2 1157/1087, c3 375/219 |
| hive_smart_29029_priority_ot | 1 | 0 | 12:25 | dead 17:03 | 2 | 0.03 | 11 (2.37) | 1, 0 | c1 32/32, c2 363/188 |
| hive_smart_30030_priority_ot | 1 | 0 | 12:24 | dead 15:55 | 2 | 0.12 | 6 (1.7) | 1, 0 | c1 0/0, c2 238/38 |
| hive_smart_1001_priority_t1_ot | 1 | 1 | 11:55 | dead 15:31 | 2 | 0.14 | 8 (2.22) | 1, 0 | c1 465/466, c2 237/86 |
| hive_smart_4004_priority_t1_ot | 1 | 1 | 12:12 | dead 17:13 | 2 | 0.12 | 11 (2.19) | 1, 0 | c1 621/615, c2 449/308 |
| hive_smart_7007_priority_t1_ot | 1 | 1 | 11:35 | dead 16:44 | 2 | 0.16 | 11 (2.13) | 1, 0 | c1 796/795, c2 602/502 |
| hive_smart_8008_priority_t1_ot | 1 | 1 | 12:50 | dead 17:05 | 2 | 0.11 | 9 (2.12) | 1, 0 | c1 499/520, c2 180/81 |
| hive_smart_7007_priority_t2_ot | 1 | 2 | 12:28 | dead 12:54 | 1 | 0 | 2 (-) | 0, 0 | c1 148/33 |
| hive_smart_31031_priority_ot | 2 | 0 | 12:00 | dead 18:17 | 3 | 0.06 | 11 (1.75) | 2, 0 | c1 326/299, c2 388/270, c3 88/8 |
| hive_smart_32032_priority_ot | 2 | 0 | 12:34 | dead 17:08 | 2 | 0.07 | 9 (1.97) | 1, 0 | c1 1132/1133, c2 406/205 |
| hive_smart_34034_priority_ot | 2 | 0 | 12:23 | dead 15:58 | 2 | 0.03 | 9 (2.51) | 1, 0 | c1 472/483, c2 201/100 |
| hive_smart_38038_priority_ot | 2 | 0 | 13:09 | dead 17:03 | 2 | 0.22 | 9 (2.31) | 1, 0 | c1 758/758, c2 272/72 |
| hive_smart_39039_priority_ot | 2 | 0 | 12:53 | dead 19:58 | 3 | 0.19 | 10 (1.41) | 2, 0 | c1 674/674, c2 849/824, c3 448/248 |
| hive_smart_43043_priority_ot | 2 | 0 | 12:57 | dead 23:05 | 4 | 0.21 | 18 (1.77) | 2, 1 | c1 35/35, c2 72/72, c3 269/264, c4 187/92 |
| hive_smart_48048_priority_ot | 2 | 0 | 12:57 | dead 20:07 | 3 | 0.22 | 13 (1.81) | 1, 1 | c1 0/0, c2 266/266, c3 216/116 |
| hive_smart_49049_priority_ot | 2 | 0 | 12:12 | dead 15:24 | 2 | 0.12 | 9 (2.82) | 1, 0 | c1 385/410, c2 107/6 |
| hive_smart_52052_priority_ot | 2 | 0 | 12:37 | dead 16:34 | 2 | 0.2 | 6 (1.52) | 1, 0 | c1 281/281, c2 291/66 |
| hive_smart_55055_priority_ot | 2 | 0 | 13:26 | dead 19:47 | 3 | 0.18 | 11 (1.73) | 2, 0 | c1 2/2, c2 27/27, c3 203/3 |
| hive_smart_57057_priority_ot | 2 | 0 | 13:13 | dead 20:38 | 3 | 0.09 | 16 (2.16) | 2, 0 | c1 474/474, c2 357/349, c3 315/95 |
| hive_smart_58058_priority_ot | 2 | 0 | 11:41 | dead 15:52 | 2 | 0.32 | 7 (1.67) | 0, 1 | c1 478/478, c2 221/121 |
| hive_smart_59059_priority_ot | 2 | 0 | 11:29 | dead 12:51 | 1 | 0 | 4 (-) | 0, 0 | c1 351/208 |
| hive_smart_60060_priority_ot | 2 | 0 | 12:07 | dead 15:46 | 2 | 0.15 | 10 (2.75) | 1, 0 | c1 888/889, c2 480/255 |
| hive_smart_13013_priority_t1_ot | 2 | 1 | 12:35 | dead 15:54 | 2 | 0.1 | 9 (2.71) | 1, 0 | c1 508/512, c2 102/1 |
| hive_smart_12012_priority_t3_ot | 2 | 3 | 13:24 | dead 17:05 | 2 | 0.16 | 9 (2.44) | 1, 0 | c1 1163/1142, c2 279/202 |
| hive_smart_15015_priority_t3_ot | 2 | 3 | 12:37 | dead 16:58 | 2 | 0.09 | 10 (2.3) | 1, 0 | c1 459/453, c2 319/231 |
