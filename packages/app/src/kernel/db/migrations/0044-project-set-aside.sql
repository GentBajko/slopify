-- "Keep as is" on Home's Needs you: a run waiting only on held work the person does not want
-- (a step added after the project was made, say, whose run would redraw finished thumbnails)
-- leaves Needs you without running anything. It holds for the revision it was set on: an edit
-- makes a new head, and the project waits for the person again.
CREATE TABLE project_set_aside (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL,
  set_at TEXT NOT NULL
);
