-- "Mark uploaded" on Home: the person says a finished video is on YouTube, so it leaves Ready
-- to upload. A row of its own rather than a projects column, like project_channels: nothing
-- about the project's config changes, so no fingerprint does, and deleting the project takes
-- the row with it.
CREATE TABLE project_uploads (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_at TEXT NOT NULL
);
