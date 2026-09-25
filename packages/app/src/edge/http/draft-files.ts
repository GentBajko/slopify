import { createReadStream } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { DraftStartDeps } from "../../slices/play-drafts/model.js";
import { draftAttachmentSchema } from "../../slices/play-drafts/schema.js";
import { readDraft } from "../../slices/play-drafts/service.js";
import { uploadDraftAttachment } from "../../slices/play-drafts/uploads.js";
import { stagingPath } from "../../slices/storage/layout.js";
import { stagedFileById } from "../../slices/storage/repo.js";
import { draftProblem } from "./draft-problem.js";
import { readMultipart } from "./multipart.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const params = z.object({ id: z.uuid(), attachmentId: z.uuid() });
const imageTypes: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

// Inference preserves the route contracts consumed by the SPA client.
export function draftFileRoutes(service: () => DraftStartDeps) {
  return new Hono()
    .put(
      "/:id/attachments/:attachmentId/file",
      zValidator("param", params, onInvalid),
      async (c) => {
        const { id, attachmentId } = c.req.valid("param");
        const deps = service();
        const result = await readMultipart(c.req.raw, (content) =>
          uploadDraftAttachment(deps, { draftId: id, attachmentId, content }),
        );
        if (result === undefined)
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: "No file arrived with the upload. Choose the file again and retry.",
          });
        return result.ok
          ? c.json(draftAttachmentSchema.parse(result.value))
          : draftProblem(c, result);
      },
    )
    .get("/:id/attachments/:attachmentId/file", zValidator("param", params, onInvalid), (c) => {
      const deps = service();
      const { id, attachmentId } = c.req.valid("param");
      const view = readDraft(deps, id);
      if (!view.ok) return draftProblem(c, view);
      const attachment = view.value.attachments.find((a) => a.id === attachmentId);
      const staged =
        attachment?.stagedFileId === null || attachment?.stagedFileId === undefined
          ? undefined
          : stagedFileById(deps.db, attachment.stagedFileId);
      const contentType =
        attachment === undefined ? undefined : imageTypes[extname(attachment.name).toLowerCase()];
      if (
        attachment?.state !== "ready" ||
        attachment.kind === "audio" ||
        staged?.state !== "staged" ||
        staged.stageKind !== attachment.kind ||
        contentType === undefined
      )
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            "This attached file has not finished uploading, so it cannot be previewed yet. Wait a moment or attach it again.",
        });
      return c.body(Readable.toWeb(createReadStream(stagingPath(deps.paths, staged.path))), 200, {
        "content-type": contentType,
        "content-length": String(staged.bytes),
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      });
    });
}
