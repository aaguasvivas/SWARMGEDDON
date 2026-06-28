# SWARMGEDDON leaderboard (Cloudflare Worker + D1)

A tiny, free global leaderboard: one Worker, one SQLite (D1) table. Regions are
derived automatically from Cloudflare's edge geo — no GPS or permissions.

## Endpoints

- `POST /api/score` — submit a run. Body: `{ name, mode, time, kills, level, seed }`.
  The score is **recomputed server-side** from the (capped) stats, so a forged
  `score` can't game the board. Returns `{ ok, score, rank }`.
- `GET /api/leaderboard?mode=endless|daily&board=alltime|daily&scope=global|region&limit=50`
  — returns `{ entries: [{ rank, name, score, time, kills, level, country }], region }`.
  For `scope=region` with no `region` param, the viewer's own continent is used.

## Deploy (one-time, ~5 min)

```bash
cd server
npm install
npx wrangler login                       # opens the browser, authorize your account

npx wrangler d1 create swarmgeddon        # prints a database_id
# → paste that id into wrangler.toml (database_id = "...")

npm run db:migrate                        # creates the table on the remote D1
npm run deploy                            # prints your Worker URL, e.g.
                                          #   https://swarmgeddon-leaderboard.<you>.workers.dev
```

## Point the game at it

Set the Worker URL as a build-time env var for the web app (repo root):

- **Local:** create `.env` with `VITE_LEADERBOARD_URL=https://swarmgeddon-leaderboard.<you>.workers.dev`
- **Cloudflare Pages:** Project → Settings → Environment variables → add
  `VITE_LEADERBOARD_URL` with the same value, then redeploy.

If the var is unset the game simply hides the leaderboard (no errors).

## Smoke test

```bash
curl -s "https://<your-worker-url>/api/leaderboard?mode=endless&board=alltime&scope=global" | jq
curl -s -X POST "https://<your-worker-url>/api/score" \
  -H 'content-type: application/json' \
  -d '{"name":"TEST","mode":"endless","time":120,"kills":80,"level":4}'
```

## Local dev (optional)

```bash
npm run db:migrate:local
npm run dev          # http://localhost:8787
```
