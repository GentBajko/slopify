-- Readable project folders (3.14.0). A project's folder was its id and its files sat under
-- assets/<asset id>/, which nobody could find their way around. Each project now gets a
-- folder named after its title, and each file a place in it: Upload/ (the current version's
-- publishable files), Working/ (what they were made from) and History/<date>/ (older
-- versions). Every stored path (`assets/<id>/video.mp4`) stays as it is in every table and
-- archive; these two tables say where it is on disk (`slices/storage/places.ts`).
--
-- `state` is 'moving' between recording a move and finishing it, so a crash in between is
-- settled at the next start from what is on disk (`recoverPlaces`). `previous` is where the
-- file or folder was before, for that check.
CREATE TABLE project_folders (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  folder TEXT NOT NULL CHECK(length(folder) > 0),
  previous TEXT,
  state TEXT NOT NULL DEFAULT 'placed' CHECK(state IN ('moving','placed')),
  arranged TEXT
);
CREATE UNIQUE INDEX project_folders_folder ON project_folders(folder COLLATE NOCASE);
CREATE TABLE file_places (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  place TEXT NOT NULL,
  previous TEXT,
  state TEXT NOT NULL DEFAULT 'placed' CHECK(state IN ('moving','placed')),
  PRIMARY KEY(project_id, path)
);
CREATE UNIQUE INDEX file_places_place ON file_places(project_id, place COLLATE NOCASE);
