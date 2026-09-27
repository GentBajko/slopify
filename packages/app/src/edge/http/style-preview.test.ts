import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, beforeEach, expect, it } from "vitest";
import { StylePreviewError, type StylePreviewRenderer } from "../../slices/style-preview/render.js";
import { createStylePreviews } from "../../slices/style-preview/service.js";
import type { StylePreviewSettings } from "../../slices/style-preview/settings.js";
import { byteRange, stylePreviewRoutes } from "./style-preview.js";

// The routes with a renderer that writes a few bytes instead of running ffmpeg.
let dir = "";
let calls: StylePreviewSettings[] = [];
let fail: StylePreviewError | undefined;
let gate: Promise<void> = Promise.resolve();
const log = { write: (): void => {} };

const fake: StylePreviewRenderer = async (settings, output) => {
  calls.push(settings);
  await gate;
  if (fail !== undefined) throw fail;
  writeFileSync(output, `mp4 #${String(calls.length)} ${settings.format}`);
};

function app(): Hono {
  return new Hono().route(
    "/api/style-preview",
    stylePreviewRoutes({ stylePreviews: createStylePreviews({ dir, render: fake, log }) }),
  );
}
const body = {
  format: "16:9",
  subtitles: { mode: "burn-in", fontId: "default", fontSize: 48, position: "bottom" },
};
const post = (target: Hono, json: unknown) =>
  target.request("/api/style-preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(json),
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "slopify-style-preview-"));
  calls = [];
  fail = undefined;
  gate = Promise.resolve();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("renders once, answers from the saved file after that, and renders again when forced", async () => {
  const target = app();
  const first = await post(target, body);
  expect(first.status).toBe(200);
  const reply = (await first.json()) as { hash: string; url: string; cached: boolean };
  expect(reply).toMatchObject({ cached: false, seconds: 6 });
  expect(reply.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(reply.url).toMatch(new RegExp(`^/api/style-preview/${reply.hash}\\.mp4\\?v=\\d+$`));

  const again = (await (await post(target, body)).json()) as { hash: string; cached: boolean };
  expect(again).toMatchObject({ hash: reply.hash, cached: true });
  expect(calls).toHaveLength(1);

  const forced = (await (await post(target, { ...body, force: true })).json()) as {
    cached: boolean;
  };
  expect(forced.cached).toBe(false);
  expect(calls).toHaveLength(2);

  const video = await target.request(reply.url);
  expect(video.status).toBe(200);
  expect(video.headers.get("content-type")).toBe("video/mp4");
  expect(video.headers.get("accept-ranges")).toBe("bytes");
  expect(await video.text()).toBe("mp4 #2 16:9");
});

it("serves a byte range for seeking", async () => {
  const target = app();
  const reply = (await (await post(target, body)).json()) as { url: string };
  const part = await target.request(reply.url, { headers: { range: "bytes=4-5" } });
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe("bytes 4-5/11");
  expect(await part.text()).toBe("#1");
  const beyond = await target.request(reply.url, { headers: { range: "bytes=99-" } });
  expect(beyond.status).toBe(416);
  expect(byteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
  expect(byteRange("items=0-1", 10)).toBeUndefined();
});

it("keeps simultaneous requests for one preview to one render", async () => {
  let release = (): void => {};
  gate = new Promise((resolve) => {
    release = resolve;
  });
  const target = app();
  const both = Promise.all([post(target, body), post(target, body)]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  const [left, right] = await both;
  expect(left.status).toBe(200);
  expect(right.status).toBe(200);
  expect(calls).toHaveLength(1);
});

it("refuses a request it can't read", async () => {
  const target = app();
  expect((await post(target, { ...body, format: "4:3" })).status).toBe(400);
  expect(
    (await post(target, { ...body, subtitles: { ...body.subtitles, fontSize: 500 } })).status,
  ).toBe(400);
  expect(
    (await post(target, { ...body, subtitles: { ...body.subtitles, fontId: "../etc" } })).status,
  ).toBe(400);
  expect(calls).toHaveLength(0);
});

it("says in words what failed and how to fix it", async () => {
  fail = new StylePreviewError(
    "ffmpeg-missing",
    "The style preview couldn't render because ffmpeg wasn't found. Install ffmpeg, or use the Docker image, then press Render again.",
  );
  const response = await post(app(), body);
  expect(response.status).toBe(503);
  expect(response.headers.get("content-type")).toBe("application/problem+json");
  expect(await response.json()).toMatchObject({
    reason: "ffmpeg-missing",
    detail: expect.stringContaining("ffmpeg wasn't found"),
  });
  // Nothing half-written is kept or served.
  fail = undefined;
  const missing = await app().request(`/api/style-preview/${"a".repeat(64)}.mp4`);
  expect(missing.status).toBe(404);
});

it("answers that the preview is unavailable without a renderer", async () => {
  const bare = new Hono().route("/api/style-preview", stylePreviewRoutes({}));
  const response = await post(bare, body);
  expect(response.status).toBe(503);
});
