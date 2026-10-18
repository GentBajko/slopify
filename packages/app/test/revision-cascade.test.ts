import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { allTelemetryEvents, insertMachine } from "../src/slices/telemetry/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

// An edit carried through to a fresh video over the real runner and the bundled ffmpeg: what
// the edit touches is made again, what it does not is kept. The voice and the image model are
// doubles; the fixture's images are drawn from the prompts "One" and "Two".

const scratch = mkdtempSync(join(tmpdir(), "slopify-cascade-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);

function still(): Uint8Array {
  const path = join(scratch, "still.png");
  execFileSync(ffmpeg, [
    ...["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=teal:s=320x180"],
    ...["-frames:v", "1", path],
  ]);
  return new Uint8Array(readFileSync(path));
}

async function rendered() {
  const images = fakeImage({ bytes: still() });
  const spoken: string[] = [];
  const voice = fakeTts({ bytesFor: () => [tone()] });
  const h = await composedFixture({
    image: () => images,
    tts: () => ({
      ...voice,
      synthesize: (request) => {
        spoken.push(request.text);
        return voice.synthesize(request);
      },
    }),
  });
  insertMachine(h.deps.db, {
    machineId: "5b0c1f9e-0d4e-4d7a-9a55-3b1f2f1e7c11",
    noticeSeenAt: new Date().toISOString(),
    appVersion: "test",
  });
  // One request for the whole article.
  const catalogue = h.deps.catalogue.read();
  h.setCatalogue({
    ...catalogue,
    tts: catalogue.tts.map((row) =>
      row.tts === undefined ? row : { ...row, tts: { ...row.tts, maxCharacters: 1000 } },
    ),
  });
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      sources: { ...base.revision.config.sources, audio: "generate", video: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope is old." },
      imageSeconds: 1,
    },
    content: base.revision.content,
  });
  await start(h.deps, h.projectId, ["export:video"]);
  await h.runner.settled();
  const selected = (role: string) =>
    current(h.deps, h.projectId).outputs.filter(
      (row) => row.selected && row.state === "ready" && row.output.role === role,
    );
  const counted = (stage: string) =>
    allTelemetryEvents(h.deps.db).filter((event) => event.payload.stage === stage).length;
  const close = async () => {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
  };
  return { h, images, spoken, selected, counted, close };
}

it("carries an article edit through the narration to a fresh video, keeping the images", async () => {
  const r = await rendered();
  try {
    const [video] = r.selected("video");
    const [body] = r.selected("audio_body");
    if (video === undefined || body === undefined) throw new Error("The first run did not finish.");
    const pictures = r.selected("image").map((row) => row.assetId);
    expect(r.images.calls()).toBe(2);
    const base = current(r.h.deps, r.h.projectId);
    await save(r.h.deps, r.h.projectId, {
      config: base.revision.config,
      content: { ...base.revision.content, articleMarkdown: "Rope is older than writing." },
    });
    await start(r.h.deps, r.h.projectId, ["export:video"]);
    await r.h.runner.settled();
    // The edited text is spoken again, not reused; the images are kept as they were.
    expect(r.spoken).toEqual(["Rope is old.", "Rope is older than writing."]);
    expect(r.images.calls()).toBe(2);
    expect(r.selected("image").map((row) => row.assetId)).toEqual(pictures);
    expect(r.selected("audio_body")[0]?.assetId).not.toBe(body.assetId);
    expect(r.selected("video")[0]?.assetId).not.toBe(video.assetId);
    expect(r.counted("video")).toBe(2);
    expect(r.counted("images")).toBe(2);
  } finally {
    await r.close();
  }
}, 60_000);

it("renders again without an image that was taken out, drawing nothing new", async () => {
  const r = await rendered();
  try {
    const [video] = r.selected("video");
    if (video === undefined) throw new Error("The first run did not finish.");
    const base = current(r.h.deps, r.h.projectId);
    const { two: _removed, ...kept } = base.revision.content.imageDefinitions;
    await save(r.h.deps, r.h.projectId, {
      config: base.revision.config,
      content: { ...base.revision.content, imageOrder: ["one"], imageDefinitions: kept },
    });
    await start(r.h.deps, r.h.projectId, ["export:video"]);
    await r.h.runner.settled();
    expect(r.images.calls()).toBe(2);
    expect(r.selected("video")[0]?.assetId).not.toBe(video.assetId);
    const remaining = r.selected("image");
    expect(remaining.map((row) => row.workKey)).toEqual(["image:one"]);
    const record = current(r.h.deps, r.h.projectId).outputs.find(
      (row) =>
        row.selected && row.workKey === "export:video" && row.output.role === "render_params",
    );
    if (record === undefined) throw new Error("No render record.");
    const plan = JSON.parse(
      readFileSync(outputPath(r.h.deps.paths, r.h.projectId, record.output.path), "utf8"),
    );
    const sources = new Set(
      plan.editList.shots.map((shot: { source: { path: string } }) => shot.source.path),
    );
    expect([...sources]).toEqual([remaining[0]?.output.path]);
  } finally {
    await r.close();
  }
}, 60_000);
