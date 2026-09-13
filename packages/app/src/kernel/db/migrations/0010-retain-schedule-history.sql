CREATE TABLE retained_schedule_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','skipped')),
  request_id TEXT,
  project_ids_json TEXT NOT NULL CHECK(json_valid(project_ids_json)),
  estimate_json TEXT CHECK(estimate_json IS NULL OR json_valid(estimate_json)),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  projects_settled_at TEXT,
  error TEXT,
  UNIQUE(schedule_id, scheduled_for),
  UNIQUE(request_id)
);
INSERT INTO retained_schedule_runs (
  id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,started_at,
  ended_at,projects_settled_at,error
)
SELECT
  id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,started_at,
  ended_at,NULL,error
FROM schedule_runs;
DROP TABLE schedule_runs;
ALTER TABLE retained_schedule_runs RENAME TO schedule_runs;
CREATE INDEX schedule_runs_schedule ON schedule_runs(schedule_id, started_at DESC);

CREATE TABLE retained_schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL CHECK(template_version >= 1),
  cadence_json TEXT NOT NULL CHECK(json_valid(cadence_json)),
  timezone TEXT NOT NULL,
  missed_policy TEXT NOT NULL CHECK(missed_policy IN ('skip','run-once')),
  overlap_policy TEXT NOT NULL CHECK(overlap_policy IN ('skip')),
  spend_limit_cents INTEGER CHECK(spend_limit_cents IS NULL OR spend_limit_cents >= 0),
  items_json TEXT NOT NULL CHECK(json_valid(items_json)),
  status TEXT NOT NULL CHECK(status IN ('active','paused','completed','canceled')),
  version INTEGER NOT NULL CHECK(version >= 1),
  creation_hash TEXT NOT NULL,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  mutation_id TEXT,
  mutation_hash TEXT,
  deleted_at TEXT,
  CHECK(deleted_at IS NULL OR (status IN ('completed','canceled') AND next_run_at IS NULL))
);
INSERT INTO retained_schedules (
  id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,
  spend_limit_cents,items_json,status,version,creation_hash,next_run_at,created_at,updated_at,
  mutation_id,mutation_hash,deleted_at
)
SELECT
  id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,
  spend_limit_cents,items_json,status,version,creation_hash,next_run_at,created_at,updated_at,
  mutation_id,mutation_hash,NULL
FROM schedules;
DROP TABLE schedules;
ALTER TABLE retained_schedules RENAME TO schedules;
CREATE INDEX schedules_due ON schedules(status, next_run_at) WHERE deleted_at IS NULL;
