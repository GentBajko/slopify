import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { derive, progressOf } from "../../kernel/runner/graph.js";
import type { Project, ProjectListing, ProjectSummary } from "../../slices/admission/model.js";
import {
  listProjects,
  projectById,
  projectTrashed,
  runDraftSchema,
  stageStandingsByProject,
  stagesOf,
} from "../../slices/admission/repo.js";
import { defaultChannelId } from "../../slices/channels/model.js";
import { projectChannels } from "../../slices/channels/repo.js";
import { withProjectControl } from "../../slices/control/lock.js";
import { stagesWithEta } from "../../slices/eta/view.js";
import { videoActivity } from "../../slices/rebuild/activity.js";
import { resumable } from "../../slices/rebuild/recovery-repo.js";
import { adoptBaseline } from "../../slices/revisions/adopt.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { limitWaitsByProject, listingWait } from "../../slices/run-cost/panel.js";
import { outputsOf } from "../../slices/storage/repo.js";
import type { TrashDeps } from "../../slices/trash/model.js";
import { trashProject } from "../../slices/trash/service.js";
import { setAsideProjects, uploadedProjects } from "../../slices/uploads/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";
import { createProject } from "./project-create.js";

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
  const storageForTrash: TrashDeps = {
    db: deps.db,
    paths: deps.paths,
    clock: deps.clock,
    log: deps.log,
    hasInflight: deps.runner.hasInflight,
  };
  const summarise = (project: Project): ProjectSummary => ({
    ...project,
    status: derive(stagesOf(deps.db, project.id), project.paused),
  });

  return (
    new Hono()
      .post("/", zValidator("json", runDraftSchema, onInvalid), async (c) => {
        const created = await createProject(deps, c.req.valid("json"));
        if (!created.ok)
          return problem(c, {
            status: created.status,
            title: titleOf(created.status),
            detail: created.detail,
            ...(created.fields.length === 0 ? {} : { extensions: { fields: created.fields } }),
          });
        // Read back after the tick, not from the rows startRun built: the runner has
        // already claimed every eligible stage, and a body that paired status "running"
        // with "video: pending" would contradict itself.
        return c.json(
          { project: summarise(created.project), stages: stagesOf(deps.db, created.project.id) },
          201,
        );
      })
      // One statement for every project's stage standings, not one per row: the list needs
      // a status word and a meter, and both come out of the same five columns.
      .get("/", (c) => {
        const standings = stageStandingsByProject(deps.db);
        const channels = projectChannels(deps.db);
        const uploads = uploadedProjects(deps.db);
        const aside = setAsideProjects(deps.db);
        const waits = limitWaitsByProject(deps.db);
        const projects: ProjectListing[] = listProjects(deps.db).map((project) => {
          const stages = standings.get(project.id) ?? [];
          const waiting = waits.get(project.id);
          return {
            ...project,
            status: derive(stages, project.paused),
            progress: progressOf(stages),
            channelId: channels.get(project.id) ?? defaultChannelId,
            uploadedAt: uploads.get(project.id) ?? null,
            ...(aside.has(project.id) ? { setAside: true } : {}),
            ...(waiting === undefined ? {} : { limitWaits: waiting.map(listingWait) }),
          };
        });
        return c.json({ projects });
      })
      .get("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const project = projectById(deps.db, c.req.valid("param").id);
        if (project === undefined) {
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail: projectTrashed(deps.db, c.req.valid("param").id)
              ? "This project is in the trash. Restore it in Settings → Trash to open it again."
              : "This project no longer exists. Go back to Projects to pick another.",
          });
        }
        if (deps.catalogue !== undefined) adoptBaseline(deps, project.id);
        return c.json({
          revisionId: currentRevisionId(deps.db, project.id) ?? null,
          resumable: resumable(deps.db, project.id),
          project: summarise(project),
          stages: stagesWithEta(
            deps.db,
            stagesOf(deps.db, project.id),
            project.config,
            deps.clock.now(),
          ).map((stage) => {
            if (stage.kind !== "video" || stage.state !== "running") return stage;
            const activity = videoActivity(deps.db, project.id);
            return activity === undefined ? stage : { ...stage, activity };
          }),
          outputs: outputsOf(deps.db, project.id),
        });
      })
      // Moves the project to the trash (Settings → Trash) for 30 days; removing it for good is
      // Delete now there, or the daily purge (`slices/trash`).
      .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const id = c.req.valid("param").id;
        return withProjectControl(deps.db, id, () => {
          const result = trashProject(storageForTrash, id);
          if (result.ok) return c.body(null, 204);
          const status = result.reason === "running" ? 409 : 404;
          return problem(c, {
            status,
            title: titleOf(status),
            detail:
              result.reason === "running"
                ? "This project is still running. Use Cancel run on the project page first, then delete it."
                : "This project no longer exists. Go back to Projects to pick another.",
          });
        });
      })
  );
}
