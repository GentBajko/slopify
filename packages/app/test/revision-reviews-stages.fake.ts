import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, vi } from "vitest";
import { type FakeImage, fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { currentProjectEvent } from "../src/edge/events/visibility.js";
import { createAudioPreviewStore } from "../src/kernel/audio-preview.js";
import { systemClock } from "../src/kernel/clock.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import type { TtsPort } from "../src/kernel/ports/tts.js";
import { wireRunner } from "../src/main.js";
import type { RunConfig } from "../src/slices/admission/model.js";
import { createReviewRedos } from "../src/slices/rebuild/review-redo.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { createRebuildDeps, paidServiceFixture } from "../src/slices/rebuild/service.fake.js";
import type { ReviewSettings } from "../src/slices/reviews/model.js";
import { listVerdicts, pendingRedos } from "../src/slices/reviews/repo.js";
import type { RevisionContent, RevisionView } from "../src/slices/revisions/model.js";
import { insertVoice } from "../src/slices/settings/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { current, save, start, tone } from "./revision-rebuild.fake.js";

// The automatic reviews of the article, the narration, the thumbnail and the shorts over the
// real runner. One scripted text model answers both the work (the article, the shorts' pick
// and prompts) and the reviewer; the voice, the image model and the word timing are doubles.
// No provider or CLI is called.

// Each test file mocks the word timing itself (`vi.mock` is hoisted per file).

const scratch = mkdtempSync(join(tmpdir(), "slopify-review-stages-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
export const ffmpeg = resolveFfmpeg({}, ffmpegStatic);

// A real one-frame PNG, so the renders that read it work.
export function still(size: string): Uint8Array {
  const path = join(scratch, `still-${size}.png`);
  if (!existsSync(path))
    execFileSync(ffmpeg, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=teal:s=${size}`,
      "-frames:v",
      "1",
      path,
    ]);
  return new Uint8Array(readFileSync(path));
}

// A quiet WAV of the given length.
export function quiet(seconds: number): Uint8Array {
  const data = seconds * 8000 * 2;
  const bytes = Buffer.alloc(44 + data);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(data, 40);
  return bytes;
}

export const model = {
  enabled: true,
  deprecated: false,
  source: "https://example.test",
  keywords: [],
  pricing: {},
};

// What the reviewer was asked: the stage's request text and the files it was shown.
export interface Asked {
  readonly text: string;
  readonly images: readonly string[];
}

export const isReview = (request: LlmCompletion): boolean =>
  (request.messages[0]?.content ?? "").startsWith("You are the quality reviewer");

// The text between a section's label and its closing quotes in a review request.
export function section(text: string, label: string): string | undefined {
  return new RegExp(`${label}:\\n"""\\n([\\s\\S]*?)\\n"""`).exec(text)?.[1];
}

export interface Options {
  // The reviewer's answer to one request: fail with these reasons, or pass.
  readonly fail: (asked: Asked) => readonly string[] | undefined;
  // The text model's answer to a request that is not a review.
  readonly work?: (request: LlmCompletion, attempt: number) => readonly string[];
  readonly image?: FakeImage;
  readonly speech?: Uint8Array;
  // The narration's voice instead of one that answers at once.
  readonly tts?: TtsPort;
  // Hand back the run as soon as it starts instead of once it has settled.
  readonly unsettled?: boolean;
  readonly config: (base: RunConfig) => RunConfig;
  readonly content?: (base: RevisionContent) => RevisionContent;
  // A second edit once the first is saved and planned, like a hand edit made in Edit project.
  readonly handEdit?: (saved: RevisionView) => RevisionContent;
  readonly reviews: Omit<ReviewSettings, "provider" | "model">;
  // Leave the redos unbound for the run, so a verdict that sends its item back stays pending.
  readonly unbound?: boolean;
}

export async function reviewedRun(options: Options) {
  const h = await paidServiceFixture();
  insertVoice(h.deps.db, { id: "first", name: "first", provider: "openai-tts", voiceId: "first" });
  const asked: Asked[] = [];
  const llm = fakeLlm({
    reply: (request, attempt) => {
      if (!isReview(request)) return options.work?.(request, attempt) ?? ["# Rope\n\nRope holds."];
      const one = {
        text: request.messages.at(-1)?.content ?? "",
        images: (request.images ?? []).map((image) => image.path),
      };
      // Checked while the call is made: a redo may replace the file later.
      expect(one.images.every((path) => existsSync(path))).toBe(true);
      asked.push(one);
      const reasons = options.fail(one);
      return [
        JSON.stringify({
          verdict: reasons === undefined ? "pass" : "fail",
          reasons: reasons ?? [],
        }),
      ];
    },
  });
  const images = options.image ?? fakeImage({ bytes: still("320x180") });
  const registry: Registry = {
    image: () => images,
    tts: () => options.tts ?? fakeTts({ bytesFor: () => [options.speech ?? tone()] }),
    llm: () => llm,
    list: async () => [],
  };
  const service = createRebuildDeps({ ...h.deps, clock: systemClock }, h.catalogue);
  service.setCatalogue({
    ...h.catalogue,
    providers: {
      ...h.catalogue.providers,
      ...narrationCatalogue.providers,
      "openai-tts": { maxConcurrent: 1 },
    },
    tts: narrationCatalogue.tts.map((row) =>
      row.tts === undefined ? row : { ...row, tts: { ...row.tts, maxCharacters: 1000 } },
    ),
    llm: [
      { ...model, provider: "codex", id: "gpt", name: "GPT", llm: { webSearch: false } },
      { ...model, provider: "openrouter", id: "llm", name: "Text", llm: { webSearch: false } },
    ],
  });
  const redos = createReviewRedos();
  const runner = wireRunner({
    ...service.deps,
    ffmpeg,
    hub: createHub({ ...h.deps, acceptEvent: (event) => currentProjectEvent(h.deps.db, event) }),
    registry,
    audioPreviews: createAudioPreviewStore(),
    telemetry: { ...h.deps, appVersion: "test" },
    flusher: { soon: () => undefined, stop: () => undefined },
    onFinished: (work) => redos.kick(work.projectId),
  });
  const deps = { ...service.deps, runner };
  if (options.unbound !== true) redos.bind(deps);
  const base = current(deps, h.projectId);
  await save(deps, h.projectId, {
    config: {
      ...options.config(base.revision.config),
      reviews: { provider: "codex", model: "gpt", ...options.reviews },
    },
    content: (options.content ?? ((content) => content))(base.revision.content),
  });
  if (options.handEdit !== undefined) {
    const saved = current(deps, h.projectId);
    await save(deps, h.projectId, {
      config: saved.revision.config,
      content: options.handEdit(saved),
    });
  }
  await start(deps, h.projectId, Object.keys(current(deps, h.projectId).revision.fingerprints));
  // A redo starts after its review's step has finished, so the run settles in rounds.
  const settle = async () => {
    await vi.waitFor(
      async () => {
        await runner.settled();
        expect(
          (options.unbound === true || pendingRedos(deps.db, h.projectId).length === 0) &&
            runner.hasInflight?.(h.projectId) !== true,
        ).toBe(true);
      },
      // ceiling: a shorts run renders its reels before its reviews settle; its test allows 60 s.
      { timeout: 30_000, interval: 20 },
    );
    await runner.settled();
  };
  if (options.unsettled !== true) await settle();
  const verdicts = () => listVerdicts(deps.db, h.projectId).toReversed();
  return { h, deps, runner, redos, llm, images, asked, verdicts, settle };
}

// The article: written by the text model from its prompt and the provided research.
export const articleConfig = (base: RunConfig): RunConfig => ({
  ...base,
  sources: { ...base.sources, research: "provide", article: "generate", images: "off" },
  llm: { provider: "openrouter", model: "llm" },
  provided: { research: "Rope was first twisted from reeds." },
  rendered: { article: "Write about rope in one paragraph." },
});
export const noImages = (content: RevisionContent): RevisionContent => ({
  ...content,
  articleMarkdown: undefined,
  articleEdited: false,
  imageOrder: [],
  imageDefinitions: {},
});
