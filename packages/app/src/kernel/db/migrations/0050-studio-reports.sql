-- Studio's Advanced-mode export, one per channel (3.6.0): the table's columns and rows (one
-- per video, every metric the person chose in Studio) and each video's daily figures for the
-- chart's metric, as the last imported zip held them. A new import replaces the old one.
CREATE TABLE studio_reports (
  channel_id TEXT PRIMARY KEY,
  imported_at TEXT NOT NULL,
  report TEXT NOT NULL CHECK (json_valid(report))
);
