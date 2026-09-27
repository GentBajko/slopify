-- A Play draft can carry an uploaded establishing image (the Images stage's reference). SQLite
-- cannot widen a CHECK constraint in place, so the attachments table is rebuilt with the new
-- kind. Nothing references it, so enforcement stays on.
CREATE TABLE play_draft_attachments_reference_upgrade (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL REFERENCES play_drafts(id) ON DELETE CASCADE,
 staged_file_id TEXT REFERENCES staged_files(id) ON DELETE SET NULL,
 kind TEXT NOT NULL CHECK(kind IN ('audio','images','thumbnail','reference')),
 original_filename TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','ready','reattach')),
 error TEXT
);
INSERT INTO play_draft_attachments_reference_upgrade (id,draft_id,staged_file_id,kind,original_filename,status,error)
  SELECT id,draft_id,staged_file_id,kind,original_filename,status,error FROM play_draft_attachments ORDER BY rowid;
DROP TABLE play_draft_attachments;
ALTER TABLE play_draft_attachments_reference_upgrade RENAME TO play_draft_attachments;
CREATE INDEX play_draft_attachment_file ON play_draft_attachments(staged_file_id);
CREATE INDEX play_draft_attachment_owner ON play_draft_attachments(draft_id);
