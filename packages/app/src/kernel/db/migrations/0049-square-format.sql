-- foreign-keys: off
-- Square projects (3.5.0): `projects.format` takes '1:1' beside '16:9' and '9:16'. SQLite
-- cannot widen a CHECK constraint in place, so the table is rebuilt; every table that points at
-- projects keeps its rows (migrate.ts turns enforcement off for this file and checks every
-- reference before it commits).
CREATE TABLE projects_square_upgrade (id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) <= 200), format TEXT NOT NULL CHECK(format IN ('16:9','9:16','1:1')), config TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO projects_square_upgrade (id,title,format,config,created_at,updated_at)
  SELECT id,title,format,config,created_at,updated_at FROM projects;
DROP TABLE projects;
ALTER TABLE projects_square_upgrade RENAME TO projects;
