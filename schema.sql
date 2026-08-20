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

CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  iso TEXT,
  ts INTEGER NOT NULL,
  lookup_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT,
  outcome TEXT NOT NULL,
  partial INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_events_ts ON activity_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(lookup_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_channel ON activity_events(channel);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor ON activity_events(actor);
CREATE INDEX IF NOT EXISTS idx_activity_events_ip ON activity_events(ip);

CREATE TABLE IF NOT EXISTS resource_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  cpu_percent REAL,
  memory_used_bytes INTEGER,
  memory_limit_bytes INTEGER,
  data_used_bytes INTEGER,
  database_bytes INTEGER,
  wal_bytes INTEGER,
  shm_bytes INTEGER,
  other_data_bytes INTEGER,
  lookup_rows INTEGER,
  activity_rows INTEGER,
  uptime_seconds INTEGER,
  local_ts TEXT,
  image_size_bytes INTEGER
);

CREATE INDEX IF NOT EXISTS idx_resource_samples_ts ON resource_samples(ts DESC);
