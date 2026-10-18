import { transact } from "../../kernel/db/tx.js";
import { deleteRenders } from "../designs/render.js";
import type { Restored, TrashDeps, TrashResult } from "./model.js";

// Designs and design templates in the trash. A design keeps its stamp in its own `deleted_at`;
// removing it for good removes its versions (they cascade) and every file drawn from it. The
// pictures stay in image_blobs, as a cast member's do: a schedule run or another design may
// still name them. A template's hidden sample goes with the template.

export function trashDesign(deps: Pick<TrashDeps, "db" | "clock">, id: string): TrashResult<null> {
  const changed = deps.db
    .prepare(
      "UPDATE designs SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL AND sample_of IS NULL",
    )
    .run(deps.clock.now().toISOString(), deps.clock.now().toISOString(), id).changes;
  return Number(changed) === 0 ? { ok: false, reason: "not-found" } : { ok: true, value: null };
}

export function trashDesignTemplate(
  deps: Pick<TrashDeps, "db" | "clock">,
  id: string,
): TrashResult<null> {
  const changed = deps.db
    .prepare("UPDATE design_templates SET deleted_at=? WHERE id=? AND deleted_at IS NULL")
    .run(deps.clock.now().toISOString(), id).changes;
  return Number(changed) === 0 ? { ok: false, reason: "not-found" } : { ok: true, value: null };
}

export function restoreDesign(
  deps: Pick<TrashDeps, "db" | "clock">,
  id: string,
): TrashResult<Restored> {
  const found = deps.db
    .prepare("SELECT name FROM designs WHERE id=? AND deleted_at IS NOT NULL")
    .get(id);
  if (typeof found?.name !== "string") return { ok: false, reason: "not-found" };
  deps.db
    .prepare("UPDATE designs SET deleted_at=NULL, updated_at=? WHERE id=?")
    .run(deps.clock.now().toISOString(), id);
  return { ok: true, value: { kind: "design", id, name: found.name, renamedFrom: null } };
}

export function restoreDesignTemplate(
  deps: Pick<TrashDeps, "db">,
  id: string,
): TrashResult<Restored> {
  const found = deps.db
    .prepare(
      `SELECT r.name FROM design_templates t
       JOIN design_template_revisions r ON r.template_id = t.id AND r.version = t.head_version
       WHERE t.id=? AND t.deleted_at IS NOT NULL`,
    )
    .get(id);
  if (typeof found?.name !== "string") return { ok: false, reason: "not-found" };
  deps.db.prepare("UPDATE design_templates SET deleted_at=NULL WHERE id=?").run(id);
  return { ok: true, value: { kind: "design-template", id, name: found.name, renamedFrom: null } };
}

export function deleteDesignNow(deps: TrashDeps, id: string): TrashResult<null> {
  const changed = deps.db
    .prepare("DELETE FROM designs WHERE id=? AND deleted_at IS NOT NULL")
    .run(id).changes;
  if (Number(changed) === 0) return { ok: false, reason: "not-found" };
  deleteRenders(deps.paths, id);
  return { ok: true, value: null };
}

export function deleteDesignTemplateNow(deps: TrashDeps, id: string): TrashResult<null> {
  const samples = transact(deps.db, () => {
    const changed = deps.db
      .prepare("DELETE FROM design_templates WHERE id=? AND deleted_at IS NOT NULL")
      .run(id).changes;
    if (Number(changed) === 0) return undefined;
    const ids = deps.db
      .prepare("SELECT id FROM designs WHERE sample_of=?")
      .all(id)
      .map((row) => String(row.id));
    deps.db.prepare("DELETE FROM designs WHERE sample_of=?").run(id);
    return ids;
  });
  if (samples === undefined) return { ok: false, reason: "not-found" };
  for (const sample of samples) deleteRenders(deps.paths, sample);
  return { ok: true, value: null };
}

export const trashedDesignRows = `
  UNION ALL SELECT 'design', id, name, kind, deleted_at FROM designs
    WHERE deleted_at IS NOT NULL AND sample_of IS NULL
  UNION ALL SELECT 'design-template', t.id, r.name, NULL, t.deleted_at
    FROM design_templates t
    JOIN design_template_revisions r ON r.template_id = t.id AND r.version = t.head_version
    WHERE t.deleted_at IS NOT NULL`;
