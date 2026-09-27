import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { recipeInputSchema } from "./recipe-input-schema.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { insertInvocation } from "./runtime-admission.js";
import { bindNarrationReuse, narrationOrdinal } from "./runtime-narration-reuse.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import { workPieces } from "./work-records.js";

const reservation = z.object({
  revision_id: z.string(),
  work_id: z.string(),
  work_key: z.string(),
  fingerprint: z.string(),
  logical_key: z.string().nullable(),
  desired_fingerprint: z.string().nullable(),
  origin_revision: z.string(),
  recipe_context: z.string(),
  admission_id: z.string().nullable(),
});
type Reservation = z.infer<typeof reservation>;

export function materializeAdmittedWork(deps: RevisionDeps, projectId: string): void {
  transact(deps.db, () => {
    const head = currentRevisionId(deps.db, projectId);
    if (head === undefined) return;
    const reservations = deps.db
      .prepare(
        `SELECT r.*,w.revision_id AS origin_revision,w.recipe_context,w.admission_id FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.project_id=? AND r.revision_id=? AND w.dispatch_state='allowed' AND w.recipe_context IS NOT NULL`,
      )
      .all(projectId, head)
      .map((row) => reservation.parse(row));
    const origins = new Map(reservations.map((row) => [row.origin_revision, row]));
    for (const origin of origins.values()) {
      const view = executionView(deps, projectId, origin.origin_revision);
      if (view === undefined) continue;
      const catalogue = savedCatalogue(origin.recipe_context);
      const plan = executionPlan(deps, view, catalogue);
      for (const recipe of plan.recipes) {
        if (!plan.work.some((row) => row.key === recipe.key)) continue;
        if (recipe.deferred || recipe.unresolved) continue;
        if (recipe.input.kind === "tts") {
          const current = getRevisionView(deps, projectId, head);
          const desired = current?.revision.fingerprints[`${recipe.input.logicalKey}:1`];
          if (desired !== undefined && desired !== recipe.logicalFingerprint) continue;
        }
        const own = reservations.find(
          (row) => row.work_key === recipe.key && row.origin_revision === origin.origin_revision,
        );
        if (own?.fingerprint === recipe.fingerprint) continue;
        const anchor =
          own ??
          reservations.find(
            (row) =>
              row.origin_revision === origin.origin_revision && row.work_key === futureKey(recipe),
          );
        if (anchor === undefined || !desiredAnchor(deps, projectId, head, anchor)) continue;
        if (
          own !== undefined &&
          workPieces(deps.db, own.work_id).some(
            (piece) => piece.submittedAt !== null || piece.state === "done",
          )
        )
          continue;
        if (plan.work.find((row) => row.key === recipe.key)?.disposition === "review") continue;
        // A step waiting on its inputs changes fingerprint each time one lands: every
        // narration chunk moves the joined audio, the timing, the export and the YouTube
        // description after it. The waiting row is the same request with newer inputs, so it
        // takes them in place; minting a row per landing left one never-run row per chunk.
        if (
          own !== undefined &&
          plan.work.find((row) => row.key === recipe.key)?.disposition !== "reuse" &&
          refreshWaiting(deps, head, own, recipe)
        )
          continue;
        if (own !== undefined) {
          deps.db
            .prepare("UPDATE revision_work SET state='done' WHERE id=? AND state='pending'")
            .run(own.work_id);
          deps.db
            .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
            .run(head, recipe.key);
        }
        const placeholder = deps.db
          .prepare(
            "SELECT w.dispatch_state FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.revision_id=? AND r.work_key=?",
          )
          .get(head, recipe.key);
        if (placeholder !== undefined && placeholder.dispatch_state !== "held") continue;
        deps.db
          .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
          .run(head, recipe.key);
        if (plan.work.find((row) => row.key === recipe.key)?.disposition === "reuse") {
          const ordinal = narrationOrdinal(plan.recipes, recipe.key);
          bindNarrationReuse(deps, view, recipe, ordinal);
          if (head !== view.revision.id) {
            const current = getRevisionView(deps, projectId, head);
            if (current !== undefined) bindNarrationReuse(deps, current, recipe, ordinal);
          }
        }
        insertInvocation(
          deps,
          view,
          recipe,
          catalogue,
          {
            key: anchor.logical_key ?? anchor.work_key,
            fingerprint: anchor.desired_fingerprint ?? anchor.fingerprint,
          },
          plan.work.find((row) => row.key === recipe.key)?.disposition === "reuse",
          head,
          anchor.admission_id,
        );
      }
    }
  });
}

