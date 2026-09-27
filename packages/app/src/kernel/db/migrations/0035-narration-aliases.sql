-- Library → Aliases: words the narrator says differently from how they are written ("Dr." as
-- "Doctor"). A project keeps its own copy of the list it started with, so nothing references
-- these rows and editing them never changes a project behind its back. `position` is the
-- order the editor shows them in.
CREATE TABLE narration_aliases (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  written TEXT NOT NULL CHECK (length(trim(written)) > 0),
  spoken TEXT NOT NULL CHECK (length(trim(spoken)) > 0),
  whole_word INTEGER NOT NULL CHECK (whole_word IN (0, 1)),
  case_sensitive INTEGER NOT NULL CHECK (case_sensitive IN (0, 1)),
  updated_at TEXT NOT NULL
);
