import { copyFileSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Catalogue } from "../../catalog/schema.js";
import { transact } from "../../kernel/db/tx.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { projectRows } from "../storage/backup-export.js";
import { type BackupRow, projectTables } from "../storage/backup-format.js";
import { projectDir } from "../storage/layout.js";

// "Make my own copy" of the sample: every row of the project and every file of its folder,
// under new ids, as an ordinary project the user may edit and rebuild.
//
// Ids are not only keys: a finished step's fingerprint covers the ids of the files it was made
// from (`resourceIdentity`), so new asset ids alone would make every step after the first look
// changed and a rebuild would redo - and pay for - all of it. So once the rows are in, the
// copy's plan is worked out again and each step the source had finished is re-stamped with the
// fingerprint the copy's own ids give it, a layer at a time until nothing changes. The copy
// then has nothing to rebuild, exactly like the source.

export interface CopyDeps extends RevisionDeps {
  readonly catalogue: Catalogue;
}

// ceiling: one pass per layer of the step graph (text, narration, timing, picks, prompts,
// images, renders); far more than any plan has.
const rebindPasses = 40;

export function copyProject(
  deps: CopyDeps,
  sourceId: string,
  title: string,
): { readonly projectId: string } {
  const source = projectDir(deps.paths, sourceId);
  const tables = projectTables.map(
    (table) => [table, projectRows(deps.db, table, sourceId)] as const,
  );
  const ids = new Map<string, string>([[sourceId, deps.ids.next()]]);
  for (const [, rows] of tables)
    for (const row of rows)
      for (const [column, value] of Object.entries(row))
        if (
          (column === "id" || column === "publication_id" || column === "admission_id") &&
          typeof value === "string" &&
          // ceiling: every id Slopify makes is a 26-character ULID or a 36-character UUID; a
          // shorter value could match inside unrelated text.
          value.length >= 16 &&
          !ids.has(value)
        )
          ids.set(value, deps.ids.next());
  const pattern = new RegExp(
    [...ids.keys()]
      .toSorted((left, right) => right.length - left.length)
      .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g",
  );
  const remap = (text: string): string => text.replace(pattern, (id) => ids.get(id) ?? id);
  const projectId = ids.get(sourceId) ?? sourceId;
  const target = projectDir(deps.paths, projectId);
  const at = deps.clock.now().toISOString();
  try {
    for (const file of listFiles(source)) {
      const to = join(target, remap(file));
      mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
      copyFileSync(join(source, file), to);
    }
    transact(deps.db, () => {
      deps.db.exec("PRAGMA defer_foreign_keys = ON");
      for (const [table, rows] of tables)
        for (const row of rows) {
          const copied: BackupRow = Object.fromEntries(
            Object.entries(row).map(([column, value]) => [
              column,
              typeof value === "string" ? remap(value) : value,
            ]),
          );
          insert(
            deps.db,
            table,
            table === "projects" ? { ...copied, title, created_at: at, updated_at: at } : copied,
          );
        }
      rebind(deps, projectId);
    });
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
  return { projectId };
}

// Re-stamps the copy's finished steps with the fingerprints its own ids give them.
function rebind(deps: CopyDeps, projectId: string): void {
  const revisionId = currentRevisionId(deps.db, projectId);
  if (revisionId === undefined) return;
  for (let pass = 0; pass < rebindPasses; pass++) {
    const view = getRevisionView(deps, projectId, revisionId);
    if (view === undefined) return;
    const plan = executionPlan(deps, view, deps.catalogue);
    const changes = new Map<string, string>();
    for (const change of plan.changedInputs)
      if (change.before !== null && change.after !== null && change.before !== change.after)
        changes.set(change.before, change.after);
    // A finished piece also records the request it answered, which covers the same ids.
    for (const recipe of plan.recipes)
      for (const piece of view.pieces)
        if (piece.selected && piece.key === recipe.key && piece.piece.payload !== null) {
          const request = requestOf(piece.piece.payload);
          if (
            request !== undefined &&
            recipe.requestFingerprint !== null &&
            request !== recipe.requestFingerprint
          )
            changes.set(request, recipe.requestFingerprint);
        }
    if (changes.size === 0) {
      deps.db
        .prepare("UPDATE project_revisions SET fingerprints=? WHERE id=?")
        .run(
          JSON.stringify(Object.fromEntries(plan.recipes.map((row) => [row.key, row.fingerprint]))),
          revisionId,
        );
      return;
    }
    for (const [before, after] of changes)
      for (const [table, column] of [
        ["revision_outputs", "fingerprint"],
        ["revision_pieces", "fingerprint"],
        ["revision_outputs", "descriptor"],
        ["revision_pieces", "descriptor"],
        ["project_revisions", "content"],
      ] as const)
        deps.db
          .prepare(
            `UPDATE ${table} SET ${column}=replace(${column},?,?) WHERE project_id=? AND instr(${column},?)>0`,
          )
          .run(before, after, projectId, before);
  }
  throw new Error(
    "Slopify hit an internal error (the copy of the sample kept changing while its steps were matched up). Delete the copy and try Make my own copy again; if it happens again, use Download diagnostics in Settings and report it.",
  );
}

function requestOf(payload: string): string | undefined {
  try {
    const value: unknown = JSON.parse(payload);
    return typeof value === "object" &&
      value !== null &&
      "requestFingerprint" in value &&
      typeof value.requestFingerprint === "string"
      ? value.requestFingerprint
      : undefined;
  } catch {
    return undefined;
  }
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (directory: string): void => {
    let names: string[];
    try {
      names = readdirSync(directory);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) out.push(relative(root, path).split(sep).join("/"));
    }
  };
  walk(root);
  return out;
}

function insert(db: DatabaseSync, table: string, row: BackupRow): void {
  const columns = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
  ).run(...columns.map((column): SQLInputValue => row[column] ?? null));
}
