# OVERTIME report: /tmp/swg-co/final

Command: `node scripts/playtest/otreport.mjs /tmp/swg-co/final --md=docs/tuning/final-ot.md`

| World and set | Dead within 7:00 of the OVERTIME start (A13, re-scored in the P19 closeout) | Alive past 24:00 | Dead by 20:00 (old measure) |
|---|---|---|---|
| hive 1 | 18/19 (95%) | 0 | 18/19 (95%) |
| hive 2 | 25/25 (100%) | 0 | 23/25 (92%) |
| depths 1 | 11/11 (100%) | 0 | 11/11 (100%) |
| depths 2 | 13/14 (93%) | 0 | 14/14 (100%) |
| wastes 1 | 11/13 (85%) | 0 | 11/13 (85%) |
| wastes 2 | 12/12 (100%) | 0 | 10/12 (83%) |

- A13 window: 7:00 from the OVERTIME start (decided after the closeout; the closeout scored 6:00, which gave 16/19, 22/25, 10/11, 12/14, 10/13 and 10/12). The cells above were re-scored in the commit `v2 P19: closeout fixes` from each run's OVERTIME start and end (the table below and `final.json`), because the raw runs are deleted. The four runs over 7:00 die 7:04 to 7:46 into OVERTIME, early in cycle 3: hive_smart_human_9009_priority_t1_ot, depths_smart_human_31031_priority_ot, wastes_smart_human_9009_priority_ot and wastes_smart_human_30030_priority_ot.
- Death cycle: {"hive c3":6,"hive c2":26,"hive c1":12,"depths c2":18,"depths c1":4,"depths c3":3,"wastes c1":3,"wastes c2":17,"wastes c3":5}; median time in OVERTIME 242.7 s; median caged share 0.1.
- Bonus drops in OVERTIME (per run with 120 s or more of it): median 1.9 a minute, max 3.24; busiest 120 s window 10 (median 5), busiest 180 s 11; runs over 3 a minute: hive_smart_human_20020_priority_ot.json 12 in 221.9 s. The same runs from 2:00 to the win: median 2.01 a minute, max 2.8; busiest 120 s window 10 (median 6).
- OVERTIME beats: 472 fired (the latest 54.05 s late), 0 dropped.

