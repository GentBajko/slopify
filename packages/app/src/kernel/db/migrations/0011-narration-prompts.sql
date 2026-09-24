CREATE TABLE prompts_narration_upgrade (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article','image','thumbnail','narration')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  slots TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO prompts_narration_upgrade (id,kind,name,body,slots,updated_at)
  SELECT id,kind,name,body,slots,updated_at FROM prompts;
DROP TABLE prompts;
ALTER TABLE prompts_narration_upgrade RENAME TO prompts;
CREATE UNIQUE INDEX prompts_name ON prompts(kind,lower(name));
