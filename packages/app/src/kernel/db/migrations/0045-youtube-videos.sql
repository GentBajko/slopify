-- The YouTube video each upload became (the long video, short 0, or short N), as the Slopify
-- Studio extension read it from Studio's upload dialog or the person pasted its link. With it,
-- the video's A/B test (its other titles and thumbnails) can wait until the video is public:
-- a scheduled video is private until then, and Studio tests only public ones. The extension
-- checks the waiting tests, starts each once its video is public, and reports back.
CREATE TABLE youtube_videos (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  short INTEGER NOT NULL CHECK (short >= 0),
  video_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  ab_state TEXT NOT NULL DEFAULT 'none' CHECK (ab_state IN ('none', 'waiting', 'started', 'failed')),
  ab_message TEXT,
  ab_at TEXT,
  PRIMARY KEY (project_id, short)
);
