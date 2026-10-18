import { z } from "zod";
import { internalError } from "../../kernel/errors.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import { fillLateKeywords, mentionsLateKeyword } from "../keywords/fill.js";
import { externalReviewWaitMs } from "../reviews/external-model.js";
import { openExternalReview } from "../reviews/external-repo.js";
import { externalReviewByFingerprint } from "../reviews/external-rows.js";
import { reviewStages } from "../reviews/model.js";
import { nextAttempt, reviewOutcome } from "../reviews/outcome.js";
import { latestVerdict, saveVerdict } from "../reviews/repo.js";
import type { RevisionDeps } from "../revisions/model.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { exportSnapshot } from "./runtime-export-inputs.js";
import { lateValuesOf } from "./runtime-keywords.js";
import { publishResult } from "./runtime-publication.js";
import { reviewMaterial } from "./runtime-review.js";
import { pieceAlreadyDone, type WorkPiece } from "./work-records.js";

// What `recipe-reviews.ts` saves for a review an external agent answers, by position.
const valuesSchema = z.tuple([
  z.enum(reviewStages),
  z.string(),
  z.array(z.tuple([z.string(), z.unknown()])),
  z.string(),
  z.enum(["flag", "redo"]),
  z.number().int().nonnegative(),
]);

// A review no model answers: the step saves what a reviewer would be shown and waits for an
// agent's verdict through MCP. Waiting is not "held": the stage's other reviews still open
// theirs in the same pass, and `agentReviewHold` keeps the runner from claiming it again.
export async function executeAgentReviewRecipe(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<"done" | "held" | "waiting"> {
  if (pieceAlreadyDone(deps.db, context.work.workId, piece.id)) return "done";
  if (!context.maySubmit(piece.id)) return "held";
  const values =
    piece.input.kind === "local" ? valuesSchema.safeParse(piece.input.values) : undefined;
  if (values === undefined || !values.success)
    throw new Error(internalError("a review step was set up wrongly"));
  const [stage, itemKey, , planned, mode, retries] = values.data;
  // The release date and the length are filled as the review opens, like a request a model is sent.
  const prompt = mentionsLateKeyword(planned)
    ? fillLateKeywords(planned, await lateValuesOf(deps, context))
    : planned;
  const projectId = context.work.projectId;
  const known = externalReviewByFingerprint(deps.db, projectId, piece.fingerprint);
  if (known === undefined || known.state === "superseded" || known.state === "canceled") {
    const material = reviewMaterial(
      deps,
      context,
      exportSnapshot(deps, context, piece),
      stage,
      itemKey,
      prompt,
    );
    const now = deps.clock.now();
    openExternalReview(deps.db, {
      id: deps.ids.next(),
      projectId,
      revisionId: context.work.revisionId,
      workId: context.work.workId,
      pieceId: piece.id,
      workKey: piece.key,
      itemKey,
      stage,
      itemFingerprint: material.itemFingerprint,
      reviewFingerprint: piece.fingerprint,
      material: {
        request: material.request,
        images: material.images.map((image) => ({ stored: image.stored, name: image.name })),
      },
      waitingSince: now.toISOString(),
      deadlineAt: new Date(now.getTime() + externalReviewWaitMs).toISOString(),
    });
    context.emit({ type: "project.updated", projectId });
    return "waiting";
  }
  const autoPassed = known.state === "auto-passed";
  const verdict = autoPassed ? { passed: true, reasons: [] } : known.verdict;
  if (known.state === "waiting" || verdict === null) return "waiting";
  const attempt = nextAttempt(latestVerdict(deps.db, projectId, itemKey), known.itemFingerprint);
  const outcome = autoPassed
    ? "auto-passed"
    : reviewOutcome({ passed: verdict.passed, mode, attempt, retries });
  const saved = saveVerdict(deps.db, {
    id: deps.ids.next(),
    projectId,
    revisionId: context.work.revisionId,
    itemKey,
    stage,
    itemFingerprint: known.itemFingerprint,
    reviewFingerprint: piece.fingerprint,
    passed: verdict.passed,
    reasons: verdict.reasons,
    outcome,
    attempt,
    action: null,
    actionAt: null,
    redoState: outcome === "redo" ? "pending" : null,
    redoError: null,
    answeredBy: autoPassed ? "nobody" : (known.answeredBy ?? "agent"),
    actionBy: null,
    createdAt: deps.clock.now().toISOString(),
  });
  await publishResult(deps, context, piece, [], {
    verdictId: saved.id,
    passed: saved.passed,
    reasons: saved.reasons,
    outcome: saved.outcome,
    attempt: saved.attempt,
  });
  if (saved.outcome === "flagged")
    context.emit({
      type: "review.flagged",
      projectId,
      verdictId: saved.id,
      stage: saved.stage,
      itemKey: saved.itemKey,
      ...(saved.reasons[0] === undefined ? {} : { reason: saved.reasons[0] }),
      ...(saved.answeredBy === "agent" ? { byAgent: true } : {}),
    });
  return "done";
}

// A stage whose only unfinished steps are reviews waiting for an agent is not claimed again
// until one is answered (or passes at its deadline); anything else lets it run.
export function agentReviewHold(
  deps: Pick<RevisionDeps, "db">,
  work: WorkRef,
):
  | { readonly kind: "eligible" }
  | { readonly kind: "held"; readonly checkpointIds: readonly string[] } {
  const open = deps.db
    .prepare(
      `SELECT e.id AS review FROM revision_work_pieces p
       LEFT JOIN external_reviews e ON e.work_id=p.work_id AND e.piece_id=p.id
         AND e.review_fingerprint=p.fingerprint AND e.state='waiting'
       WHERE p.work_id=? AND p.state!='done' AND p.work_key NOT LIKE 'article:continuation:%'`,
    )
    .all(work.workId)
    .map((row) => z.object({ review: z.string().nullable() }).parse(row).review);
  const waiting = open.flatMap((id) => (id === null ? [] : [id]));
  return open.length > 0 && waiting.length === open.length
    ? { kind: "held", checkpointIds: waiting.map((id) => `agent-review:${id}`) }
    : { kind: "eligible" };
}
