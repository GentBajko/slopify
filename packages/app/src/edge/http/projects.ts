import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { derive, progressOf } from "../../kernel/runner/graph.js";
import type { Project, ProjectListing, ProjectSummary } from "../../slices/admission/model.js";
import {
  listProjects,
  projectById,
  runDraftSchema,
  stageStandingsByProject,
  stagesOf,
} from "../../slices/admission/repo.js";
import { admit } from "../../slices/admission/rules.js";
import { startRun } from "../../slices/admission/start.js";
import { pickTemplates, renderPicked } from "../../slices/library/slots.js";
import type { DeleteDeps, DeleteRefusal } from "../../slices/storage/delete-project.js";
import { deleteProject } from "../../slices/storage/delete-project.js";
import { outputsOf, stagedFiles } from "../../slices/storage/repo.js";
import type { StorageDeps } from "../../slices/storage/staging.js";
import type { TelemetryDeps } from "../../slices/telemetry/record.js";
import { record } from "../../slices/telemetry/record.js";
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
  const telemetry: TelemetryDeps = {
    db: deps.db,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    appVersion: deps.version,
  };
  const storageForDelete: DeleteDeps = { db: deps.db, paths: deps.paths, log: deps.log };
  const summarise = (project: Project): ProjectSummary => ({
    ...project,
    status: derive(stagesOf(deps.db, project.id)),
  });

  return (
    new Hono()
      .post("/", zValidator("json", runDraftSchema, onInvalid), (c) => {
        // logic/04 §Q34: the bodies are read here, at the click, so an edit made since the
        // prompt was selected is the one that runs.
        const picked = pickTemplates(deps.db, c.req.valid("json"));
        const admitted = admit({
          draft: picked.draft,
          staged: stagedFiles(deps.db),
          requiredSlots: picked.requiredSlots,
        });
        if (!admitted.ok || picked.missing.length > 0) {
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: "This run cannot start yet; the listed fields need attention.",
            extensions: {
              fields: [...picked.missing, ...(admitted.ok ? [] : admitted.fields)],
            },
          });
        }

        // Rendered from the values admit() has trimmed, so the stored text carries no
        // padding the user did not intend (logic/03 step 4 and step 5).
        const { project } = startRun(
          storage,
          admitted.draft,
          renderPicked(picked, admitted.draft.values),
        );
        // logic/16 step 2: one event per project created. record() swallows its own
        // failures, so a broken telemetry write cannot cost the user the run.
        record(telemetry, "project.created", {});
        deps.flushSoon();
        // logic/04 step 6: the run starts only once the project is committed.
        deps.runner.tick(project.id);
        // Read back after the tick, not from the rows startRun built: the runner has
        // already claimed every eligible stage, and a body that paired status "running"
        // with "video: pending" would contradict itself.
        return c.json({ project: summarise(project), stages: stagesOf(deps.db, project.id) }, 201);
      })
      // One statement for every project's stage standings, not one per row: the list needs
      // a status word and a meter, and both come out of the same five columns.
      .get("/", (c) => {
        const standings = stageStandingsByProject(deps.db);
        const projects: ProjectListing[] = listProjects(deps.db).map((project) => {
          const stages = standings.get(project.id) ?? [];
          return { ...project, status: derive(stages), progress: progressOf(stages) };
        });
        return c.json({ projects });
      })
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
      })
      // `logic/14` step 4. Irreversible, and only from the app: 07 Projects puts the
      // confirmation dialog in front of it.
      .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const result = deleteProject(storageForDelete, c.req.valid("param").id);
        if (result.ok) {
          return c.body(null, 204);
        }
        return problem(c, {
          status: deleteStatus[result.reason],
          title: titleOf(deleteStatus[result.reason]),
          detail: result.detail ?? deleteDetails[result.reason],
        });
      })
  );
}

const deleteStatus: Readonly<Record<DeleteRefusal, 404 | 409 | 500>> = {
  "no-project": 404,
  running: 409,
  files: 500,
};

const deleteDetails: Readonly<Record<DeleteRefusal, string>> = {
  "no-project": "No project has that id.",
  // §Q117: the run has to be stopped before its files can go.
  running: "This project is still running. Cancel the run first.",
  files: "Some of this project's files could not be removed.",
};
