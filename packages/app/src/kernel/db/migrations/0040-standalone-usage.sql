-- What every successful provider call made outside a project used and cost: a schedule's
-- topic generation, a channel's episode summary and its cast pictures. provider_usage cannot
-- hold them, since each of its rows belongs to a project. Priced the same way when the call
-- lands. There is no link to the schedule or channel: deleting one keeps what it cost this
-- week. `channel_id` is the channel the call was made for, resolved when it landed, for Home's
-- channel filter. A CLI's plan windows reported around the call ride along (`account`,
-- `reading_json`), so Home's plan standings read them beside a project's.
CREATE TABLE standalone_usage (
 id TEXT PRIMARY KEY,
 owner_kind TEXT NOT NULL CHECK(owner_kind IN ('schedule','channel')),
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
CREATE INDEX standalone_usage_created ON standalone_usage(created_at);
