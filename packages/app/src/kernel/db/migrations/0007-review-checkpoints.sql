CREATE UNIQUE INDEX revision_work_revision_identity ON revision_work(project_id,revision_id,id);
CREATE TABLE review_checkpoints (
 project_id TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 checkpoint_id TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('audio','images','video')),
 work_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 state TEXT NOT NULL CHECK(state IN ('configured','pending-review','held','released','satisfied','invalidated','canceled')),
 created_at TEXT NOT NULL,
 approved_at TEXT,
 PRIMARY KEY(project_id,revision_id,checkpoint_id),
 UNIQUE(project_id,revision_id,stage),
 FOREIGN KEY(project_id,revision_id) REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,revision_id,work_id) REFERENCES revision_work(project_id,revision_id,id) ON DELETE CASCADE
);
CREATE INDEX review_checkpoint_work ON review_checkpoints(work_id);
CREATE TABLE review_checkpoint_approvals (
 project_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 revision_id TEXT NOT NULL,
 checkpoint_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 approved_at TEXT NOT NULL,
 PRIMARY KEY(project_id,idempotency_key),
 UNIQUE(project_id,revision_id,checkpoint_id),
 FOREIGN KEY(project_id,revision_id,checkpoint_id) REFERENCES review_checkpoints(project_id,revision_id,checkpoint_id) ON DELETE CASCADE
);
