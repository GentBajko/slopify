import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { projectTitle } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const projectParam = z.object({
  projectId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});
const previewParam = projectParam.extend({ previewId: z.uuid() });

export function audioPreviewRoutes(deps: Pick<AppDeps, "db" | "audioPreviews">) {
  return new Hono()
    .get("/:projectId/audio-preview", zValidator("param", projectParam, onInvalid), (c) => {
      const { projectId } = c.req.valid("param");
      if (projectTitle(deps.db, projectId) === undefined) return missing(c);
      c.header("Cache-Control", "no-store");
      return c.json({ previews: deps.audioPreviews?.list(projectId) ?? [] });
    })
    .get(
      "/:projectId/audio-preview/:previewId",
      zValidator("param", previewParam, onInvalid),
      (c) => {
        const { projectId, previewId } = c.req.valid("param");
        if (projectTitle(deps.db, projectId) === undefined) return missing(c);
        const stream = deps.audioPreviews?.stream(projectId, previewId, c.req.raw.signal);
        if (stream === undefined) return missing(c);
        // A growing MP3 has no final length or seek range. A native audio element
        // can consume it progressively; late listeners receive the retained prefix.
        return c.body(stream, 200, {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "Accept-Ranges": "none",
          "X-Content-Type-Options": "nosniff",
        });
      },
    );
}
function missing(c: Parameters<typeof problem>[0]): Response {
  return problem(c, {
    status: 404,
    title: titleOf(404),
    detail:
      "This live audio preview is no longer available. Finished narration is available in the audio outputs.",
  });
}
