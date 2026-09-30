-- A schedule's topic prepared ahead (Schedules → a topic → Prepare): its project runs everything
-- but the video now and holds at a Before Video checkpoint; on the scheduled day the schedule
-- continues it instead of starting another. `added_checkpoint` says the hold is the preparation's
-- own, so the day releases it; a Before Video checkpoint the template already had stays for the
-- person to approve.
CREATE TABLE prepared_videos (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 schedule_id TEXT NOT NULL,
 title TEXT NOT NULL,
 added_checkpoint INTEGER NOT NULL CHECK (added_checkpoint IN (0, 1)),
 prepared_at TEXT NOT NULL
);
CREATE INDEX prepared_videos_title ON prepared_videos(schedule_id, title);
