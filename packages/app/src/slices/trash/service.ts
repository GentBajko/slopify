import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { deleteVersions, recordVersion } from "../library/history.js";
import { nameMax } from "../library/model.js";
import { entryById, promptById } from "../library/repo.js";
import { deleteProject, projectBusy } from "../storage/delete-project.js";
import {
  type Restored,
  type TrashDeps,
  type TrashItem,
  type TrashKind,
  type TrashResult,
  trashKinds,
  trashMs,
} from "./model.js";

// Settings → Trash: what was deleted in the last 30 days, put back or removed for good.
//
// Each kind keeps its stamp where it lives: a project in `project_trash` (the projects table is
// read positionally in many places), a prompt, entry or template in its own `deleted_at`, and a
// schedule in the `deleted_at` it always had as the tombstone that keeps its run history. A
// schedule leaves the trash by getting `purged_at`; its row and history stay, as before.

const dayMs = 24 * 60 * 60_000;
// A template's name column allows this much (0008's CHECK on project_template_revisions).
const templateNameMax = 200;

const row = z.object({
  id: z.string(),
  name: z.string(),
  detail: z.string().nullable(),
  deleted_at: z.string(),
});

// Every kind in one statement, newest deletion first.
const trashedRows = `
  SELECT 'project' AS kind, p.id, p.title AS name, NULL AS detail, t.deleted_at
    FROM project_trash t JOIN projects p ON p.id = t.project_id
  UNION ALL SELECT 'prompt', id, name, kind, deleted_at FROM prompts WHERE deleted_at IS NOT NULL
  UNION ALL SELECT 'entry', id, name, category, deleted_at FROM entries WHERE deleted_at IS NOT NULL
  UNION ALL SELECT 'template', t.id, r.name, NULL, t.deleted_at
    FROM project_templates t
    JOIN project_template_revisions r ON r.template_id = t.id AND r.version = t.head_version
    WHERE t.deleted_at IS NOT NULL
  UNION ALL SELECT 'schedule', id, name, NULL, deleted_at FROM schedules
    WHERE deleted_at IS NOT NULL AND purged_at IS NULL`;

export function listTrash(deps: Pick<TrashDeps, "db" | "clock">): readonly TrashItem[] {
  const now = deps.clock.now().valueOf();
  return deps.db
    .prepare(`SELECT * FROM (${trashedRows}) ORDER BY deleted_at DESC, kind, id`)
    .all()
    .map((raw) => {
      const parsed = row.extend({ kind: z.enum(trashKinds) }).parse(raw);
      const purgeAt = Date.parse(parsed.deleted_at) + trashMs;
      return {
        kind: parsed.kind,
        id: parsed.id,
        name: parsed.name,
        detail: parsed.detail,
        deletedAt: parsed.deleted_at,
        purgeAt: new Date(purgeAt).toISOString(),
        daysLeft: Math.max(0, Math.ceil((purgeAt - now) / dayMs)),
      };
    });
}

// 07 Projects' Delete. Refused while the run is going, as removing it always was: the work
// has to be stopped by the user first. A project waiting its turn (a queued batch item, a
// checkpoint, work left over from a restart) simply stops being picked up: the runner holds a
// project in the trash like a paused one and the batch queue moves on past it.
export function trashProject(deps: TrashDeps, projectId: string): TrashResult<null> {
  return transact(deps.db, () => {
    const found = deps.db
      .prepare(
        "SELECT (SELECT 1 FROM project_trash t WHERE t.project_id = p.id) AS trashed FROM projects p WHERE p.id = ?",
      )
      .get(projectId);
    if (found === undefined || found.trashed === 1) return { ok: false, reason: "not-found" };
    if (projectBusy(deps, projectId)) return { ok: false, reason: "running" };
    deps.db
      .prepare("INSERT INTO project_trash (project_id, deleted_at) VALUES (?, ?)")
      .run(projectId, deps.clock.now().toISOString());
    return { ok: true, value: null };
  });
}

// Puts the item back where it was. A prompt, entry or template whose name a live one has
// taken meanwhile comes back as "Name (restored)", then "Name (restored 2)"…
//
// A schedule comes back paused with no next run, whatever it was when deleted (only a
// canceled or completed one can be deleted): nothing runs until Resume is pressed on
// Schedules, which picks the next occurrence from then. Its template must be live: one in the
// trash is restored first, and one removed for good leaves the schedule nothing to run.
export function restoreItem(
  deps: Pick<TrashDeps, "db" | "clock">,
  kind: TrashKind,
  id: string,
): TrashResult<Restored> {
  return transact(deps.db, () => {
    switch (kind) {
      case "project":
        return restoreProject(deps.db, id);
      case "prompt":
        return restoreLibrary(deps, "prompt", id);
      case "entry":
        return restoreLibrary(deps, "entry", id);
      case "template":
        return restoreTemplate(deps, id);
      case "schedule":
        return restoreSchedule(deps, id);
    }
  });
}

