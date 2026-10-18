-- Design templates: a designed piece saved with fields ({{Event}}, {{Date}}…) to make again by
-- hand or from a schedule. Every Save is a new revision; schedules only make from a revision
-- marked ready. `design_template_samples` is the one sample job per template its editor
-- redraws after a Save (the sample itself is a hidden design, `designs.sample_of`).
CREATE TABLE design_templates (
 id TEXT PRIMARY KEY,
 channel_id TEXT,
 head_version INTEGER NOT NULL CHECK(head_version >= 1),
 created_at TEXT NOT NULL,
 deleted_at TEXT,
 mutation_id TEXT UNIQUE,
 mutation_hash TEXT
);
CREATE TABLE design_template_revisions (
 template_id TEXT NOT NULL REFERENCES design_templates(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version >= 1),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 gate TEXT NOT NULL DEFAULT 'unchecked' CHECK(gate IN ('unchecked','ready')),
 checks_json TEXT CHECK(checks_json IS NULL OR json_valid(checks_json)),
 marked_at TEXT,
 created_at TEXT NOT NULL,
 PRIMARY KEY(template_id, version)
);
CREATE TABLE design_template_samples (
 template_id TEXT PRIMARY KEY REFERENCES design_templates(id) ON DELETE CASCADE,
 design_id TEXT UNIQUE,
 version INTEGER NOT NULL CHECK(version >= 1),
 state TEXT NOT NULL CHECK(state IN ('queued','making','done','failed','held')),
 held_reason TEXT,
 quoted_high REAL,
 updated_at TEXT NOT NULL
);
