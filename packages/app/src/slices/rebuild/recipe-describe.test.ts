import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece } from "../revisions/model.js";
import type { VoicesSettings } from "../voices/model.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// "Describe tables and figures in the narration": each table, figure, equation or code block
// is one cached text-model step, and the narration speaks its answer in the block's place.

const article =
  "# Tides\n\nThe sea rises twice a day.\n\n| Port | Range |\n|---|---|\n| Brest | 7 m |\n| Dover | 6 m |\n\n![Chart of tides](tides.png)\n\n```rust\nfn main() {}\n```\n\nThe rate is $E = k (T - T_0)$ per day.\n\n## Pronunciation Glossary\nBrest: /bʁɛst/\n";
const script =
  "# Opening\n\nAlex: Welcome. Here are the ranges:\n| Port | Range |\n|---|---|\n| Brest | 7 m |\n\nSam: Thanks.\n";
const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate", video: "off" },
  provided: { article },
  rendered: { ...config.rendered, narration: "Calm." },
};
const voices: VoicesSettings = {
  format: "podcast",
  source: "script",
  speakers: [
    {
      id: "alex",
      name: "Alex",
      role: "host",
      voice: { provider: "voice", model: "tts", voice: "a" },
    },
    {
      id: "sam",
      name: "Sam",
      role: "guest",
      voice: { provider: "voice", model: "tts", voice: "s" },
    },
  ],
  turnGapSeconds: 0.35,
  nameTags: true,
  nativeDialogue: false,
  audioFiles: false,
};
const cases = {
  single: narrated,
  prepared: {
    ...narrated,
    narrationPrompt: "Calm.",
    audio: { provider: "inworld", model: "inworld-tts-2", voice: "v" },
  },
  generated: { ...narrated, sources: { ...narrated.sources, article: "generate" } },
  voices: { ...narrated, provided: { article: script }, voices },
} satisfies Record<string, RunConfig>;
const on = (c: RunConfig, extra: Partial<NonNullable<RunConfig["audio"]>> = {}): RunConfig => ({
  ...c,
  audio: {
    ...(c.audio ?? { provider: "", model: "", voice: "" }),
    describeFigures: true,
    ...extra,
  },
});

function plan(c: RunConfig, pieces: readonly ManifestPiece[] = []) {
  const markdown = c.sources.article === "generate" ? null : (c.provided.article ?? "");
  return buildRecipes({
    config: c,
    content: { ...content, articleMarkdown: markdown ?? undefined },
    manifest: { outputs: [], pieces },
    resolved: { articleMarkdown: markdown, researchNotes: null },
    catalogue,
  });
}
function answered(recipes: readonly ResolvedWorkRecipe[], say: (n: number) => string) {
  return recipes
    .filter((one) => /^narration:describe:\d+$/.test(one.key))
    .map(
      (one, index): ManifestPiece => ({
        key: one.key,
        stageKind: "audio",
        assetId: null,
        fingerprint: one.fingerprint,
        piece: {
          id: `d${String(index)}`,
          stageId: "s",
          kind: "prompt_written",
          idx: 500001 + index,
          state: "done",
          payload: JSON.stringify({ text: say(Number(one.key.split(":").at(-1))) }),
        } as ManifestPiece["piece"],
      }),
    );
}
const spoken = (recipes: readonly ResolvedWorkRecipe[]) =>
  recipes.flatMap((one) =>
    one.input.kind === "tts" ? [one.input.spokenText ?? one.input.text] : [],
  );