// Only a row nothing has touched: still pending, one unsent piece, no attempt. Anything
// further along keeps the old path, which retires it and admits a fresh row.
function refreshWaiting(
  deps: RevisionDeps,
  head: string,
  own: Reservation,
  recipe: ResolvedWorkRecipe,
): boolean {
  const pieces = workPieces(deps.db, own.work_id);
  const piece = pieces[0];
  if (
    pieces.length !== 1 ||
    piece === undefined ||
    piece.key !== recipe.key ||
    piece.state !== "pending" ||
    piece.submittedAt !== null ||
    piece.continuation !== null
  )
    return false;
  const waiting = deps.db
    .prepare(
      "SELECT 1 FROM revision_work w WHERE w.id=? AND w.state='pending' AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.work_id=w.id)",
    )
    .get(own.work_id);
  if (waiting === undefined) return false;
  deps.db
    .prepare("UPDATE revision_work SET fingerprint=? WHERE id=?")
    .run(recipe.fingerprint, own.work_id);
  deps.db
    .prepare(
      "UPDATE revision_work_pieces SET fingerprint=?,request_fingerprint=?,logical_fingerprint=?,input_json=? WHERE id=?",
    )
    .run(
      recipe.fingerprint,
      recipe.requestFingerprint,
      recipe.logicalFingerprint,
      JSON.stringify(recipeInputSchema.parse(recipe.input)),
      piece.id,
    );
  deps.db
    .prepare(
      "UPDATE revision_work_reservations SET fingerprint=? WHERE revision_id=? AND work_id=? AND work_key=?",
    )
    .run(recipe.fingerprint, head, own.work_id, recipe.key);
  return true;
}
function desiredAnchor(
  deps: RevisionDeps,
  projectId: string,
  head: string,
  row: Reservation,
): boolean {
  const view = getRevisionView(deps, projectId, head);
  return (
    view?.revision.fingerprints[row.logical_key ?? row.work_key] ===
    (row.desired_fingerprint ?? row.fingerprint)
  );
}
function futureKey(recipe: ResolvedWorkRecipe): string {
  if (recipe.input.kind === "llm" && recipe.input.preparation !== undefined)
    return `narration:prepare:${recipe.input.preparation.segment}:future`;
  if (recipe.input.kind === "tts") return `audio:${recipe.input.segment}:future`;
  if (recipe.key.startsWith("research:chapter:")) return "research:planner";
  if (recipe.key === "article:continuation") return "article:body";
  // A short's images and render unfold from its image prompts, admitted with them: under the
  // pick on a first run, or on their own when one short is made again and the pick is kept.
  // The prompts unfold from the pick's answer.
  // A short's review unfolds with the short it reviews.
  const reviewed = /^review:(shorts:\d+)$/.exec(recipe.key);
  if (reviewed?.[1] !== undefined) return `${reviewed[1]}:prompts`;
  const clip = /^(shorts:\d+):(?:image:\d+|render)$/.exec(recipe.key);
  if (clip?.[1] !== undefined) return `${clip[1]}:prompts`;
  if (recipe.key.startsWith("shorts:")) return "shorts:pick";
  // The chapter openers' clips unfold from the deferred request that stood in for them.
  if (recipe.key.startsWith("animate:")) return "animate:future";
  return recipe.key;
}
