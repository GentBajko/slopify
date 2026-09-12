import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import {
  type ProjectState,
  projectStates,
  type StageKind,
  stageKinds,
} from "../../kernel/pipeline.js";
import { derive } from "../../kernel/runner/graph.js";
import {
  finishStage,
  projectExists,
  projectPaused,
  setProjectPaused,
  stagesOf,
} from "../admission/repo.js";
import { withProjectControl } from "../control/lock.js";
import {
  checkRevisionControl,
  type RevisionControlInput,
  type RevisionControlRefusal,
  rememberRevisionControl,
} from "../control/revision-control.js";

// Cancel on the project header. Every in-flight call of this project is aborted at once, every
// `done` output and every finished piece is kept for the resume, and the project sits
// `canceled` until the user retries a stage.

// The cancel rules and the stage transition table, in the words the stage row carries.
export const canceledByUser = "canceled by user";

export interface CancelDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
  // The runner's per-project abort. Taken as a function rather than as the whole runner
  // so a test can drive the barrier without a stage implementation.
  readonly abort: (projectId: string) => Promise<void>;
  readonly hasInflight?: ((projectId: string) => boolean) | undefined;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
}

export type CancelResult =
  | {
      readonly ok: true;
      // The stages this click stopped, empty when there was nothing running.
      readonly canceled: readonly StageKind[];
      readonly state: ProjectState;
    }
  | { readonly ok: false; readonly reason: RevisionControlRefusal };

export function cancelProject(
  deps: CancelDeps,
  projectId: string,
  input?: RevisionControlInput,
): Promise<CancelResult> {
  return withProjectControl(deps.db, projectId, async () => {
    const checked = checkRevisionControl(
      deps,
      projectId,
      "cancel",
      input,
      z.object({
        ok: z.literal(true),
        canceled: z.array(z.enum(stageKinds)),
        state: z.enum(projectStates),
      }),
    );
    if (!checked.ok) return checked;
    if (checked.response !== undefined) return checked.response;
    const result = await cancel(deps, projectId);
    if (result.ok) rememberRevisionControl(deps, checked.identity, result);
    return result;
  });
}
async function cancel(deps: CancelDeps, projectId: string): Promise<CancelResult> {
  if (!projectExists(deps.db, projectId)) {
    return { ok: false, reason: "no-project" };
  }
  const before = stagesOf(deps.db, projectId);
  const paused = projectPaused(deps.db, projectId);
  if (paused) {
    setProjectPaused(deps.db, projectId, false, deps.clock.now().toISOString());
    deps.emit(projectId, { type: "project.updated", projectId });
  }
  const running = before.filter((stage) => stage.state === "running").map((stage) => stage.kind);
  const admittedPending =
    deps.db
      .prepare(
        "SELECT 1 FROM revision_work w JOIN revision_work_reservations r ON r.work_id=w.id JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id WHERE w.project_id=? AND w.state='pending' LIMIT 1",
      )
      .get(projectId) !== undefined;
  const draining = deps.hasInflight?.(projectId) === true;
  if (running.length === 0 && !paused && !admittedPending && !draining) {
    // A second click is a no-op. Nothing is aborted and no state changes, so
    // the page is simply told what the project already reads.
    return { ok: true, canceled: [], state: derive(before) };
  }

  // Nothing waits for a response. The runner holds the controllers and its own
  // barrier, so a stage that finishes during this does not release its dependents.
  if (running.length > 0 || draining) await deps.abort(projectId);
  deps.db
    .prepare(
      "UPDATE revision_work SET state='canceled',dispatch_state='held',failure_reason=? WHERE project_id=? AND state!='done'",
    )
    .run(canceledByUser, projectId);
  deps.db
    .prepare(
      "UPDATE revision_work_pieces SET state='held',dispatch_state='held' WHERE work_id IN (SELECT id FROM revision_work WHERE project_id=?) AND state!='done'",
    )
    .run(projectId);

  // The invariant: after cancel completes no stage of the project is `running`.
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

  // An abort can race a successful stage completion. Mark one remaining pending
  // stage canceled so cancellation is explicit, rather than guessing from any
  // completed stage (independent images can now finish before Article).
  const stopped = stagesOf(deps.db, projectId);
  const waiting = stopped.find((stage) => stage.state === "pending");
  if (!stopped.some((stage) => stage.state === "canceled") && waiting !== undefined) {
    finishStage(deps.db, waiting.id, "canceled", canceledByUser, deps.clock.now().toISOString());
    deps.emit(projectId, {
      type: "stage.state",
      projectId,
      stage: waiting.kind,
      state: "canceled",
      failureReason: canceledByUser,
    });
  }
  const settled = stagesOf(deps.db, projectId);
  const state = derive(settled);
  if (
    paused ||
    after.some((stage) => stage.state === "running") ||
    (waiting !== undefined && !stopped.some((stage) => stage.state === "canceled"))
  ) {
    // Only when the sweep above moved a row: the runner already announced the state it
    // left the project in, and repeating it would tell every open page the same thing
    // twice.
    deps.emit(projectId, { type: "project.state", projectId, state });
  }
  return {
    ok: true,
    // A stage whose output was stored in the same instant as the cancel stays
    // `done`, so what was stopped is read back rather than assumed from what was running.
    canceled: settled
      .filter((stage) => stage.state === "canceled" && running.includes(stage.kind))
      .map((stage) => stage.kind),
    state,
  };
}
