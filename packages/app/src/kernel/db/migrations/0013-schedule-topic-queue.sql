-- A schedule's items became a queue of topics: each run fills one template keyword with the
-- first topic and the rest of the keywords with fixed values.
ALTER TABLE schedules ADD COLUMN topic_keyword TEXT;
ALTER TABLE schedules ADD COLUMN values_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(values_json));
