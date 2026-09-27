import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { StylePreviewError } from "../../slices/style-preview/render.js";
import { stylePreviewRequestSchema } from "../../slices/style-preview/schema.js";
import type { StylePreviews } from "../../slices/style-preview/service.js";
import { fileResponse } from "./byte-range.js";
import { onInvalid, problem, titleOf } from "./problem.js";

export { byteRange } from "./byte-range.js";

// POST renders (or finds) the preview for a set of caption and Look settings and answers where
// to play it; GET streams the mp4, with byte ranges so the browser's player can seek.
const fileParam = z.object({ file: z.string().regex(/^[a-f0-9]{64}\.mp4$/) });

export function stylePreviewRoutes(deps: { readonly stylePreviews?: StylePreviews | undefined }) {
  return new Hono()
    .post("/", zValidator("json", stylePreviewRequestSchema, onInvalid), async (c) => {
      const previews = deps.stylePreviews;
      if (previews === undefined) return unavailable(c);
      try {
        const result = await previews.render(c.req.valid("json"));
        c.header("Cache-Control", "no-store");
        return c.json({
          hash: result.hash,
          url: `/api/style-preview/${result.hash}.mp4?v=${String(result.version)}`,
          cached: result.cached,
          seconds: result.seconds,
        });
      } catch (error) {
        if (!(error instanceof StylePreviewError)) throw error;
        const status =
          error.reason === "font-missing" ? 409 : error.reason === "ffmpeg-missing" ? 503 : 500;
        return problem(c, {
          status,
          title: titleOf(status),
          detail: error.message,
          extensions: { reason: error.reason },
        });
      }
    })
    .get("/:file", zValidator("param", fileParam, onInvalid), (c) => {
      const saved = deps.stylePreviews?.file(c.req.valid("param").file.slice(0, 64));
      if (saved === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "This style preview is no longer saved; Slopify keeps only the most recent ones. Press Render again to make it.",
        });
      return fileResponse(c, saved.path, saved.bytes, {
        "content-type": "video/mp4",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      });
    });
}

function unavailable(c: Context): Response {
  return problem(c, {
    status: 503,
    title: titleOf(503),
    detail:
      "The style preview isn't available because this Slopify started without its video renderer. Restart Slopify, then press Render again.",
  });
}