describe("fingerprints with describing off", () => {
  // Captured from the planner before the setting existed: absent, off, or on without a text
  // model, a project plans exactly what it did.
  const pinned: Record<keyof typeof cases, Record<string, string>> = {
    single: {
      "audio:body:edaf21817020cf60be00-1:1":
        "607ad7104ed09ff8fff635d2dd77973b84225fa85694b5a4a965c88b69cedfe2",
      "audio:body:concat": "8d9143335f4767acde88524ae8558bea00aa1ccad8fb03a8496d234fe4d3c859",
      "export:wav": "74587a1d28b586ad98564f43a9d9b6cfdec1f69e9869118235f7eb5c7c7ae2c3",
    },
    prepared: {
      "narration:prepare:body:audio:body:edaf21817020cf60be00-1":
        "5f3edf3417165dca73ff2653d912cf4f090bfb363349d3648bdfb55712a6bf12",
      "audio:body:future": "943199ebf8e9311aed64f309e9a9a43342f2b8b40c92e39a860ad51bc40b5f01",
      "narration:files:body": "9b1e2946a1787886ccaea8ab86ed30933f06006a661d93c55f34cbc39a2acb56",
      "audio:body:concat": "71adb056a5900d209e670948dea57eebf37d070afab1d3d224e2bc6db1aa64b8",
    },
    generated: {
      "audio:body:future": "4b3057f78b96d1e69dc9a3b69e914ed9212b8ea55de348fc1443a5718df54739",
      "audio:body:concat": "a600603233d6b8c43a3ca852fb7b201772df2a5181434bbda3ce75c3b5ad0e79",
    },
    voices: {
      "audio:body:turn:1:1": "b45c2125bf115759a918068fdeafb705c95afc26e2d133f3a3a62e029ccbf161",
      "audio:body:turn:2:1": "68efd37de79f982d5f470016ab9e86c1e8f35f6bf34fd7085b1f5008ce8d591b",
      "audio:body:concat": "6c415f02c433c9fd72d0214309943432ac75d97b8d017bbd0bef9011a5f1e453",
    },
  };
  for (const [name, c] of Object.entries(cases) as [keyof typeof cases, RunConfig][]) {
    it(`keeps ${name} unchanged when absent, off, or on without a text model`, () => {
      for (const variant of [
        c,
        {
          ...c,
          audio: { ...(c.audio ?? { provider: "", model: "", voice: "" }), describeFigures: false },
        },
      ]) {
        const recipes = plan(variant);
        expect(recipes.some((one) => one.key.startsWith("narration:describe:"))).toBe(false);
        const fingerprints = Object.fromEntries(recipes.map((one) => [one.key, one.fingerprint]));
        for (const [key, value] of Object.entries(pinned[name]))
          expect(fingerprints[key]).toBe(value);
      }
      // On without a text model: the narration flattens the article as it always did.
      const { llm: _one, ...without } = c;
      const { llm: _two, ...noText } = on(c);
      const print = (recipes: readonly ResolvedWorkRecipe[]) =>
        recipes.map((one) => [one.key, one.fingerprint]);
      expect(print(plan(noText))).toEqual(print(plan(without)));
    });
  }
});

