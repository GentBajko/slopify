-- Library prompts of the new "shorts" kind: what the Video stage's Shorts step asks the text
-- model for when it picks the clips. SQLite cannot change a CHECK in place, so the table is
-- copied into one whose CHECK lists the new kind, like 0015 did for "description".
CREATE TABLE prompts_shorts_upgrade (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article','image','thumbnail','narration','description','shorts')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  slots TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO prompts_shorts_upgrade (id,kind,name,body,slots,updated_at)
  SELECT id,kind,name,body,slots,updated_at FROM prompts;
DROP TABLE prompts;
ALTER TABLE prompts_shorts_upgrade RENAME TO prompts;
CREATE UNIQUE INDEX prompts_name ON prompts(kind,lower(name));
