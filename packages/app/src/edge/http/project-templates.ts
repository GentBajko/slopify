import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { DraftDeps } from "../../slices/play-drafts/model.js";
import {
  createTemplateFromProject,
  templateFromProjectSchema,
} from "../../slices/project-templates/from-project.js";
import type { TemplateResult } from "../../slices/project-templates/model.js";
import {
  templateCreateSchema,
  templateDeleteSchema,
  templateInstantiateSchema,
  templateUpdateSchema,
} from "../../slices/project-templates/schema.js";
import {
  createTemplate,
  deleteTemplate,
  instantiateTemplate,
  listTemplates,
  readTemplate,
  updateTemplate,
} from "../../slices/project-templates/service.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const param = z.object({ id: z.uuid() });
function refused(c: Context, result: Extract<TemplateResult<never>, { ok: false }>): Response {
  const status =
    result.reason === "not-found"
      ? 404
      : ["conflict", "referenced-by-schedule"].includes(result.reason)
        ? 409
        : 400;
  return problem(c, {
    status,
    title: titleOf(status),
    detail:
      result.reason === "referenced-by-schedule"
        ? "Some schedules still use this template. In Library > Schedules, cancel and delete them first; their run history is kept."
        : result.reason === "missing-prompt"
          ? "A prompt or intro/outro entry this template uses was deleted. Choose another in the template, then save again."
          : result.reason === "not-found"
            ? "This template no longer exists; it may have been deleted. Go to Library > Templates to see your templates."
            : result.reason === "conflict"
              ? "This template or its project changed while you were editing. Reload the page to see the latest, then make your change again."
              : "Some template settings are not valid, for example an image you supplied yourself. Check the template's settings and try again.",
    extensions: { reason: result.reason },
  });
}
export function projectTemplateRoutes(deps: DraftDeps | undefined): ReturnType<typeof routes> {
  return routes(deps);
}
function routes(deps: DraftDeps | undefined) {
  const service = (): DraftDeps => {
    if (!deps) throw new HTTPException(404);
    return deps;
  };
  return new Hono()
    .get("/", (c) => c.json({ templates: listTemplates(service()) }))
    .post(
      "/from-project/:projectId",
      zValidator("param", templateFromProjectSchema.unwrap().pick({ projectId: true }), onInvalid),
      zValidator("json", templateFromProjectSchema.unwrap().omit({ projectId: true }), onInvalid),
      (c) => {
        const result = createTemplateFromProject(service(), {
          ...c.req.valid("json"),
          projectId: c.req.valid("param").projectId,
        });
        return result.ok ? c.json(result.value, 201) : refused(c, result);
      },
    )
    .post("/", zValidator("json", templateCreateSchema, onInvalid), (c) => {
      const result = createTemplate(service(), c.req.valid("json"));
      return result.ok ? c.json(result.value, 201) : refused(c, result);
    })
    .get(
      "/:id",
      zValidator("param", param, onInvalid),
      zValidator(
        "query",
        z.object({ version: z.coerce.number().int().positive().optional() }),
        onInvalid,
      ),
      (c) => {
        const result = readTemplate(
          service(),
          c.req.valid("param").id,
          c.req.valid("query").version,
        );
        return result.ok ? c.json(result.value) : refused(c, result);
      },
    )
    .put(
      "/:id",
      zValidator("param", param, onInvalid),
      zValidator("json", templateUpdateSchema.unwrap().omit({ id: true }), onInvalid),
      (c) => {
        const result = updateTemplate(service(), {
          ...c.req.valid("json"),
          id: c.req.valid("param").id,
        });
        return result.ok ? c.json(result.value) : refused(c, result);
      },
    )
    .delete(
      "/:id",
      zValidator("param", param, onInvalid),
      zValidator("json", templateDeleteSchema.unwrap().omit({ id: true }), onInvalid),
      (c) => {
        const result = deleteTemplate(service(), {
          ...c.req.valid("json"),
          id: c.req.valid("param").id,
        });
        return result.ok ? c.json(result.value) : refused(c, result);
      },
    )
    .post(
      "/:id/instantiate",
      zValidator("param", param, onInvalid),
      zValidator("json", templateInstantiateSchema.unwrap().omit({ templateId: true }), onInvalid),
      (c) => {
        const result = instantiateTemplate(service(), {
          ...c.req.valid("json"),
          templateId: c.req.valid("param").id,
        });
        return result.ok ? c.json(result.value, 201) : refused(c, result);
      },
    );
}
