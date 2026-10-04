-- Release times on the schedule (3.8.0): for each day the schedule runs, when the project it
-- makes goes out on YouTube (the long video and each short, a weekday and a time in the
-- schedule's time zone). Null: the schedule sets none.
ALTER TABLE schedules ADD COLUMN releases_json TEXT;
