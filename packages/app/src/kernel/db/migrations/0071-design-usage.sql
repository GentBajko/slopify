-- A design's picture edits and artwork are paid calls made outside a project, metered like a
-- schedule's or a channel's (0040). Every row is copied as it was; only the owner kinds widen.
CREATE TABLE standalone_usage_next (
 id TEXT PRIMARY KEY,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('schedule','channel','design')),
 owner_id TEXT NOT NULL,
 channel_id TEXT NOT NULL,
 purpose TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('llm','tts','image','video')),
 provider TEXT NOT NULL,
 model TEXT NOT NULL,
 tokens_in INTEGER,
 tokens_out INTEGER,
 tokens_cached INTEGER,
 characters INTEGER,
 images INTEGER,
 seconds REAL,
 size TEXT,
 quality TEXT,
 wall_ms INTEGER NOT NULL,
 on_plan INTEGER NOT NULL DEFAULT 0 CHECK(on_plan IN (0,1)),
 cost REAL,
 api_model TEXT,
 api_cost REAL,
 price_json TEXT CHECK(price_json IS NULL OR json_valid(price_json)),
 account TEXT,
 reading_json TEXT CHECK(reading_json IS NULL OR json_valid(reading_json)),
 created_at TEXT NOT NULL
);
INSERT INTO standalone_usage_next SELECT id, owner_kind, owner_id, channel_id, purpose, kind, provider, model, tokens_in, tokens_out, tokens_cached, characters, images, seconds, size, quality, wall_ms, on_plan, cost, api_model, api_cost, price_json, account, reading_json, created_at FROM standalone_usage ORDER BY rowid;
DROP TABLE standalone_usage;
ALTER TABLE standalone_usage_next RENAME TO standalone_usage;
CREATE INDEX standalone_usage_created ON standalone_usage(created_at);
