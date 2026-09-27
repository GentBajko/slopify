import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { legacyVideoEdit } from "../video/edit-settings.js";
import { probeDurationMs, resolveFfmpeg } from "../video/ffmpeg.js";
import { ffmpegStylePreview } from "./render.js";
import { normalizeStylePreview } from "./settings.js";

// One real render with this machine's ffmpeg: captions burned in, a transition, the Look and a
// chapter card, on the stills the renderer makes itself. Skipped where there is no ffmpeg.
const bin = (() => {
  try {
    const found = resolveFfmpeg(process.env, ffmpegStatic);
    return existsSync(found) ? found : undefined;
  } catch {
    return undefined;
  }
})();
const log = { write: (): void => {} };
let scratch = "";

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-style-render-"));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

it.skipIf(bin === undefined)(
  "renders six seconds of video with every style setting",
  async () => {
    const dir = join(scratch, "cache");
    const render = ffmpegStylePreview({
      ffmpeg: bin ?? "",
      paths: layout(join(scratch, "data")),
      log,
      dir,
    });
    const output = join(scratch, "preview.mp4");
    await render(
      normalizeStylePreview({
        format: "16:9",
        subtitles: { mode: "burn-in", fontId: "default", fontSize: 48, position: "bottom" },
        videoEdit: {
          ...legacyVideoEdit,
          transition: "crossfade",
          vignette: "subtle",
          grain: "subtle",
          grade: "warm",
          chapterCards: true,
        },
      }),
      output,
      AbortSignal.timeout(110_000),
    );
    expect(statSync(output).size).toBeGreaterThan(1000);
    const ms = await probeDurationMs(bin ?? "", output, AbortSignal.timeout(20_000), log);
    expect(ms).toBeGreaterThan(5500);
    expect(ms).toBeLessThan(6500);
    // The stills are made once and kept.
    expect(existsSync(join(dir, "samples", "still-3.png"))).toBe(true);
  },
  120_000,
);

it.skipIf(bin === undefined)(
  "renders on a given picture instead of the sample stills",
  async () => {
    const dir = join(scratch, "picture-cache");
    const picture = join(scratch, "picture.png");
    // Any real PNG will do; one of another renderer's sample stills is at hand.
    const samples = ffmpegStylePreview({
      ffmpeg: bin ?? "",
      paths: layout(join(scratch, "data")),
      log,
      dir: join(scratch, "sample-cache"),
    });
    const settings = normalizeStylePreview({
      format: "9:16",
      subtitles: { mode: "off", fontId: "default", fontSize: 48, position: "bottom" },
    });
    await samples(settings, join(scratch, "first.mp4"), AbortSignal.timeout(110_000));
    copyFileSync(join(scratch, "sample-cache", "samples", "still-2.png"), picture);
    const render = ffmpegStylePreview({
      ffmpeg: bin ?? "",
      paths: layout(join(scratch, "data")),
      log,
      dir,
    });
    const output = join(scratch, "on-picture.mp4");
    await render(settings, output, AbortSignal.timeout(110_000), picture);
    expect(statSync(output).size).toBeGreaterThan(1000);
    // The renderer never made its own stills for this one.
    expect(existsSync(join(dir, "samples"))).toBe(false);
  },
  120_000,
);
