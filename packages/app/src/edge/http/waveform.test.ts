import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { foldPeaks, waveformAnswer } from "./waveform.js";

function app(decode: Parameters<typeof waveformAnswer>[0], contentType = "audio/mpeg") {
  const answer = waveformAnswer(decode);
  return new Hono().get("/file", async (c) => {
    const bars = await answer(c, { path: "/tmp/narration.mp3", bytes: 42, contentType });
    return bars ?? c.text("the file itself");
  });
}

describe("the audio player's waveform", () => {
  it("folds peaks into the average of each equal run", () => {
    expect(foldPeaks([0.1, 0.5, 0.2, 0.9, 0.3, 0.4], 3)).toEqual([0.3, 0.55, 0.35]);
    // Fewer peaks than bars are kept as they are.
    expect(foldPeaks([0.2, 0.7], 5)).toEqual([0.2, 0.7]);
  });

  it("answers bars instead of the file when asked, decoding each file once", async () => {
    const decode = vi.fn(async () => ({ seconds: 3, peaks: [0.1, 0.8, 0.3, 0.6] }));
    const routes = app(decode);
    const first = await routes.request("/file?waveform=2");
    expect(await first.json()).toEqual({ seconds: 3, peaks: [0.45, 0.45] });
    await routes.request("/file?waveform=4");
    expect(decode).toHaveBeenCalledTimes(1);
    // Without the question the file is served as ever.
    expect(await (await routes.request("/file")).text()).toBe("the file itself");
  });

  it("says plainly when there is no waveform to give", async () => {
    const decode = vi.fn(async () => ({ seconds: 1, peaks: [0.5] }));
    const image = await app(decode, "image/png").request("/file?waveform=10");
    expect(image.status).toBe(400);
    expect(((await image.json()) as { detail: string }).detail).toBe(
      "Only an audio file has a waveform. This file plays without one.",
    );
    expect((await app(decode).request("/file?waveform=0")).status).toBe(400);
    const noFfmpeg = await app(undefined).request("/file?waveform=10");
    expect(noFfmpeg.status).toBe(503);
    expect(((await noFfmpeg.json()) as { detail: string }).detail).toContain(
      "The audio still plays.",
    );
  });
});