describe("describing tables and figures", () => {
  it("plans one step per block and waits for them before narrating", () => {
    const recipes = plan(on(narrated));
    const steps = recipes.filter((one) => one.key.startsWith("narration:describe:"));
    expect(
      steps.map((one) => [one.key, one.input.kind === "llm" && one.input.describe?.kind]),
    ).toEqual([
      ["narration:describe:1", "table"],
      ["narration:describe:2", "figure"],
      ["narration:describe:3", "code"],
      ["narration:describe:4", "math"],
    ]);
    const table = steps[0];
    if (table?.input.kind !== "llm") throw new Error("Missing description step");
    expect(table.stage).toBe("audio");
    const [system, user] = table.input.messages;
    expect(system?.content).toContain("never read it row by row");
    // The run's Narration Preparation prompt is the style guidance.
    expect(system?.content).toContain("Calm.");
    expect(user?.content).toContain("| Brest | 7 m |");
    expect(user?.content).toContain("Section: Tides");
    // Nothing is spoken until every block is described.
    expect(recipes.some((one) => one.input.kind === "tts")).toBe(false);
    expect(recipes.find((one) => one.key === "audio:body:future")?.dependsOn).toEqual(
      expect.arrayContaining(steps.map((one) => one.key)),
    );
  });

  it("speaks each answer in its block's place and never the glossary", () => {
    const first = plan(on(narrated));
    const recipes = plan(
      on(narrated),
      answered(first, (n) => `Passage ${String(n)}.`),
    );
    const text = spoken(recipes).join("");
    expect(text).toContain("The sea rises twice a day.");
    expect(text).toContain("Passage 1.");
    expect(text).toContain("Passage 4.");
    expect(text.indexOf("Passage 1.")).toBeLessThan(text.indexOf("Passage 2."));
    for (const never of ["|", "Dover", "fn main", "$", "bʁɛst", "Pronunciation"])
      expect(text).not.toContain(never);
  });

  it("leaves code out when asked", () => {
    const recipes = plan(on(narrated, { skipCode: true }));
    expect(
      recipes.filter((one) => one.input.kind === "llm" && one.input.describe?.kind === "code"),
    ).toEqual([]);
  });

  it("writes in the project's language", () => {
    const recipes = plan({ ...on(narrated), language: "de" });
    const step = recipes.find((one) => one.key === "narration:describe:1");
    if (step?.input.kind !== "llm") throw new Error("Missing description step");
    expect(step.input.messages[0]?.content).toMatch(/German/);
  });

  it("stands one future step in for the descriptions of an unwritten article", () => {
    const recipes = plan(on(cases.generated));
    const future = recipes.find((one) => one.key === "narration:describe:future");
    expect(future?.input).toMatchObject({ kind: "deferred", operation: "narration-description" });
    expect(recipes.find((one) => one.key === "audio:body:future")?.dependsOn).toContain(
      "narration:describe:future",
    );
  });

  it("describes a table inside a speaker's turn within that turn", () => {
    const c = on(cases.voices);
    const first = plan(c);
    expect(
      first.filter((one) => one.key.startsWith("narration:describe:")).map((one) => one.key),
    ).toEqual(["narration:describe:1"]);
    expect(first.some((one) => one.input.kind === "tts")).toBe(false);
    const recipes = plan(
      c,
      answered(first, () => "Brest has the larger range."),
    );
    const turns = recipes.flatMap((one) =>
      one.input.kind === "tts" ? [[one.input.speaker, one.input.text]] : [],
    );
    expect(turns).toEqual([
      ["alex", "Welcome. Here are the ranges: Brest has the larger range."],
      ["sam", "Thanks."],
    ]);
    // The turn that had no table keeps its request.
    expect(recipes.find((one) => one.key === "audio:body:turn:2:1")?.fingerprint).toBe(
      "68efd37de79f982d5f470016ab9e86c1e8f35f6bf34fd7085b1f5008ce8d591b",
    );
  });
});

describe("showing tables and figures on screen", () => {
  const video: RunConfig = {
    ...on(narrated),
    sources: { ...narrated.sources, video: "generate" },
    showFigures: true,
  };

  it("plans a card per described block, which the video waits for", () => {
    const recipes = plan(video);
    const cards = recipes.filter((one) => one.key.startsWith("figure:card:"));
    expect(cards.map((one) => [one.key, one.stage])).toEqual([
      ["figure:card:1", "images"],
      ["figure:card:2", "images"],
      ["figure:card:3", "images"],
      ["figure:card:4", "images"],
    ]);
    expect(cards[0]?.input).toMatchObject({
      kind: "local",
      operation: "figure-card-v1",
      values: { kind: "table", formats: ["16:9"] },
    });
    const exported = recipes.find((one) => one.key === "export:video");
    expect(exported?.dependsOn).toEqual(
      expect.arrayContaining(["subtitles:timing", ...cards.map((one) => one.key)]),
    );
  });

  it("draws them upright too for the Shorts of a 16:9 video, which wait for them", () => {
    const recipes = plan({
      ...video,
      shorts: { enabled: true, count: 1, minSeconds: 30, maxSeconds: 60 },
    });
    expect(recipes.find((one) => one.key === "figure:card:1")?.input).toMatchObject({
      values: { formats: ["16:9", "9:16"] },
    });
  });

  it("plans no card, and the video it always did, when off", () => {
    const { showFigures: _off, ...without } = video;
    const recipes = plan(without);
    expect(recipes.some((one) => one.key.startsWith("figure:card:"))).toBe(false);
  });
});
