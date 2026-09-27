-- A step that failed on something time can fix (a rate limit, a timeout, a dropped connection
-- or CLI) waits and runs again by itself. The wait is kept on the row, so a restart keeps it,
-- and the count is what caps it. `failure_kind` is the provider error's kind, which picks the
-- fix-it button a failed step shows.
ALTER TABLE revision_work ADD COLUMN auto_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE revision_work ADD COLUMN retry_at TEXT;
ALTER TABLE revision_work ADD COLUMN failure_kind TEXT;
CREATE INDEX revision_work_retry ON revision_work(retry_at) WHERE retry_at IS NOT NULL;
ALTER TABLE stages ADD COLUMN retry_at TEXT;
ALTER TABLE stages ADD COLUMN failure_kind TEXT;
-- Soften and retry: the image step whose prompt a content filter refused rewords it with the
-- project's AI model before drawing again. One request per step, cleared once it succeeds.
CREATE TABLE prompt_softening (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 work_key TEXT NOT NULL,
 requested_at TEXT NOT NULL,
 PRIMARY KEY(project_id, work_key)
);
