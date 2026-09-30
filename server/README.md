# SWARMGEDDON leaderboard v2 (Cloudflare Worker + D1)

One Worker and one D1 table (`runs`). The spec is docs/NEXT-LEVEL.md section 8.4.
The worker imports the game's own `src/core/rules.ts` for the Daily spec, the score
formula and the plausibility bounds, so deploy it from the same commit as the clients.

## Endpoints

- `POST /api/v2/run`: post a run. The server recomputes the score with `scoreOf`,
  checks the plausibility bounds (`implausible`), checks a Daily against
  `dailySpec(day)` (today or yesterday UTC, once per install id), and applies the
  insert guards (8 posts per 10 minutes per IP hash, 40 per 24 hours per install
  id, 3 Daily rows per IP hash per day). Answers:
  - 200 `{ ok, score, name, renamed, ranks }`: `ranks.day` for a Daily,
    `ranks.week` and `ranks.all` for a Standard run, each `{ rank, of }`.
  - 400 bad input, wrong day or not the Daily's seed, world, pilot or threat;
    409 that Daily is already posted; 422 implausible; 426 old `v`;
    429 over a limit; 503 `IP_SALT` is not set.
- `GET /api/v2/board?board=daily|endless&world=&period=week|all&day=&limit=&player=`:
  one row per player (their best), `{ rows, total, me }`. `me` is the install id's
  own `{ rank, of, pct, score }`, also outside the top rows.
- `DELETE /api/v2/player/<id>`: removes every row of that install id.
- `/api/score` and `/api/leaderboard` (v1): 410.

No response carries `player_id` or `ip_hash`. `ip_hash` is the first 16 hex
characters of `HMAC-SHA256(IP_SALT, ip + '|' + day)`, so it changes every day.

## Owner steps for the v2 deploy (not done by the build lanes)

Do these in the release that ships the v2 clients. Until then the live worker has
only the v1 routes, and v2 clients show `The leaderboard is offline.` and post nothing.

1. Review `src/blocklist.ts` (names that post as `PILOT` plus 4 characters of the id).
2. Set `DAILY_EPOCH` in `src/core/rules.ts` to the release day (UTC); it is Daily #1.
3. Set the salt. Wrangler prompts for the value; use a long random string and keep it
   nowhere else:
   ```bash
   cd server
   npx wrangler secret put IP_SALT
   ```
4. Replace the table. **This drops the live v1 `scores` table** (v1 scores use the
   old formula and have no v2 fields). To keep a copy first:
   `npx wrangler d1 export swarmgeddon --remote --output scores-v1.sql`.
   ```bash
   npm run db:migrate
   ```
5. `npm run deploy`, then check: `curl -s "https://swarmgeddon-leaderboard.adelsonaguasvivas.workers.dev/api/v2/board?board=daily"`
   returns `{"rows":[],"total":0,"me":null}`.

## Local testing (local D1 only)

```bash
cd server
npm run db:migrate:test      # schema into a local D1 under .wrangler/test
npm run dev:test             # http://127.0.0.1:8788, IP_SALT local-only, dev routes on
# in the repo root:
LB_URL=http://127.0.0.1:8788 LB_PERSIST=server/.wrangler/test node scripts/attack.mjs
LB_URL=http://127.0.0.1:8788 node scripts/test-rules.mjs
```

- `scripts/attack.mjs`: every A-LB case plus the clear bounds (27 cases).
- `scripts/test-rules.mjs`: the clear bounds against the world scripts and
  `config.ts`, and `dailySpec` parity with the worker over 400 dates. The worker's
  `GET /api/v2/dev/daily` exists only when `DEV_ROUTES` is `1` (`dev:test` sets it).
- `scripts/probe-lb.mjs`: the game client against the local worker (see its header).
- A local worker takes `cf-connecting-ip` from the request, so the attack suite gives
  each case its own IP. In production Cloudflare sets that header.
