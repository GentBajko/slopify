import { createReadStream } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { findRevisionDownload, revisionImagesZip } from "../../slices/revisions/downloads.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const revisionParam = z.object({ projectId: id, revisionId: id });
const recordParam = revisionParam.extend({ recordId: id });
const folderParam = z.object({ id, revisionId: id, recordId: id });

export function revisionFileRoutes(deps: AppDeps) {
  return new Hono()
    .get(
      "/files/:projectId/revisions/:revisionId/images.zip",
      zValidator("param", revisionParam, onInvalid),
      (c) => {
        const { projectId, revisionId } = c.req.valid("param");
        const result = revisionImagesZip(deps, projectId, revisionId);
        if (!result.ok) return unavailable(c, result.reason);
        return c.body(result.bytes, 200, {
          "content-type": "application/zip",
          "content-length": String(result.bytes.byteLength),
          "content-disposition": `attachment; filename="${result.filename}"`,
        });
      },
    )
    .get(
      "/files/:projectId/revisions/:revisionId/:recordId",
      zValidator("param", recordParam, onInvalid),
      (c) => {
        const { projectId, revisionId, recordId } = c.req.valid("param");
        const result = findRevisionDownload(deps, projectId, revisionId, recordId);
        if (!result.ok) return unavailable(c, result.reason);
        const value = result.download;
        return c.body(Readable.toWeb(createReadStream(value.path)), 200, {
          "content-type": value.contentType,
          "content-length": String(value.bytes),
          "content-disposition": `attachment; filename="${value.filename}"`,
        });
      },
    );
}

export function revisionFolderRoutes(deps: AppDeps) {
  return new Hono().post(
    "/:id/revisions/:revisionId/:recordId/open-folder",
    zValidator("param", folderParam, onInvalid),
    async (c) => {
      const origin = c.req.header("origin");
      if (origin !== undefined && origin !== new URL(c.req.url).origin)
        return problem(c, {
          status: 403,
          title: titleOf(403),
          detail: "Open folders from Slopify itself.",
        });
      const { id: projectId, revisionId, recordId } = c.req.valid("param");
      const result = findRevisionDownload(deps, projectId, revisionId, recordId);
      if (!result.ok) return unavailable(c, result.reason);
      try {
        if (deps.openFolder === undefined) throw new Error("No folder opener configured");
        await deps.openFolder(dirname(result.download.path));
        return c.json({ opened: true });
      } catch {
        deps.log.write("warn", "project.open-folder", {
          projectId,
          detail: "The file manager could not be opened for a retained file.",
        });
        return problem(c, {
          status: 503,
          title: titleOf(503),
          detail:
            "Could not open the file manager on the machine running Slopify. Make sure a desktop session is available.",
        });
      }
    },
  );
}

function unavailable(c: Context, reason: string): Response {
  return problem(c, {
    status: 404,
    title: titleOf(404),
    detail:
      reason === "missing-file"
        ? "This retained file is no longer on disk. Review the affected rebuild to recreate it."
        : "The retained file is unavailable.",
    extensions: { reason },
  });
}
