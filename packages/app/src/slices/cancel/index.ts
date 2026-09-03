import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import type { ProjectState, StageKind } from "../../kernel/pipeline.js";
import { derive } from "../../kernel/runner/graph.js";
import { finishStage, projectExists, stagesOf } from "../admission/repo.js";

// `logic/13`: Cancel on the project header. Every in-flight call of this project is
// aborted at once, every `done` output and every finished piece is kept for the resume,
// and the project sits `canceled` until the user retries a stage.

// §Q111 and `logic/01`'s transition table, in the words the stage row carries.
export const canceledByUser = "canceled by user";

export interface CancelDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
  // The runner's per-project abort. Taken as a function rather than as the whole runner
  // so a test can drive the barrier without a stage implementation.
  readonly abort: (projectId: string) => Promise<void>;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
}

export type CancelResult =
  | {
      readonly ok: true;
      // The stages this click stopped, empty when there was nothing running (§Q108).
      readonly canceled: readonly StageKind[];
      readonly state: ProjectState;
    }
  | { readonly ok: false; readonly reason: "no-project" };

export async function cancelProject(deps: CancelDeps, projectId: string): Promise<CancelResult> {
  if (!projectExists(deps.db, projectId)) {
    return { ok: false, reason: "no-project" };
  }
  const before = stagesOf(deps.db, projectId);
  const running = before.filter((stage) => stage.state === "running").map((stage) => stage.kind);
  if (running.length === 0) {
    // Step 4: "a second click is a no-op". Nothing is aborted and no state changes, so
    // the page is simply told what the project already reads.
    return { ok: true, canceled: [], state: derive(before) };
  }

  // Step 1: nothing waits for a response. The runner holds the controllers and its own
  // barrier, so a stage that finishes during this does not release its dependents.
  await deps.abort(projectId);

  // Step 3's invariant: "after cancel completes no stage of the project is `running`".
  // The runner writes that row as each aborted stage unwinds; this is the path where it
  // could not - a failed write is logged there and the run is left mid-flight otherwise.
  const after = stagesOf(deps.db, projectId);
  for (const stage of after) {
    if (stage.state !== "running") {
      continue;
    }
    deps.log.write("warn", "cancel.sweep", {
      projectId,
      stage: stage.kind,
      detail: "the stage was still running after its calls stopped",
    });
    finishStage(deps.db, stage.id, "canceled", canceledByUser, deps.clock.now().toISOString());
    deps.emit(projectId, {
      type: "stage.state",
      projectId,
      stage: stage.kind,
      state: "canceled",
      failureReason: canceledByUser,
    });
  }

  const settled = stagesOf(deps.db, projectId);
  const state = derive(settled);
  if (after.some((stage) => stage.state === "running")) {
    // Only when the sweep above moved a row: the runner already announced the state it
    // left the project in, and repeating it would tell every open page the same thing
    // twice.
    deps.emit(projectId, { type: "project.state", projectId, state });
  }
  return {
    ok: true,
    // §Q113: a stage whose output was stored in the same instant as the cancel stays
    // `done`, so what was stopped is read back rather than assumed from what was running.
    canceled: settled
      .filter((stage) => stage.state === "canceled" && running.includes(stage.kind))
      .map((stage) => stage.kind),
    state,
  };
}