function restoreProject(db: DatabaseSync, id: string): TrashResult<Restored> {
  const found = db
    .prepare(
      "SELECT p.title FROM project_trash t JOIN projects p ON p.id = t.project_id WHERE t.project_id = ?",
    )
    .get(id);
  if (typeof found?.title !== "string") return { ok: false, reason: "not-found" };
  db.prepare("DELETE FROM project_trash WHERE project_id = ?").run(id);
  return { ok: true, value: { kind: "project", id, name: found.title, renamedFrom: null } };
}

function restoreLibrary(
  deps: Pick<TrashDeps, "db" | "clock">,
  itemKind: "prompt" | "entry",
  id: string,
): TrashResult<Restored> {
  const table = itemKind === "prompt" ? "prompts" : "entries";
  const group = itemKind === "prompt" ? "kind" : "category";
  const found = deps.db
    .prepare(`SELECT name, ${group} AS grp FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`)
    .get(id);
  if (typeof found?.name !== "string" || typeof found.grp !== "string")
    return { ok: false, reason: "not-found" };
  const taken = deps.db.prepare(
    `SELECT 1 FROM ${table} WHERE ${group} = ? AND lower(name) = lower(?) AND deleted_at IS NULL`,
  );
  const grp = found.grp;
  const name = freeName(
    found.name,
    nameMax,
    (candidate) => taken.get(grp, candidate) !== undefined,
  );
  const renamed = name !== found.name;
  deps.db
    .prepare(
      `UPDATE ${table} SET deleted_at = NULL, name = ?, updated_at = ${renamed ? "?" : "updated_at"} WHERE id = ?`,
    )
    .run(...(renamed ? [name, deps.clock.now().toISOString(), id] : [name, id]));
  // A rename shows in History as a version of its own.
  if (renamed) {
    const item = itemKind === "prompt" ? promptById(deps.db, id) : entryById(deps.db, id);
    if (item !== undefined) recordVersion(deps.db, itemKind, item);
  }
  return {
    ok: true,
    value: { kind: itemKind, id, name, renamedFrom: renamed ? found.name : null },
  };
}

function restoreTemplate(deps: Pick<TrashDeps, "db" | "clock">, id: string): TrashResult<Restored> {
  const found = deps.db
    .prepare(
      `SELECT r.name, r.version, r.document_json FROM project_templates t
       JOIN project_template_revisions r ON r.template_id = t.id AND r.version = t.head_version
       WHERE t.id = ? AND t.deleted_at IS NOT NULL`,
    )
    .get(id);
  if (
    typeof found?.name !== "string" ||
    typeof found.version !== "number" ||
    typeof found.document_json !== "string"
  )
    return { ok: false, reason: "not-found" };
  const taken = deps.db.prepare(
    `SELECT 1 FROM project_templates t
     JOIN project_template_revisions r ON r.template_id = t.id AND r.version = t.head_version
     WHERE t.deleted_at IS NULL AND lower(r.name) = lower(?)`,
  );
  const name = freeName(
    found.name,
    templateNameMax,
    (candidate) => taken.get(candidate) !== undefined,
  );
  deps.db.prepare("UPDATE project_templates SET deleted_at = NULL WHERE id = ?").run(id);
  // A rename is a new version, as a rename in the template editor is; the versions a schedule
  // or a draft names stay as they were.
  if (name !== found.name) {
    const version = found.version + 1;
    deps.db
      .prepare(
        "INSERT INTO project_template_revisions(template_id,version,name,document_json,created_at) VALUES (?,?,?,?,?)",
      )
      .run(id, version, name, found.document_json, deps.clock.now().toISOString());
    deps.db.prepare("UPDATE project_templates SET head_version = ? WHERE id = ?").run(version, id);
  }
  return {
    ok: true,
    value: {
      kind: "template",
      id,
      name,
      renamedFrom: name === found.name ? null : found.name,
    },
  };
}

