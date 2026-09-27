import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { StylePreviewError } from "../../slices/style-preview/render.js";
import { stylePreviewRequestSchema } from "../../slices/style-preview/schema.js";
import type { StylePreviews } from "../../slices/style-preview/service.js";
import { onInvalid, problem, titleOf } from "./problem.js";

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
      const headers: Record<string, string> = {
        "content-type": "video/mp4",
        "accept-ranges": "bytes",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      };
      const range = byteRange(c.req.header("range"), saved.bytes);
      if (range === "unsatisfiable")
        return new Response(null, {
          status: 416,
          headers: { ...headers, "content-range": `bytes */${String(saved.bytes)}` },
        });
      const { start, end } = range ?? { start: 0, end: saved.bytes - 1 };
      const body = Readable.toWeb(createReadStream(saved.path, { start, end })) as ReadableStream;
      return new Response(body, {
        status: range === undefined ? 200 : 206,
        headers: {
          ...headers,
          "content-length": String(end - start + 1),
          ...(range === undefined
            ? {}
            : { "content-range": `bytes ${String(start)}-${String(end)}/${String(saved.bytes)}` }),
        },
      });
    });
}

// One `bytes=` range, as browsers ask for media; anything else is answered with the whole file.
export function byteRange(
  header: string | undefined,
  size: number,
): { readonly start: number; readonly end: number } | "unsatisfiable" | undefined {
  const matched = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (matched === null) return undefined;
  const [, from = "", to = ""] = matched;
  if (from === "" && to === "") return undefined;
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

function unavailable(c: Context): Response {
  return problem(c, {
    status: 503,
    title: titleOf(503),
    detail:
      "The style preview isn't available because this Slopify started without its video renderer. Restart Slopify, then press Render again.",
  });
}
