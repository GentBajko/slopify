import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SubtitleAligner } from "../../kernel/ports/subtitles.js";
import { decodeAudio } from "./audio.js";
import { prepareModel } from "./cache.js";
import { claimWorker } from "./lock.js";
import { runAlignmentWorker } from "./runner.js";
import { speechWords } from "./text.js";

export const alignSubtitles: SubtitleAligner = async (request) => {
  request.signal.throwIfAborted();
  speechWords(request.text);
  await mkdir(request.cacheDir, { recursive: true, mode: 0o700 });
  const release = await claimWorker(request.cacheDir, request.signal);
  try {
    const modelPath = await prepareModel({
      cacheDir: request.cacheDir,
      signal: request.signal,
      onProgress: (current, total) => request.onProgress?.(Math.round((current / total) * 20), 100),
    });
    request.onProgress?.(20, 100);
    const working = await mkdtemp(join(request.cacheDir, ".alignment-audio-"));
    try {
      const pcmPath = join(working, "audio.f32");
      await decodeAudio(request.ffmpeg, request.audioPath, pcmPath, request.signal);
      request.onProgress?.(25, 100);
      return await runAlignmentWorker(
        { modelPath, pcmPath, text: request.text },
        request.signal,
        (current, total) => request.onProgress?.(25 + Math.round((current / total) * 75), 100),
      );
    } finally {
      await rm(working, { recursive: true, force: true });
    }
  } finally {
    await release();
  }
};
