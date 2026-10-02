# OVERTIME report: /tmp/swg-ladder/control

Command: `node scripts/playtest/otreport.mjs /tmp/swg-ladder/control --md=docs/tuning/ladder-control-ot.md`

| Set | Dead by 20:00 | Alive past 24:00 |
|---|---|---|
| 1 | 12/19 (63%) | 4 |
| 2 | 5/16 (31%) | 5 |

- Death cycle: {"c2":9,"c3":10,"alive":8,"c4":2,"c1":5,"c5":1}; median time in OVERTIME 426.5 s; median caged share 0.14.
- Bonus drops in OVERTIME (per run with 120 s or more of it): median 2.21 a minute, max 3.66; busiest 120 s window 9 (median 6), busiest 180 s 13; runs over 3 a minute: hive_smart_1001_priority_ot.json 15 in 246.2 s; hive_smart_15015_priority_ot.json 11 in 194.6 s. The same runs from 2:00 to the win: median 2.06 a minute, max 3.12; busiest 120 s window 12 (median 7).
- OVERTIME beats: 305 fired (the latest 58.6 s late), 26 dropped: hive_smart_9009_priority_ot.json c3 event stampede due 1209.38 at 1269.42; hive_smart_9009_priority_ot.json c3 event mirror stampede due 1217.38 at 1281.42; hive_smart_9009_priority_ot.json c4 event stampede due 1389.38 at 1449.42; hive_smart_9009_priority_ot.json c4 event mirror stampede due 1397.38 at 1461.42; hive_smart_22022_priority_ot.json c4 event stampede due 1244.8 at 1304.85; hive_smart_22022_priority_ot.json c4 event mirror stampede due 1252.8 at 1316.85; hive_smart_25025_priority_ot.json c3 event stampede due 1218.38 at 1278.42; hive_smart_25025_priority_ot.json c3 event mirror stampede due 1226.38 at 1290.42; hive_smart_25025_priority_ot.json c4 event stampede due 1398.38 at 1458.42; hive_smart_25025_priority_ot.json c4 event mirror stampede due 1406.38 at 1470.42; hive_smart_7007_priority_t1_ot.json c3 event stampede due 1062.17 at 1122.2; hive_smart_7007_priority_t1_ot.json c3 event mirror stampede due 1070.17 at 1134.2; hive_smart_7007_priority_t1_ot.json c4 event stampede due 1242.17 at 1302.2; hive_smart_7007_priority_t1_ot.json c4 event mirror stampede due 1250.17 at 1314.2; hive_smart_7007_priority_t3_ot.json c3 event stampede due 1153.05 at 1213.1; hive_smart_48048_priority_ot.json c4 event stampede due 1325.85 at 1385.88; hive_smart_48048_priority_ot.json c4 event mirror stampede due 1333.85 at 1397.88; hive_smart_57057_priority_ot.json c4 event stampede due 1294.35 at 1354.38; hive_smart_57057_priority_ot.json c4 event mirror stampede due 1302.35 at 1366.38; hive_smart_16016_priority_t1_ot.json c2 event stampede due 1004.22 at 1064.27; hive_smart_16016_priority_t1_ot.json c2 event mirror stampede due 1012.22 at 1076.27; hive_smart_16016_priority_t1_ot.json c3 event stampede due 1184.22 at 1244.27; hive_smart_16016_priority_t1_ot.json c3 event mirror stampede due 1192.22 at 1256.27; hive_smart_16016_priority_t1_ot.json c4 event stampede due 1364.22 at 1424.27; hive_smart_16016_priority_t1_ot.json c4 event mirror stampede due 1372.22 at 1436.27; hive_smart_11011_priority_t2_ot.json c3 event stampede due 1177.12 at 1237.17.

