import { readFileSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { expect, it } from "vitest";
import { outputPath } from "../storage/layout.js";
import { probeDurationMs, resolveFfmpeg } from "../video/ffmpeg.js";
import { exportFixture } from "./runtime-export.fake.js";
import { executeExportRecipe } from "./runtime-export.js";

it("publishes a playable PCM WAV and a relative render record through the real bundled ffmpeg", async () => {
  const rate = 8000;
  const bytes = Buffer.alloc(44 + rate * 2 * 4);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  const h = await exportFixture(false, bytes);
  try {
    const deps = { ...h.deps, ffmpeg: resolveFfmpeg({}, ffmpegStatic) };
    const { context, piece } = h.grant("export:wav");
    expect(await executeExportRecipe(deps, context, piece)).toBe("done");
    const outputs = h.view().outputs.filter((row) => row.selected);
    const wav = outputs.find((row) => row.output.role === "audio_export");
    const record = outputs.find((row) => row.output.role === "render_params");
    if (wav === undefined || record === undefined) throw new Error("Incomplete export bundle");
    const duration = await probeDurationMs(
      deps.ffmpeg,
      outputPath(deps.paths, h.projectId, wav.output.path),
      context.signal,
      deps.log,
    );
    expect(duration).toBeCloseTo(4000, -1);
    const text = readFileSync(outputPath(deps.paths, h.projectId, record.output.path), "utf8");
    expect(text).not.toContain(deps.paths.dataDir);
    expect(JSON.parse(text)).toMatchObject({
      sampleRate: 48000,
      channels: 2,
      codec: "pcm_s16le",
      output: wav.output.path,
    });
  } finally {
    h.close();
  }
});
