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
          detail: "The request carried no file part.",
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
              ? "This file is used by a saved draft."
              : "No staged file has that id.",
        });
      }
      return c.body(null, 204);
    });
}

function detailOf(reason: "unsafe-filename" | "empty-file"): string {
  return reason === "empty-file"
    ? "The uploaded file is empty."
    : "The file name may not be empty or contain a path separator.";
}