| Run | Set | T | OVERTIME from | End | Cycle | Caged | Bonus drops (per min) | OT boss kills, retreats | Damage / healing per cycle |
|---|---|---|---|---|---|---|---|---|---|
| hive_smart_human_3003_priority_ot | 1 | 0 | 12:24 | dead 19:06 | 3 | 0.1 | 10 (1.49) | 2, 0 | c1 81/81, c2 391/246, c3 139/58 |
| hive_smart_human_4004_priority_ot | 1 | 0 | 12:57 | dead 18:33 | 2 | 0.14 | 10 (1.79) | 1, 0 | c1 519/544, c2 612/387 |
| hive_smart_human_5005_priority_ot | 1 | 0 | 12:41 | dead 17:20 | 2 | 0.18 | 7 (1.51) | 1, 0 | c1 569/569, c2 482/257 |
| hive_smart_human_7007_priority_ot | 1 | 0 | 11:06 | dead 13:19 | 1 | 0 | 5 (2.24) | 0, 0 | c1 593/492 |
| hive_smart_human_13013_priority_ot | 1 | 0 | 12:33 | dead 16:53 | 2 | 0.16 | 10 (2.31) | 1, 0 | c1 503/493, c2 162/72 |
| hive_smart_human_15015_priority_ot | 1 | 0 | 11:28 | dead 15:53 | 2 | 0.25 | 9 (2.04) | 1, 0 | c1 409/335, c2 281/259 |
| hive_smart_human_20020_priority_ot | 1 | 0 | 13:18 | dead 17:00 | 2 | 0.05 | 12 (3.24) | 1, 0 | c1 169/151, c2 255/108 |
| hive_smart_human_21021_priority_ot | 1 | 0 | 12:01 | dead 13:29 | 1 | 0 | 2 (-) | 0, 0 | c1 306/205 |
| hive_smart_human_22022_priority_ot | 1 | 0 | 11:57 | dead 12:35 | 1 | 0 | 2 (-) | 0, 0 | c1 475/375 |
| hive_smart_human_23023_priority_ot | 1 | 0 | 12:06 | dead 17:31 | 2 | 0.2 | 9 (1.66) | 1, 0 | c1 180/180, c2 289/189 |
| hive_smart_human_29029_priority_ot | 1 | 0 | 12:18 | dead 15:59 | 2 | 0.17 | 8 (2.18) | 1, 0 | c1 218/218, c2 221/45 |
| hive_smart_human_30030_priority_ot | 1 | 0 | 13:19 | dead 17:29 | 2 | 0.08 | 8 (1.92) | 1, 0 | c1 660/660, c2 545/320 |
| hive_smart_human_2002_priority_t1_ot | 1 | 1 | 13:59 | dead 17:43 | 2 | 0.09 | 7 (1.87) | 1, 0 | c1 980/912, c2 366/238 |
| hive_smart_human_3003_priority_t1_ot | 1 | 1 | 13:53 | dead 14:32 | 1 | 0 | 1 (-) | 0, 0 | c1 323/155 |
| hive_smart_human_5005_priority_t1_ot | 1 | 1 | 11:33 | dead 18:09 | 3 | 0.13 | 11 (1.67) | 2, 0 | c1 443/442, c2 163/117, c3 375/195 |
| hive_smart_human_9009_priority_t1_ot | 1 | 1 | 13:44 | dead 20:53 | 3 | 0.3 | 12 (1.68) | 1, 1 | c1 0/0, c2 615/615, c3 210/10 |
| hive_smart_human_8008_priority_t2_ot | 1 | 2 | 12:42 | dead 14:57 | 1 | 0 | 6 (2.66) | 0, 0 | c1 530/412 |
| hive_smart_human_4004_priority_t3_ot | 1 | 3 | 13:17 | dead 17:32 | 2 | 0.05 | 11 (2.59) | 1, 0 | c1 898/939, c2 334/158 |
| hive_smart_human_8008_priority_t3_ot | 1 | 3 | 13:50 | dead 15:49 | 1 | 0 | 6 (-) | 0, 0 | c1 466/365 |
| hive_smart_human_31031_priority_ot | 2 | 0 | 12:56 | dead 17:22 | 2 | 0.07 | 8 (1.8) | 1, 0 | c1 308/290, c2 718/517 |
| hive_smart_human_32032_priority_ot | 2 | 0 | 13:36 | dead 17:36 | 2 | 0.15 | 10 (2.5) | 1, 0 | c1 360/360, c2 384/184 |
| hive_smart_human_35035_priority_ot | 2 | 0 | 12:53 | dead 16:12 | 2 | 0.02 | 6 (1.81) | 1, 0 | c1 694/695, c2 165/40 |
| hive_smart_human_36036_priority_ot | 2 | 0 | 13:33 | dead 17:31 | 2 | 0.03 | 8 (2.02) | 1, 0 | c1 918/917, c2 617/416 |
| hive_smart_human_38038_priority_ot | 2 | 0 | 13:12 | dead 17:54 | 2 | 0.15 | 8 (1.7) | 1, 0 | c1 308/318, c2 382/207 |
| hive_smart_human_40040_priority_ot | 2 | 0 | 13:55 | dead 16:01 | 1 | 0 | 4 (1.91) | 0, 0 | c1 774/658 |
| hive_smart_human_41041_priority_ot | 2 | 0 | 12:09 | dead 18:32 | 3 | 0.11 | 13 (2.03) | 2, 0 | c1 165/164, c2 728/727, c3 229/29 |
| hive_smart_human_43043_priority_ot | 2 | 0 | 13:42 | dead 20:28 | 3 | 0.22 | 11 (1.62) | 2, 0 | c1 401/401, c2 280/280, c3 203/53 |
| hive_smart_human_44044_priority_ot | 2 | 0 | 13:10 | dead 18:05 | 2 | 0.27 | 10 (2.04) | 0, 1 | c1 924/924, c2 462/361 |
| hive_smart_human_47047_priority_ot | 2 | 0 | 13:12 | dead 16:33 | 2 | 0.03 | 7 (2.09) | 1, 0 | c1 581/568, c2 164/78 |
| hive_smart_human_48048_priority_ot | 2 | 0 | 12:49 | dead 18:25 | 2 | 0.03 | 13 (2.32) | 1, 0 | c1 0/0, c2 618/518 |
| hive_smart_human_49049_priority_ot | 2 | 0 | 11:14 | dead 13:22 | 1 | 0 | 4 (1.87) | 0, 0 | c1 463/377 |
| hive_smart_human_50050_priority_ot | 2 | 0 | 13:32 | dead 16:02 | 1 | 0 | 4 (1.6) | 0, 0 | c1 842/693 |
| hive_smart_human_56056_priority_ot | 2 | 0 | 13:11 | dead 17:25 | 2 | 0.14 | 10 (2.37) | 1, 0 | c1 650/650, c2 230/104 |
| hive_smart_human_57057_priority_ot | 2 | 0 | 11:49 | dead 15:40 | 2 | 0.14 | 11 (2.86) | 1, 0 | c1 746/746, c2 291/91 |
| hive_smart_human_58058_priority_ot | 2 | 0 | 10:42 | dead 13:59 | 2 | 0.03 | 7 (2.14) | 1, 0 | c1 751/751, c2 183/82 |
| hive_smart_human_60060_priority_ot | 2 | 0 | 12:35 | dead 16:44 | 2 | 0.01 | 11 (2.65) | 1, 0 | c1 233/234, c2 504/354 |
| hive_smart_human_11011_priority_t1_ot | 2 | 1 | 12:19 | dead 17:18 | 2 | 0.19 | 10 (2) | 1, 0 | c1 803/804, c2 483/382 |
| hive_smart_human_12012_priority_t1_ot | 2 | 1 | 11:37 | dead 12:10 | 1 | 0 | 1 (-) | 0, 0 | c1 193/96 |
| hive_smart_human_15015_priority_t1_ot | 2 | 1 | 11:06 | dead 16:18 | 2 | 0.01 | 15 (2.89) | 1, 0 | c1 532/548, c2 403/302 |
| hive_smart_human_19019_priority_t1_ot | 2 | 1 | 13:44 | dead 20:33 | 3 | 0.3 | 10 (1.47) | 2, 0 | c1 701/701, c2 211/114, c3 137/109 |
| hive_smart_human_20020_priority_t1_ot | 2 | 1 | 13:36 | dead 16:51 | 2 | 0.09 | 8 (2.46) | 1, 0 | c1 732/732, c2 129/29 |
| hive_smart_human_11011_priority_t2_ot | 2 | 2 | 13:20 | dead 13:37 | 1 | 0 | 2 (-) | 0, 0 | c1 146/51 |
| hive_smart_human_17017_priority_t2_ot | 2 | 2 | 13:45 | dead 14:38 | 1 | 0 | 3 (-) | 0, 0 | c1 783/559 |
| hive_smart_human_11011_priority_t3_ot | 2 | 3 | 13:47 | dead 18:03 | 2 | 0.29 | 9 (2.11) | 1, 0 | c1 467/494, c2 178/77 |
| depths_smart_human_6006_priority_ot | 1 | 0 | 13:05 | dead 17:25 | 2 | 0.3 | 8 (1.85) | 1, 0 | c1 125/125, c2 153/53 |
| depths_smart_human_7007_priority_ot | 1 | 0 | 11:08 | dead 14:36 | 2 | 0.14 | 8 (2.3) | 1, 0 | c1 513/513, c2 157/58 |
| depths_smart_human_8008_priority_ot | 1 | 0 | 11:14 | dead 15:57 | 2 | 0.08 | 8 (1.7) | 1, 0 | c1 1070/1063, c2 514/323 |
| depths_smart_human_11011_priority_ot | 1 | 0 | 13:41 | dead 16:51 | 2 | 0.1 | 6 (1.9) | 1, 0 | c1 553/553, c2 159/34 |
| depths_smart_human_16016_priority_ot | 1 | 0 | 13:17 | dead 17:18 | 2 | 0.05 | 7 (1.75) | 1, 0 | c1 0/0, c2 355/180 |
| depths_smart_human_19019_priority_ot | 1 | 0 | 13:13 | dead 17:11 | 2 | 0.22 | 7 (1.76) | 1, 0 | c1 1186/1293, c2 308/133 |
| depths_smart_human_21021_priority_ot | 1 | 0 | 11:52 | dead 12:42 | 1 | 0 | 2 (-) | 0, 0 | c1 225/113 |
| depths_smart_human_23023_priority_ot | 1 | 0 | 11:49 | dead 18:26 | 3 | 0.21 | 15 (2.26) | 2, 0 | c1 2/2, c2 146/146, c3 164/39 |
| depths_smart_human_25025_priority_ot | 1 | 0 | 13:15 | dead 13:34 | 1 | 0 | 1 (-) | 0, 0 | c1 456/366 |
| depths_smart_human_27027_priority_ot | 1 | 0 | 11:49 | dead 16:30 | 2 | 0.07 | 8 (1.71) | 1, 0 | c1 744/603, c2 406/322 |
| depths_smart_human_30030_priority_ot | 1 | 0 | 13:53 | dead 17:13 | 2 | 0.1 | 8 (2.4) | 1, 0 | c1 0/0, c2 241/41 |
| depths_smart_human_31031_priority_ot | 2 | 0 | 11:41 | dead 19:27 | 3 | 0.25 | 13 (1.67) | 2, 0 | c1 517/529, c2 707/632, c3 299/151 |
| depths_smart_human_35035_priority_ot | 2 | 0 | 11:09 | dead 14:26 | 2 | 0.08 | 7 (2.13) | 1, 0 | c1 361/360, c2 191/41 |
| depths_smart_human_36036_priority_ot | 2 | 0 | 12:48 | dead 14:24 | 1 | 0 | 5 (-) | 0, 0 | c1 1155/950 |
| depths_smart_human_38038_priority_ot | 2 | 0 | 12:53 | dead 16:17 | 2 | 0.11 | 7 (2.06) | 1, 0 | c1 1235/1212, c2 319/116 |
| depths_smart_human_39039_priority_ot | 2 | 0 | 12:34 | dead 17:41 | 2 | 0.04 | 8 (1.56) | 1, 0 | c1 498/517, c2 828/603 |
| depths_smart_human_41041_priority_ot | 2 | 0 | 12:29 | dead 16:01 | 2 | 0.04 | 6 (1.7) | 1, 0 | c1 90/90, c2 215/66 |
| depths_smart_human_43043_priority_ot | 2 | 0 | 12:28 | dead 16:17 | 2 | 0.21 | 9 (2.36) | 1, 0 | c1 463/463, c2 111/11 |
| depths_smart_human_44044_priority_ot | 2 | 0 | 13:03 | dead 16:19 | 2 | 0.13 | 6 (1.84) | 1, 0 | c1 1307/1308, c2 222/72 |
| depths_smart_human_45045_priority_ot | 2 | 0 | 11:42 | dead 15:36 | 2 | 0.26 | 11 (2.81) | 1, 0 | c1 294/294, c2 111/11 |
| depths_smart_human_48048_priority_ot | 2 | 0 | 12:55 | dead 19:04 | 3 | 0.05 | 12 (1.95) | 2, 0 | c1 0/0, c2 227/227, c3 164/15 |
| depths_smart_human_54054_priority_ot | 2 | 0 | 12:23 | dead 15:47 | 2 | 0.16 | 9 (2.64) | 1, 0 | c1 821/714, c2 310/217 |
| depths_smart_human_55055_priority_ot | 2 | 0 | 10:47 | dead 14:19 | 2 | 0.12 | 6 (1.7) | 1, 0 | c1 86/86, c2 275/50 |
| depths_smart_human_58058_priority_ot | 2 | 0 | 11:16 | dead 13:30 | 1 | 0 | 5 (2.23) | 0, 0 | c1 466/365 |
| depths_smart_human_60060_priority_ot | 2 | 0 | 12:05 | dead 15:36 | 2 | 0.24 | 10 (2.85) | 0, 0 | c1 682/714, c2 195/21 |
| wastes_smart_human_1001_priority_ot | 1 | 0 | 12:21 | dead 14:08 | 1 | 0 | 3 (-) | 0, 0 | c1 352/261 |
| wastes_smart_human_5005_priority_ot | 1 | 0 | 13:12 | dead 17:35 | 2 | 0.3 | 7 (1.6) | 0, 1 | c1 132/132, c2 381/157 |
| wastes_smart_human_7007_priority_ot | 1 | 0 | 11:23 | dead 15:11 | 2 | 0.15 | 8 (2.11) | 1, 0 | c1 342/361, c2 258/108 |
| wastes_smart_human_9009_priority_ot | 1 | 0 | 13:16 | dead 20:20 | 3 | 0.32 | 10 (1.42) | 1, 1 | c1 0/0, c2 392/346, c3 277/97 |
| wastes_smart_human_11011_priority_ot | 1 | 0 | 12:19 | dead 17:27 | 2 | 0.02 | 9 (1.75) | 1, 0 | c1 1117/1099, c2 663/532 |
| wastes_smart_human_15015_priority_ot | 1 | 0 | 10:48 | dead 12:06 | 1 | 0 | 1 (-) | 0, 0 | c1 302/209 |
| wastes_smart_human_20020_priority_ot | 1 | 0 | 13:18 | dead 16:44 | 2 | 0.1 | 7 (2.04) | 1, 0 | c1 475/310, c2 180/119 |
| wastes_smart_human_21021_priority_ot | 1 | 0 | 12:49 | dead 17:02 | 2 | 0.32 | 8 (1.9) | 0, 1 | c1 441/440, c2 207/108 |
| wastes_smart_human_23023_priority_ot | 1 | 0 | 11:36 | dead 16:33 | 2 | 0.03 | 10 (2.01) | 1, 0 | c1 63/63, c2 330/206 |
| wastes_smart_human_24024_priority_ot | 1 | 0 | 12:33 | dead 16:44 | 2 | 0.32 | 8 (1.91) | 0, 1 | c1 804/803, c2 221/97 |
| wastes_smart_human_27027_priority_ot | 1 | 0 | 11:21 | dead 17:38 | 3 | 0.13 | 11 (1.75) | 2, 0 | c1 306/277, c2 454/408, c3 166/34 |
| wastes_smart_human_29029_priority_ot | 1 | 0 | 11:59 | dead 16:07 | 2 | 0.15 | 6 (1.45) | 1, 0 | c1 479/479, c2 214/64 |
| wastes_smart_human_30030_priority_ot | 1 | 0 | 13:20 | dead 20:29 | 3 | 0.31 | 10 (1.4) | 1, 1 | c1 12/12, c2 160/160, c3 198/23 |
| wastes_smart_human_32032_priority_ot | 2 | 0 | 12:30 | dead 16:33 | 2 | 0.03 | 9 (2.22) | 1, 0 | c1 835/814, c2 361/157 |
| wastes_smart_human_33033_priority_ot | 2 | 0 | 13:46 | dead 18:23 | 2 | 0.29 | 7 (1.52) | 0, 1 | c1 699/709, c2 719/497 |
| wastes_smart_human_34034_priority_ot | 2 | 0 | 11:22 | dead 15:37 | 2 | 0.1 | 6 (1.41) | 1, 0 | c1 422/411, c2 189/115 |
| wastes_smart_human_39039_priority_ot | 2 | 0 | 14:01 | dead 20:45 | 3 | 0.34 | 11 (1.63) | 1, 1 | c1 772/772, c2 581/506, c3 171/23 |
| wastes_smart_human_41041_priority_ot | 2 | 0 | 11:55 | dead 16:12 | 2 | 0.31 | 8 (1.87) | 0, 1 | c1 155/155, c2 249/99 |
| wastes_smart_human_43043_priority_ot | 2 | 0 | 12:37 | dead 17:02 | 2 | 0.3 | 7 (1.59) | 0, 1 | c1 589/589, c2 354/254 |
| wastes_smart_human_44044_priority_ot | 2 | 0 | 14:01 | dead 18:28 | 2 | 0.13 | 8 (1.8) | 1, 0 | c1 534/534, c2 579/479 |
| wastes_smart_human_48048_priority_ot | 2 | 0 | 13:52 | dead 20:07 | 3 | 0.22 | 9 (1.44) | 2, 0 | c1 179/179, c2 558/518, c3 157/72 |
| wastes_smart_human_54054_priority_ot | 2 | 0 | 12:13 | dead 15:47 | 2 | 0.09 | 5 (1.41) | 1, 0 | c1 535/533, c2 271/46 |
| wastes_smart_human_57057_priority_ot | 2 | 0 | 13:06 | dead 17:11 | 2 | 0.17 | 7 (1.71) | 1, 0 | c1 151/152, c2 161/11 |
| wastes_smart_human_59059_priority_ot | 2 | 0 | 11:08 | dead 12:14 | 1 | 0 | 3 (-) | 0, 0 | c1 256/148 |
| wastes_smart_human_60060_priority_ot | 2 | 0 | 11:31 | dead 15:33 | 2 | 0.05 | 7 (1.73) | 1, 0 | c1 414/415, c2 372/223 |
