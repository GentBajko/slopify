import { readFile } from "node:fs/promises";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { castImageMaxBytes } from "../../slices/channels/images.js";
import { type DesignRefusal, designFormats } from "../../slices/designs/model.js";
import type { DesignRenderer } from "../../slices/designs/render.js";
import type { DesignRunner } from "../../slices/designs/runner.js";
import {
  createDesign,
  type DesignDeps,
  getDesign,
  listDesignViews,
  setDesignHead,
  stepPicture,
  storeUploadedPicture,
  updateDesignRecord,
} from "../../slices/designs/service.js";
import { trashDesign } from "../../slices/trash/designs.js";
import { idParam, idString } from "./ids.js";
import { onInvalid, problem } from "./problem.js";
import { jsonBody } from "./refusal.js";

// Library → Designs: pictures edited step by step and designed pieces. The bodies are checked by
// the slice, so a refusal names what to fix; paid steps answer 202 and land on the design
// (`design.changed` on the global stream).

export interface DesignRoutesDeps {
  readonly service: DesignDeps;
  readonly runner: DesignRunner;
  readonly renderer: DesignRenderer;
}

const stepParam = idParam.extend({ stepId: idString });
const fileParam = idParam.extend({
  file: z.string().regex(new RegExp(`^(?:${designFormats.join("|")})\\.(?:png|pdf)$`)),
});
const listQuery = z.object({ projectId: idString.optional() });

export const designStatuses: Readonly<Record<DesignRefusal, ContentfulStatusCode>> = {
  "not-found": 404,
  invalid: 400,
  changed: 409,
  "mutation-reused": 409,
  "not-an-image": 400,
  "still-uploading": 409,
  "upload-gone": 404,
  "project-not-found": 404,
  "channel-not-found": 404,
  busy: 409,
  "no-image-provider": 409,
  "cost-changed": 409,
  "missing-values": 400,
  "not-ready": 409,
};

export function designRefused(
  c: Context,
  result: { readonly reason: DesignRefusal; readonly message: string; readonly current?: unknown },
): Response {
  return problem(c, {
    status: designStatuses[result.reason],
    detail: result.message,
    extensions: {
      reason: result.reason,
      ...(result.current === undefined
        ? {}
        : result.reason === "cost-changed"
          ? { quote: result.current }
          : { current: result.current }),
    },
  });
}

const unavailable = (c: Context): Response =>
  problem(c, {
    status: 503,
    detail:
      "Designs aren't available in this copy of Slopify. Restart Slopify; if it keeps happening, reinstall it.",
  });

