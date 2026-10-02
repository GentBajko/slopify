-- Release calendar (3.4.0): one release time for each long video and each short, in place of
-- one posting-plan slot per project. short 0 is the long video. release_at '' is "not
-- scheduled". line is the posting-plan line the time came from (null when picked by hand);
-- by says whether the plan or the person set it, so moving a long video re-plans only the
-- shorts the plan placed.
CREATE TABLE releases (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL CHECK (short >= 0),
  release_at TEXT NOT NULL,
  line TEXT,
  by TEXT NOT NULL DEFAULT 'plan' CHECK (by IN ('plan', 'person')),
  set_at TEXT NOT NULL,
  PRIMARY KEY (project_id, short)
);
INSERT INTO releases (project_id, short, release_at, line, by, set_at)
  SELECT project_id, 0, long_at, NULLIF(row_name, ''), 'plan', assigned_at FROM upload_slots;
DROP TABLE upload_slots;
-- What Studio's Content list says about a video's checks (copyright, ad suitability), as the
-- extension last read it: null until read.
ALTER TABLE youtube_videos ADD COLUMN checks TEXT;
