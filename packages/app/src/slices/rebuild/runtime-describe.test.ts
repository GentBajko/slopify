import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { Message } from "../../kernel/ports/llm.js";
import { writeAsset } from "../storage/assets.js";
import { revisionTranscript } from "./runtime-export-inputs.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { joinedNarration, narrationTextParts } from "./runtime-narration-text.js";
import { executionPlan } from "./runtime-plan.js";

// The description steps run through the text model like any other request; the narration
// is spoken from their answers, so the transcript the captions and the word timing are made
// from is what was said.

const article =
  "Tides differ by port.\n\n| Port | Range |\n|---|---|\n| Brest | 7 m |\n| Dover | 6 m |\n\n![Chart of tides](tides.png)\n\n*Figure 1: Tidal range along the coast.*\n\nThat is all.";
const describing = {
  llm: { provider: "openrouter", model: "llm" },
  audio: { provider: "openai-tts", model: "tts", voice: "voice", describeFigures: true },
  chunking: { mode: "whole" as const },
};
const passages: Readonly<Record<string, string>> = {
  "narration:describe:1": "Brest has the larger range, seven metres against Dover's six.",
  "narration:describe:2": "A map shows the range growing towards the west.",
};
const answer = (key: string) => passages[key] ?? "";
const bigCatalogue = {
  ...narrationCatalogue,
  tts: narrationCatalogue.tts.map((row) => ({ ...row, tts: { ...row.tts, maxCharacters: 4000 } })),
};

it("describes each table and figure once, then speaks the passages in their place", async () => {
  const h = await narrationFixture(article, {
    config: describing,
    catalogue: bigCatalogue,
    answer,
  });
  try {
    await h.pump();
    const llm = h.calls.filter((call) => call.kind === "llm");
    expect(llm.map((call) => call.key)).toEqual(["narration:describe:1", "narration:describe:2"]);
    expect(llm[0]?.text).toContain("never read it row by row");
    // A figure from its caption and alt text alone: this model can't look at pictures.
    expect(llm[1]?.images).toBeUndefined();
    const tts = h.calls.filter((call) => call.kind === "tts").map((call) => call.text);
    expect(tts).toEqual([
      "Tides differ by port.\n\nBrest has the larger range, seven metres against Dover's six.\n\nA map shows the range growing towards the west.\n\nThat is all.",
    ]);
    const view = h.view();
    const plan = executionPlan(h.deps, view, bigCatalogue);
    // What the captions and word timing are made from is what was said.
    expect(joinedNarration(narrationTextParts(view, plan, "body"))).toBe(tts[0]);
    expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe(tts[0]);
    // The article keeps its table.
    expect(view.articleMarkdown).toContain("| Brest | 7 m |");
    const described = view.pieces.filter((row) => row.key.startsWith("narration:describe:"));
    expect(described.every((row) => row.piece.kind === "prompt_written")).toBe(true);
    // Cached: nothing is asked again.
    h.calls.length = 0;
    await h.pump();
    expect(h.calls).toEqual([]);
  } finally {
    h.close();
  }
});

it("shows a figure's own picture to a text model that can look at it", async () => {
  const vision = {
    ...bigCatalogue,
    providers: { ...bigCatalogue.providers, "claude-code": { maxConcurrent: 1 } },
    llm: [
      ...bigCatalogue.llm,
      {
        ...bigCatalogue.llm[0],
        provider: "claude-code",
        id: "sonnet",
      } as (typeof bigCatalogue.llm)[number],
    ],
  };
  const seen: Message[][] = [];
  const h = await narrationFixture(article, {
    config: { ...describing, llm: { provider: "claude-code", model: "sonnet" } },
    catalogue: vision,
    answer: (key, messages) => {
      seen.push([...messages]);
      return answer(key);
    },
  });
  try {
    // The project has the picture the article names, uploaded as one of its images.
    const asset = writeAsset(h.deps, h.projectId, "tides.png", new Uint8Array([137, 80, 78, 71]));
    h.deps.db
      .prepare("INSERT INTO project_assets(id,project_id,path,bytes,created_at) VALUES (?,?,?,?,?)")
      .run(asset.id, h.projectId, asset.path, 4, "2026-09-27T00:00:00Z");
    h.deps.db
      .prepare(
        "UPDATE project_revisions SET content=json_set(content,'$.imageDefinitions.tides',json(?)) WHERE project_id=?",
      )
      .run(JSON.stringify({ source: "provide", assetId: asset.id, prompt: null }), h.projectId);
    await h.pump();
    const figure = h.calls.find((call) => call.key === "narration:describe:2");
    expect(figure?.images).toHaveLength(1);
    expect(readFileSync(figure?.images?.[0] ?? "")).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(seen[1]?.at(-1)?.content).toContain("The picture itself is attached");
    // A table has no picture to show.
    expect(h.calls.find((call) => call.key === "narration:describe:1")?.images).toBeUndefined();
  } finally {
    h.close();
  }
});

it("unfolds the descriptions of an article the text model writes", async () => {
  const h = await narrationFixture("", {
    config: {
      ...describing,
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      provided: {},
      articlePrompt: "Write about tides.",
      rendered: { article: "Write about tides." },
    },
    catalogue: bigCatalogue,
    answer: (key) => (key === "article:body" ? article : answer(key)),
  });
  try {
    await h.pump();
    expect(h.calls.filter((call) => call.kind === "llm").map((call) => call.key)).toEqual([
      "article:body",
      "narration:describe:1",
      "narration:describe:2",
    ]);
    const tts = h.calls.filter((call) => call.kind === "tts").map((call) => call.text);
    expect(tts.join("")).toContain("seven metres against Dover's six");
    expect(tts.join("")).not.toContain("|");
  } finally {
    h.close();
  }
});
