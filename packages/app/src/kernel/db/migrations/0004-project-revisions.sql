CREATE TABLE project_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  restored_from_id TEXT,
  config TEXT NOT NULL CHECK(json_valid(config)),
  content TEXT NOT NULL CHECK(json_valid(content)),
  fingerprints TEXT NOT NULL CHECK(json_valid(fingerprints)),
  created_at TEXT NOT NULL,
  UNIQUE(project_id, id),
  FOREIGN KEY(project_id, parent_id)
    REFERENCES project_revisions(project_id, id),
  FOREIGN KEY(project_id, restored_from_id)
    REFERENCES project_revisions(project_id, id)
);
CREATE INDEX project_revisions_project ON project_revisions(project_id, created_at, id);
CREATE TABLE project_heads (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL,
  FOREIGN KEY(project_id, revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE
);
CREATE TABLE project_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK(length(path) > 0),
  bytes INTEGER CHECK(bytes IS NULL OR bytes >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(project_id, id),
  UNIQUE(project_id, path)
);
CREATE TABLE revision_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  work_key TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('ready','outdated','review')),
  descriptor TEXT NOT NULL CHECK(json_valid(descriptor)),
  publication_id TEXT,
  selected INTEGER NOT NULL CHECK(selected IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id, revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, asset_id)
    REFERENCES project_assets(project_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX revision_outputs_selected ON revision_outputs(revision_id, slot)
  WHERE selected = 1;
CREATE INDEX revision_outputs_revision ON revision_outputs(revision_id, created_at, id);
CREATE UNIQUE INDEX revision_outputs_publication ON revision_outputs(revision_id, publication_id, slot)
  WHERE publication_id IS NOT NULL;
CREATE TABLE revision_pieces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  piece_key TEXT NOT NULL,
  stage_kind TEXT NOT NULL CHECK(stage_kind IN
    ('research','article','audio','images','thumbnail','video')),
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
CREATE UNIQUE INDEX revision_pieces_selected ON revision_pieces(revision_id, piece_key)
  WHERE selected = 1;
CREATE INDEX revision_pieces_revision ON revision_pieces(revision_id, created_at, id);
CREATE UNIQUE INDEX revision_pieces_publication ON revision_pieces(revision_id, publication_id, piece_key)
  WHERE publication_id IS NOT NULL;
CREATE TABLE revision_mutations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('save','restore')),
  request_hash TEXT NOT NULL,
  base_revision_id TEXT NOT NULL,
  result_revision_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, idempotency_key),
  FOREIGN KEY(project_id, base_revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, result_revision_id)
    REFERENCES project_revisions(project_id, id) ON DELETE CASCADE
);
