import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { LlmCall, StageProviders } from "../../kernel/runner/providers.js";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath } from "../storage/layout.js";
import { exportFixture } from "./runtime-export.fake.js";
import { executeSubtitleRecipe } from "./runtime-subtitles.js";
import { executeYoutubeRecipe } from "./runtime-youtube.js";

async function described(edgeSilenceSeconds = 2) {
  const h = await exportFixture(false);
  const base = h.view();
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: base.revision.id,
    idempotencyKey: "describe",
    edit: {
      config: {
        ...base.revision.config,
        llm: { provider: "text", model: "text-model" },
        subtitles: undefined,
        edgeSilenceSeconds,
        youtubeDescription: true,
      },
      content: base.revision.content,
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const revision = saved.view.revision.id;
  const timing = h.grant("subtitles:timing", revision);
  const alignSubtitles = vi.fn(async () => [
    { text: "Saved", start: 0, end: 1 },
    { text: "article.", start: 1, end: 2 },
  ]);
  expect(
    await executeSubtitleRecipe({ ...h.deps, alignSubtitles }, timing.context, timing.piece),
  ).toBe("done");
  return { ...h, revision };
}

function providersAnswering(texts: readonly string[], calls: LlmCall[]): StageProviders {
  const providers: StageProviders = {
    llm: async (call) => {
      calls.push(call);
      // The wrapper's retry: an answer the check refuses is asked again while attempts
      // remain, and the last refusal is the failure.
      let reason: string | undefined;
      for (const text of texts) {
        const answer = { text, usage: null, finishReason: "stop" };
        reason = call.check?.(answer);
        if (reason === undefined) return { ok: true, value: answer };
      }
      throw new Error(reason);
    },
    tts: async () => {
      throw new Error("Unexpected narration");
    },
    image: async () => {
      throw new Error("Unexpected image");
    },
    forPiece: () => providers,
  };
  return providers;
}

const chapters = (first: string) =>
  JSON.stringify({
    summary: "A saved article.",
    chapters: [
      { start: first, title: "One" },
      { start: "0:01", title: "Two" },
      { start: "0:02", title: "Three" },
    ],
    hashtags: ["#Saved"],
    tags: ["saved"],
  });

it("fails in plain words when every answer breaks YouTube's chapter rules", async () => {
  const h = await described();
  try {
    const { context, piece } = h.grant("youtube:description", h.revision);
    const calls: LlmCall[] = [];
    await expect(
      executeYoutubeRecipe(h.deps, context, providersAnswering([chapters("0:02")], calls), piece),
    ).rejects.toThrow(
      "The AI model's chapters broke YouTube's rules (the first chapter must start at 0:00). Retry stage, or choose another model in Edit project → Providers.",
    );
    // The narration is 4 s with 2 s of silence either side, and the words were offset by
    // the silence at the start.
    const sent = calls[0]?.messages.at(-1)?.content ?? "";
    expect(sent).toContain("Video length: 0:08");
    expect(sent).toContain("[0:02] Saved article.");
    expect(sent).toContain("Write a YouTube description for this video.");
    expect(calls[0]).toMatchObject({ provider: "text", model: "text-model", webSearch: false });
  } finally {
    h.close();
  }
});

it("asks again after a malformed answer and fails on chapters shorter than YouTube allows", async () => {
  const h = await described();
  try {
    const { context, piece } = h.grant("youtube:description", h.revision);
    const malformed = JSON.stringify({
      summary: "A saved article.",
      chapters: [
        { start: "0:00", title: "All" },
        { start: "0:00", title: "Of" },
      ],
      hashtags: [],
      tags: [],
    });
    const calls: LlmCall[] = [];
    // An eight-second video can't hold three ten-second chapters, so no answer passes.
    await expect(
      executeYoutubeRecipe(
        h.deps,
        context,
        providersAnswering([malformed, chapters("0:00")], calls),
        piece,
      ),
    ).rejects.toThrow(/lasts 1 seconds, and each must last at least 10/);
  } finally {
    h.close();
  }
});

it("publishes description.txt and tags.txt in the Video stage", async () => {
  // 30 s of silence either side makes room for three chapters around the 4 s narration.
  const h = await described(30);
  try {
    const { context, piece } = h.grant("youtube:description", h.revision);
    const answer = JSON.stringify({
      summary: "A saved article.",
      chapters: [
        { start: "0:00", title: "One" },
        { start: "0:20", title: "Two" },
        { start: "0:40", title: "Three" },
      ],
      hashtags: ["#Saved"],
      tags: ["saved", "article"],
    });
    const counted: unknown[][] = [];
    expect(
      await executeYoutubeRecipe(
        { ...h.deps, count: (...args: unknown[]) => void counted.push(args) },
        context,
        providersAnswering([answer], []),
        piece,
      ),
    ).toBe("done");
    // One description counted, with no stage: stage "video" would read as a finished video.
    expect(counted).toHaveLength(1);
    expect(counted[0]?.[0]).toBe("stage.completed");
    expect(counted[0]?.[1]).toMatchObject({ descriptions: 1, tokensIn: 0, tokensOut: 0 });
    expect(counted[0]?.[1]).not.toHaveProperty("stage");
    const view = h.view(h.revision);
    const read = (role: string) => {
      const row = view.outputs.find((one) => one.selected && one.output.role === role);
      if (row === undefined) throw new Error(`Missing ${role}`);
      expect(row.output.stageKind).toBe("video");
      return readFileSync(outputPath(h.deps.paths, h.projectId, row.output.path), "utf8");
    };
    expect(read("youtube_description")).toBe(
      "A saved article.\n\n0:00 One\n0:20 Two\n0:40 Three\n\n#Saved",
    );
    expect(read("youtube_tags")).toBe("saved, article");
  } finally {
    h.close();
  }
});
