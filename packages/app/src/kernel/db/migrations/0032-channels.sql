-- Channels: the brand kit, the cast library and the series brief that templates, schedules
-- and projects belong to. Every install gets one default channel, "My channel", with a fixed
-- id so a backup made on one install names the same default on another, and everything that
-- exists moves into it. Nothing about a project's config changes, so no fingerprint does.
--
-- A template's channel is a plain column and a project's is a row of project_channels, neither
-- with a foreign key to channels: a backup can bring in a row naming a channel this install
-- never had, and such a row (like none at all) reads as the default channel. The projects
-- table itself is left as it is. A schedule's channel is its template's.
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  brand_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(brand_json)),
  series_brief TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX channels_one_default ON channels(is_default) WHERE is_default = 1;
INSERT INTO channels (id, name, is_default, created_at, updated_at) VALUES (
  '00000000-0000-4000-8000-000000000001', 'My channel', 1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
-- The characters, creatures, places and objects a channel keeps drawing the same way.
CREATE TABLE cast_members (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('character','creature','place','object')),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  aliases_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(aliases_json)),
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX cast_members_channel ON cast_members(channel_id);
-- Picture bytes by content hash: cast reference images and the brand kit's end screen image.
-- A project names the hashes it was started with, so a row is never removed while it may be
-- named; the bytes are in the database so every database backup carries them.
CREATE TABLE image_blobs (
  sha256 TEXT PRIMARY KEY,
  mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg')),
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE cast_images (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES cast_members(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK(source IN ('upload','generate')),
  prompt TEXT,
  state TEXT NOT NULL CHECK(state IN ('ready','generating','failed')),
  error TEXT,
  sha256 TEXT REFERENCES image_blobs(sha256),
  created_at TEXT NOT NULL
);
CREATE INDEX cast_images_member ON cast_images(member_id);
ALTER TABLE project_templates ADD COLUMN channel_id TEXT;
CREATE TABLE project_channels (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL
);
UPDATE project_templates SET channel_id = '00000000-0000-4000-8000-000000000001';
INSERT INTO project_channels (project_id, channel_id)
  SELECT id, '00000000-0000-4000-8000-000000000001' FROM projects;
