import { createHash } from "node:crypto";
import type { WorkRef } from "../../kernel/runner/work.js";
import type { ReviewRecord } from "../reviews/model.js";
import { reviewKey } from "../reviews/model.js";
import { pendingRedos, setRedoState } from "../reviews/repo.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import { recoverProject } from "./recovery.js";
import type { RecoveryResult } from "./recovery-model.js";
import { dependentClosure } from "./recovery-selection.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import type { RebuildDeps } from "./service.js";
import { workPieces } from "./work-records.js";

// While a review's verdict waits to send its item back, what depends on the item waits too:
// the automatic redo replaces that work, and starting it on the failed item would be wasted.
// The same claim-time hold a review checkpoint uses, answered by the reviewer.
export function reviewHold(
  deps: RevisionDeps,
  work: WorkRef,
):
  | { readonly kind: "eligible" }
  | { readonly kind: "held"; readonly checkpointIds: readonly string[] } {
  const waiting = pendingRedos(deps.db, work.projectId).filter(
    (row) => row.revisionId === work.revisionId,
  );
  if (waiting.length === 0) return { kind: "eligible" };
  const view = executionView(deps, work.projectId, work.revisionId);
  const row = deps.db
    .prepare("SELECT recipe_context FROM revision_work WHERE id=?")
    .get(work.workId);
  if (view === undefined || row === undefined) return { kind: "eligible" };
  const plan = executionPlan(deps, view, savedCatalogue(row.recipe_context));
  const keys = new Set(workPieces(deps.db, work.workId).map((piece) => piece.key));
  const held = waiting.filter((verdict) => {
    const review = reviewKey(verdict.itemKey);
    return dependentClosure(plan.recipes, [review]).some((key) => key !== review && keys.has(key));
  });
  return held.length === 0
    ? { kind: "eligible" }
    : { kind: "held", checkpointIds: held.map((verdict) => `review:${verdict.id}`) };
}

// Starts the redos reviews asked for, once their review step has finished: the item is made
// again through Re-run's path (a new regeneration token saved as a new project version, then
// its dependents rebuilt), so the redone item, its new review and everything after it are
// ordinary recipe work. One at a time per verdict; a redo that cannot start leaves the item
// flagged with the reason and releases what was waiting on it.
export function createReviewRedos(): {
  readonly bind: (deps: RebuildDeps) => void;
  readonly kick: (projectId?: string) => void;
} {
  let bound: RebuildDeps | undefined;
  const running = new Set<string>();
  const kick = (projectId?: string): void => {
    const deps = bound;
    if (deps === undefined) return;
    for (const verdict of pendingRedos(deps.db, projectId)) {
      if (running.has(verdict.id)) continue;
      running.add(verdict.id);
      void startRedo(deps, verdict)
        .catch((error: unknown) => {
          deps.log.write("error", "review.redo", {
            projectId: verdict.projectId,
            detail: error instanceof Error ? error.message : String(error),
          });
          setRedoState(
            deps.db,
            verdict.id,
            "failed",
            "Slopify hit an internal error while making this item again. Use Redo beside it; if it happens again, use Download diagnostics in Settings and report it.",
          );
        })
        .finally(() => {
          running.delete(verdict.id);
          try {
            deps.runner.tick(verdict.projectId);
          } catch {
            // The next tick of this project picks the released work up.
          }
        });
    }
  };
  return {
    bind: (deps) => {
      bound = deps;
    },
    kick,
  };
}

// The verdicts whose redo is being started right now. Overrule may call off a redo only while
// it waits, not once Slopify has begun making the item again.
const starting = new Set<string>();

export function redoStarting(verdictId: string): boolean {
  return starting.has(verdictId);
}

export async function startRedo(deps: RebuildDeps, verdict: ReviewRecord): Promise<void> {
  starting.add(verdict.id);
  try {
    await makeAgain(deps, verdict);
  } finally {
    starting.delete(verdict.id);
  }
}

async function makeAgain(deps: RebuildDeps, verdict: ReviewRecord): Promise<void> {
  const base = currentRevisionId(deps.db, verdict.projectId);
  if (base === undefined) {
    setRedoState(deps.db, verdict.id, "failed", "The project no longer exists.");
    return;
  }
  const result = await recoverProject(
    deps,
    verdict.projectId,
    {
      baseRevisionId: base,
      idempotencyKey: redoKey(verdict.id),
      action: { kind: "redo", item: verdict.itemKey },
    },
    { pendingSuperseded: true },
  );
  if (result.ok) setRedoState(deps.db, verdict.id, "started");
  else setRedoState(deps.db, verdict.id, "failed", redoRefusal(result));
  deps.emit(verdict.projectId, { type: "project.updated", projectId: verdict.projectId });
}

// A stable request identity per verdict, so a restart that starts the same redo again gets
// the first attempt's answer instead of a second redo.
export function redoKey(verdictId: string): string {
  const hex = createHash("sha256").update(`review-redo:${verdictId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function redoRefusal(result: Extract<RecoveryResult, { ok: false }>): string {
  const detail = result.fields?.map((field) => field.message).join(" ");
  switch (result.reason) {
    case "running":
      return "Slopify couldn't make this item again automatically because work that depends on it was already running. Use Redo beside it once the run has finished.";
    case "readiness":
      return `Slopify couldn't make this item again automatically: ${detail ?? "a provider isn't ready"}. Fix that in Settings → Providers, then use Redo beside it.`;
    case "conflict":
    case "control-changed":
      return "Slopify couldn't make this item again automatically because the project changed at the same moment (an edit, Pause or Cancel). Use Redo beside it.";
    default:
      return `Slopify couldn't make this item again automatically${detail ? `: ${detail}` : "."} Use Redo beside it.`;
  }
}
