import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, it, vi } from "vitest";
import { type FakeImage, fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { currentProjectEvent } from "../src/edge/events/visibility.js";
import { createAudioPreviewStore } from "../src/kernel/audio-preview.js";
import { systemClock } from "../src/kernel/clock.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { wireRunner } from "../src/main.js";
import type { RunConfig } from "../src/slices/admission/model.js";
import { createReviewRedos } from "../src/slices/rebuild/review-redo.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { createRebuildDeps, paidServiceFixture } from "../src/slices/rebuild/service.fake.js";
import type { ReviewSettings } from "../src/slices/reviews/model.js";
import { actOnVerdict, listVerdicts, pendingRedos } from "../src/slices/reviews/repo.js";
import type { RevisionContent, RevisionView } from "../src/slices/revisions/model.js";
import { insertVoice } from "../src/slices/settings/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { current, save, start, tone } from "./revision-rebuild.fake.js";

// The automatic reviews of the article, the narration, the thumbnail and the shorts over the
// real runner. One scripted text model answers both the work (the article, the shorts' pick
// and prompts) and the reviewer; the voice, the image model and the word timing are doubles.
// No provider or CLI is called.

// Every word at one a second, so the word timing hears exactly what was said.
vi.mock("../src/adapters/alignment/index.js", () => ({
  alignSubtitles: async (request: { readonly text: string }) =>
    request.text
      .split(/\s+/)
      .filter((word) => word !== "")
      .map((text, index) => ({ text, start: index, end: index + 0.9 })),
}));

const scratch = mkdtempSync(join(tmpdir(), "slopify-review-stages-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ffmpeg = resolveFfmpeg({}, ffmpegStatic);

// A real one-frame PNG, so the renders that read it work.
function still(size: string): Uint8Array {
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
function quiet(seconds: number): Uint8Array {
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

const model = {
  enabled: true,
  deprecated: false,
  source: "https://example.test",
  keywords: [],
  pricing: {},
};

// What the reviewer was asked: the stage's request text and the files it was shown.
interface Asked {
  readonly text: string;
  readonly images: readonly string[];
}

const isReview = (request: LlmCompletion): boolean =>
  (request.messages[0]?.content ?? "").startsWith("You are the quality reviewer");

// The text between a section's label and its closing quotes in a review request.
function section(text: string, label: string): string | undefined {
  return new RegExp(`${label}:\\n"""\\n([\\s\\S]*?)\\n"""`).exec(text)?.[1];
}

interface Options {
  // The reviewer's answer to one request: fail with these reasons, or pass.
  readonly fail: (asked: Asked) => readonly string[] | undefined;
  // The text model's answer to a request that is not a review.
  readonly work?: (request: LlmCompletion, attempt: number) => readonly string[];
  readonly image?: FakeImage;
  readonly speech?: Uint8Array;
  readonly config: (base: RunConfig) => RunConfig;
  readonly content?: (base: RevisionContent) => RevisionContent;
  // A second edit once the first is saved and planned, like a hand edit made in Edit project.
  readonly handEdit?: (saved: RevisionView) => RevisionContent;
  readonly reviews: Omit<ReviewSettings, "provider" | "model">;
  // Leave the redos unbound for the run, so a verdict that sends its item back stays pending.
  readonly unbound?: boolean;
}

async function reviewedRun(options: Options) {
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
    tts: () => fakeTts({ bytesFor: () => [options.speech ?? tone()] }),
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
    for (let round = 0; round < 20; round++) {
      await runner.settled();
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (
        (options.unbound === true || pendingRedos(deps.db, h.projectId).length === 0) &&
        !runner.hasInflight?.(h.projectId)
      )
        break;
    }
    await runner.settled();
  };
  await settle();
  const verdicts = () => listVerdicts(deps.db, h.projectId).toReversed();
  return { h, deps, runner, redos, llm, images, asked, verdicts, settle };
}

// The article: written by the text model from its prompt and the provided research.
const articleConfig = (base: RunConfig): RunConfig => ({
  ...base,
  sources: { ...base.sources, research: "provide", article: "generate", images: "off" },
  llm: { provider: "openrouter", model: "llm" },
  provided: { research: "Rope was first twisted from reeds." },
  rendered: { article: "Write about rope in one paragraph." },
});
const noImages = (content: RevisionContent): RevisionContent => ({
  ...content,
  articleMarkdown: undefined,
  articleEdited: false,
  imageOrder: [],
  imageDefinitions: {},
});

it("shows the article reviewer the prompt, the research and the article, and flags a failed one", async () => {
  const { h, asked, llm, verdicts } = await reviewedRun({
    fail: () => ["It invents a rope museum."],
    config: articleConfig,
    content: noImages,
    reviews: { retries: 1, stages: { article: { mode: "flag" } } },
  });
  try {
    expect(asked).toHaveLength(1);
    const text = asked[0]?.text ?? "";
    expect(section(text, "Article prompt the article was written from")).toBe(
      "Write about rope in one paragraph.",
    );
    expect(section(text, "Research notes")).toContain("Rope was first twisted from reeds.");
    expect(section(text, "Article")).toContain("Rope holds.");
    expect(asked[0]?.images).toEqual([]);
    expect(
      verdicts().map((row) => [row.itemKey, row.stage, row.outcome, row.attempt, row.reasons]),
    ).toEqual([["article:body", "article", "flagged", 1, ["It invents a rope museum."]]]);
    // One article, one review: Flag only writes nothing again.
    expect(llm.calls()).toBe(2);
  } finally {
    h.close();
  }
});

it("writes a failed article again once, then keeps it and flags it", async () => {
  let written = 0;
  const { h, deps, asked, verdicts } = await reviewedRun({
    fail: () => ["It invents a rope museum."],
    work: () => [`# Rope\n\nRope holds, take ${String(++written)}.`],
    config: articleConfig,
    content: noImages,
    reviews: { retries: 1, stages: { article: { mode: "redo" } } },
  });
  try {
    expect(verdicts().map((row) => [row.itemKey, row.attempt, row.outcome, row.redoState])).toEqual(
      [
        ["article:body", 1, "redo", "started"],
        ["article:body", 2, "flagged", null],
      ],
    );
    expect(written).toBe(2);
    // The second review read the article written again.
    expect(asked.map((one) => section(one.text, "Article"))).toEqual([
      expect.stringContaining("take 1."),
      expect.stringContaining("take 2."),
    ]);
    expect(current(deps, h.projectId).revision.content.regenerationTokens).toHaveProperty(
      "article:body",
    );
  } finally {
    h.close();
  }
});

it("shows the narration reviewer the hand-edited words the voice read, not the article", async () => {
  const { h, asked, verdicts } = await reviewedRun({
    fail: () => ["The second sentence is missing."],
    // Long enough for every word the timing hears at one a second.
    speech: quiet(12),
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", images: "off" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds fast in the museum." },
    }),
    content: noImages,
    // The narration's one part, reworded by hand in Edit project → Narration.
    handEdit: (saved) => {
      const parts = Object.keys(saved.revision.fingerprints).flatMap((key) => {
        const logical = /^(audio:body:.+):\d+$/.exec(key)?.[1];
        return logical === undefined || logical === "audio:body:concat" ? [] : [logical];
      });
      expect(parts).toHaveLength(1);
      return {
        ...saved.revision.content,
        narrationOverrides: Object.fromEntries(
          parts.map((key) => [key, { kind: "text" as const, text: "Rope holds fast and true." }]),
        ),
      };
    },
    reviews: { stages: { narration: { mode: "flag" } } },
  });
  try {
    expect(asked).toHaveLength(1);
    const text = asked[0]?.text ?? "";
    const read = section(text, "Text the narration was read from");
    expect(read).toContain("Rope holds fast and true.");
    expect(read).not.toContain("museum");
    expect(section(text, "What the timing heard")).toBe("Rope holds fast and true.");
    expect(section(text, "Stretches of text the timing could not hear")).toBe("None.");
    expect(asked[0]?.images).toEqual([]);
    expect(
      verdicts().map((row) => [row.itemKey, row.stage, row.outcome, row.reasons, row.redoState]),
    ).toEqual([["narration", "narration", "flagged", ["The second sentence is missing."], null]]);
  } finally {
    h.close();
  }
});

it("shows the thumbnail reviewer the thumbnail file and the video title", async () => {
  const { h, asked, images, verdicts } = await reviewedRun({
    fail: () => ["The title text cannot be read on a phone."],
    config: (base) => ({
      ...base,
      title: "Rope Tricks",
      sources: { ...base.sources, images: "off", thumbnail: "from_prompt" },
      rendered: { ...base.rendered, thumbnailPrompt: "A bold rope thumbnail." },
    }),
    content: noImages,
    reviews: { stages: { thumbnail: { mode: "flag" } } },
  });
  try {
    expect(images.calls()).toBe(1);
    expect(asked).toHaveLength(1);
    const text = asked[0]?.text ?? "";
    expect(section(text, "Video title")).toBe("Rope Tricks");
    expect(section(text, "Brief the image was drawn from")).toContain("A bold rope thumbnail.");
    expect(text).toContain("Attached images (look at every one before answering): the thumbnail");
    // The thumbnail file itself, still on disk.
    expect(asked[0]?.images).toHaveLength(1);
    expect(existsSync(asked[0]?.images[0] ?? "")).toBe(true);
    expect(verdicts().map((row) => [row.itemKey, row.stage, row.outcome, row.reasons])).toEqual([
      ["thumbnail:image", "thumbnail", "flagged", ["The title text cannot be read on a phone."]],
    ]);
  } finally {
    h.close();
  }
});

// Two shorts from forty words at one a second (as `revision-shorts.test.ts` sets them up):
// sentences 1-3 in two vertical images, sentences 5-8 in three.
const clip = (first: number, last: number) => ({
  first,
  last,
  title: `Sentences ${String(first)} to ${String(last)}`,
  description: "A clip that stands alone.",
  hashtags: ["#Sentences", "#Words", "#Test"],
  why: "It has a hook.",
});
function shortsWork(request: LlmCompletion): readonly string[] {
  const system = request.messages[0]?.content ?? "";
  if (system.startsWith("You pick clips")) return [JSON.stringify([clip(1, 3), clip(5, 8)])];
  const count = Number(/Exactly (\d+) prompt/.exec(system)?.[1] ?? "0");
  return [JSON.stringify(Array.from({ length: count }, (_value, at) => `Image ${String(at + 1)}`))];
}

it("shows each short's reviewer its title and its images, and flags a failed short on its own", {
  timeout: 60_000,
}, async () => {
  const { h, asked, verdicts } = await reviewedRun({
    fail: (one) =>
      section(one.text, "Title of the short") === "Sentences 5 to 8"
        ? ["The third image shows stray letters."]
        : undefined,
    work: shortsWork,
    image: fakeImage({ bytes: still("270x480") }),
    speech: quiet(40),
    config: (base) => ({
      ...base,
      title: "Sentences",
      sources: { ...base.sources, audio: "generate", images: "off", video: "off" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      llm: { provider: "openrouter", model: "llm" },
      chunking: { mode: "whole" },
      provided: {
        article: Array.from(
          { length: 8 },
          (_value, at) => `Sentence ${String(at + 1)} has five words.`,
        ).join(" "),
      },
      edgeSilenceSeconds: 2,
      imageSeconds: 10,
      motionStyle: "still",
      shorts: { enabled: true, count: 2, minSeconds: 15, maxSeconds: 25 },
    }),
    content: noImages,
    reviews: { stages: { shorts: { mode: "flag" } } },
  });
  try {
    const byTitle = Object.fromEntries(
      asked.map((one) => [section(one.text, "Title of the short"), one]),
    );
    expect(Object.keys(byTitle).sort()).toEqual(["Sentences 1 to 3", "Sentences 5 to 8"]);
    // Each review is shown its own short's stills: two and three vertical images.
    expect(byTitle["Sentences 1 to 3"]?.images).toHaveLength(2);
    expect(byTitle["Sentences 5 to 8"]?.images).toHaveLength(3);
    expect(byTitle["Sentences 5 to 8"]?.text).toContain(
      "image 1 of the short; image 2 of the short; image 3 of the short",
    );
    expect(
      verdicts()
        .map((row) => [row.itemKey, row.stage, row.outcome, row.reasons])
        .sort(),
    ).toEqual([
      ["shorts:1", "shorts", "passed", []],
      ["shorts:2", "shorts", "flagged", ["The third image shows stray letters."]],
    ]);
  } finally {
    h.close();
  }
});

it("lets Overrule call off a redo that has not started, and releases the work held for it", {
  timeout: 30_000,
}, async () => {
  // The redos are not bound during the run, so image "one"'s failed review stays a pending
  // redo and the video that shows it waits.
  const { h, deps, runner, redos, images, verdicts, settle } = await reviewedRun({
    fail: (one) => (one.text.includes('"""\nOne\n"""') ? ["A hand has six fingers."] : undefined),
    speech: quiet(2),
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", video: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds fast." },
      motionStyle: "still",
    }),
    reviews: { retries: 1, stages: { images: { mode: "redo" } } },
    unbound: true,
  });
  try {
    const video = () =>
      current(deps, h.projectId).outputs.filter(
        (row) =>
          row.workKey === "export:video" &&
          row.output.role === "video" &&
          row.selected &&
          row.state === "ready",
      );
    const waiting = pendingRedos(deps.db, h.projectId);
    expect(waiting.map((row) => [row.itemKey, row.outcome, row.redoState])).toEqual([
      ["image:one", "redo", "pending"],
    ]);
    expect(video()).toEqual([]);
    expect(images.calls()).toBe(2);

    const pending = waiting[0];
    if (pending === undefined) throw new Error("no pending redo");
    expect(actOnVerdict(deps.db, h.projectId, pending.id, "overruled", "now")).toMatchObject({
      ok: true,
      value: { action: "overruled", redoState: null },
    });
    expect(pendingRedos(deps.db, h.projectId)).toEqual([]);

    // Nothing is left to redo once the redos run, and the held video goes ahead.
    redos.bind(deps);
    redos.kick(h.projectId);
    runner.tick(h.projectId);
    await settle();
    expect(images.calls()).toBe(2);
    expect(video()).toHaveLength(1);
    expect(
      verdicts()
        .filter((row) => row.itemKey === "image:one")
        .map((row) => [row.attempt, row.outcome, row.action, row.redoState]),
    ).toEqual([[1, "redo", "overruled", null]]);
    expect(current(deps, h.projectId).revision.content.regenerationTokens).not.toHaveProperty(
      "image:one",
    );
  } finally {
    h.close();
  }
});
