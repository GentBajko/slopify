-- Channel essentials.
--
-- Trash: deleting a project, a Library prompt or intro/outro, or a template now only stamps
-- `deleted_at`; Settings → Trash lists the stamped rows for 30 days, and a daily purge removes
-- them for good. Every list and lookup skips stamped rows. The name indexes only count rows
-- that are not in the trash, so a name can be reused while the old one waits there. A later
-- migration that rebuilds one of these tables must carry `deleted_at` over.
--
-- A project's stamp lives in its own table rather than a column: the projects table is read
-- and written positionally in many places, and a project has no name index to relax.
CREATE TABLE project_trash (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  deleted_at TEXT NOT NULL
);
ALTER TABLE prompts ADD COLUMN deleted_at TEXT;
ALTER TABLE entries ADD COLUMN deleted_at TEXT;
ALTER TABLE project_templates ADD COLUMN deleted_at TEXT;
DROP INDEX prompts_name;
CREATE UNIQUE INDEX prompts_name ON prompts(kind,lower(name)) WHERE deleted_at IS NULL;
DROP INDEX entries_name;
CREATE UNIQUE INDEX entries_name ON entries(category,lower(name)) WHERE deleted_at IS NULL;
-- A schedule already kept a `deleted_at` (0010: its history outlives it). `purged_at` marks one
-- that has left the trash; every schedule deleted before the trash existed counts as left.
ALTER TABLE schedules ADD COLUMN purged_at TEXT;
UPDATE schedules SET purged_at = deleted_at WHERE deleted_at IS NOT NULL;

-- Episode memory: a short summary each finished project leaves on its channel, read back into
-- the article and script prompts of later related episodes while the channel's setting is on.
-- No foreign key to projects: the memory outlives the project it came from.
CREATE TABLE episode_memories (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL CHECK(length(trim(summary)) > 0),
  cast_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(cast_json)),
  source TEXT NOT NULL CHECK(source IN ('generated','edited')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX episode_memories_project ON episode_memories(project_id);
CREATE INDEX episode_memories_channel ON episode_memories(channel_id, created_at);
-- Off for every channel that exists; a channel made from now on starts with it on. A fresh
-- install (no project yet) counts its default channel as new.
ALTER TABLE channels ADD COLUMN episode_memory INTEGER NOT NULL DEFAULT 0 CHECK(episode_memory IN (0,1));
UPDATE channels SET episode_memory = 1 WHERE NOT EXISTS (SELECT 1 FROM projects);
-- YouTube's "Altered or synthetic content" answer Studio prep gives: 'auto' follows the rule in
-- slices/studio/disclosure.ts, 'yes' and 'no' override it for the channel.
ALTER TABLE channels ADD COLUMN ai_disclosure TEXT NOT NULL DEFAULT 'auto' CHECK(ai_disclosure IN ('auto','yes','no'));

-- The channel's videos made before (or outside) Slopify: titles pasted or imported from a
-- YouTube Studio CSV, so topic suggestions and duplicate checks skip them too.
CREATE TABLE channel_videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX channel_videos_title ON channel_videos(channel_id, lower(title));

-- Episode memory (appended): what a generated summary was made from, a SHA-256 of the prompt
-- version, title and article text, so finishing the same article again asks no LLM. A summary
-- the user edited is never replaced by a later finish.
ALTER TABLE episode_memories ADD COLUMN recipe TEXT;
