-- How long each local step ran (3.11.1): levelling, renders, captions, documents. Only provider
-- calls left a record (`attempts`), so a project's working time missed every render and its
-- clock stood still while one ran. Kept apart from attempts, whose presence says a step has
-- started submitting and changes how a pause or an edit treats it.
CREATE TABLE local_work_times (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  revision_id TEXT,
  work_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX local_work_times_project ON local_work_times(project_id);