| Run | Set | T | OVERTIME from | End | Cycle | Caged | Bonus drops (per min) | OT boss kills, retreats | Damage / healing per cycle |
|---|---|---|---|---|---|---|---|---|---|
| hive_smart_1001_priority_ot | 1 | 0 | 12:10 | dead 16:16 | 2 | 0.14 | 15 (3.66) | 1, 0 | c1 456/467, c2 123/23 |
| hive_smart_3003_priority_ot | 1 | 0 | 13:03 | dead 19:31 | 3 | 0.1 | 10 (1.55) | 2, 0 | c1 503/504, c2 104/104, c3 397/172 |
| hive_smart_5005_priority_ot | 1 | 0 | 13:09 | dead 19:15 | 3 | 0.09 | 10 (1.64) | 2, 0 | c1 45/45, c2 1486/1486, c3 261/61 |
| hive_smart_7007_priority_ot | 1 | 0 | 10:36 | dead 17:11 | 3 | 0.05 | 18 (2.73) | 2, 0 | c1 914/914, c2 857/858, c3 742/642 |
| hive_smart_9009_priority_ot | 1 | 0 | 13:49 | ALIVE 25:00 | 4 | 0.33 | 20 (1.79) | 1, 2 | c1 0/0, c2 303/303, c3 251/251, c4 883/877 |
| hive_smart_12012_priority_ot | 1 | 0 | 11:55 | dead 16:08 | 2 | 0.29 | 11 (2.61) | 1, 0 | c1 408/408, c2 244/144 |
| hive_smart_15015_priority_ot | 1 | 0 | 11:55 | dead 15:10 | 2 | 0.02 | 11 (3.39) | 1, 0 | c1 554/555, c2 299/198 |
| hive_smart_17017_priority_ot | 1 | 0 | 12:39 | dead 23:07 | 4 | 0.16 | 24 (2.29) | 3, 0 | c1 961/988, c2 1380/1380, c3 721/721, c4 1693/1468 |
| hive_smart_19019_priority_ot | 1 | 0 | 12:53 | dead 13:17 | 1 | 0 | 1 (-) | 0, 0 | c1 322/228 |
| hive_smart_22022_priority_ot | 1 | 0 | 11:25 | ALIVE 25:00 | 5 | 0.24 | 30 (2.21) | 3, 1 | c1 39/39, c2 68/68, c3 35/35, c4 586/586, c5 347/348 |
| hive_smart_24024_priority_ot | 1 | 0 | 12:02 | dead 16:21 | 2 | 0.26 | 8 (1.85) | 1, 0 | c1 1080/1080, c2 321/146 |
| hive_smart_25025_priority_ot | 1 | 0 | 13:58 | ALIVE 25:00 | 4 | 0.36 | 25 (2.27) | 1, 2 | c1 793/843, c2 562/566, c3 1357/1242, c4 1417/1449 |
| hive_smart_29029_priority_ot | 1 | 0 | 12:47 | dead 14:53 | 1 | 0 | 5 (2.37) | 0, 0 | c1 677/476 |
| hive_smart_30030_priority_ot | 1 | 0 | 13:53 | dead 21:23 | 3 | 0.29 | 14 (1.87) | 2, 0 | c1 415/440, c2 862/845, c3 2045/1837 |
| hive_smart_4004_priority_t1_ot | 1 | 1 | 12:59 | dead 17:56 | 2 | 0.06 | 12 (2.42) | 1, 0 | c1 481/500, c2 399/258 |
| hive_smart_5005_priority_t1_ot | 1 | 1 | 13:34 | dead 14:25 | 1 | 0 | 2 (-) | 0, 0 | c1 576/401 |
| hive_smart_7007_priority_t1_ot | 1 | 1 | 11:22 | dead 24:42 | 5 | 0.34 | 32 (2.4) | 2, 2 | c1 1230/1174, c2 1187/1229, c3 1485/1497, c4 1443/1442, c5 551/452 |
| hive_smart_8008_priority_t1_ot | 1 | 1 | 11:06 | dead 15:45 | 2 | 0.05 | 13 (2.8) | 1, 0 | c1 661/661, c2 538/339 |
| hive_smart_7007_priority_t3_ot | 1 | 3 | 12:53 | dead 20:23 | 3 | 0.36 | 17 (2.27) | 1, 1 | c1 398/422, c2 1191/1154, c3 488/351 |
| hive_smart_32032_priority_ot | 2 | 0 | 12:20 | dead 15:58 | 2 | 0.08 | 7 (1.93) | 1, 0 | c1 374/363, c2 516/300 |
| hive_smart_39039_priority_ot | 2 | 0 | 12:40 | dead 20:53 | 3 | 0.2 | 17 (2.07) | 2, 0 | c1 1106/1106, c2 900/901, c3 939/714 |
| hive_smart_41041_priority_ot | 2 | 0 | 12:51 | ALIVE 25:00 | 5 | 0.14 | 26 (2.14) | 3, 0 | c1 180/180, c2 1776/1776, c3 2158/2074, c4 2154/2236, c5 0/0 |
| hive_smart_43043_priority_ot | 2 | 0 | 11:58 | dead 22:44 | 4 | 0.22 | 24 (2.23) | 3, 0 | c1 204/204, c2 259/259, c3 302/302, c4 1073/972 |
| hive_smart_47047_priority_ot | 2 | 0 | 13:00 | dead 20:52 | 3 | 0.09 | 17 (2.16) | 2, 0 | c1 634/608, c2 441/466, c3 1730/1580 |
| hive_smart_48048_priority_ot | 2 | 0 | 12:46 | ALIVE 25:00 | 5 | 0.26 | 22 (1.8) | 2, 1 | c1 0/0, c2 5/5, c3 2100/2125, c4 2659/2658, c5 0/0 |
| hive_smart_52052_priority_ot | 2 | 0 | 13:43 | dead 20:50 | 3 | 0.2 | 13 (1.83) | 2, 0 | c1 93/93, c2 1023/903, c3 488/382 |
| hive_smart_57057_priority_ot | 2 | 0 | 12:14 | ALIVE 25:00 | 5 | 0.27 | 25 (1.96) | 2, 1 | c1 746/746, c2 334/359, c3 1086/1086, c4 891/892, c5 0/0 |
| hive_smart_58058_priority_ot | 2 | 0 | 10:45 | dead 15:19 | 2 | 0.1 | 11 (2.41) | 1, 0 | c1 388/392, c2 336/242 |
| hive_smart_59059_priority_ot | 2 | 0 | 11:18 | dead 11:57 | 1 | 0 | 1 (-) | 0, 0 | c1 209/34 |
| hive_smart_60060_priority_ot | 2 | 0 | 11:54 | ALIVE 25:00 | 5 | 0.13 | 30 (2.29) | 4, 0 | c1 798/800, c2 721/721, c3 1046/1046, c4 2018/2018, c5 938/890 |
| hive_smart_16016_priority_t1_ot | 2 | 1 | 13:24 | ALIVE 25:00 | 4 | 0.39 | 20 (1.72) | 0, 3 | c1 117/117, c2 77/64, c3 616/629, c4 508/501 |
| hive_smart_11011_priority_t2_ot | 2 | 2 | 13:17 | dead 20:38 | 3 | 0.33 | 14 (1.91) | 1, 1 | c1 468/467, c2 573/573, c3 217/117 |
| hive_smart_15015_priority_t2_ot | 2 | 2 | 11:43 | dead 12:56 | 1 | 0 | 2 (-) | 0, 0 | c1 362/295 |
| hive_smart_11011_priority_t3_ot | 2 | 3 | 13:32 | dead 20:47 | 3 | 0.19 | 15 (2.07) | 2, 0 | c1 418/417, c2 713/712, c3 343/192 |
| hive_smart_15015_priority_t3_ot | 2 | 3 | 11:37 | dead 16:17 | 2 | 0.11 | 13 (2.78) | 1, 0 | c1 613/613, c2 476/376 |
