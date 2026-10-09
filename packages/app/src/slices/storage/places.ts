import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Paths, Places } from "../../kernel/paths.js";

// Where each project's folder and files are on disk (migration 0054). Stored paths never
// change, in the database or in a backup; `layout.ts` asks this where one is now. Read on
// every file access, so the rows are held in memory and changed only through `moves`.
export interface ProjectPlaces extends Places {
  // Records a move before it happens ('moving'), then marks it done or takes it back.
  readonly moves: PlaceMoves;
  // Every stored path moved somewhere, with its place.
  placesOf(projectId: string): ReadonlyMap<string, string>;
  // Forgets a deleted project's rows (the database drops them with the project).
  forget(projectId: string): void;
}

export interface PlaceMoves {
  folder(projectId: string, folder: string, previous: string | undefined): void;
  folderDone(projectId: string): void;
  folderUndone(projectId: string): void;
  file(projectId: string, path: string, place: string, previous: string | undefined): void;
  fileDone(projectId: string, path: string): void;
  fileUndone(projectId: string, path: string): void;
  arranged(projectId: string, key: string): void;
  arrangedKey(projectId: string): string | undefined;
}

interface Folder {
  folder: string;
  previous: string | undefined;
  state: "moving" | "placed";
  arranged: string | undefined;
}
interface Place {
  place: string;
  previous: string | undefined;
  state: "moving" | "placed";
}

export function createPlaces(db: DatabaseSync): ProjectPlaces {
  const folders = new Map<string, Folder>();
  const files = new Map<string, Map<string, Place>>();
  const stored = new Map<string, Map<string, string>>();
  for (const row of db.prepare("SELECT * FROM project_folders").all())
    folders.set(String(row.project_id), {
      folder: String(row.folder),
      previous: row.previous === null ? undefined : String(row.previous),
      state: row.state === "moving" ? "moving" : "placed",
      arranged: row.arranged === null ? undefined : String(row.arranged),
    });
  for (const row of db.prepare("SELECT * FROM file_places").all())
    setFile(String(row.project_id), String(row.path), {
      place: String(row.place),
      previous: row.previous === null ? undefined : String(row.previous),
      state: row.state === "moving" ? "moving" : "placed",
    });

  function setFile(projectId: string, path: string, place: Place | undefined): void {
    let own = files.get(projectId);
    let back = stored.get(projectId);
    const old = own?.get(path);
    if (old !== undefined) back?.delete(old.place.toLowerCase());
    if (place === undefined) {
      own?.delete(path);
      return;
    }
    if (own === undefined) {
      own = new Map();
      files.set(projectId, own);
    }
    if (back === undefined) {
      back = new Map();
      stored.set(projectId, back);
    }
    own.set(path, place);
    back.set(place.place.toLowerCase(), path);
  }

  const moves: PlaceMoves = {
    folder(projectId, folder, previous) {
      db.prepare(
        `INSERT INTO project_folders(project_id,folder,previous,state) VALUES (?,?,?,'moving')
         ON CONFLICT(project_id) DO UPDATE SET folder=excluded.folder,previous=excluded.previous,state='moving'`,
      ).run(projectId, folder, previous ?? null);
      folders.set(projectId, {
        folder,
        previous,
        state: "moving",
        arranged: folders.get(projectId)?.arranged,
      });
    },
    folderDone(projectId) {
      db.prepare("UPDATE project_folders SET state='placed',previous=NULL WHERE project_id=?").run(
        projectId,
      );
      const row = folders.get(projectId);
      if (row !== undefined)
        folders.set(projectId, { ...row, state: "placed", previous: undefined });
    },
    folderUndone(projectId) {
      const row = folders.get(projectId);
      if (row?.previous === undefined) {
        db.prepare("DELETE FROM project_folders WHERE project_id=?").run(projectId);
        folders.delete(projectId);
        return;
      }
      db.prepare(
        "UPDATE project_folders SET folder=previous,previous=NULL,state='placed' WHERE project_id=?",
      ).run(projectId);
      folders.set(projectId, {
        ...row,
        folder: row.previous,
        previous: undefined,
        state: "placed",
      });
    },
    file(projectId, path, place, previous) {
      db.prepare(
        `INSERT INTO file_places(project_id,path,place,previous,state) VALUES (?,?,?,?,'moving')
         ON CONFLICT(project_id,path) DO UPDATE SET place=excluded.place,previous=excluded.previous,state='moving'`,
      ).run(projectId, path, place, previous ?? null);
      setFile(projectId, path, { place, previous, state: "moving" });
    },
    fileDone(projectId, path) {
      db.prepare(
        "UPDATE file_places SET state='placed',previous=NULL WHERE project_id=? AND path=?",
      ).run(projectId, path);
      const row = files.get(projectId)?.get(path);
      if (row !== undefined)
        setFile(projectId, path, { ...row, state: "placed", previous: undefined });
    },
    fileUndone(projectId, path) {
      const row = files.get(projectId)?.get(path);
      if (row?.previous === undefined || row.previous === path) {
        db.prepare("DELETE FROM file_places WHERE project_id=? AND path=?").run(projectId, path);
        setFile(projectId, path, undefined);
        return;
      }
      db.prepare(
        "UPDATE file_places SET place=previous,previous=NULL,state='placed' WHERE project_id=? AND path=?",
      ).run(projectId, path);
      setFile(projectId, path, { place: row.previous, previous: undefined, state: "placed" });
    },
    arranged(projectId, key) {
      db.prepare("UPDATE project_folders SET arranged=? WHERE project_id=?").run(key, projectId);
      const row = folders.get(projectId);
      if (row !== undefined) folders.set(projectId, { ...row, arranged: key });
    },
    arrangedKey(projectId) {
      return folders.get(projectId)?.arranged;
    },
  };

  return {
    // A move in flight still answers with where the file is until it is done.
    folderOf(projectId) {
      const row = folders.get(projectId);
      if (row === undefined) return undefined;
      return row.state === "moving" ? row.previous : row.folder;
    },
    placeOf(projectId, path) {
      const row = files.get(projectId)?.get(path);
      if (row === undefined) return undefined;
      return row.state === "moving" ? row.previous : row.place;
    },
    storedAt(projectId, place) {
      return stored.get(projectId)?.get(place.toLowerCase());
    },
    placesOf(projectId) {
      const own = files.get(projectId);
      const out = new Map<string, string>();
      for (const [path, row] of own ?? []) if (row.state === "placed") out.set(path, row.place);
      return out;
    },
    forget(projectId) {
      folders.delete(projectId);
      files.delete(projectId);
      stored.delete(projectId);
    },
    moves,
  };
}

