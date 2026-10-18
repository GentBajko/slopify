-- The in-app assistant acts through the same API as an agent but is told apart: its changes
-- show "by assistant", and it can start a project's work. Its chat is kept per session, each
-- turn replayed to a fresh CLI, and what it asked the person first ("Ask first") is kept with
-- the person's answer, which a later call may use once. SQLite cannot change a CHECK in place,
-- so project_starts is copied, as 0055 did.
ALTER TABLE agent_actions ADD COLUMN actor TEXT NOT NULL DEFAULT 'agent' CHECK(actor IN ('agent','assistant'));

CREATE TABLE project_starts_assistant_upgrade (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 actor TEXT NOT NULL CHECK(actor IN ('person','agent','assistant')),
 started_at TEXT NOT NULL
);
INSERT INTO project_starts_assistant_upgrade (project_id,actor,started_at)
  SELECT project_id,actor,started_at FROM project_starts ORDER BY rowid;
DROP TABLE project_starts;
ALTER TABLE project_starts_assistant_upgrade RENAME TO project_starts;

CREATE TABLE assistant_sessions (
 id TEXT PRIMARY KEY,
 cli TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE assistant_messages (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
 turn_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('person','assistant','tool','ask','error')),
 text TEXT NOT NULL,
 meta TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(meta)),
 created_at TEXT NOT NULL
);
CREATE INDEX assistant_messages_session ON assistant_messages(session_id, created_at);
CREATE TABLE assistant_asks (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES assistant_sessions(id) ON DELETE CASCADE,
 tool TEXT NOT NULL,
 args_hash TEXT NOT NULL,
 text TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('asked','allowed','denied','used','expired')),
 created_at TEXT NOT NULL,
 decided_at TEXT
);
CREATE INDEX assistant_asks_session ON assistant_asks(session_id, state);
