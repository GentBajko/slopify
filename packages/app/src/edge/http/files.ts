import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { DownloadDeps } from "../../slices/storage/downloads.js";
import { findDownload, imagesZip } from "../../slices/storage/downloads.js";
import type { AppDeps } from "./app.js";
import { fileResponse } from "./byte-range.js";
import { onInvalid, problem, titleOf } from "./problem.js";
import { waveformAnswer } from "./waveform.js";

const projectParam = z.object({
  projectId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});
const assetParam = projectParam.extend({
  asset: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
});

// The return type is inferred so Hono keeps the route types; see stagingRoutes.
export function fileRoutes(deps: AppDeps) {
  const storage: DownloadDeps = { db: deps.db, paths: deps.paths };
  const waveform = waveformAnswer(deps.decodePeaks);

  return (
    new Hono()
      // Declared before :asset so the zip is never read as an asset name.
      .get("/files/:projectId/images.zip", zValidator("param", projectParam, onInvalid), (c) => {
        const result = imagesZip(storage, c.req.valid("param").projectId);
        if (!result.ok) {
          return missing(c, result.reason);
        }
        return c.body(result.bytes, 200, {
          "content-type": "application/zip",
          "content-length": String(result.bytes.byteLength),
          "content-disposition": disposition(result.filename),
        });
      })
      .get("/files/:projectId/:asset", zValidator("param", assetParam, onInvalid), async (c) => {
        const { projectId, asset } = c.req.valid("param");
        const result = findDownload(storage, projectId, asset);
        if (!result.ok) {
          return missing(c, result.reason);
        }
        const { download } = result;
        // `?waveform=N`: the audio player's bars instead of the file.
        if (download.text === undefined) {
          const bars = await waveform(c, download);
          if (bars !== undefined) return bars;
        }
        // The YouTube description and tags as the page shows them, edits and links in.
        if (download.text !== undefined)
          return c.body(download.text, 200, {
            "content-type": download.contentType,
            "content-length": String(download.text.byteLength),
            "content-disposition": disposition(download.filename),
          });
        // Byte ranges, so the players can jump to any time in the video or narration.
        return fileResponse(c, download.path, download.bytes, {
          "content-type": download.contentType,
          "content-disposition": disposition(download.filename),
        });
      })
  );
}

// A download name is built from a slug, a role, and an extension, so it is always
// `[a-z0-9.-]` and needs neither quoting nor the RFC 5987 encoded form.
function disposition(filename: string): string {
  return `attachment; filename="${filename}"`;
}

function missing(
  c: Parameters<typeof problem>[0],
  reason: "unknown-project" | "unknown-asset" | "missing-file" | "no-images",
): Response {
  const details: Readonly<Record<typeof reason, string>> = {
    "unknown-project": "This project no longer exists. Go back to Projects to pick another.",
    "unknown-asset":
      "This project has no file by that name. Reload the page to see its current files.",
    "missing-file":
      "This file was deleted or moved from the project folder. Use More → make it again in its section on the project page to make it again.",
    "no-images":
      "This project has no images or thumbnail yet. Wait for the Images step to finish, then try again.",
  };
  return problem(c, { status: 404, title: titleOf(404), detail: details[reason] });
}
