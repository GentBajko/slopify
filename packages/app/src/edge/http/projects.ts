import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { derive } from "../../kernel/runner/graph.js";
import type { Project, ProjectSummary } from "../../slices/admission/model.js";
import {
  listProjects,
  projectById,
  runDraftSchema,
  stagesOf,
} from "../../slices/admission/repo.js";
import { admit } from "../../slices/admission/rules.js";
import { startRun } from "../../slices/admission/start.js";
import { outputsOf, stagedFiles } from "../../slices/storage/repo.js";
import type { StorageDeps } from "../../slices/storage/staging.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

// The return type is inferred so Hono keeps the route types the SPA's client is
// generated from; see stagingRoutes.
export function projectRoutes(deps: AppDeps) {
  const storage: StorageDeps = {
    db: deps.db,
    paths: deps.paths,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    emit: (event) => {
      deps.hub.emitGlobal(event);
    },
  };
  const summarise = (project: Project): ProjectSummary => ({
    ...project,
    status: derive(stagesOf(deps.db, project.id)),
  });

  return new Hono()
    .post("/", zValidator("json", runDraftSchema, onInvalid), (c) => {
      // ceiling: no prompt body exists to scan yet, so no slot is required and nothing is
      // rendered. Both lists come from the prompt library slice once it lands, through
      // collectFields and render in slices/admission/substitute.ts.
      const admitted = admit({
        draft: c.req.valid("json"),
        staged: stagedFiles(deps.db),
        requiredSlots: [],
      });
      if (!admitted.ok) {
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "This run cannot start yet; the listed fields need attention.",
          extensions: { fields: admitted.fields },
        });
      }

      const { project, stages } = startRun(storage, admitted.draft, {});
      // logic/04 step 6: the run starts only once the project is committed.
      deps.runner.tick(project.id);
      return c.json({ project: summarise(project), stages }, 201);
    })
    .get("/", (c) => c.json({ projects: listProjects(deps.db).map(summarise) }))
    .get("/:id", zValidator("param", idParam, onInvalid), (c) => {
      const project = projectById(deps.db, c.req.valid("param").id);
      if (project === undefined) {
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail: "No project has that id.",
        });
      }
      return c.json({
        project: summarise(project),
        stages: stagesOf(deps.db, project.id),
        outputs: outputsOf(deps.db, project.id),
      });
    });
}