function restoreSchedule(deps: Pick<TrashDeps, "db" | "clock">, id: string): TrashResult<Restored> {
  const found = deps.db
    .prepare(
      `SELECT s.name, s.template_id,
        (SELECT t.deleted_at IS NOT NULL FROM project_templates t WHERE t.id = s.template_id) AS trashed
       FROM schedules s WHERE s.id = ? AND s.deleted_at IS NOT NULL AND s.purged_at IS NULL`,
    )
    .get(id);
  if (typeof found?.name !== "string") return { ok: false, reason: "not-found" };
  if (found.trashed === null) return { ok: false, reason: "template-gone" };
  if (found.trashed === 1) return { ok: false, reason: "template-in-trash" };
  const at = deps.clock.now().toISOString();
  deps.db
    .prepare(
      `UPDATE schedules SET deleted_at = NULL, status = 'paused', next_run_at = NULL,
       version = version + 1, updated_at = ? WHERE id = ?`,
    )
    .run(at, id);
  return { ok: true, value: { kind: "schedule", id, name: found.name, renamedFrom: null } };
}

// "Delete now": removes one item for good. A project's folder goes first, then its rows
// (`slices/storage/delete-project.ts`); a folder that will not go leaves it in the trash.
export function deleteNow(deps: TrashDeps, kind: TrashKind, id: string): TrashResult<null> {
  switch (kind) {
    case "project": {
      if (deps.db.prepare("SELECT 1 FROM project_trash WHERE project_id = ?").get(id) === undefined)
        return { ok: false, reason: "not-found" };
      const removed = deleteProject(deps, id);
      if (removed.ok) return { ok: true, value: null };
      return {
        ok: false,
        reason: removed.reason === "no-project" ? "not-found" : removed.reason,
        ...(removed.detail === undefined ? {} : { detail: removed.detail }),
      };
    }
    case "prompt":
    case "entry":
      return transact(deps.db, () => {
        const table = kind === "prompt" ? "prompts" : "entries";
        const changed = deps.db
          .prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`)
          .run(id).changes;
        if (Number(changed) === 0) return { ok: false, reason: "not-found" };
        deleteVersions(deps.db, kind, id);
        return { ok: true, value: null };
      });
    case "template": {
      // Revisions cascade. A schedule in the trash may still name it: that schedule can then
      // no longer be restored (`restoreSchedule`), only removed.
      const changed = deps.db
        .prepare("DELETE FROM project_templates WHERE id = ? AND deleted_at IS NOT NULL")
        .run(id).changes;
      return Number(changed) === 0 ? { ok: false, reason: "not-found" } : { ok: true, value: null };
    }
    case "schedule": {
      // Gone from the trash; the row stays as the history Schedules lists under Deleted.
      const changed = deps.db
        .prepare(
          "UPDATE schedules SET purged_at = ? WHERE id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL",
        )
        .run(deps.clock.now().toISOString(), id).changes;
      return Number(changed) === 0 ? { ok: false, reason: "not-found" } : { ok: true, value: null };
    }
  }
}

export interface PurgeReport {
  readonly removed: number;
  // Left for the next purge: a project folder the OS would not let go of.
  readonly kept: number;
}

// The daily purge: everything deleted more than 30 days ago goes for good. A failure on one
// item is logged and leaves it for the next pass; the rest still go.
export function purgeExpired(deps: TrashDeps): PurgeReport {
  const cutoff = new Date(deps.clock.now().valueOf() - trashMs).toISOString();
  let removed = 0;
  let kept = 0;
  for (const item of listTrash(deps)) {
    if (item.deletedAt > cutoff) continue;
    const result = deleteNow(deps, item.kind, item.id);
    if (result.ok) removed++;
    else {
      kept++;
      deps.log.write("warn", "trash.purge", {
        ...(item.kind === "project" ? { projectId: item.id } : {}),
        detail: `${item.kind} ${item.id}: ${result.detail ?? result.reason}`,
      });
    }
  }
  return { removed, kept };
}

export interface TrashPurge {
  // Purges when a day has passed since the last purge (or none has run since start); main.ts
  // looks hourly, so a machine that slept catches up. Answers what it did, or undefined.
  readonly tick: () => PurgeReport | undefined;
}

export function createTrashPurge(deps: TrashDeps): TrashPurge {
  let last: number | undefined;
  return {
    tick: () => {
      const now = deps.clock.now().valueOf();
      if (last !== undefined && now - last < dayMs) return undefined;
      last = now;
      return purgeExpired(deps);
    },
  };
}

// The name itself when free, else "Name (restored)", "Name (restored 2)"… cut to fit `max`.
export function freeName(name: string, max: number, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? " (restored)" : ` (restored ${String(n)})`;
    const candidate = `${name.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
}
