-- A review an external agent answers through MCP: what the built-in reviewer would be shown,
-- kept while it waits (picture files by their stored path, found again where they are when
-- read); the agent's verdict, or its passing at the deadline. One row per review step
-- fingerprint, like review_verdicts.
CREATE TABLE external_reviews (
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
 state TEXT NOT NULL CHECK(state IN ('waiting','answered','auto-passed','superseded')),
 waiting_since TEXT NOT NULL,
 deadline_at TEXT NOT NULL,
 verdict TEXT CHECK(verdict IS NULL OR json_valid(verdict)),
 answered_by TEXT CHECK(answered_by IN ('person','agent')),
 answered_at TEXT,
 UNIQUE(project_id,review_fingerprint)
);
CREATE INDEX external_reviews_waiting ON external_reviews(state, deadline_at);
-- Verdicts say who gave them and who acted on them, and a review nobody answered in time is
-- its own outcome. SQLite cannot change a CHECK in place, so the table is copied, as 0025 did.
CREATE TABLE review_verdicts_agent_upgrade (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 revision_id TEXT NOT NULL,
 item_key TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('article','images','narration','thumbnail','shorts')),
 item_fingerprint TEXT NOT NULL,
 review_fingerprint TEXT NOT NULL,
 passed INTEGER NOT NULL CHECK(passed IN (0,1)),
 reasons TEXT NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('passed','flagged','redo','auto-passed')),
 attempt INTEGER NOT NULL CHECK(attempt >= 1),
 action TEXT CHECK(action IN ('overruled','redone')),
 action_at TEXT,
 action_by TEXT CHECK(action_by IN ('person','agent')),
 redo_state TEXT CHECK(redo_state IN ('pending','started','failed')),
 redo_error TEXT,
 answered_by TEXT NOT NULL DEFAULT 'model' CHECK(answered_by IN ('model','agent','person','nobody')),
 created_at TEXT NOT NULL,
 UNIQUE(project_id,review_fingerprint)
);
INSERT INTO review_verdicts_agent_upgrade (id,project_id,revision_id,item_key,stage,item_fingerprint,review_fingerprint,passed,reasons,outcome,attempt,action,action_at,action_by,redo_state,redo_error,answered_by,created_at)
  SELECT id,project_id,revision_id,item_key,stage,item_fingerprint,review_fingerprint,passed,reasons,outcome,attempt,action,action_at,
    CASE WHEN action IS NULL THEN NULL ELSE 'person' END,redo_state,redo_error,'model',created_at
  FROM review_verdicts ORDER BY rowid;
DROP TABLE review_verdicts;
ALTER TABLE review_verdicts_agent_upgrade RENAME TO review_verdicts;
CREATE INDEX review_verdicts_item ON review_verdicts(project_id,item_key);
CREATE INDEX review_verdicts_redo ON review_verdicts(redo_state);
