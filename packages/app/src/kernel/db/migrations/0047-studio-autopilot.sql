-- Studio, hands off (3.3.0).
-- upload_slots: the posting plan's slot each project's upload takes (its long video's time; the
-- shorts follow from the plan).
CREATE TABLE upload_slots (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  row_name TEXT NOT NULL,
  long_at TEXT NOT NULL,
  assigned_at TEXT NOT NULL
);
-- What the extension does on a confirmed upload's Details page (the shorts' related video, the
-- long video's end screen and captions), and the pinned comment once it is public.
ALTER TABLE youtube_videos ADD COLUMN finish_state TEXT NOT NULL DEFAULT 'none'
  CHECK (finish_state IN ('none', 'waiting', 'done', 'failed'));
ALTER TABLE youtube_videos ADD COLUMN finish_message TEXT;
ALTER TABLE youtube_videos ADD COLUMN comment_state TEXT NOT NULL DEFAULT 'none'
  CHECK (comment_state IN ('none', 'waiting', 'done', 'failed'));
ALTER TABLE youtube_videos ADD COLUMN comment_message TEXT;
-- Studio's numbers for each known video, as the extension last read them.
CREATE TABLE video_stats (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  impressions INTEGER,
  ctr REAL,
  views INTEGER,
  average_view_seconds INTEGER,
  watch_hours REAL,
  PRIMARY KEY (project_id, short)
);
-- A finished A/B test as Studio shows it: each variant's title, thumbnail number and share.
CREATE TABLE ab_results (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  variants TEXT NOT NULL CHECK (json_valid(variants)),
  PRIMARY KEY (project_id, short)
);
