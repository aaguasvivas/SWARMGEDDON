-- SWARMGEDDON leaderboard v2 (Cloudflare D1 / SQLite), section 8.4.
-- The v1 `scores` table is dropped: v1 scores used another formula and have
-- no v2 fields. On the live database this is an owner step (server/README.md).
DROP TABLE IF EXISTS scores;

CREATE TABLE IF NOT EXISTS runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  v          INTEGER NOT NULL,          -- SIM_VERSION of the client
  board      TEXT    NOT NULL,          -- 'endless' (Standard) | 'daily'
  world      TEXT    NOT NULL,
  pilot      TEXT    NOT NULL,
  paint      TEXT    NOT NULL,
  threat     INTEGER NOT NULL,
  player_id  TEXT    NOT NULL,          -- random install id (lb:id); never returned
  name       TEXT    NOT NULL,          -- sanitized, blocklist-checked
  score      INTEGER NOT NULL,          -- recomputed here with scoreOf
  time_ms    INTEGER NOT NULL,
  kills      INTEGER NOT NULL,
  level      INTEGER NOT NULL,
  xp_sum     INTEGER NOT NULL,
  kill_pts   INTEGER NOT NULL,          -- clamped to 80 x xp_sum
  bosses     INTEGER NOT NULL,
  best_chain INTEGER NOT NULL,
  hits       INTEGER NOT NULL,
  cleared    INTEGER NOT NULL,          -- 0 | 1
  clear_ms   INTEGER NOT NULL,
  seed       INTEGER NOT NULL,
  day        TEXT    NOT NULL,          -- YYYY-MM-DD UTC (the Daily's own day)
  week       TEXT    NOT NULL,          -- ISO week of the post, 2026-W40
  country    TEXT,                      -- ISO-2 from request.cf.country
  client     TEXT    NOT NULL,          -- web | ios | android | other
  ts         INTEGER NOT NULL,          -- epoch ms
  ip_hash    TEXT    NOT NULL           -- HMAC(IP_SALT, ip|day), 16 hex; never returned
);

CREATE INDEX IF NOT EXISTS runs_week   ON runs (board, world, week, score DESC);
CREATE INDEX IF NOT EXISTS runs_all    ON runs (board, world, score DESC);
CREATE INDEX IF NOT EXISTS runs_day    ON runs (board, day, score DESC);
CREATE INDEX IF NOT EXISTS runs_ip     ON runs (ip_hash, ts);
CREATE INDEX IF NOT EXISTS runs_player ON runs (player_id, ts);
CREATE UNIQUE INDEX IF NOT EXISTS runs_daily_once ON runs (player_id, day) WHERE board = 'daily';
