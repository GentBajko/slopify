import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { languageInfo } from "../../kernel/ports/languages.js";
import type { AlignmentRequest, SubtitleAligner, TimedWord } from "../../kernel/ports/subtitles.js";
import { decodeAudio } from "./audio.js";
import { alignmentModel, prepareModel } from "./cache.js";
import { claimWorker } from "./lock.js";
import { alignmentSpecFor, multilingualModel } from "./multilingual.js";
import { runAlignmentWorker } from "./runner.js";
import { sentenceTiming, speechShape } from "./sentences.js";

export const alignSubtitles: SubtitleAligner = async (request) => {
  request.signal.throwIfAborted();
  if (languageInfo(request.language).timing === "sentences") return timeSentences(request);
  const english = request.language === undefined || request.language === "en";
  alignmentSpecFor(request.language).words(request.text);
  await mkdir(request.cacheDir, { recursive: true, mode: 0o700 });
  const release = await claimWorker(request.cacheDir, request.signal);
  try {
    const modelPath = await prepareModel(
      {
        cacheDir: request.cacheDir,
        signal: request.signal,
        onProgress: (current, total) =>
          request.onProgress?.(Math.round((current / total) * 20), 100),
      },
      { model: english ? alignmentModel : multilingualModel, fetch: globalThis.fetch },
    );
    request.onProgress?.(20, 100);
    const working = await mkdtemp(join(request.cacheDir, ".alignment-audio-"));
    try {
      const pcmPath = join(working, "audio.f32");
      await decodeAudio(request.ffmpeg, request.audioPath, pcmPath, request.signal);
      request.onProgress?.(25, 100);
      return await runAlignmentWorker(
        {
          modelPath,
          pcmPath,
          text: request.text,
          ...(english ? {} : { language: request.language }),
        },
        request.signal,
        (current, total) => request.onProgress?.(25 + Math.round((current / total) * 75), 100),
        undefined,
        request.onOmission,
      );
    } finally {
      await rm(working, { recursive: true, force: true });
    }
  } finally {
    await release();
  }
};

// No model and no download: the narration's loudness says where it pauses, and the sentences
// are laid over it (`sentences.ts`).
async function timeSentences(request: AlignmentRequest): Promise<readonly TimedWord[]> {
  await mkdir(request.cacheDir, { recursive: true, mode: 0o700 });
  const working = await mkdtemp(join(request.cacheDir, ".sentence-audio-"));
  try {
    const pcmPath = join(working, "audio.f32");
    await decodeAudio(request.ffmpeg, request.audioPath, pcmPath, request.signal);
    request.onProgress?.(50, 100);
    const bytes = await readFile(pcmPath);
    const length = Math.floor(bytes.length / 4) * 4;
    const samples = new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + length),
    );
    const words = sentenceTiming(request.text, request.language ?? "en", speechShape(samples));
    request.onProgress?.(100, 100);
    return words;
  } finally {
    await rm(working, { recursive: true, force: true });
  }
}
