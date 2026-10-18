-- Library prompts of the new "post" kind: what writes a project's post for another site
-- (`slices/social`). SQLite cannot change a CHECK in place, so the table is copied into one
-- whose CHECK lists the new kind, like 0034 did for "script".
CREATE TABLE prompts_post_upgrade (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article','image','thumbnail','narration','description','shorts','review','script','post')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  slots TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
INSERT INTO prompts_post_upgrade (id,kind,name,body,slots,updated_at,deleted_at)
  SELECT id,kind,name,body,slots,updated_at,deleted_at FROM prompts;
DROP TABLE prompts;
ALTER TABLE prompts_post_upgrade RENAME TO prompts;
CREATE UNIQUE INDEX prompts_name ON prompts(kind,lower(name)) WHERE deleted_at IS NULL;
