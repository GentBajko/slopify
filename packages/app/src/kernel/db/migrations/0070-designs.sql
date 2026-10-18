-- Designs (4.0): an uploaded or generated picture edited step by step, and a designed piece
-- (poster, flyer, brochure, social image) whose text Slopify lays out on the AI's artwork.
-- A design is its own record, not a project; `project_id` only links it to one ("Keep in
-- project") and is cleared when that project is deleted. `channel_id` is the channel its paid
-- calls count under on Home. `sample_of` marks the hidden sample a design template's editor
-- redraws; every list leaves those out. Each step is one version of the picture, kept in
-- image_blobs (backed up), chained by `parent_id`; `head_step_id` is the version the design
-- shows and continues from.
CREATE TABLE designs (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('edit','design')),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 channel_id TEXT NOT NULL,
 project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
 template_id TEXT,
 template_version INTEGER CHECK(template_version IS NULL OR template_version >= 1),
 schedule_id TEXT,
 schedule_run_id TEXT,
 document_json TEXT CHECK(document_json IS NULL OR json_valid(document_json)),
 values_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(values_json)),
 head_step_id TEXT,
 sample_of TEXT,
 mutation_id TEXT UNIQUE,
 mutation_hash TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 deleted_at TEXT
);
CREATE INDEX designs_project ON designs(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX designs_schedule ON designs(schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX designs_sample_of ON designs(sample_of) WHERE sample_of IS NOT NULL;
CREATE TABLE design_steps (
 id TEXT PRIMARY KEY,
 design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
 n INTEGER NOT NULL CHECK(n >= 1),
 parent_id TEXT REFERENCES design_steps(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('upload','edit','generate')),
 instruction TEXT CHECK(instruction IS NULL OR length(instruction) <= 4000),
 provider TEXT,
 model TEXT,
 inputs_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(inputs_json)),
 state TEXT NOT NULL CHECK(state IN ('making','ready','failed')),
 error TEXT,
 sha256 TEXT REFERENCES image_blobs(sha256),
 width INTEGER CHECK(width IS NULL OR width > 0),
 height INTEGER CHECK(height IS NULL OR height > 0),
 mutation_id TEXT UNIQUE,
 mutation_hash TEXT,
 created_at TEXT NOT NULL,
 settled_at TEXT,
 UNIQUE(design_id, n),
 CHECK(state <> 'ready' OR sha256 IS NOT NULL)
);
