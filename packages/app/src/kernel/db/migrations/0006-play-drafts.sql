CREATE TABLE play_drafts (
 id TEXT PRIMARY KEY,
 schema_version INTEGER NOT NULL,
 version INTEGER NOT NULL CHECK(version >= 1),
 title TEXT NOT NULL,
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 creation_hash TEXT NOT NULL,
 save_mutation_id TEXT,
 save_request_hash TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('active','starting','started')),
 review_id TEXT UNIQUE,
 review_json TEXT CHECK(review_json IS NULL OR json_valid(review_json)),
 review_fingerprint TEXT,
 start_id TEXT
);
CREATE TABLE play_draft_attachments (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL REFERENCES play_drafts(id) ON DELETE CASCADE,
 staged_file_id TEXT REFERENCES staged_files(id) ON DELETE SET NULL,
 kind TEXT NOT NULL CHECK(kind IN ('audio','images','thumbnail')),
 original_filename TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','ready','reattach')),
 error TEXT
);
CREATE INDEX play_draft_attachment_file ON play_draft_attachments(staged_file_id);
CREATE INDEX play_draft_attachment_owner ON play_draft_attachments(draft_id);
CREATE TABLE play_start_receipts (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL,
 draft_version INTEGER NOT NULL,
 request_hash TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL,
 UNIQUE(draft_id,draft_version)
);
CREATE INDEX play_start_receipt_draft ON play_start_receipts(draft_id);
