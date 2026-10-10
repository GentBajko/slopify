-- Cancel closes a run's waiting reviews as canceled, an outcome of their own, rather than as
-- replaced: their items weren't made again, and taken up again their steps ask the same review
-- once more. SQLite cannot change a CHECK in place, so the table is copied, as 0055 did.
CREATE TABLE external_reviews_canceled_upgrade (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 revision_id TEXT NOT NULL,
 work_id TEXT NOT NULL,
 piece_id TEXT NOT NULL,
 work_key TEXT NOT NULL,
 item_key TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('article','images','narration','thumbnail','shorts')),
 item_fingerprint TEXT NOT NULL,
 review_fingerprint TEXT NOT NULL,
 material TEXT NOT NULL CHECK(json_valid(material)),
 state TEXT NOT NULL CHECK(state IN ('waiting','answered','auto-passed','superseded','canceled')),
 waiting_since TEXT NOT NULL,
 deadline_at TEXT NOT NULL,
 verdict TEXT CHECK(verdict IS NULL OR json_valid(verdict)),
 answered_by TEXT CHECK(answered_by IN ('person','agent')),
 answered_at TEXT,
 UNIQUE(project_id,review_fingerprint)
);
INSERT INTO external_reviews_canceled_upgrade (id,project_id,revision_id,work_id,piece_id,work_key,item_key,stage,item_fingerprint,review_fingerprint,material,state,waiting_since,deadline_at,verdict,answered_by,answered_at)
  SELECT id,project_id,revision_id,work_id,piece_id,work_key,item_key,stage,item_fingerprint,review_fingerprint,material,state,waiting_since,deadline_at,verdict,answered_by,answered_at
  FROM external_reviews ORDER BY rowid;
DROP TABLE external_reviews;
ALTER TABLE external_reviews_canceled_upgrade RENAME TO external_reviews;
CREATE INDEX external_reviews_waiting ON external_reviews(state, deadline_at);
