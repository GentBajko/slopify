import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { uploadableStageKinds } from "../../slices/storage/model.js";
import { stagedFiles } from "../../slices/storage/repo.js";
import type { StorageDeps } from "../../slices/storage/staging.js";
import { discardStagedFile, stageUpload } from "../../slices/storage/staging.js";
import type { AppDeps } from "./app.js";
import { readMultipart } from "./multipart.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const kindParam = z.object({ kind: z.enum(uploadableStageKinds) });
const idParam = z.object({ id: z.string().min(1).max(64) });

// The return type is inferred on purpose: annotating it would erase the route types the
// SPA's client is generated from.
export function stagingRoutes(deps: AppDeps) {
  const storage: StorageDeps = {
    db: deps.db,
    paths: deps.paths,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    // The slice never reaches for the hub: progress is a function it is handed.
    emit: (event) => {
      deps.hub.emitGlobal(event);
    },
  };

  return new Hono()
    .get("/", (c) => c.json({ files: stagedFiles(deps.db) }))
    .post("/:kind", zValidator("param", kindParam, onInvalid), async (c) => {
      const result = await readMultipart(c.req.raw, (content, originalFilename) =>
        stageUpload(storage, {
          stageKind: c.req.valid("param").kind,
          originalFilename,
          content,
        }),
      );
      if (result === undefined) {
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "No file arrived with the upload. Choose the file again and retry.",
        });
      }
      if (!result.ok) {
        return problem(c, { status: 400, title: titleOf(400), detail: detailOf(result.reason) });
      }
      return c.json(result.file, 201);
    })
    .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
      const result = discardStagedFile(storage, c.req.valid("param").id);
      if (!result.ok) {
        return problem(c, {
          status: result.reason === "in-use" ? 409 : 404,
          title: titleOf(result.reason === "in-use" ? 409 : 404),
          detail:
            result.reason === "in-use"
              ? "This file is still attached to a draft in Play. Remove it from the draft first."
              : "This uploaded file no longer exists; it may have been removed already. Reload the page.",
        });
      }
      return c.body(null, 204);
    });
}

function detailOf(reason: "unsafe-filename" | "empty-file"): string {
  return reason === "empty-file"
    ? "This file is empty (0 bytes). Choose a file that has content."
    : "This file's name is empty or contains a slash. Rename the file on your computer, then upload it again.";
}
