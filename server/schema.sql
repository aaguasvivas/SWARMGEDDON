-- SWARMGEDDON leaderboard (Cloudflare D1 / SQLite).
CREATE TABLE IF NOT EXISTS scores (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  mode      TEXT    NOT NULL,          -- 'endless' | 'daily'
  score     INTEGER NOT NULL,          -- recomputed server-side from the stats below
  time      INTEGER NOT NULL,          -- seconds survived
  kills     INTEGER NOT NULL,
  level     INTEGER NOT NULL,
  seed      INTEGER,
  country   TEXT,                      -- ISO-2, from request.cf.country
  continent TEXT,                      -- e.g. NA/EU/AS, from request.cf.continent
  day       TEXT    NOT NULL,          -- YYYY-MM-DD (UTC) the run was submitted
  ts        INTEGER NOT NULL,          -- epoch ms
  ip_hash   TEXT                       -- sha256(ip) for light rate limiting only
);

-- All-time global per mode.
CREATE INDEX IF NOT EXISTS idx_alltime ON scores (mode, score DESC);
-- Daily board.
CREATE INDEX IF NOT EXISTS idx_daily   ON scores (mode, day, score DESC);
-- Regional board.
CREATE INDEX IF NOT EXISTS idx_region  ON scores (mode, continent, score DESC);
-- Rate-limit lookups.
CREATE INDEX IF NOT EXISTS idx_ip      ON scores (ip_hash, ts);
