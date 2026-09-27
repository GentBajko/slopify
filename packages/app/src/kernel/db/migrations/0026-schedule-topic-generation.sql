-- A schedule can find its own topics: a series brief, a generation mode and how many topics to
-- keep queued. `topic_llm_json` is NULL for the template's own LLM. The generating/failed
-- columns are the generation's own bookkeeping and never bump the schedule's version.
ALTER TABLE schedules ADD COLUMN brief TEXT;
ALTER TABLE schedules ADD COLUMN topic_mode TEXT NOT NULL DEFAULT 'off' CHECK(topic_mode IN ('off','queue','hold'));
ALTER TABLE schedules ADD COLUMN topic_min INTEGER NOT NULL DEFAULT 10 CHECK(topic_min BETWEEN 1 AND 100);
ALTER TABLE schedules ADD COLUMN topic_llm_json TEXT CHECK(topic_llm_json IS NULL OR json_valid(topic_llm_json));
ALTER TABLE schedules ADD COLUMN topics_generating_at TEXT;
ALTER TABLE schedules ADD COLUMN topics_generated_at TEXT;
ALTER TABLE schedules ADD COLUMN topics_failed_at TEXT;
ALTER TABLE schedules ADD COLUMN topics_error TEXT;
-- Topics outside the queue: generated ones held for approval, ones the user rejected, and ones
-- a run used. Rejected and used rows stay so a later generation never suggests them again.
CREATE TABLE schedule_topics (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  state TEXT NOT NULL CHECK(state IN ('held','rejected','used')),
  rank INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX schedule_topics_schedule ON schedule_topics(schedule_id, state, rank);
