-- One row per backup archive imported (Settings → Backup & storage). A backup carries its own
-- id, so importing the same file twice adds its usage history once.
CREATE TABLE backup_imports (
  backup_id TEXT PRIMARY KEY,
  imported_at TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json))
);
