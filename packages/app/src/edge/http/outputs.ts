import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  addOutputPreviewRequestSchema,
  addOutputRequestSchema,
} from "../../slices/outputs/model.js";
import {
  type AddOutputRefusal,
  addOutput,
  previewAddedOutput,
} from "../../slices/outputs/service.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const projectParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

const statuses = {
  "no-project": 404,
  "no-revision": 404,
  conflict: 409,
  "idempotency-conflict": 409,
  "invalid-edit": 400,
  already: 409,
  "needs-article": 409,
  "narration-taken": 409,
  "adaptation-not-accepted": 409,
} as const;

const details: Readonly<Record<AddOutputRefusal["reason"], string>> = {
  "no-project": "This project no longer exists. Go back to Projects to pick another.",
  "no-revision":
    "This saved version of the project no longer exists. Reload the page, then open Add another output again.",
  conflict:
    "This project changed while you were choosing. Reload the page, then open Add another output again.",
  "idempotency-conflict":
    "This output was already requested with different details. Reload the page, then try again.",
  "invalid-edit":
    "This project is missing a choice the new output needs. Set the fields listed in this project's Settings, save, then add the output again.",
  already: "This project already makes that output. Find it in its section on the left.",
  "needs-article":
    "That output is made from the article, which this project does not have yet. Wait for the Article step to finish, then add it.",
  "narration-taken":
    "This project already has narration, and a project has one. Keep it, or change its format under Speakers in this project's Settings → Providers.",
  "adaptation-not-accepted":
    'This output rewrites your article as a conversation. Tick "Adapt my article into a conversation" in Add another output, then add it.',
};

// Add another output: what it reuses, makes and costs, then the revision that switches it on.
export function outputRoutes(deps: AppDeps) {
  const service = { ...deps, catalogue: deps.catalogue ?? deps.rebuild?.catalogue };
  const refused = (c: Context, projectId: string, value: AddOutputRefusal): Response => {
    const status = statuses[value.reason];
    return problem(c, {
      status,
      title: titleOf(status),
      detail: value.message ?? details[value.reason],
      extensions: {
        reason: value.reason,
        currentRevisionId: currentRevisionId(deps.db, projectId) ?? null,
        fields: value.fields ?? [],
      },
    });
  };
  return new Hono()
    .post(
      "/:id/outputs/preview",
      zValidator("param", projectParam, onInvalid),
      zValidator("json", addOutputPreviewRequestSchema, onInvalid),
      (c) => {
        const projectId = c.req.valid("param").id;
        const result = previewAddedOutput(service, { projectId, ...c.req.valid("json") });
        return result.ok ? c.json(result.value) : refused(c, projectId, result);
      },
    )
    .post(
      "/:id/outputs",
      zValidator("param", projectParam, onInvalid),
      zValidator("json", addOutputRequestSchema, onInvalid),
      async (c) => {
        const projectId = c.req.valid("param").id;
        const result = await addOutput(service, { projectId, ...c.req.valid("json") });
        if (!result.ok) return refused(c, projectId, result);
        deps.hub.emit(projectId, { type: "project.updated", projectId });
        return c.json(result);
      },
    );
}
