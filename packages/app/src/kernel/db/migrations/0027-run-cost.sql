-- What every successful provider call used and cost, for the project's Run cost tab. The price
-- is worked out when the call lands and stored with the rates it used, so a later catalogue
-- change never rewrites what a finished run cost. A CLI call costs nothing on the user's plan
-- (`on_plan`); `api_cost` is what the same tokens would have cost through the API.
CREATE TABLE provider_usage (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 stage TEXT NOT NULL,
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
 created_at TEXT NOT NULL
);
CREATE INDEX provider_usage_project ON provider_usage(project_id, created_at);

-- The plan windows a CLI reported around a project's calls, in the order they arrived, so the
-- tab can say how much of the 5-hour and weekly allowance the run took.
CREATE TABLE plan_limit_readings (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 account TEXT NOT NULL,
 reading_json TEXT NOT NULL CHECK(json_valid(reading_json)),
 created_at TEXT NOT NULL
);
CREATE INDEX plan_limit_readings_project ON plan_limit_readings(project_id, created_at);

-- A CLI whose plan allowance is used up, until when. One row per account: every project's
-- calls to it wait on the same reset.
CREATE TABLE plan_limit_waits (
 account TEXT PRIMARY KEY,
 resets_at TEXT,
 retry_at TEXT NOT NULL,
 detected_at TEXT NOT NULL
);

-- The stages waiting on an account. They outlive a restart: the boot resumes these projects
-- instead of leaving the stage interrupted.
CREATE TABLE plan_limit_waiters (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 stage TEXT NOT NULL,
 account TEXT NOT NULL,
 since TEXT NOT NULL,
 PRIMARY KEY(project_id, stage, account)
);
