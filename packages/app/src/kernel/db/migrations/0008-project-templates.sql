CREATE TABLE project_templates (
 id TEXT PRIMARY KEY,
 head_version INTEGER NOT NULL CHECK(head_version >= 1),
 creation_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 mutation_id TEXT,
 mutation_hash TEXT
);
CREATE TABLE project_template_revisions (
 template_id TEXT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version >= 1),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 created_at TEXT NOT NULL,
 PRIMARY KEY(template_id,version)
);
CREATE TABLE project_template_instantiations (
 draft_id TEXT PRIMARY KEY REFERENCES play_drafts(id) ON DELETE CASCADE,
 template_id TEXT NOT NULL,
 template_version INTEGER NOT NULL CHECK(template_version >= 1)
);
