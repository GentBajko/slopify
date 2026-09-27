-- Automatic reviews. Library prompts of the new "review" kind are what a reviewer model is
-- asked per stage; SQLite cannot change a CHECK in place, so the table is copied into one whose
-- CHECK lists the new kind, like 0019 did for "shorts".
CREATE TABLE prompts_review_upgrade (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article','image','thumbnail','narration','description','shorts','review')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  slots TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO prompts_review_upgrade (id,kind,name,body,slots,updated_at)
  SELECT id,kind,name,body,slots,updated_at FROM prompts;
DROP TABLE prompts;
ALTER TABLE prompts_review_upgrade RENAME TO prompts;
CREATE UNIQUE INDEX prompts_name ON prompts(kind,lower(name));
-- Every verdict a reviewer gave, with its reasons, what Slopify did about it (passed, flagged,
-- or sent back to be made again) and what the person did (overruled it, or had it redone).
-- One row per review step fingerprint: the same review of the same output is not asked twice.
CREATE TABLE review_verdicts (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 revision_id TEXT NOT NULL,
 item_key TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('article','images','narration','thumbnail','shorts')),
 item_fingerprint TEXT NOT NULL,
 review_fingerprint TEXT NOT NULL,
 passed INTEGER NOT NULL CHECK(passed IN (0,1)),
 reasons TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('passed','flagged','redo')),
 attempt INTEGER NOT NULL CHECK(attempt >= 1),
 action TEXT CHECK(action IN ('overruled','redone')),
 action_at TEXT,
 redo_state TEXT CHECK(redo_state IN ('pending','started','failed')),
 redo_error TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(project_id,review_fingerprint)
);
CREATE INDEX review_verdicts_item ON review_verdicts(project_id,item_key);
CREATE INDEX review_verdicts_redo ON review_verdicts(redo_state);
