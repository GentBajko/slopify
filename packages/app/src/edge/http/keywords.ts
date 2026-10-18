import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { projectById, projectTrashed } from "../../slices/admission/repo.js";
import { projectChannelId } from "../../slices/channels/repo.js";
import { keywordFactsFor } from "../../slices/keywords/facts.js";
import { costLabel, placeLabels } from "../../slices/keywords/model.js";
import { keywordSpecs } from "../../slices/keywords/specs.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const projectParam = z.object({ projectId: z.string().min(1).max(64) });

// The keywords Slopify fills, as the editor's Insert bar and agents read them, and a project's
// facts copied again for Edit project's Refresh keyword facts.
export function keywordRoutes(deps: AppDeps) {
  return new Hono()
    .get("/", (c) =>
      c.json({
        keywords: keywordSpecs.map((spec) => ({
          ...spec,
          cost: { kind: spec.cost, label: costLabel(spec.cost) },
          places: spec.places.map((place) => ({ place, label: placeLabels[place] })),
        })),
      }),
    )
    .get("/facts/:projectId", zValidator("param", projectParam, onInvalid), (c) => {
      const { projectId } = c.req.valid("param");
      const project = projectById(deps.db, projectId);
      if (project === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail: projectTrashed(deps.db, projectId)
            ? "This project is in the trash. Restore it in Settings → Trash, then refresh its keyword facts."
            : "This project no longer exists. Go back to Projects to pick another.",
        });
      return c.json({
        keywordFacts: keywordFactsFor(
          deps,
          { ...project.config, channelId: projectChannelId(deps.db, projectId) },
          deps.clock.now(),
          projectId,
        ),
      });
    });
}
