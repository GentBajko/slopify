import { z } from "zod";
import { buildRecipes } from "../rebuild/recipe-build.js";
import { recipeInputSchema } from "../rebuild/recipe-input-schema.js";
import type { RevisionPlanResult } from "../rebuild/recipe-save.js";
import type { RevisionDeps, RevisionView } from "./model.js";

export function preserveDeferredIntent(
  deps: RevisionDeps,
  base: RevisionView,
  plan: Extract<RevisionPlanResult, { ok: true }>,
): Extract<RevisionPlanResult, { ok: true }> {
  const rows = deps.db
    .prepare(
      "SELECT p.input_json,r.work_key,r.fingerprint,r.logical_key,r.desired_fingerprint FROM revision_work_reservations r JOIN revision_work_pieces p ON p.id=r.piece_id JOIN revision_work w ON w.id=r.work_id WHERE r.project_id=? AND r.revision_id=? AND (w.dispatch_state='allowed' OR p.dispatch_state='allowed')",
    )
    .all(base.revision.projectId, base.revision.id);
  const before = buildRecipes({
    config: base.revision.config,
    content: base.revision.content,
    manifest: {
      outputs: base.outputs.filter((row) => row.selected),
      pieces: base.pieces.filter((row) => row.selected),
    },
    resolved: {
      articleMarkdown: null,
      researchNotes: base.revision.config.provided.research ?? null,
    },
  });
  const after = buildRecipes({
    config: plan.config,
    content: plan.content,
    manifest: plan.manifest,
    resolved: { articleMarkdown: null, researchNotes: plan.config.provided.research ?? null },
  });
  const fingerprints = { ...plan.fingerprints };
  const baseFingerprints = { ...plan.baseFingerprints };
  const recipes = [...plan.recipes];
  for (const row of rows) {
    const input = recipeInputSchema.parse(JSON.parse(z.string().parse(row.input_json)));
    const key = z.string().parse(row.logical_key ?? row.work_key);
    if (input.kind !== "deferred" || fingerprints[key] !== undefined) continue;
    const old = before.find((one) => one.key === key);
    const next = after.find((one) => one.key === key);
    const desired = z.string().parse(row.desired_fingerprint ?? row.fingerprint);
    if (
      old !== undefined &&
      next !== undefined &&
      old.fingerprint === next.fingerprint &&
      old.fingerprint === desired
    ) {
      fingerprints[key] = desired;
      baseFingerprints[key] = desired;
      recipes.push(next);
    }
  }
  return { ...plan, fingerprints, baseFingerprints, recipes };
}
