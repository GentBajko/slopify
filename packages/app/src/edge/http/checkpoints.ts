import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { errorText } from "../../kernel/errors.js";
import {
  changeCheckpoints,
  checkpointChangeSchema,
  readCheckpointStatus,
  replayCheckpointApproval,
  validateCheckpointApproval,
} from "../../slices/checkpoints/change.js";
import { listCheckpoints } from "../../slices/checkpoints/repo.js";
import { checkpointApprovalSchema, checkpointRowSchema } from "../../slices/checkpoints/schema.js";
import { withProjectControl } from "../../slices/control/lock.js";
import { projectHolds } from "../../slices/reviews/holds.js";
import type { AppDeps } from "./app.js";
import { idParam, idString } from "./ids.js";
import { onInvalid, problem } from "./problem.js";
import { refusal } from "./refusal.js";

const id = idString;
const projectParam = idParam;
const approvalParam = projectParam.extend({ checkpointId: id });
const approvalBody = checkpointApprovalSchema
  .unwrap()
  .omit({ projectId: true, checkpointId: true, approvedAt: true });
function refused(c: Context, reason: string): Response {
  return refusal(c, reason, {
    statuses: { "not-found": 404, "invalid-input": 400 },
    otherwise: 409,
    detail:
      reason === "not-found"
        ? "This checkpoint no longer exists; the project may have moved on or changed. Reload the page to see where it is now."
        : reason === "invalid-input"
          ? "This checkpoint answer could not be read. Reload the page and try again."
          : "This checkpoint changed since the page loaded, for example it was already approved. Reload the page to see its current state, then try again.",
  });
}

// Taking a checkpoint off that holds the run now would start the paid steps behind it without
// the review: that goes through Approve, which checks what is approved is what was looked at.
function heldThere(c: Context, stage: string): Response {
  return problem(c, {
    status: 409,
    detail: `The run is waiting at the checkpoint before ${stage}, so it can't be taken off now: that would start the next steps without the review. Look over what is made, then press Approve on the checkpoint (agents: approve_checkpoint).`,
    extensions: { reason: "held-at-checkpoint" },
  });
}

function alreadyApproved(c: Context): Response {
  return problem(c, {
    status: 409,
    detail:
      "This checkpoint was already approved, so nothing changed. Reload the page (or call needs_attention) to see what waits now.",
    extensions: { reason: "already-approved" },
  });
}

export function checkpointRoutes(deps: AppDeps): ReturnType<typeof buildCheckpointRoutes> {
  return buildCheckpointRoutes(deps);
}

function buildCheckpointRoutes(deps: AppDeps) {
  const notify = (projectId: string, revisionId: string, wake: boolean) => {
    try {
      deps.hub.emit(projectId, { type: "project.updated", projectId, revisionId });
    } catch (error) {
      deps.log.write("error", "checkpoint.notify", {
        projectId,
        detail: errorText(error),
      });
    }
    if (wake) {
      try {
        deps.runner.tick(projectId);
      } catch (error) {
        deps.log.write("error", "checkpoint.wake", {
          projectId,
          detail: errorText(error),
        });
      }
    }
  };
  return new Hono()
    .get("/:id/checkpoints", zValidator("param", projectParam, onInvalid), (c) => {
      const result = readCheckpointStatus(deps, c.req.valid("param").id);
      return result.ok ? c.json(result.value) : refused(c, result.reason);
    })
    .post(
      "/:id/checkpoints/:checkpointId/approve",
      zValidator("param", approvalParam, onInvalid),
      zValidator("json", approvalBody, onInvalid),
      async (c) => {
        const { id: projectId, checkpointId } = c.req.valid("param");
        const identity = c.req.valid("json");
        return withProjectControl(deps.db, projectId, () => {
          const replay = replayCheckpointApproval(deps, { ...identity, projectId, checkpointId });
          if (replay)
            return replay.ok
              ? c.json({ checkpoint: replay.value, replayed: true })
              : refused(c, replay.reason);
          const valid = validateCheckpointApproval(deps, { ...identity, projectId, checkpointId });
          if (!valid.ok) return refused(c, valid.reason);
          const authority = deps.runner.checkpoints;
          if (!authority) return refused(c, "conflict");
          const result = authority.release(projectId, checkpointId, identity);
          // A known key was answered by the replay above, so a duplicate here is an approval
          // someone else made first.
          if (!result.ok)
            return result.reason === "duplicate" ? alreadyApproved(c) : refused(c, result.reason);
          notify(projectId, identity.revisionId, false);
          return c.json({ checkpoint: checkpointRowSchema.parse(result.value), replayed: false });
        });
      },
    )
    .patch(
      "/:id/checkpoints",
      zValidator("param", projectParam, onInvalid),
      zValidator("json", checkpointChangeSchema, onInvalid),
      async (c) => {
        const projectId = c.req.valid("param").id;
        const body = c.req.valid("json");
        return withProjectControl(deps.db, projectId, () => {
          const holding = projectHolds(deps.db, { projectId }).holding.get(projectId) ?? [];
          const removed = listCheckpoints(deps.db, projectId, body.revisionId).filter(
            (row) => !body.stages.includes(row.stage),
          );
          const held = holding.find((hold) =>
            removed.some((row) => row.checkpointId === hold.checkpointId),
          );
          if (held !== undefined) return heldThere(c, held.stage);
          const result = changeCheckpoints(deps, { ...body, projectId });
          if (!result.ok) return refused(c, result.reason);
          if (result.value.changed) notify(projectId, body.revisionId, result.value.released);
          const status = readCheckpointStatus(deps, projectId);
          return status.ok ? c.json(status.value) : refused(c, status.reason);
        });
      },
    );
}