// Settles moves a crash interrupted, from what is on disk: a move whose target exists and
// whose source doesn't happened; any other is taken back. Run before anything reads a file.
export function recoverPlaces(db: DatabaseSync, paths: Pick<Paths, "projects">): number {
  let settled = 0;
  for (const row of db.prepare("SELECT * FROM project_folders WHERE state='moving'").all()) {
    const id = String(row.project_id);
    const target = join(paths.projects, String(row.folder));
    const source = join(paths.projects, row.previous === null ? id : String(row.previous));
    if (existsSync(target) && !existsSync(source))
      db.prepare("UPDATE project_folders SET state='placed',previous=NULL WHERE project_id=?").run(
        id,
      );
    else if (row.previous === null)
      db.prepare("DELETE FROM project_folders WHERE project_id=?").run(id);
    else
      db.prepare(
        "UPDATE project_folders SET folder=previous,previous=NULL,state='placed' WHERE project_id=?",
      ).run(id);
    settled += 1;
  }
  const folderOf = new Map(
    db
      .prepare("SELECT project_id,folder FROM project_folders")
      .all()
      .map((row) => [String(row.project_id), String(row.folder)] as const),
  );
  for (const row of db.prepare("SELECT * FROM file_places WHERE state='moving'").all()) {
    const id = String(row.project_id);
    const root = join(paths.projects, folderOf.get(id) ?? id);
    const path = String(row.path);
    const previous = row.previous === null ? path : String(row.previous);
    if (existsSync(join(root, String(row.place))) && !existsSync(join(root, previous)))
      db.prepare(
        "UPDATE file_places SET state='placed',previous=NULL WHERE project_id=? AND path=?",
      ).run(id, path);
    else if (row.previous === null || previous === path)
      db.prepare("DELETE FROM file_places WHERE project_id=? AND path=?").run(id, path);
    else
      db.prepare(
        "UPDATE file_places SET place=previous,previous=NULL,state='placed' WHERE project_id=? AND path=?",
      ).run(id, path);
    settled += 1;
  }
  return settled;
}
