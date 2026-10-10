-- What an agent changed through MCP. A project's rows are its history ("by agent") and go with
-- it; a change that names no project (a schedule's topics, the Library, a setting) keeps none,
-- and Settings → Connections → Agents (MCP) lists it.
CREATE TABLE agent_actions (
 id TEXT PRIMARY KEY,
 project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
 schedule_id TEXT,
 tool TEXT NOT NULL,
 title TEXT NOT NULL,
 revision_id TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX agent_actions_project ON agent_actions(project_id, created_at);
CREATE INDEX agent_actions_time ON agent_actions(created_at);
-- Who last started a project's work, the person or an agent: the run's notices say so.
CREATE TABLE project_starts (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 actor TEXT NOT NULL CHECK(actor IN ('person','agent')),
 started_at TEXT NOT NULL
);
