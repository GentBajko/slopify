import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { DownloadDeps } from "../../slices/storage/downloads.js";
import { findDownload, imagesZip } from "../../slices/storage/downloads.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

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
      .get("/files/:projectId/:asset", zValidator("param", assetParam, onInvalid), (c) => {
        const { projectId, asset } = c.req.valid("param");
        const result = findDownload(storage, projectId, asset);
        if (!result.ok) {
          return missing(c, result.reason);
        }
        const { download } = result;
        // ceiling: whole-file responses only. Seeking inside the finished video would
        // need a Range handler answering 206 with the requested slice.
        return c.body(Readable.toWeb(createReadStream(download.path)), 200, {
          "content-type": download.contentType,
          "content-length": String(download.bytes),
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
    "unknown-project": "No project has that id.",
    "unknown-asset": "This project has no such file.",
    "missing-file": "This file is recorded but is no longer on disk; re-run the stage.",
    "no-images": "This project has no images or thumbnail yet.",
  };
  return problem(c, { status: 404, title: titleOf(404), detail: details[reason] });
}
