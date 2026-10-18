import { expect, it, vi } from "vitest";
import { fakeTts } from "../src/adapters/fake/tts.js";
import type { RunConfig } from "../src/slices/admission/model.js";
import { current } from "./revision-rebuild.fake.js";
import {
  articleConfig,
  noImages,
  quiet,
  reviewedRun,
  section,
} from "./revision-reviews-stages.fake.js";

// The promise check over the real runner: the article is written by the scripted text model,
// the reviewer reads its opening against the title and thumbnail brief, and the paid narration
// waits for the answer. No provider or CLI is called.

vi.mock("../src/adapters/alignment/index.js", () => {
  const mocked = {
    alignSubtitles: async (request: { readonly text: string }) =>
      request.text
        .split(/\s+/)
        .filter((word) => word !== "")
        .map((text, index) => ({ text, start: index, end: index + 0.9 })),
  };
  return { ...mocked, alignSubtitlesWith: () => mocked.alignSubtitles };
});

// A hundred numbered words, so the opening's cut at 75 words (30 s at 150 a minute) shows.
const long = Array.from({ length: 100 }, (_value, at) => `w${String(at + 1)}`).join(" ");

const narrated = (base: RunConfig): RunConfig => ({
  ...articleConfig(base),
  title: "Rope Tricks",
  sources: {
    ...articleConfig(base).sources,
    audio: "generate",
    thumbnail: "from_prompt",
    video: "off",
  },
  audio: { provider: "openai-tts", model: "tts", voice: "first" },
  chunking: { mode: "whole" },
  rendered: { ...articleConfig(base).rendered, thumbnailPrompt: "A bold rope thumbnail." },
});

it("reads the opening against the title and thumbnail before the narration is paid for", async () => {
  let spoken = 0;
  let spokenWhenAsked: number | undefined;
  const { h, asked, verdicts } = await reviewedRun({
    fail: () => {
      spokenWhenAsked = spoken;
      return ["It greets the viewer before the subject. Start with: w1 w2 w3."];
    },
    work: () => [`# Rope\n\n**Welcome** back. ${long}`],
    tts: fakeTts({
      bytesFor: () => {
        spoken += 1;
        return [quiet(1)];
      },
    }),
    config: narrated,
    content: noImages,
    reviews: { stages: { promise: { mode: "flag" } } },
  });
  try {
    expect(asked).toHaveLength(1);
    const text = asked[0]?.text ?? "";
    expect(section(text, "Video title")).toBe("Rope Tricks");
    expect(section(text, "Thumbnail brief")).toBe("A bold rope thumbnail.");
    const opening = section(text, "Opening \\(first ~30 s\\)") ?? "";
    // Spoken as the voice would read it: no Markdown, cut at 75 words.
    expect(opening.startsWith("Rope\n\nWelcome back. w1 w2")).toBe(true);
    expect(opening.split(/\s+/)).toHaveLength(75);
    expect(opening.endsWith("w72")).toBe(true);
    expect(section(text, "Whole article")).toContain("w100");
    expect(asked[0]?.images).toEqual([]);
    expect(text).toContain("first 30 seconds");
    // The voice waited for the answer, and Flag only lets it go on afterwards.
    expect(spokenWhenAsked).toBe(0);
    expect(spoken).toBeGreaterThan(0);
    expect(
      verdicts().map((row) => [row.itemKey, row.stage, row.outcome, row.attempt, row.reasons]),
    ).toEqual([
      [
        "promise",
        "promise",
        "flagged",
        1,
        ["It greets the viewer before the subject. Start with: w1 w2 w3."],
      ],
    ]);
  } finally {
    h.close();
  }
});

it("writes the article again when its opening breaks the promise, and checks the new one", async () => {
  let written = 0;
  const { h, deps, asked, verdicts } = await reviewedRun({
    fail: (one) =>
      (section(one.text, "Whole article") ?? "").includes("take 1.")
        ? ["The opening talks about the channel."]
        : undefined,
    work: () => [`# Rope\n\nRope holds, take ${String(++written)}.`],
    config: (base) => ({ ...narrated(base), sources: { ...narrated(base).sources, audio: "off" } }),
    content: noImages,
    reviews: { retries: 1, stages: { promise: { mode: "redo" } } },
  });
  try {
    expect(verdicts().map((row) => [row.itemKey, row.attempt, row.outcome, row.redoState])).toEqual(
      [
        ["promise", 1, "redo", "started"],
        ["promise", 2, "passed", null],
      ],
    );
    expect(written).toBe(2);
    expect(asked.map((one) => section(one.text, "Whole article"))).toEqual([
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
