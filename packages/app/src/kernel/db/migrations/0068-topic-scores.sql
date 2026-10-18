-- Topic scoring (`slices/schedules/score.ts`): off for every schedule saved before it, which
-- then finds and orders topics exactly as it did. A topic's score is kept beside the queue, by
-- its normalised title, so the queue's own rows keep their strict shape; `pinned` is a topic the
-- person moved, which scoring then leaves where it was put.
ALTER TABLE schedules ADD COLUMN topic_scoring TEXT NOT NULL DEFAULT 'off' CHECK(topic_scoring IN ('off','library','search'));
CREATE TABLE topic_scores (
 schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
 topic_key TEXT NOT NULL,
 title TEXT NOT NULL,
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
 interest REAL,
 novelty REAL NOT NULL,
 reasons TEXT NOT NULL CHECK(json_valid(reasons)),
 pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
 scored_at TEXT NOT NULL,
 PRIMARY KEY(schedule_id, topic_key)
);
