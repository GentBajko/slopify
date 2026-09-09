CREATE TABLE project_controls (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0, 1))
);
