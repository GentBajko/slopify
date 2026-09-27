-- Every save of a Library prompt or intro/outro keeps a version, so History can show and
-- restore any of them. One table serves both libraries: `item_kind` says which, `kind` holds the
-- prompt's kind or the entry's category, and `mode` the entry's mode (NULL for a prompt). No
-- foreign key: the row it belongs to lives in one of two tables, and the save path deletes the
-- versions with the prompt or entry.
CREATE TABLE library_versions (
  item_kind TEXT NOT NULL CHECK(item_kind IN ('prompt','entry')),
  item_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  kind TEXT NOT NULL,
  mode TEXT CHECK(mode IS NULL OR mode IN ('text','llm')),
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  restored_from INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY(item_kind,item_id,version)
);
-- What is saved today becomes version 1 of each.
INSERT INTO library_versions (item_kind,item_id,version,kind,mode,name,body,author,restored_from,created_at)
  SELECT 'prompt',id,1,kind,NULL,name,body,'you',NULL,updated_at FROM prompts;
INSERT INTO library_versions (item_kind,item_id,version,kind,mode,name,body,author,restored_from,created_at)
  SELECT 'entry',id,1,category,mode,name,body,'you',NULL,updated_at FROM entries;
-- The project page's hand edits to the YouTube description, chapters, hashtags and tags. Each
-- field keeps the user's text and the generated text it was edited from, so a regenerated
-- description can tell whether the user changed that field. `links_json` holds this project's
-- own channel links (such as "Previous video"), which win over the Settings list.
CREATE TABLE youtube_description_edits (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  fields_json TEXT NOT NULL CHECK(json_valid(fields_json)),
  links_json TEXT NOT NULL CHECK(json_valid(links_json)),
  updated_at TEXT NOT NULL
);
