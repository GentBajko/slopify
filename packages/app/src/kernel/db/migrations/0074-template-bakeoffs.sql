-- Template studio's model bake-off (4.0, `slices/template-studio/bakeoff.ts`): one section's
-- sample made again on two or three models, each on a hidden copy of the template's sample
-- project, compared by cost and speed, then discarded. One bake-off per template at a time.
CREATE TABLE template_bakeoffs (
 id TEXT PRIMARY KEY,
 template_id TEXT NOT NULL UNIQUE REFERENCES project_templates(id) ON DELETE CASCADE,
 template_version INTEGER NOT NULL CHECK(template_version >= 1),
 section TEXT NOT NULL CHECK(section IN ('script','voice','pictures')),
 ack_high REAL NOT NULL CHECK(ack_high >= 0),
 ack_unknown INTEGER NOT NULL DEFAULT 0 CHECK(ack_unknown IN (0,1)),
 state TEXT NOT NULL CHECK(state IN ('queued','making','done','held','failed')),
 sentence TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
-- Each model's copy. Its project is hidden like the sample's (`template_hidden_projects`) and
-- removed with the bake-off.
CREATE TABLE template_bakeoff_clones (
 bakeoff_id TEXT NOT NULL REFERENCES template_bakeoffs(id) ON DELETE CASCADE,
 slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 2),
 provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 100),
 model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
 project_id TEXT UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('queued','making','done','failed')),
 quoted_high REAL,
 failure TEXT,
 started_at TEXT,
 finished_at TEXT,
 PRIMARY KEY(bakeoff_id, slot)
);
-- Every project the studio keeps out of the lists the person sees: each template's sample and
-- each bake-off copy (`notTemplateSample`).
CREATE VIEW template_hidden_projects AS
 SELECT project_id FROM template_samples
 UNION ALL
 SELECT project_id FROM template_bakeoff_clones WHERE project_id IS NOT NULL;
-- What a hidden project spent, kept when the project is removed (a bake-off discarded, a sample
-- made again on a new topic), so today's sample budget still counts it.
CREATE TABLE template_studio_spend (
 project_id TEXT NOT NULL,
 cost REAL NOT NULL CHECK(cost >= 0),
 created_at TEXT NOT NULL
);
CREATE INDEX template_studio_spend_at ON template_studio_spend(created_at);
