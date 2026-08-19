PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS lookups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip  TEXT NOT NULL,
  iso TEXT,
  ts  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lookups_ts ON lookups(ts DESC);
CREATE INDEX IF NOT EXISTS idx_lookups_iso ON lookups(iso);
CREATE INDEX IF NOT EXISTS idx_lookups_ip ON lookups(ip);
