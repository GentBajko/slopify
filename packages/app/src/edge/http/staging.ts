import { Readable } from "node:stream";
import { Busboy } from "@fastify/busboy";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { StageKind } from "../../slices/storage/model.js";
import { uploadableStageKinds } from "../../slices/storage/model.js";
import { stagedFiles } from "../../slices/storage/repo.js";
import type { StageUploadResult, StorageDeps } from "../../slices/storage/staging.js";
import { discardStagedFile, stageUpload } from "../../slices/storage/staging.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const kindParam = z.object({ kind: z.enum(uploadableStageKinds) });
const idParam = z.object({ id: z.string().min(1).max(64) });

// The return type is inferred on purpose: annotating it would erase the route types the
// SPA's client is generated from (02-models §Q27).
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
      const contentType = c.req.header("content-type");
      if (contentType === undefined || !contentType.startsWith("multipart/form-data")) {
        return problem(c, {
          status: 415,
          title: titleOf(415),
          detail: "An upload is sent as multipart/form-data with the file in one part.",
        });
      }
      const body = c.req.raw.body;
      if (body === null) {
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "The request carried no body.",
        });
      }

      const result = await readUpload(storage, c.req.valid("param").kind, contentType, body);
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
          status: 404,
          title: titleOf(404),
          detail: "No staged file has that id.",
        });
      }
      return c.body(null, 204);
    });
}

// The bytes go from the socket to the parser to the disk. Nothing collects them: the
// platform's own formData() materialises a whole part in memory first, which an
// uncapped audio or video upload cannot afford.
function readUpload(
  storage: StorageDeps,
  stageKind: StageKind,
  contentType: string,
  body: ReadableStream<Uint8Array>,
): Promise<StageUploadResult | undefined> {
  return new Promise<StageUploadResult | undefined>((resolve, reject) => {
    const parser = new Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fields: 8 },
      // The parser hands the name through untouched: silently renaming a file the user
      // picked would record a name nobody chose, so the slice rejects instead.
      preservePath: true,
    });
    let started = false;
    parser.on("file", (_field, stream, filename) => {
      started = true;
      stageUpload(storage, {
        stageKind,
        originalFilename: typeof filename === "string" ? filename : "",
        content: stream,
      }).then(resolve, reject);
    });
    parser.on("error", reject);
    parser.on("finish", () => {
      if (!started) {
        resolve(undefined);
      }
    });
    Readable.fromWeb(body).pipe(parser);
  });
}

function detailOf(reason: "unsafe-filename" | "empty-file"): string {
  return reason === "empty-file"
    ? "The uploaded file is empty."
    : "The file name may not be empty or contain a path separator.";
}
