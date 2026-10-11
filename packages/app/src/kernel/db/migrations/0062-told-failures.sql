-- Each failed step the Notification URL was told of (`notifications/rules.ts` runNotices), by its
-- identity (`kind@finishedAt`), only while its project still has it: a restart reads it back, so
-- a failure is told once, and one never told is still told when the run ends.
CREATE TABLE told_failures (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 failure_id TEXT NOT NULL,
 PRIMARY KEY(project_id, failure_id)
);
