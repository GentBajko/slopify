-- The collector's database. Aggregates are sums over deduplicated events;
-- the event rows are kept so a lost aggregate can be recomputed from them.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);

-- The rate limit counts a machine's recent rows, so it reads this index rather than the
-- table.
CREATE INDEX IF NOT EXISTS events_machine ON events (machine_id, received_at);

CREATE TABLE IF NOT EXISTS aggregates (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
