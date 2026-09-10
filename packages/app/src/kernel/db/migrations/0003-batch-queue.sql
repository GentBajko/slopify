CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE project_queue (
  position INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES batches(id),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','active','finished'))
);
CREATE INDEX project_queue_state ON project_queue(state, position);
