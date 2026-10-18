import { errorText } from "../../kernel/errors.js";
import type { LoudnessDefault } from "../loudness/model.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { StylePreviewError } from "../style-preview/render.js";
import type { StylePreviews } from "../style-preview/service.js";
import { normalizeStylePreview, stylePreviewHash } from "../style-preview/settings.js";
import { type DocumentSamples, documentHash, documentThemeOfTemplate } from "./document-sample.js";
import { videoSampleRequest } from "./free-video.js";
import { type LoudnessSamples, loudnessGoalOf, loudnessHash } from "./loudness.js";

// The samples the studio makes on this computer, free: the 30-second video, the loudness before
// and after, and the PDF. Each is kept by the hash of what it is made from, so a setting changed
// back, or the same setup in another template, shows at once.

export const freeKinds = ["video", "loudness", "document"] as const;
export type FreeKind = (typeof freeKinds)[number];
export type FreeState = "current" | "making" | "waiting" | "needs-fix" | "stale" | "off";

export interface FreeSample {
  readonly state: FreeState;
  readonly sentence: string;
  readonly url: string | null;
}
export interface LoudnessSample extends FreeSample {
  readonly beforeUrl: string | null;
  readonly beforeLufs: number | null;
  readonly afterLufs: number | null;
}
export interface FreeSamplesView {
  readonly video: FreeSample;
  readonly loudness: LoudnessSample;
  readonly document: FreeSample;
}

export interface FreeSampleDeps {
  readonly stylePreviews?: StylePreviews | undefined;
  readonly loudness?: LoudnessSamples | undefined;
  readonly documents?: DocumentSamples | undefined;
  // Settings → Production defaults: what Level the volume is when the template never set it.
  readonly loudnessDefault: () => LoudnessDefault;
}

export interface JobState {
  readonly running: boolean;
  readonly queued: boolean;
}

export interface FreeSamples {
  readonly make: (document: PlayDraftDocument, signal: AbortSignal) => Promise<void>;
  readonly view: (
    templateId: string,
    document: PlayDraftDocument,
    job: JobState,
  ) => FreeSamplesView;
  // The levelled narration's hash for a template's setup, which its loudness route serves.
  readonly loudnessHashOf: (document: PlayDraftDocument) => string | undefined;
  readonly documentHashOf: (document: PlayDraftDocument) => string;
}

const press = "press Make samples";

