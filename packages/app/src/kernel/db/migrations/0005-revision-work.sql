CREATE UNIQUE INDEX stages_project_identity ON stages(project_id,id,kind);
CREATE TABLE revision_work (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 stage_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 admission_id TEXT,
 recipe_context TEXT CHECK(recipe_context IS NULL OR json_valid(recipe_context)),
 progress_current REAL,
 progress_total REAL,
 state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','canceled')),
 dispatch_state TEXT NOT NULL CHECK(dispatch_state IN ('held','allowed','draining')),
 failure_reason TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(project_id,id),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,stage_id,kind) REFERENCES stages(project_id,id,kind) ON DELETE CASCADE
);
CREATE INDEX revision_work_stage ON revision_work(revision_id,stage_id);
CREATE INDEX revision_work_dispatch ON revision_work(project_id,dispatch_state,state);
CREATE TABLE revision_work_pieces (
 id TEXT PRIMARY KEY,
 work_id TEXT NOT NULL REFERENCES revision_work(id) ON DELETE CASCADE,
 work_key TEXT NOT NULL,
 request_fingerprint TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 input_json TEXT NOT NULL CHECK(json_valid(input_json)),
 logical_fingerprint TEXT,
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 continuation TEXT,
 generation_token TEXT,
 state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','held')),
 dispatch_state TEXT NOT NULL CHECK(dispatch_state IN ('held','allowed','draining')),
 submitted_at TEXT,
 UNIQUE(work_id,id),
 UNIQUE(work_id,work_key)
);
CREATE INDEX revision_piece_dispatch ON revision_work_pieces(work_id,dispatch_state,state);
CREATE TABLE revision_work_reservations (
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 work_key TEXT NOT NULL,
 work_id TEXT NOT NULL,
 piece_id TEXT,
 fingerprint TEXT NOT NULL,
 logical_key TEXT,
 desired_fingerprint TEXT,
 CHECK((logical_key IS NULL) = (desired_fingerprint IS NULL)),
 PRIMARY KEY(revision_id,work_key),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,work_id) REFERENCES revision_work(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(work_id,piece_id) REFERENCES revision_work_pieces(work_id,id) ON DELETE CASCADE
);
CREATE TABLE rebuild_previews (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 plan_fingerprint TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 created_at TEXT NOT NULL,
 UNIQUE(project_id,revision_id,id),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE
);
CREATE TABLE rebuild_admissions (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 preview_id TEXT NOT NULL,
 response_json TEXT NOT NULL CHECK(json_valid(response_json)),
 created_at TEXT NOT NULL,
 UNIQUE(project_id,idempotency_key),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,revision_id,preview_id) REFERENCES rebuild_previews(project_id,revision_id,id)
);
ALTER TABLE attempts ADD COLUMN revision_id TEXT REFERENCES project_revisions(id) ON DELETE SET NULL;
ALTER TABLE attempts ADD COLUMN work_id TEXT REFERENCES revision_work(id) ON DELETE SET NULL;
ALTER TABLE attempts ADD COLUMN work_piece_id TEXT REFERENCES revision_work_pieces(id) ON DELETE SET NULL;