export function designRoutes(deps: DesignRoutesDeps | undefined) {
  return (
    new Hono()
      .get("/", zValidator("query", listQuery, onInvalid), (c) => {
        if (deps === undefined) return unavailable(c);
        return c.json({
          designs: listDesignViews(deps.service.db, c.req.valid("query").projectId),
        });
      })
      .post("/", async (c) => {
        if (deps === undefined) return unavailable(c);
        const result = createDesign(deps.service, await jsonBody(c));
        return result.ok ? c.json(result.value, 201) : designRefused(c, result);
      })
      // The picture's bytes are the body; the answer's sha256 starts a design (fromStepSha).
      .post(
        "/pictures",
        bodyLimit({
          maxSize: castImageMaxBytes,
          onError: (c) =>
            designRefused(c, {
              reason: "not-an-image",
              message: `This picture is larger than ${String(castImageMaxBytes / 1024 / 1024)} MB. Save it smaller (for example as a JPEG) and upload it again.`,
            }),
        }),
        async (c) => {
          if (deps === undefined) return unavailable(c);
          const result = storeUploadedPicture(
            deps.service,
            new Uint8Array(await c.req.arrayBuffer()),
          );
          return result.ok ? c.json(result.value, 201) : designRefused(c, result);
        },
      )
      .get("/:id", zValidator("param", idParam, onInvalid), (c) => {
        if (deps === undefined) return unavailable(c);
        const result = getDesign(deps.service, c.req.valid("param").id);
        return result.ok ? c.json(result.value) : designRefused(c, result);
      })
      .put("/:id", zValidator("param", idParam, onInvalid), async (c) => {
        if (deps === undefined) return unavailable(c);
        const result = updateDesignRecord(deps.service, c.req.valid("param").id, await jsonBody(c));
        return result.ok ? c.json(result.value) : designRefused(c, result);
      })
      .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
        if (deps === undefined) return unavailable(c);
        const id = c.req.valid("param").id;
        const result = trashDesign(deps.service, id);
        if (!result.ok)
          return designRefused(c, {
            reason: "not-found",
            message: "This design no longer exists. Go back to Designs to choose another.",
          });
        deps.service.emit?.({ type: "design.changed", designId: id });
        return c.body(null, 204);
      })
      // Quoting records nothing and starts nothing.
      .post("/:id/quote", zValidator("param", idParam, onInvalid), async (c) => {
        if (deps === undefined) return unavailable(c);
        const result = deps.runner.quoteEdit(c.req.valid("param").id, await jsonBody(c));
        return result.ok ? c.json(result.value) : designRefused(c, result);
      })
      .post("/:id/artwork/quote", zValidator("param", idParam, onInvalid), (c) => {
        if (deps === undefined) return unavailable(c);
        const result = deps.runner.quoteArtwork(c.req.valid("param").id);
        return result.ok ? c.json(result.value) : designRefused(c, result);
      })
      .post("/:id/edit", zValidator("param", idParam, onInvalid), async (c) => {
        if (deps === undefined) return unavailable(c);
        const result = deps.runner.edit(c.req.valid("param").id, await jsonBody(c));
        return result.ok ? c.json(result.value, 202) : designRefused(c, result);
      })
      .post("/:id/artwork", zValidator("param", idParam, onInvalid), async (c) => {
        if (deps === undefined) return unavailable(c);
        const result = deps.runner.artwork(c.req.valid("param").id, await jsonBody(c));
        return result.ok ? c.json(result.value, 202) : designRefused(c, result);
      })
      .post("/:id/steps/:stepId/retry", zValidator("param", stepParam, onInvalid), async (c) => {
        if (deps === undefined) return unavailable(c);
        const { id, stepId } = c.req.valid("param");
        const result = deps.runner.retry(id, stepId, await jsonBody(c));
        return result.ok ? c.json(result.value, 202) : designRefused(c, result);
      })
      .put("/:id/head", zValidator("param", idParam, onInvalid), async (c) => {
        if (deps === undefined) return unavailable(c);
        const result = setDesignHead(deps.service, c.req.valid("param").id, await jsonBody(c));
        return result.ok ? c.json(result.value) : designRefused(c, result);
      })
      // A version never changes, so the browser may keep it.
      .get("/:id/steps/:stepId/picture", zValidator("param", stepParam, onInvalid), (c) => {
        if (deps === undefined) return unavailable(c);
        const { id, stepId } = c.req.valid("param");
        const picture = stepPicture(deps.service.db, id, stepId);
        if (picture === undefined)
          return designRefused(c, {
            reason: "not-found",
            message: "That version has no picture. Reload the design to see its versions.",
          });
        return c.body(new Uint8Array(picture.bytes), 200, {
          "Content-Type": picture.mime,
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        });
      })
      // Drawn on demand in a child ffmpeg (and the PDF worker), then served from the cache.
      .get("/:id/files/:file", zValidator("param", fileParam, onInvalid), async (c) => {
        if (deps === undefined) return unavailable(c);
        const { id, file } = c.req.valid("param");
        const format = z.enum(designFormats).parse(file.slice(0, file.lastIndexOf(".")));
        const type = file.endsWith(".pdf") ? "pdf" : "png";
        const result = await deps.renderer.render(id, format, type, c.req.raw.signal);
        if (!result.ok) return designRefused(c, result);
        const bytes = await readFile(result.value.path);
        return c.body(new Uint8Array(bytes), 200, {
          "Content-Type": result.value.mime,
          "Content-Disposition": `attachment; filename="${result.value.name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(result.value.name)}`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
      })
  );
}
