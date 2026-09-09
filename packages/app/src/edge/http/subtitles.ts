import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { derive } from "../../kernel/runner/graph.js";
import {
  projectById,
  resetStage,
  stagesOf,
  updateProjectConfig,
} from "../../slices/admission/repo.js";
import { withProjectControl } from "../../slices/control/lock.js";
import { resolveFont } from "../../slices/fonts/index.js";
import { outputsOf } from "../../slices/storage/repo.js";
import { subtitleConfigSchema } from "../../slices/subtitles/model.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

export function subtitleRoutes(deps: AppDeps) {
  return new Hono().patch(
    "/:id/subtitles",
    zValidator("param", idParam, onInvalid),
    zValidator("json", subtitleConfigSchema, onInvalid),
    async (c) => {
      const { id } = c.req.valid("param");
      return withProjectControl(deps.db, id, async () => {
        const project = projectById(deps.db, id);
        if (project === undefined)
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail: "No project has that id.",
          });
        const stages = stagesOf(deps.db, id);
        if (stages.some((stage) => stage.state === "running") || deps.runner.hasInflight?.(id))
          return problem(c, {
            status: 409,
            title: titleOf(409),
            detail: "Pause the run and wait for its active work to stop before changing subtitles.",
          });
        const chosen = c.req.valid("json");
        if (chosen.mode !== "off" && project.config.sources.audio === "off")
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: "Subtitles need narration audio.",
          });
        const subtitles =
          project.config.sources.video === "off" && chosen.mode === "burn-in"
            ? { ...chosen, mode: "files" as const }
            : chosen;
        if (subtitles.mode !== "off" && subtitles.fontId !== project.config.subtitles?.fontId) {
          try {
            await resolveFont(deps.paths, subtitles.fontId);
          } catch {
            return problem(c, {
              status: 400,
              title: titleOf(400),
              detail: "That font is no longer available. Choose another font or upload it again.",
            });
          }
        }
        // Font discovery awaits filesystem work; a pending runner may have claimed a
        // stage during that time. Recheck synchronously immediately before the write.
        if (
          stagesOf(deps.db, id).some((stage) => stage.state === "running") ||
          deps.runner.hasInflight?.(id)
        ) {
          return problem(c, {
            status: 409,
            title: titleOf(409),
            detail: "Pause the run before changing subtitles.",
          });
        }
        const video = stages.find((stage) => stage.kind === "video");
        transact(deps.db, () => {
          updateProjectConfig(
            deps.db,
            id,
            { ...project.config, subtitles },
            deps.clock.now().toISOString(),
          );
          // Only the local final export is invalidated. Existing provider outputs and
          // the last finished export remain intact until its replacement succeeds.
          if (
            video !== undefined &&
            (project.config.sources.audio !== "off" || project.config.sources.video !== "off")
          )
            resetStage(deps.db, video.id);
        });
        deps.hub.emit(id, { type: "project.updated", projectId: id });
        if (project.paused !== true) deps.runner.tick(id);
        const current = stagesOf(deps.db, id);
        return c.json({
          project: {
            ...projectById(deps.db, id),
            status: derive(current, project.paused === true),
          },
          stages: current,
          outputs: outputsOf(deps.db, id),
        });
      });
    },
  );
}
