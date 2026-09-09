import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Busboy } from "@fastify/busboy";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { FontUpload, FontUploadResult } from "../../slices/fonts/index.js";
import {
  fontIdPattern,
  fontMaxBytes,
  isMissingFont,
  listFonts,
  previewFont,
  uploadFont,
} from "../../slices/fonts/index.js";
import type { AppDeps } from "./app.js";
import { problem, titleOf } from "./problem.js";

const idParam = z.object({ id: z.string().regex(fontIdPattern) });
type UploadPart =
  | { readonly ok: true; readonly upload: FontUpload }
  | { readonly ok: false; readonly reason: "multipart" | "too-large" };

// Inferred so the Hono client retains all response shapes.
export function fontsRoutes(deps: AppDeps) {
  return new Hono()
    .get("/", async (c) => c.json({ fonts: await listFonts(deps.paths) }))
    .post("/", async (c) => {
      const contentType = c.req.header("content-type");
      if (contentType === undefined || !contentType.toLowerCase().startsWith("multipart/form-data"))
        return problem(c, {
          status: 415,
          title: titleOf(415),
          detail: "Upload one .ttf or .otf file as multipart/form-data.",
        });
      const body = c.req.raw.body;
      if (body === null)
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail: "The request carried no font file.",
        });
      const part = await readUpload(contentType, body);
      if (!part.ok) {
        const tooLarge = part.reason === "too-large";
        return problem(c, {
          status: tooLarge ? 413 : 400,
          title: tooLarge ? "Content Too Large" : titleOf(400),
          detail: tooLarge
            ? "A font file must be no larger than 32 MiB."
            : "Upload exactly one complete font file in the file part.",
        });
      }
      const result = await uploadFont(deps.paths, part.upload);
      if (!result.ok) return problem(c, failure(result.reason));
      return c.json({ font: result.font }, 201);
    })
    .get(
      "/:id/file",
      zValidator("param", idParam, (result, c) => {
        if (!result.success)
          return problem(c, { status: 404, title: titleOf(404), detail: "No font has that id." });
        return undefined;
      }),
      async (c) => {
        try {
          const preview = await previewFont(deps.paths, c.req.valid("param").id);
          return c.body(Uint8Array.from(preview.content), 200, {
            "content-type": preview.contentType,
            "x-content-type-options": "nosniff",
            "cache-control": "private, max-age=300",
          });
        } catch (error) {
          if (!isMissingFont(error)) throw error;
          return problem(c, { status: 404, title: titleOf(404), detail: "No font has that id." });
        }
      },
    );
}

// Bounded buffering is intentional for small font files. No file is committed until
// the entire multipart envelope finishes, so a second part or truncation cannot save it.
async function readUpload(
  contentType: string,
  body: ReadableStream<Uint8Array>,
): Promise<UploadPart> {
  let parser: InstanceType<typeof Busboy>;
  try {
    parser = new Busboy({
      headers: { "content-type": contentType },
      preservePath: true,
      limits: { files: 1, fields: 0, parts: 1, fileSize: fontMaxBytes + 1 },
    });
  } catch {
    return { ok: false, reason: "multipart" };
  }
  const chunks: Uint8Array[] = [];
  let filename: string | undefined;
  let count = 0;
  let invalid = false;
  let tooLarge = false;
  parser.on("file", (field, stream, name) => {
    filename = name;
    if (field !== "file") invalid = true;
    stream.on("data", (chunk: Buffer) => {
      count += chunk.byteLength;
      if (count > fontMaxBytes) tooLarge = true;
      else chunks.push(chunk);
    });
    stream.on("limit", () => {
      tooLarge = true;
    });
    stream.on("error", (error: Error) => {
      invalid = true;
      parser.destroy(error);
    });
  });
  parser.on("filesLimit", () => {
    invalid = true;
  });
  parser.on("fieldsLimit", () => {
    invalid = true;
  });
  parser.on("partsLimit", () => {
    invalid = true;
  });
  try {
    await pipeline(Readable.fromWeb(body), parser);
  } catch {
    return { ok: false, reason: "multipart" };
  }
  if (tooLarge) return { ok: false, reason: "too-large" };
  if (invalid || filename === undefined) return { ok: false, reason: "multipart" };
  return { ok: true, upload: { filename, content: Buffer.concat(chunks, count) } };
}

function failure(reason: Extract<FontUploadResult, { ok: false }>["reason"]): {
  readonly status: 400 | 413 | 415;
  readonly title: string;
  readonly detail: string;
} {
  switch (reason) {
    case "too-large":
      return {
        status: 413,
        title: "Content Too Large",
        detail: "A font file must be no larger than 32 MiB.",
      };
    case "unsupported-format":
      return { status: 415, title: titleOf(415), detail: "Choose a .ttf or .otf font file." };
    case "unsafe-filename":
      return {
        status: 400,
        title: titleOf(400),
        detail: "The font filename cannot contain a path or control character.",
      };
    case "invalid-font":
      return {
        status: 400,
        title: titleOf(400),
        detail: "This file is not a supported, valid TrueType or OpenType font.",
      };
  }
}
