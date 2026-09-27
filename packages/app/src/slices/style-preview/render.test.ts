import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import { legacyVideoEdit } from "../video/edit-settings.js";
import { probeDurationMs, resolveFfmpeg } from "../video/ffmpeg.js";
import { bundledSampleAssets } from "./narration.js";
import { ffmpegStylePreview } from "./render.js";
import { normalizeStylePreview } from "./settings.js";

// One real render with this machine's ffmpeg: captions burned in, a transition, the Look and a
// chapter card, on the bundled sample's images and narration. Skipped where there is no ffmpeg.
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
    // The sample narration plays under it: not silence.
    expect(loudest(output)).toBeGreaterThan(-30);
  },
  120_000,
);

it.skipIf(bin === undefined)(
  "renders on a given picture instead of the sample's images",
  async () => {
    const dir = join(scratch, "picture-cache");
    const picture = join(scratch, "picture.jpg");
    // Any real picture will do; one of the bundled sample's is at hand.
    copyFileSync(bundledSampleAssets().wide[1] ?? "", picture);
    const render = ffmpegStylePreview({
      ffmpeg: bin ?? "",
      paths: layout(join(scratch, "data")),
      log,
      dir,
    });
    const output = join(scratch, "on-picture.mp4");
    await render(
      normalizeStylePreview({
        format: "9:16",
        subtitles: { mode: "off", fontId: "default", fontSize: 48, position: "bottom" },
      }),
      output,
      AbortSignal.timeout(110_000),
      picture,
    );
    expect(statSync(output).size).toBeGreaterThan(1000);
  },
  120_000,
);

it.skipIf(bin === undefined)(
  "renders the Shorts layout through the Shorts renderer, faster at a higher speed",
  async () => {
    const render = ffmpegStylePreview({
      ffmpeg: bin ?? "",
      paths: layout(join(scratch, "data")),
      log,
      dir: join(scratch, "shorts-cache"),
    });
    const output = join(scratch, "short.mp4");
    const settings = normalizeStylePreview({
      format: "16:9",
      subtitles: { mode: "off", fontId: "default", fontSize: 48, position: "bottom" },
      shorts: { titleOnScreen: true, speed: 1.2, title: "Tides" },
    });
    await render(settings, output, AbortSignal.timeout(110_000));
    const ms = await probeDurationMs(bin ?? "", output, AbortSignal.timeout(20_000), log);
    expect(ms).toBeGreaterThan(4500);
    expect(ms).toBeLessThan(5500);
    expect(frameSize(output)).toBe("270x480");
    expect(loudest(output)).toBeGreaterThan(-30);
  },
  120_000,
);

// The loudest sample of a file's sound, in dB.
function loudest(file: string): number {
  const run = spawnSync(
    bin ?? "",
    ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    {
      encoding: "utf8",
    },
  );
  return Number(/max_volume: (-?[\d.]+) dB/.exec(run.stderr)?.[1] ?? "-100");
}

function frameSize(file: string): string | undefined {
  const run = spawnSync(bin ?? "", ["-hide_banner", "-i", file], { encoding: "utf8" });
  return /Video: .*?, (\d+x\d+)/.exec(run.stderr)?.[1];
}
