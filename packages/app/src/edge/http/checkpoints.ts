import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  changeCheckpoints,
  checkpointChangeSchema,
  readCheckpointStatus,
  replayCheckpointApproval,
  validateCheckpointApproval,
} from "../../slices/checkpoints/change.js";
import { checkpointApprovalSchema, checkpointRowSchema } from "../../slices/checkpoints/schema.js";
import { withProjectControl } from "../../slices/control/lock.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const projectParam = z.object({ id });
const approvalParam = projectParam.extend({ checkpointId: id });
const approvalBody = checkpointApprovalSchema
  .unwrap()
  .omit({ projectId: true, checkpointId: true, approvedAt: true });
function refused(c: Context, reason: string): Response {
  const status = reason === "not-found" ? 404 : reason === "invalid-input" ? 400 : 409;
  return problem(c, {
    status,
    title: titleOf(status),
    detail: "Reload the current checkpoint status before approving or changing this gate.",
    extensions: { reason },
  });
}

export function checkpointRoutes(deps: AppDeps) {
  const notify = (projectId: string, revisionId: string, wake: boolean) => {
    try {
      deps.hub.emit(projectId, { type: "project.updated", projectId, revisionId });
    } catch (error) {
      deps.log.write("error", "checkpoint.notify", {
        projectId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    if (wake) {
      try {
        deps.runner.tick(projectId);
      } catch (error) {
        deps.log.write("error", "checkpoint.wake", {
          projectId,
          detail: error instanceof Error ? error.message : String(error),
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
          if (!result.ok && (result.reason !== "duplicate" || result.value === undefined))
            return refused(c, result.reason);
          const checkpoint = checkpointRowSchema.parse(result.value);
          if (result.ok) notify(projectId, identity.revisionId, false);
          return c.json({ checkpoint, replayed: !result.ok });
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
          const result = changeCheckpoints(deps, { ...body, projectId });
          if (!result.ok) return refused(c, result.reason);
          if (result.value.changed) notify(projectId, body.revisionId, result.value.released);
          const status = readCheckpointStatus(deps, projectId);
          return status.ok ? c.json(status.value) : refused(c, status.reason);
        });
      },
    );
}
