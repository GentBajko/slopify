import { z } from "zod";
import type { WorkRef } from "../../kernel/runner/work.js";
import type { RevisionDeps } from "../revisions/model.js";
import { projectSelected } from "../revisions/projection.js";
import { getRevisionView } from "../revisions/view.js";
import { bindNarrationReuse, narrationOrdinal } from "./runtime-narration-reuse.js";
import { executionPlan, savedCatalogue } from "./runtime-plan.js";
import type { WorkPiece } from "./work-records.js";

export function rebindPublishedNarration(
  deps: RevisionDeps,
  work: WorkRef,
  piece: WorkPiece,
): void {
  if (piece.input.kind !== "tts") return;
  const targets = deps.db
    .prepare(
      "SELECT revision_id FROM revision_pieces WHERE project_id=? AND publication_id=? AND piece_key=? AND selected=1 AND revision_id!=?",
    )
    .all(work.projectId, piece.id, piece.key, work.revisionId);
  if (targets.length === 0) return;
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(work.workId);
  const catalogue = savedCatalogue(row?.recipe_context);
  for (const target of targets) {
    const view = getRevisionView(deps, work.projectId, z.string().parse(target.revision_id));
    if (view === undefined) continue;
    const plan = executionPlan(deps, view, catalogue);
    const recipe = plan.recipes.find(
      (value) => value.key === piece.key && value.fingerprint === piece.fingerprint,
    );
    if (recipe === undefined || recipe.unresolved || recipe.deferred) continue;
    bindNarrationReuse(deps, view, recipe, narrationOrdinal(plan.recipes, recipe.key));
    if (view.current) projectSelected(deps.db, view.revision);
  }
}
