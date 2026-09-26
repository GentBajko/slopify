-- Document themes saved in Library → Documents. A project keeps its own copy of the values
-- it was given, so nothing references these rows and a delete never cascades.
CREATE TABLE document_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  values_json TEXT NOT NULL CHECK (json_valid(values_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX document_themes_name ON document_themes(lower(name));
