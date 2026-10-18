-- What Settings → Models and the pickers know about each model for the person's own key or
-- CLI login (`slices/model-checks`): whether the key's live list names it, and the last check
-- or real run's verdict. Only pickers read it; no run does. `account` is the key generation or
-- the CLI's id, so a new key starts every row over.
CREATE TABLE model_checks (
 provider TEXT NOT NULL,
 family TEXT NOT NULL CHECK (family IN ('llm','tts','image')),
 model TEXT NOT NULL,
 account TEXT NOT NULL,
 listed INTEGER CHECK (listed IN (0,1)),
 listed_at TEXT,
 verdict TEXT CHECK (verdict IN ('works','no-access','failed')),
 verdict_source TEXT CHECK (verdict_source IN ('check','run')),
 sentence TEXT,
 checked_at TEXT,
 cost REAL NOT NULL DEFAULT 0,
 first_works_at TEXT,
 notice_seen INTEGER NOT NULL DEFAULT 0 CHECK (notice_seen IN (0,1)),
 PRIMARY KEY(provider, family, model)
);
