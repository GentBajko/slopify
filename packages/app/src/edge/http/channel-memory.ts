import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  clearChannelVideos,
  deleteChannelVideo,
  importChannelVideos,
  listChannelVideos,
  previewChannelVideos,
} from "../../slices/channels/videos.js";
import {
  channelEpisodes,
  deleteMemory,
  editMemory,
  setEpisodeMemory,
} from "../../slices/episodes/service.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const idParam = z.object({ id: z.uuid() });
const memoryParam = idParam.extend({ memoryId: z.string().min(1).max(100) });
const videoParam = idParam.extend({ videoId: z.uuid() });
// A YouTube Studio export of a large channel is a few megabytes.
const importMaxBytes = 20 * 1024 * 1024;

type Refusal = {
  readonly ok: false;
  readonly reason: "not-found" | "invalid-input";
  readonly message?: string | undefined;
};

// Channel page → Episodes (episode memory: the setting and the summaries) and Existing videos
// (titles made before Slopify; a CSV is previewed, then its ticked titles are saved). Mounted
// beside `channelRoutes` under /api/channels.
export function channelMemoryRoutes(deps: AppDeps) {
  const service = { db: deps.db, clock: deps.clock, uuid: randomUUID };
  return new Hono()
    .get("/:id/episodes", zValidator("param", idParam, onInvalid), (c) => {
      const result = channelEpisodes(service, c.req.valid("param").id);
      return result.ok ? c.json(result.value) : refused(c, result, "episode");
    })
    .put("/:id/episodes/setting", zValidator("param", idParam, onInvalid), async (c) => {
      const result = setEpisodeMemory(service, c.req.valid("param").id, await body(c));
      return result.ok ? c.json(result.value) : refused(c, result, "episode");
    })
    .put("/:id/episodes/:memoryId", zValidator("param", memoryParam, onInvalid), async (c) => {
      const { id, memoryId } = c.req.valid("param");
      const result = editMemory(service, id, memoryId, await body(c));
      return result.ok ? c.json(result.value) : refused(c, result, "episode");
    })
    .delete("/:id/episodes/:memoryId", zValidator("param", memoryParam, onInvalid), (c) => {
      const { id, memoryId } = c.req.valid("param");
      const result = deleteMemory(service, id, memoryId);
      return result.ok ? c.body(null, 204) : refused(c, result, "episode");
    })
    .get("/:id/videos", zValidator("param", idParam, onInvalid), (c) => {
      const result = listChannelVideos(service, c.req.valid("param").id);
      return result.ok ? c.json({ videos: result.value }) : refused(c, result, "video");
    })
    .post(
      "/:id/videos/preview",
      zValidator("param", idParam, onInvalid),
      importLimit(),
      async (c) => {
        const result = previewChannelVideos(service, c.req.valid("param").id, await body(c));
        return result.ok ? c.json(result.value) : refused(c, result, "video");
      },
    )
    .post("/:id/videos", zValidator("param", idParam, onInvalid), importLimit(), async (c) => {
      const result = importChannelVideos(service, c.req.valid("param").id, await body(c));
      return result.ok ? c.json(result.value, 201) : refused(c, result, "video");
    })
    .delete("/:id/videos", zValidator("param", idParam, onInvalid), (c) => {
      const result = clearChannelVideos(service, c.req.valid("param").id);
      return result.ok ? c.json(result.value) : refused(c, result, "video");
    })
    .delete("/:id/videos/:videoId", zValidator("param", videoParam, onInvalid), (c) => {
      const { id, videoId } = c.req.valid("param");
      const result = deleteChannelVideo(service, id, videoId);
      return result.ok ? c.body(null, 204) : refused(c, result, "video");
    });
}

function importLimit() {
  return bodyLimit({
    maxSize: importMaxBytes,
    onError: (c) =>
      refused(
        c,
        {
          ok: false,
          reason: "invalid-input",
          message:
            "This file is larger than 20 MB. Export fewer videos from YouTube Studio, or paste the titles instead.",
        },
        "video",
      ),
  });
}

async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function refused(c: Context, result: Refusal, about: "episode" | "video"): Response {
  const status = result.reason === "not-found" ? 404 : 400;
  const detail =
    result.message ??
    (result.reason === "not-found"
      ? about === "episode"
        ? "This channel or episode summary no longer exists; it may have been deleted in another tab. Reload the channel's Episodes tab."
        : "This channel or video title no longer exists; it may have been deleted in another tab. Reload the channel's Existing videos tab."
      : "This request isn't valid. Reload the page and try again.");
  return problem(c, {
    status,
    title: titleOf(status),
    detail,
    extensions: { reason: result.reason },
  });
}
