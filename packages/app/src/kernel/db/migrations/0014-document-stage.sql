-- foreign-keys: off
-- SQLite cannot widen a CHECK constraint in place, so the two tables that list the stage
-- kinds are rebuilt. `stages` is referenced by attempts, stage_pieces and revision_work with
-- ON DELETE CASCADE: migrate.ts turns enforcement off for this file, or dropping the old
-- table would empty those three, and checks every reference before it commits.
CREATE TABLE stages_document_upgrade (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN ('research','article','audio','images','thumbnail','video','document')), source TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','running','done','failed','canceled','provided','skipped')), failure_reason TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, progress_current INTEGER, progress_total INTEGER, started_at TEXT, finished_at TEXT, UNIQUE(project_id, kind));
INSERT INTO stages_document_upgrade (id,project_id,kind,source,state,failure_reason,attempt_count,progress_current,progress_total,started_at,finished_at)
  SELECT id,project_id,kind,source,state,failure_reason,attempt_count,progress_current,progress_total,started_at,finished_at FROM stages;
DROP TABLE stages;
ALTER TABLE stages_document_upgrade RENAME TO stages;
CREATE UNIQUE INDEX stages_project_identity ON stages(project_id,id,kind);

-- Every existing project gets the new stage switched off, so nothing it already finished
-- shows as waiting.
INSERT INTO stages (id,project_id,kind,source,state)
  SELECT id || '-document', id, 'document', 'off', 'skipped' FROM projects;

CREATE TABLE revision_pieces_document_upgrade (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  piece_key TEXT NOT NULL,
  stage_kind TEXT NOT NULL CHECK(stage_kind IN
    ('research','article','audio','images','thumbnail','video','document')),
  asset_id TEXT,
  fingerprint TEXT NOT NULL,
  descriptor TEXT NOT NULL CHECK(json_valid(descriptor)),
  publication_id TEXT,
  selected INTEGER NOT NULL CHECK(selected IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id, revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, asset_id)
    REFERENCES project_assets(project_id, id) ON DELETE CASCADE
);
INSERT INTO revision_pieces_document_upgrade (id,project_id,revision_id,piece_key,stage_kind,asset_id,fingerprint,descriptor,publication_id,selected,created_at)
  SELECT id,project_id,revision_id,piece_key,stage_kind,asset_id,fingerprint,descriptor,publication_id,selected,created_at FROM revision_pieces;
DROP TABLE revision_pieces;
ALTER TABLE revision_pieces_document_upgrade RENAME TO revision_pieces;
CREATE UNIQUE INDEX revision_pieces_selected ON revision_pieces(revision_id, piece_key)
  WHERE selected = 1;
CREATE INDEX revision_pieces_revision ON revision_pieces(revision_id, created_at, id);
CREATE UNIQUE INDEX revision_pieces_publication ON revision_pieces(revision_id, publication_id, piece_key)
  WHERE publication_id IS NOT NULL;
