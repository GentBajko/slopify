ALTER TABLE provider_keys ADD COLUMN credential_generation TEXT NOT NULL DEFAULT 'legacy';

CREATE TABLE project_recovery_requests (
 project_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 base_revision_id TEXT NOT NULL,
 authority_stamp TEXT NOT NULL,
 edit_json TEXT CHECK(edit_json IS NULL OR json_valid(edit_json)),
 intent_revision_id TEXT,
 response_json TEXT CHECK(response_json IS NULL OR json_valid(response_json)),
 PRIMARY KEY(project_id,idempotency_key),
 FOREIGN KEY(project_id,base_revision_id)
   REFERENCES project_revisions(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,intent_revision_id)
   REFERENCES project_revisions(project_id,id) ON DELETE CASCADE
);
