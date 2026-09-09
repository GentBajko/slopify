import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { outputsOf } from "../storage/repo.js";
import { exportFixture, inspectMedia, wavParts } from "./export.fake.js";
import { renderVideo } from "./run.js";

const fixtures: ReturnType<typeof exportFixture>[] = [];
function fixture(...args: Parameters<typeof exportFixture>) {
  const result = exportFixture(...args);
  fixtures.push(result);
  return result;
}
afterEach(() => {
  for (const one of fixtures.splice(0)) {
    one.deps.db.close();
    rmSync(one.deps.paths.dataDir, { recursive: true, force: true });
  }
});

describe("optional media exports with real ffmpeg", () => {
  it.each(["mp3", "wav"] as const)(
    "exports provided %s as real PCM stereo 48 kHz WAV without images",
    async (extension) => {
      const h = fixture("off", "provide");
      h.tone("audio_body", extension);
      await renderVideo(h.deps, h.context());
      const exported = outputsOf(h.deps.db, "p1").find((output) => output.role === "audio_export");
      expect(exported).toMatchObject({ path: "audio.wav", stageKind: "video", durationMs: 300 });
      const wav = wavParts(join(h.dir, "audio.wav"));
      expect(wav).toMatchObject({
        signature: "RIFF",
        container: "WAVE",
        codec: 1,
        channels: 2,
        rate: 48000,
        bits: 16,
      });
      expect(wav.duration).toBeCloseTo(0.3, 2);
      expect(wav.peakAt(0.1)).toBeGreaterThan(1000);
      expect(h.counted.events()).toEqual([]);
      expect(existsSync(join(h.dir, "video.mp4"))).toBe(false);
      expect(existsSync(join(h.dir, "audio.part.wav"))).toBe(false);
    },
  );

  it("joins intro, body and outro with the configured silence in the WAV", async () => {
    const h = fixture("off", "provide", 0.15);
    h.tone("audio_intro", "wav", 0.2);
    h.tone("audio_body", "mp3", 0.3);
    h.tone("audio_outro", "wav", 0.2);
    await renderVideo(h.deps, h.context());
    const wav = wavParts(join(h.dir, "audio.wav"));
    expect(wav.duration).toBeCloseTo(1, 2);
    for (const at of [0.1, 0.45, 0.9]) expect(wav.peakAt(at)).toBeGreaterThan(1000);
    for (const at of [0.25, 0.7]) expect(wav.peakAt(at)).toBe(0);
    const params = JSON.parse(readFileSync(join(h.dir, "render.json"), "utf8"));
    expect(params.output).toBe("audio.wav");
    expect(params.audio.map((segment: { path: string | null }) => segment.path)).toEqual([
      "audio_intro.wav",
      null,
      "audio_body.mp3",
      null,
      "audio_outro.wav",
    ]);
  });

  it.each([0, 0.01])(
    "honors a %s-second gap without adding leading or trailing silence",
    async (gap) => {
      const h = fixture("off", "provide", gap);
      h.tone("audio_intro", "wav", 0.2);
      h.tone("audio_body", "wav", 0.3);
      await renderVideo(h.deps, h.context());
      const wav = wavParts(join(h.dir, "audio.wav"));
      expect(wav.duration).toBeCloseTo(0.5 + gap, 3);
      expect(wav.peakAt(0.001)).toBeGreaterThan(1000);
      expect(wav.peakAt(wav.duration - 0.02)).toBeGreaterThan(1000);
    },
  );

  it("keeps the prior WAV and output row after a failed retry or cancellation", async () => {
    const h = fixture("off", "provide");
    const body = h.tone("audio_body", "wav");
    const source = readFileSync(body);
    await renderVideo(h.deps, h.context());
    const before = readFileSync(join(h.dir, "audio.wav"));
    const row = outputsOf(h.deps.db, "p1").find((output) => output.role === "audio_export");
    writeFileSync(body, "broken source");
    await expect(renderVideo(h.deps, h.context())).rejects.toThrow(/ffmpeg/);
    expect(readFileSync(join(h.dir, "audio.wav"))).toEqual(before);
    expect(outputsOf(h.deps.db, "p1").find((output) => output.role === "audio_export")).toEqual(
      row,
    );
    const abort = new AbortController();
    abort.abort();
    await expect(renderVideo(h.deps, h.context(abort.signal))).rejects.toThrow();
    expect(readFileSync(join(h.dir, "audio.wav"))).toEqual(before);
    expect(existsSync(join(h.dir, "audio.part.wav"))).toBe(false);
    writeFileSync(body, source);
    await renderVideo(h.deps, h.context());
    const replaced = outputsOf(h.deps.db, "p1").filter((output) => output.role === "audio_export");
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.id).not.toBe(row?.id);
    expect(readFileSync(join(h.dir, "audio.wav"))).toEqual(before);
    expect(h.counted.events()).toEqual([]);
  });

  it("discards an in-flight WAV when cancellation arrives with its progress", async () => {
    const h = fixture("off", "provide");
    h.tone("audio_body", "wav");
    await renderVideo(h.deps, h.context());
    const before = readFileSync(join(h.dir, "audio.wav"));
    const abort = new AbortController();
    await expect(
      renderVideo(h.deps, { ...h.context(abort.signal), emit: () => abort.abort() }),
    ).rejects.toThrow();
    expect(abort.signal.aborted).toBe(true);
    expect(readFileSync(join(h.dir, "audio.wav"))).toEqual(before);
    expect(existsSync(join(h.dir, "audio.part.wav"))).toBe(false);
  });

  it("renders five seconds per image with no audio stream when Audio is Off", async () => {
    const h = fixture("generate", "off");
    h.image();
    await renderVideo(h.deps, h.context());
    const report = inspectMedia(join(h.dir, "video.mp4"));
    expect(report).toContain("Duration: 00:00:05.00");
    expect(report).toContain("Video: h264");
    expect(report).not.toContain("Audio:");
    expect(outputsOf(h.deps.db, "p1").find((output) => output.role === "video")?.durationMs).toBe(
      5000,
    );
    expect(h.counted.events()).toHaveLength(1);
  }, 30000);
});
