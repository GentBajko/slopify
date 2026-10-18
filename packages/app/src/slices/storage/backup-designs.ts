import type { DatabaseSync } from "node:sqlite";
import { rowsOf } from "./backup-export.js";
import type { BackupRow } from "./backup-format.js";

// Designs and design templates in a backup's library part. Their pictures travel with every
// other picture in image_blobs; the files drawn from them are a cache and never travel.

export const designTables = [
  "designs",
  "design_steps",
  "design_templates",
  "design_template_revisions",
  "design_template_samples",
] as const;

export function exportDesigns(
  db: DatabaseSync,
  put: (table: (typeof designTables)[number], rows: BackupRow[]) => void,
): void {
  put("designs", rowsOf(db, "SELECT * FROM designs ORDER BY rowid"));
  put("design_steps", rowsOf(db, "SELECT * FROM design_steps ORDER BY design_id, n"));
  put("design_templates", rowsOf(db, "SELECT * FROM design_templates ORDER BY rowid"));
  put(
    "design_template_revisions",
    rowsOf(db, "SELECT * FROM design_template_revisions ORDER BY template_id, version"),
  );
  put(
    "design_template_samples",
    rowsOf(db, "SELECT * FROM design_template_samples ORDER BY rowid"),
  );
}

export interface DesignCounts {
  readonly added: number;
  readonly skipped: number;
}

// The project a design links to, when the one here is the backup's own (it came in with this
// import, or with an earlier one: same id, same creation time); a different project that only
// shares the id is not linked.
function sameProject(db: DatabaseSync, scratch: DatabaseSync, id: unknown): string | null {
  if (typeof id !== "string") return null;
  const here = db.prepare("SELECT created_at FROM projects WHERE id=?").get(id);
  const there = scratch.prepare("SELECT created_at FROM projects WHERE id=?").get(id);
  return here !== undefined && there !== undefined && here.created_at === there.created_at
    ? id
    : null;
}

// Added beside what is here: a design or template this install already has (same id) is kept
// as it is. A picture the other install was still making never lands here; a sample job it was
// running starts over.
export function mergeDesigns(
  db: DatabaseSync,
  scratch: DatabaseSync,
  insert: (table: string, row: BackupRow) => void,
): { readonly designs: DesignCounts; readonly templates: DesignCounts } {
  const has = (sql: string, id: string): boolean => db.prepare(sql).get(id) !== undefined;
  const templates = { added: 0, skipped: 0 };
  for (const row of rowsOf(scratch, "SELECT * FROM design_templates ORDER BY rowid")) {
    const id = String(row.id);
    if (has("SELECT 1 FROM design_templates WHERE id=?", id)) {
      templates.skipped += 1;
      continue;
    }
    insert("design_templates", row);
    for (const revision of rowsOf(
      scratch,
      "SELECT * FROM design_template_revisions WHERE template_id=? ORDER BY version",
      id,
    ))
      insert("design_template_revisions", revision);
    templates.added += 1;
  }
  const designs = { added: 0, skipped: 0 };
  for (const row of rowsOf(scratch, "SELECT * FROM designs ORDER BY rowid")) {
    const id = String(row.id);
    // A template's hidden sample is not one of the person's designs, so it isn't counted.
    if (has("SELECT 1 FROM designs WHERE id=?", id)) {
      if (row.sample_of === null) designs.skipped += 1;
      continue;
    }
    insert("designs", { ...row, project_id: sameProject(db, scratch, row.project_id) });
    for (const step of rowsOf(
      scratch,
      "SELECT * FROM design_steps WHERE design_id=? ORDER BY n",
      id,
    ))
      insert(
        "design_steps",
        step.state === "making"
          ? {
              ...step,
              state: "failed",
              error: "Stopped by the backup. Press Try again.",
              settled_at: step.created_at ?? null,
            }
          : step,
      );
    if (row.sample_of === null) designs.added += 1;
  }
  for (const row of rowsOf(scratch, "SELECT * FROM design_template_samples ORDER BY rowid"))
    if (
      has("SELECT 1 FROM design_templates WHERE id=?", String(row.template_id)) &&
      !has("SELECT 1 FROM design_template_samples WHERE template_id=?", String(row.template_id))
    )
      insert("design_template_samples", row.state === "making" ? { ...row, state: "queued" } : row);
  return { designs, templates };
}