export function createFreeSamples(deps: FreeSampleDeps): FreeSamples {
  const failures = new Map<string, string>();
  const making = new Set<string>();
  const keyOf = (kind: FreeKind, hash: string): string => `${kind}:${hash}`;
  const videoHash = (document: PlayDraftDocument): string =>
    stylePreviewHash(normalizeStylePreview(videoSampleRequest(document)));
  const loudnessHashOf = (document: PlayDraftDocument): string | undefined => {
    const goal = loudnessGoalOf(document, deps.loudnessDefault());
    return goal === undefined ? undefined : loudnessHash(goal);
  };
  const documentHashOf = (document: PlayDraftDocument): string =>
    documentHash(documentThemeOfTemplate(document));

  const attempt = async (
    kind: FreeKind,
    hash: string,
    work: () => Promise<void> | void,
    failure: (error: unknown) => string,
  ): Promise<void> => {
    const key = keyOf(kind, hash);
    making.add(key);
    failures.delete(key);
    try {
      await work();
    } catch (error) {
      failures.set(key, failure(error));
    } finally {
      making.delete(key);
    }
  };

  const pending = (job: JobState, kind: FreeKind, hash: string, what: string): FreeSample => {
    const key = keyOf(kind, hash);
    const failed = failures.get(key);
    if (failed !== undefined) return { state: "needs-fix", sentence: failed, url: null };
    if (making.has(key) || job.running)
      return { state: "making", sentence: `Making the ${what} on this computer.`, url: null };
    if (job.queued)
      return {
        state: "waiting",
        sentence: `The ${what} waits for another template's samples to finish.`,
        url: null,
      };
    return { state: "stale", sentence: `No ${what} for this version yet: ${press}.`, url: null };
  };

  return {
    loudnessHashOf,
    documentHashOf,
    make: async (document, signal) => {
      const { form } = document;
      if (form.sources.video !== "off" && deps.stylePreviews !== undefined) {
        const previews = deps.stylePreviews;
        await attempt(
          "video",
          videoHash(document),
          async () => {
            await previews.render(videoSampleRequest(document));
          },
          videoFailure,
        );
      }
      if (signal.aborted) return;
      const goal = loudnessGoalOf(document, deps.loudnessDefault());
      if (goal !== undefined && deps.loudness !== undefined) {
        const samples = deps.loudness;
        await attempt(
          "loudness",
          loudnessHash(goal),
          () => samples.make(goal, signal),
          (error) => ffmpegFailure("loudness before and after", error),
        );
      }
      if (signal.aborted) return;
      if (form.sources.document === "generate" && deps.documents !== undefined) {
        const documents = deps.documents;
        const theme = documentThemeOfTemplate(document);
        await attempt(
          "document",
          documentHash(theme),
          () => documents.make(theme),
          (error) =>
            `The PDF sample couldn't be made: ${errorText(error)} Change the theme in Document (PDF) → Fine-tune, then ${press}.`,
        );
      }
    },
    view: (templateId, document, job) => {
      const { form } = document;
      const base = `/api/template-studio/${encodeURIComponent(templateId)}`;
      const unavailable = (what: string): FreeSample => ({
        state: "needs-fix",
        sentence: `The ${what} can't be made because this Slopify started without ffmpeg. Install ffmpeg, or use the Docker image, then restart Slopify and ${press}.`,
        url: null,
      });

      let video: FreeSample;
      if (form.sources.video === "off")
        video = { state: "off", sentence: "The video is off.", url: null };
      else if (deps.stylePreviews === undefined) video = unavailable("video sample");
      else {
        const hash = videoHash(document);
        const saved = deps.stylePreviews.file(hash);
        video =
          saved === undefined
            ? pending(job, "video", hash, "30-second video")
            : {
                state: "current",
                sentence:
                  "30 seconds in your frame, captions, Look and picture timing, on Slopify's sample pictures and narration.",
                url: `/api/style-preview/${hash}.mp4?v=${String(saved.version)}`,
              };
      }

      const lHash = loudnessHashOf(document);
      let loudness: LoudnessSample;
      if (lHash === undefined)
        loudness = {
          state: "off",
          sentence: "Level the volume is off: the narration plays as the voice gives it.",
          url: null,
          beforeUrl: null,
          beforeLufs: null,
          afterLufs: null,
        };
      else if (deps.loudness === undefined)
        loudness = {
          ...unavailable("loudness before and after"),
          beforeUrl: null,
          beforeLufs: null,
          afterLufs: null,
        };
      else {
        const reading = deps.loudness.reading(lHash);
        const shown =
          reading === undefined
            ? pending(job, "loudness", lHash, "loudness before and after")
            : undefined;
        loudness = {
          ...(shown ?? {
            state: "current",
            sentence:
              "Slopify's sample narration as it came, and levelled the way your videos will be. Your own voice's sample replaces it once paid samples are made.",
            url: `${base}/loudness/after.mp3?v=${lHash.slice(0, 12)}`,
          }),
          beforeUrl: `${base}/loudness/before.mp3`,
          beforeLufs: reading?.before ?? null,
          afterLufs: reading?.after ?? null,
        };
      }

      let pdf: FreeSample;
      if (form.sources.document !== "generate")
        pdf = { state: "off", sentence: "The PDF document is off.", url: null };
      else if (deps.documents === undefined) pdf = unavailable("PDF sample");
      else {
        const hash = documentHashOf(document);
        pdf =
          deps.documents.file(hash) === undefined
            ? pending(job, "document", hash, "PDF sample")
            : {
                state: "current",
                sentence: "Slopify's sample article laid out in your theme.",
                url: `${base}/document.pdf?v=${hash.slice(0, 12)}`,
              };
      }
      return { video, loudness, document: pdf };
    },
  };
}

function videoFailure(error: unknown): string {
  if (error instanceof StylePreviewError) {
    if (error.reason === "font-missing")
      return `The video sample couldn't be made because the caption font is no longer on this computer. Choose another font in Video & captions → Fine-tune, then ${press}.`;
    if (error.reason === "ffmpeg-missing")
      return `The video sample couldn't be made because ffmpeg wasn't found. Install ffmpeg, or use the Docker image, then ${press}.`;
  }
  return ffmpegFailure("video sample", error);
}

function ffmpegFailure(what: string, error: unknown): string {
  const message = errorText(error);
  if (/\bENOENT\b/.test(message) || message.startsWith("Slopify could not start ffmpeg"))
    return `The ${what} couldn't be made because ffmpeg wasn't found. Install ffmpeg, or use the Docker image, then ${press}.`;
  return `The ${what} couldn't be made because ffmpeg stopped with an error. ${press[0]?.toUpperCase()}${press.slice(1)} again; if it fails again, use Download diagnostics in Settings and report it.`;
}
