// Prompt history: every save of a Library prompt or intro/outro keeps a version, and History
// lists, compares and restores them. A version is the whole saved row - name, body, kind and
// mode - so restoring one puts back exactly what was saved then.

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Entry, EntryMode, Prompt } from "./model.js";
import { entryModes } from "./model.js";

export const libraryItemKinds = ["prompt", "entry"] as const;
export type LibraryItemKind = (typeof libraryItemKinds)[number];

// Saves come from this one-user app, so every version is the user's. The column exists so a
// version written by something else (an import, a future automatic update) can say so.
export const versionAuthor = "you";

export interface LibraryVersion {
  readonly version: number;
  readonly name: string;
  readonly body: string;
  // The prompt's kind, or the entry's category.
  readonly kind: string;
  // The entry's mode; null for a prompt.
  readonly mode: EntryMode | null;
  readonly author: string;
  // The version this one was restored from, when Restore made it.
  readonly restoredFrom: number | null;
  readonly createdAt: string;
}

const versionRow = z.object({
  version: z.number().int().positive(),
  kind: z.string(),
  mode: z.enum(entryModes).nullable(),
  name: z.string(),
  body: z.string(),
  author: z.string(),
  restored_from: z.number().int().nullable(),
  created_at: z.string(),
});

type Item = Prompt | Entry;

function kindOf(item: Item): string {
  return "kind" in item ? item.kind : item.category;
}

function modeOf(item: Item): EntryMode | null {
  return "mode" in item ? item.mode : null;
}

// Newest first: History opens on what is saved now.
export function listVersions(
  db: DatabaseSync,
  itemKind: LibraryItemKind,
  itemId: string,
): readonly LibraryVersion[] {
  return db
    .prepare(
      "SELECT version,kind,mode,name,body,author,restored_from,created_at FROM library_versions WHERE item_kind=? AND item_id=? ORDER BY version DESC",
    )
    .all(itemKind, itemId)
    .map((row) => toVersion(versionRow.parse(row)));
}

export function versionOf(
  db: DatabaseSync,
  itemKind: LibraryItemKind,
  itemId: string,
  version: number,
): LibraryVersion | undefined {
  const row = db
    .prepare(
      "SELECT version,kind,mode,name,body,author,restored_from,created_at FROM library_versions WHERE item_kind=? AND item_id=? AND version=?",
    )
    .get(itemKind, itemId, version);
  return row === undefined ? undefined : toVersion(versionRow.parse(row));
}

// Records the row as saved. A save that changed nothing (the editor's Save pressed twice, a
// restore of the version already current) adds no version, so History lists real changes only.
// A row with no versions at all - one a backup or a portable import wrote straight into the
// table - gets its saved text as version 1 before the new one, so History never starts from
// a version the user never saw.
export function recordVersion(
  db: DatabaseSync,
  itemKind: LibraryItemKind,
  item: Item,
  options: { readonly previous?: Item | undefined; readonly restoredFrom?: number } = {},
): void {
  const latest = listVersions(db, itemKind, item.id)[0];
  let next = (latest?.version ?? 0) + 1;
  if (latest === undefined && options.previous !== undefined && !same(options.previous, item)) {
    insert(db, itemKind, options.previous, 1, null, options.previous.updatedAt);
    next = 2;
  }
  if (latest !== undefined && sameAsVersion(latest, item)) return;
  insert(db, itemKind, item, next, options.restoredFrom ?? null, item.updatedAt);
}

export function deleteVersions(db: DatabaseSync, itemKind: LibraryItemKind, itemId: string): void {
  db.prepare("DELETE FROM library_versions WHERE item_kind=? AND item_id=?").run(itemKind, itemId);
}

// History for a row with no versions yet (written by an import): its saved text as version 1,
// said rather than stored, since reading must not write.
export function versionsOrCurrent(
  db: DatabaseSync,
  itemKind: LibraryItemKind,
  item: Item,
): readonly LibraryVersion[] {
  const versions = listVersions(db, itemKind, item.id);
  if (versions.length > 0) return versions;
  return [
    {
      version: 1,
      kind: kindOf(item),
      mode: modeOf(item),
      name: item.name,
      body: item.body,
      author: versionAuthor,
      restoredFrom: null,
      createdAt: item.updatedAt,
    },
  ];
}

function insert(
  db: DatabaseSync,
  itemKind: LibraryItemKind,
  item: Item,
  version: number,
  restoredFrom: number | null,
  createdAt: string,
): void {
  db.prepare(
    "INSERT INTO library_versions (item_kind,item_id,version,kind,mode,name,body,author,restored_from,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  ).run(
    itemKind,
    item.id,
    version,
    kindOf(item),
    modeOf(item),
    item.name,
    item.body,
    versionAuthor,
    restoredFrom,
    createdAt,
  );
}

function same(a: Item, b: Item): boolean {
  return (
    a.name === b.name && a.body === b.body && kindOf(a) === kindOf(b) && modeOf(a) === modeOf(b)
  );
}

function sameAsVersion(version: LibraryVersion, item: Item): boolean {
  return (
    version.name === item.name &&
    version.body === item.body &&
    version.kind === kindOf(item) &&
    version.mode === modeOf(item)
  );
}

function toVersion(row: z.infer<typeof versionRow>): LibraryVersion {
  return {
    version: row.version,
    kind: row.kind,
    mode: row.mode,
    name: row.name,
    body: row.body,
    author: row.author,
    restoredFrom: row.restored_from,
    createdAt: row.created_at,
  };
}
