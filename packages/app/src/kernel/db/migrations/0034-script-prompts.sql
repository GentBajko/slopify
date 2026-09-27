-- Library prompts of the new "script" kind: what a multi-voice run (audiobook, podcast, radio
-- drama, interview) asks the text model for in place of an article - speaker turns. SQLite
-- cannot change a CHECK in place, so the table is copied into one whose CHECK lists the new
-- kind, like 0019 did for "shorts".
CREATE TABLE prompts_script_upgrade (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article','image','thumbnail','narration','description','shorts','script')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  slots TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO prompts_script_upgrade (id,kind,name,body,slots,updated_at)
  SELECT id,kind,name,body,slots,updated_at FROM prompts;
DROP TABLE prompts;
ALTER TABLE prompts_script_upgrade RENAME TO prompts;
CREATE UNIQUE INDEX prompts_name ON prompts(kind,lower(name));
