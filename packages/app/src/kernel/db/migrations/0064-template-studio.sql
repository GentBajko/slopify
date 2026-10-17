-- Template studio (4.0, `slices/template-studio`). A version is runnable by schedules when its
-- gate is ready, carried (a system writer copied a runnable gate) or legacy (saved before the
-- studio). A version with no row was never checked.
CREATE TABLE template_gates (
 template_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version >= 1),
 state TEXT NOT NULL CHECK(state IN ('legacy','ready','carried')),
 carried_from INTEGER CHECK(carried_from IS NULL OR carried_from >= 1),
 checks_json TEXT CHECK(checks_json IS NULL OR json_valid(checks_json)),
 marked_at TEXT,
 PRIMARY KEY(template_id, version),
 FOREIGN KEY(template_id, version) REFERENCES project_template_revisions(template_id, version) ON DELETE CASCADE
);
INSERT INTO template_gates (template_id, version, state)
 SELECT template_id, version, 'legacy' FROM project_template_revisions;
-- The hidden project each template's samples are made on. It never appears in a list the user
-- sees (`notTemplateSample`), and its project may be gone: the next sample makes it again.
CREATE TABLE template_samples (
 template_id TEXT PRIMARY KEY REFERENCES project_templates(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL UNIQUE,
 topic TEXT NOT NULL CHECK(length(trim(topic)) BETWEEN 1 AND 300),
 topic_source TEXT NOT NULL CHECK(topic_source IN ('fixed','queued')),
 full_script INTEGER NOT NULL DEFAULT 0 CHECK(full_script IN (0,1)),
 created_at TEXT NOT NULL
);
CREATE TABLE template_sample_versions (
 template_id TEXT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
 template_version INTEGER NOT NULL CHECK(template_version >= 1),
 revision_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('queued','making','done','failed','skipped','held')),
 quoted_high REAL,
 held_reason TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(template_id, template_version)
);
-- At most one sample job per template: a newer Save replaces a queued one and waits behind a
-- running one, which is never stopped.
CREATE TABLE template_sample_jobs (
 template_id TEXT PRIMARY KEY REFERENCES project_templates(id) ON DELETE CASCADE,
 template_version INTEGER NOT NULL CHECK(template_version >= 1),
 ack_high REAL NOT NULL DEFAULT 0 CHECK(ack_high >= 0),
 kind TEXT NOT NULL CHECK(kind IN ('save','topic','full-script','bakeoff','free')),
 requested_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','running'))
);
