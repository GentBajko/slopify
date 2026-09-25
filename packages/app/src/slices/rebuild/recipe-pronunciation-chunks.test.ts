import { expect, it } from "vitest";
import { fingerprint } from "../../kernel/runner/work.js";
import type { Chunking } from "../narration/chunk.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content, emptyView } from "./recipe-fixture.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";

function context(source: string, glossary: string, chunking: Chunking): RecipeContext {
  const markdown = `${source}\n\n## Pronunciation Glossary\n${glossary}`;
  const selected = {
    ...config,
    sources: { ...config.sources, audio: "generate" as const, images: "off" as const },
    audio: {
      provider: "inworld",
      model: "inworld-tts-2",
      voice: "voice",
      usePronunciationGlossary: true,
    },
    chunking,
  };
  const value = { ...content, articleMarkdown: markdown, imageOrder: [], imageDefinitions: {} };
  return {
    config: selected,
    content: value,
    manifest: emptyView(selected, value),
    resolved: { articleMarkdown: markdown, researchNotes: null },
    catalogue: {
      ...catalogue,
      tts: catalogue.tts.map((row) => ({ ...row, provider: "inworld", id: "inworld-tts-2" })),
    },
  };
}
function tts(rows: readonly ResolvedWorkRecipe[]) {
  return rows.filter((row) => row.input.kind === "tts");
}
function off(base: RecipeContext): RecipeContext {
  return {
    ...base,
    config: {
      ...base.config,
      audio: {
        provider: "inworld",
        model: "inworld-tts-2",
        voice: "voice",
        usePronunciationGlossary: false,
      },
    },
  };
}
const chunkings: readonly Chunking[] = [
  { mode: "words", words: 1 },
  { mode: "characters", characters: 3 },
  { mode: "paragraph" },
];

it.each(chunkings)("protects punctuated glossary terms across $mode logical chunks", (chunking) => {
  const base = context("P!nk sings.", "P!nk: /pɪŋk/", chunking);
  expect(tts(buildRecipes(base)).map((row) => row.input)).toMatchObject([
    { kind: "tts", text: "/pɪŋk/ sings.", spokenText: "P!nk sings.", logicalText: "P!nk sings." },
  ]);
});

it.each([
  { source: "Meet Dr. Doom today.", chunking: { mode: "words", words: 2 } as const },
  { source: "Meet Dr. Doom today.", chunking: { mode: "characters", characters: 5 } as const },
  { source: "Meet Dr.\n\nDoom today.", chunking: { mode: "paragraph" } as const },
])("protects full multiword terms across $chunking.mode boundaries", ({ source, chunking }) => {
  const base = context(source, "Dr.: /dɑk/\nDr. Doom: /dɒktə duːm/\nDoom: /dʌm/", chunking);
  expect(tts(buildRecipes(base)).map((row) => row.input)).toMatchObject([
    {
      kind: "tts",
      text: source.replace("Dr.", "/dɒktə/").replace("Doom", "/duːm/"),
      spokenText: source,
      logicalText: source,
    },
  ]);
});

it("keeps unchanged repeated group keys when earlier occurrences are merged", () => {
  const base = context("P!nk sings.\n\nnk sings.\n\nP!nk sings.", "P!nk: /pɪŋk/", {
    mode: "words",
    words: 1,
  });
  const before = tts(buildRecipes(off(base)));
  const next = tts(buildRecipes(base));
  expect(next).toHaveLength(3);
  expect(new Set(next.map((row) => row.key)).size).toBe(3);
  const unchanged = before[2];
  expect(unchanged?.input).toMatchObject({ logicalText: "nk sings." });
  expect(next[1]).toEqual(unchanged);
  expect(next[0]?.requestFingerprint).toBe(next[2]?.requestFingerprint);
});

it.each(chunkings)("keeps no-match and Off identities for $mode chunks", (chunking) => {
  const base = context("First.\n\nP!nk sings.\n\nLast.", "Unused: /ʌnjuːzd/", chunking);
  const disabled = off(base);
  expect(tts(buildRecipes(base))).toEqual(tts(buildRecipes(disabled)));
  const absent = {
    ...disabled,
    config: {
      ...disabled.config,
      audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
    },
  };
  expect(buildRecipes(disabled)).toEqual(buildRecipes(absent));
});

it.each(["text", "asset"] as const)(
  "preserves a %s override on a crossed original group",
  (kind) => {
    const base = context("P!nk sings. P!nk sings.", "P!nk: /pɪŋk/\nJames: /dʒeɪmz/", {
      mode: "words",
      words: 1,
    });
    const key = `audio:body:${fingerprint("P!").slice(0, 20)}-1`;
    const next = buildRecipes({
      ...base,
      content: {
        ...base.content,
        narrationOverrides: {
          [key]:
            kind === "text"
              ? { kind: "text", text: "James sings." }
              : { kind: "asset", assetId: "supplied" },
        },
      },
    });
    expect(next.find((row) => row.key === `${key}:1`)?.input).toMatchObject(
      kind === "text"
        ? { kind: "tts", text: "/dʒeɪmz/ sings.", spokenText: "James sings." }
        : { kind: "provided", assetId: "supplied" },
    );
    const spoken = tts(next).map((row) => (row.input.kind === "tts" ? row.input.text : ""));
    expect(spoken.filter((text) => text.includes("/pɪŋk/"))).toHaveLength(1);
    expect(spoken).toContain("nk sings.");
  },
);

it("honors an override saved for an already merged group", () => {
  const base = context("P!nk sings.", "P!nk: /pɪŋk/", { mode: "words", words: 1 });
  const key = `audio:body:${fingerprint("P!nk sings.").slice(0, 20)}-1`;
  expect(
    tts(
      buildRecipes({
        ...base,
        content: {
          ...base.content,
          narrationOverrides: { [key]: { kind: "text", text: "A replacement." } },
        },
      }),
    ).map((row) => row.input),
  ).toMatchObject([{ text: "A replacement.", logicalKey: key }]);
});

it("bypasses logical glossary grouping for supplied whole audio", () => {
  const base = context("P!nk sings.", "P!nk: /pɪŋk/", { mode: "words", words: 1 });
  const recipes = buildRecipes({
    ...base,
    config: { ...base.config, sources: { ...base.config.sources, audio: "provide" } },
    content: { ...base.content, provided: { audio: "whole-audio" } },
  });
  expect(tts(recipes)).toEqual([]);
  expect(recipes.find((row) => row.key === "audio:provided")?.input).toMatchObject({
    kind: "provided",
    assetId: "whole-audio",
  });
});
