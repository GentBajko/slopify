// Renaming a Library prompt or intro/outro. Everything names the Library by name, so a rename
// rewrites the name where a future run reads it: each live template's current version (its
// form and the copy it saved of the Library) and every Play draft still being edited.
// Schedules run their template as it is now, so they follow. A project revision is the record
// of what its run used and keeps the old name; "Used by" finds it through `formerNames`.

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { LibraryItemKind } from "./history.js";
import { type LibraryRef, renamedIn } from "./used-by.js";

const documentRow = z.object({ key: z.string(), version: z.number(), document_json: z.string() });

// The template document or Play draft document with the form, and the Library copy it saved,
// naming `to`; undefined when neither named the old name.
function renamedDocument(
  json: string,
  ref: LibraryRef,
  id: string,
  to: string,
): string | undefined {
  const document: unknown = JSON.parse(json);
  if (typeof document !== "object" || document === null) return undefined;
  const next = { ...(document as Record<string, unknown>) };
  let changed = false;
  const form = renamedIn(next.form, ref, to);
  if (form !== undefined) {
    next.form = form;
    changed = true;
  }
  const snapshot = renamedSnapshot(next.librarySnapshot, ref, id, to);
  if (snapshot !== undefined) {
    next.librarySnapshot = snapshot;
    changed = true;
  }
  return changed ? JSON.stringify(next) : undefined;
}

// The saved copy of a renamed item is found by the new name once the Library row is gone.
function renamedSnapshot(
  value: unknown,
  ref: LibraryRef,
  id: string,
  to: string,
): unknown | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const snapshot = value as Record<string, unknown>;
  const listKey = ref.item === "prompt" ? "prompts" : "entries";
  const rows = snapshot[listKey];
  if (!Array.isArray(rows)) return undefined;
  const from = ref.name.trim().toLowerCase();
  let changed = false;
  const next = rows.map((row: unknown) => {
    if (typeof row !== "object" || row === null) return row;
    const one = row as Record<string, unknown>;
    const sameKind = ref.item === "prompt" ? one.kind === ref.kind : one.category === ref.category;
    const named = typeof one.name === "string" && one.name.trim().toLowerCase() === from;
    if (!sameKind || one.name === to || (one.id !== id && !named)) return row;
    changed = true;
    return { ...one, name: to };
  });
  return changed ? { ...snapshot, [listKey]: next } : undefined;
}

// Runs inside the save's transaction, so the rename and the rewritten references land
// together or not at all.
export function renameReferences(db: DatabaseSync, ref: LibraryRef, id: string, to: string): void {
  if (ref.name === to) return;
  const templates = db
    .prepare(
      `SELECT t.id AS key,r.version,r.document_json FROM project_templates t
       JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE t.deleted_at IS NULL`,
    )
    .all()
    .map((row) => documentRow.parse(row));
  const updateTemplate = db.prepare(
    "UPDATE project_template_revisions SET document_json=? WHERE template_id=? AND version=?",
  );
  for (const row of templates) {
    const next = renamedDocument(row.document_json, ref, id, to);
    if (next !== undefined) updateTemplate.run(next, row.key, row.version);
  }
  const drafts = db
    .prepare("SELECT id AS key,version,document_json FROM play_drafts WHERE state='active'")
    .all()
    .map((row) => documentRow.parse(row));
  const updateDraft = db.prepare("UPDATE play_drafts SET document_json=? WHERE id=?");
  for (const row of drafts) {
    const next = renamedDocument(row.document_json, ref, id, to);
    if (next !== undefined) updateDraft.run(next, row.key);
  }
}

// The names an item had before, other than its current one, that no other live item of the
// same kind or category holds now.
export function formerNames(
  db: DatabaseSync,
  itemKind: LibraryItemKind,
  id: string,
  current: string,
): readonly string[] {
  const table = itemKind === "prompt" ? "prompts" : "entries";
  const group = itemKind === "prompt" ? "kind" : "category";
  const rows = db
    .prepare(
      `SELECT DISTINCT v.name FROM library_versions v
       WHERE v.item_kind=? AND v.item_id=? AND lower(v.name)<>lower(?)
       AND NOT EXISTS (
         SELECT 1 FROM ${table} o WHERE o.id<>v.item_id AND o.${group}=v.kind
         AND lower(o.name)=lower(v.name) AND o.deleted_at IS NULL)`,
    )
    .all(itemKind, id, current);
  return rows.map((row) => z.object({ name: z.string() }).parse(row).name);
}
