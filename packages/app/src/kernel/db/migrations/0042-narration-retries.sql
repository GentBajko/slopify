-- A narration chunk whose audio stopped matching its text is recorded again by itself: the
-- caption step asks for it here, and the retry starts once that step's failure is saved. The
-- count caps it at two tries per chunk; `state` is what the last try did.
CREATE TABLE narration_retries (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 chunk_key TEXT NOT NULL,
 tries INTEGER NOT NULL CHECK (tries > 0),
 state TEXT NOT NULL CHECK (state IN ('pending', 'started', 'failed')),
 detail TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(project_id, chunk_key)
);
CREATE INDEX narration_retries_pending ON narration_retries(state) WHERE state = 'pending';
