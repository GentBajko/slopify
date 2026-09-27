import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  type CastImageDeps,
  deleteCastImage,
  generateCastImage,
  uploadCastImage,
} from "../../slices/channels/cast-images.js";
import { castImageMaxBytes } from "../../slices/channels/images.js";
import type { ChannelResult } from "../../slices/channels/model.js";
import { imageBlob } from "../../slices/channels/repo.js";
import {
  createCastMember,
  createChannel,
  deleteCastMember,
  deleteChannel,
  listChannels,
  moveTemplate,
  readChannel,
  setChannelAiDisclosure,
  updateCastMember,
  updateChannel,
} from "../../slices/channels/service.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({ id: z.uuid() });
const memberParam = z.object({ memberId: z.uuid() });
const imageParam = memberParam.extend({ imageId: z.uuid() });
const pictureParam = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) });
const templateParam = z.object({ templateId: z.uuid() });

// Channels: the channels, their brand kit, series brief and cast, and which channel
// each template belongs to. The bodies are checked by the slice, so a refusal names the field.
export function channelRoutes(deps: AppDeps) {
  const service: CastImageDeps = {
    db: deps.db,
    clock: deps.clock,
    uuid: randomUUID,
    generateImage: deps.generateCastImage,
    log: deps.log,
  };
  return (
    new Hono()
      .get("/", (c) => c.json({ channels: listChannels(service) }))
      .post("/", async (c) => {
        const result = createChannel(service, await body(c));
        return result.ok ? c.json(result.value, 201) : refused(c, result);
      })
      // The pictures by content hash: they never change, so the browser may keep them.
      .get("/pictures/:sha256", zValidator("param", pictureParam, onInvalid), (c) => {
        const blob = imageBlob(deps.db, c.req.valid("param").sha256);
        if (blob === undefined) return refused(c, { ok: false, reason: "not-found" });
        return c.body(new Uint8Array(blob.bytes), 200, {
          "Content-Type": blob.mime,
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        });
      })
      .put("/templates/:templateId", zValidator("param", templateParam, onInvalid), async (c) => {
        const result = moveTemplate(service, c.req.valid("param").templateId, await body(c));
        return result.ok ? c.json(result.value) : refused(c, result);
      })
      .put("/cast/:memberId", zValidator("param", memberParam, onInvalid), async (c) => {
        const result = updateCastMember(service, c.req.valid("param").memberId, await body(c));
        return result.ok ? c.json(result.value) : refused(c, result);
      })
      .delete("/cast/:memberId", zValidator("param", memberParam, onInvalid), (c) => {
        const result = deleteCastMember(service, c.req.valid("param").memberId);
        return result.ok ? c.body(null, 204) : refused(c, result);
      })
      // The picture's bytes are the body, as the file input read them.
      .post(
        "/cast/:memberId/images",
        zValidator("param", memberParam, onInvalid),
        bodyLimit({
          maxSize: castImageMaxBytes,
          onError: (c) =>
            refused(c, {
              ok: false,
              reason: "not-an-image",
              message: `This picture is larger than ${String(castImageMaxBytes / 1024 / 1024)} MB. Save it smaller (for example as a JPEG) and upload it again.`,
            }),
        }),
        async (c) => {
          const bytes = new Uint8Array(await c.req.arrayBuffer());
          const result = uploadCastImage(service, c.req.valid("param").memberId, bytes);
          return result.ok ? c.json(result.value, 201) : refused(c, result);
        },
      )
      .post("/cast/:memberId/generate", zValidator("param", memberParam, onInvalid), async (c) => {
        const result = generateCastImage(service, c.req.valid("param").memberId, await body(c));
        return result.ok ? c.json(result.value, 202) : refused(c, result);
      })
      .delete(
        "/cast/:memberId/images/:imageId",
        zValidator("param", imageParam, onInvalid),
        (c) => {
          const { memberId, imageId } = c.req.valid("param");
          const result = deleteCastImage(service, memberId, imageId);
          return result.ok ? c.body(null, 204) : refused(c, result);
        },
      )
      .get("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const result = readChannel(service, c.req.valid("param").id);
        return result.ok ? c.json(result.value) : refused(c, result);
      })
      .put("/:id", zValidator("param", idParam, onInvalid), async (c) => {
        const result = updateChannel(service, c.req.valid("param").id, await body(c));
        return result.ok ? c.json(result.value) : refused(c, result);
      })
      .put("/:id/ai-disclosure", zValidator("param", idParam, onInvalid), async (c) => {
        const result = setChannelAiDisclosure(service, c.req.valid("param").id, await body(c));
        return result.ok ? c.json(result.value) : refused(c, result);
      })
      .delete("/:id", zValidator("param", idParam, onInvalid), (c) => {
        const result = deleteChannel(service, c.req.valid("param").id);
        return result.ok ? c.body(null, 204) : refused(c, result);
      })
      .post("/:id/cast", zValidator("param", idParam, onInvalid), async (c) => {
        const result = createCastMember(service, c.req.valid("param").id, await body(c));
        return result.ok ? c.json(result.value, 201) : refused(c, result);
      })
  );
}

async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const details: Readonly<Record<Extract<ChannelResult<never>, { ok: false }>["reason"], string>> = {
  "not-found":
    "This channel, cast member or picture no longer exists; it may have been deleted in another tab. Go back to Channels.",
  conflict:
    "This changed in another tab while you were editing. Reload the page to see the latest, then make your change again.",
  "invalid-input":
    "Some of these settings are not valid. Check the highlighted fields and try again.",
  "default-channel":
    "The default channel can't be deleted; projects and templates without a channel belong to it. Rename it in its Brand tab instead.",
  "has-templates":
    "This channel still has templates. Move them to another channel in its Templates tab, or delete them, then delete the channel.",
  "not-an-image": "This file is not a PNG or JPEG picture. Upload a PNG or JPEG file.",
  "too-many-images":
    "This cast member already has the most pictures it can keep. Delete one first.",
  "no-image-provider":
    "Slopify can't make pictures here yet. Set up an image provider in Settings → Providers, or upload a picture instead.",
};

function refused(c: Context, result: Extract<ChannelResult<never>, { ok: false }>): Response {
  const status =
    result.reason === "not-found"
      ? 404
      : result.reason === "conflict" || result.reason === "has-templates"
        ? 409
        : 400;
  return problem(c, {
    status,
    title: titleOf(status),
    detail: result.message ?? details[result.reason],
    extensions: { reason: result.reason },
  });
}
