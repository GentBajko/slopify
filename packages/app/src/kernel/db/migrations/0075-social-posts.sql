-- Posting to other sites (`slices/social`). One row per project, site and item (0 is the
-- project's one post per site): the project's own pick (`choice_json`, NULL is the template's),
-- the person's hand edit of the text and the generated text it was made from, Reddit's own
-- fields, and where the post stands after the extension filled it or the person posted it.
-- A project with no row posts as its settings say; nothing here is generated.
CREATE TABLE social_posts (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('x','linkedin','instagram','tiktok','reddit','bluesky')),
  item INTEGER NOT NULL DEFAULT 0 CHECK (item >= 0),
  choice_json TEXT CHECK (choice_json IS NULL OR json_valid(choice_json)),
  text_edit TEXT,
  text_base TEXT,
  reddit_json TEXT CHECK (reddit_json IS NULL OR json_valid(reddit_json)),
  state TEXT NOT NULL DEFAULT 'none' CHECK (state IN ('none','waiting','filling','filled','scheduled','posted','failed')),
  waiting_at TEXT,
  filled_at TEXT,
  scheduled_at TEXT,
  posted_at TEXT,
  url TEXT,
  message TEXT,
  by TEXT CHECK (by IN ('extension','person')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, platform, item)
);
CREATE INDEX social_posts_waiting ON social_posts(platform, waiting_at) WHERE state = 'waiting';
