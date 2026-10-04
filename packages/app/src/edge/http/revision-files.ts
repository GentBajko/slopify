import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  findRevisionDownload,
  revisionSetZip,
  type ZipSet,
} from "../../slices/revisions/downloads.js";
import type { AppDeps } from "./app.js";
import { fileResponse } from "./byte-range.js";
import { replyForFolder } from "./folder-location.js";
import { onInvalid, problem, titleOf } from "./problem.js";
import { waveformAnswer } from "./waveform.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const revisionParam = z.object({ projectId: id, revisionId: id });
const recordParam = revisionParam.extend({ recordId: id });
const folderParam = z.object({ id, revisionId: id, recordId: id });
const setParam = revisionParam.extend({
  set: z.enum(["images.zip", "thumbnails.zip", "shorts.zip"]),
});
const setQuery = z.object({
  only: z
    .string()
    .regex(/^[0-9A-Za-z_-]{1,64}(?:,[0-9A-Za-z_-]{1,64}){0,499}$/)
    .optional(),
});

function zipSetOf(file: "images.zip" | "thumbnails.zip" | "shorts.zip"): ZipSet {
  return file === "images.zip" ? "images" : file === "thumbnails.zip" ? "thumbnails" : "shorts";
}

export function revisionFileRoutes(deps: AppDeps) {
  const waveform = waveformAnswer(deps.decodePeaks);
  return (
    new Hono()
      // Images' Download all, and the thumbnails or shorts as one zip. `?only=` names the records
      // picked, so the zip holds exactly those. Declared before :recordId so a zip is never read
      // as a record.
      .get(
        "/files/:projectId/revisions/:revisionId/:set{(?:images|thumbnails|shorts)\\.zip}",
        zValidator("param", setParam, onInvalid),
        zValidator("query", setQuery, onInvalid),
        (c) => {
          const { projectId, revisionId, set } = c.req.valid("param");
          const only = c.req.valid("query").only;
          const result = revisionSetZip(
            deps,
            projectId,
            revisionId,
            zipSetOf(set),
            only === undefined ? undefined : only.split(","),
          );
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
        async (c) => {
          const { projectId, revisionId, recordId } = c.req.valid("param");
          const result = findRevisionDownload(deps, projectId, revisionId, recordId);
          if (!result.ok) return unavailable(c, result.reason);
          const value = result.download;
          // `?waveform=N`: the audio player's bars instead of the file.
          const bars = await waveform(c, value);
          if (bars !== undefined) return bars;
          // `?inline=1` lets the project page open a PDF in a browser tab instead of saving
          // it. Only PDFs: anything else the browser might render stays a download.
          const inline = c.req.query("inline") === "1" && value.contentType === "application/pdf";
          return fileResponse(c, value.path, value.bytes, {
            "content-type": value.contentType,
            "content-disposition": `${inline ? "inline" : "attachment"}; filename="${value.filename}"`,
            "x-content-type-options": "nosniff",
          });
        },
      )
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
          detail:
            "For your safety, folders can only be opened from the Slopify page itself. Open Slopify and try again there.",
        });
      const { id: projectId, revisionId, recordId } = c.req.valid("param");
      const result = findRevisionDownload(deps, projectId, revisionId, recordId);
      if (!result.ok) return unavailable(c, result.reason);
      return replyForFolder(c, deps, projectId, result.download.path);
    },
  );
}

function unavailable(c: Context, reason: string): Response {
  return problem(c, {
    status: 404,
    title: titleOf(404),
    detail:
      reason === "missing-file"
        ? "This file was deleted or moved from the project folder. In the Edit tab, use Choose what to remake (in the project's More menu) to make it again."
        : reason === "no-images"
          ? "There are no saved files of this kind to put in the zip yet. Wait for the step that makes them to finish, then download again."
          : "This file is no longer part of the project. Reload the page to see its current files.",
    extensions: { reason },
  });
}
