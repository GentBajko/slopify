import { expect, it } from "vitest";
import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content, emptyView } from "./recipe-fixture.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";

const doctor: NarrationAlias = {
  written: "Dr.",
  spoken: "Doctor",
  wholeWord: true,
  caseSensitive: false,
};

function context(
  markdown: string,
  options: {
    readonly use?: boolean;
    readonly aliases?: readonly NarrationAlias[];
    readonly prepare?: boolean;
    readonly glossary?: boolean;
  } = {},
): RecipeContext {
  const selected = {
    ...config,
    sources: {
      ...config.sources,
      audio: "generate" as const,
      images: "off" as const,
      video: "off" as const,
    },
    audio: {
      ...(options.glossary
        ? { provider: "inworld", model: "inworld-tts-2", usePronunciationGlossary: true }
        : { provider: "voice", model: "tts" }),
      voice: "v1",
      ...(options.use === undefined ? {} : { useNarrationAliases: options.use }),
    },
    ...(options.aliases === undefined ? {} : { narrationAliases: options.aliases }),
    chunking: { mode: "paragraph" as const },
    ...(options.prepare
      ? {
          narrationPrompt: "Delivery",
          llm: { provider: "llm", model: "llm" },
          rendered: { ...config.rendered, narration: "Restrained." },
        }
      : {}),
  };
  const value = { ...content, articleMarkdown: markdown, imageOrder: [], imageDefinitions: {} };
  return {
    config: selected,
    content: value,
    manifest: emptyView(selected, value),
    resolved: { articleMarkdown: markdown, researchNotes: null },
    catalogue: options.glossary
      ? {
          ...catalogue,
          tts: catalogue.tts.map((row) => ({ ...row, provider: "inworld", id: "inworld-tts-2" })),
        }
      : catalogue,
  };
}
const fingerprints = (recipes: readonly ResolvedWorkRecipe[]) =>
  Object.fromEntries(recipes.map((row) => [row.key, row.fingerprint]));
const tts = (recipes: readonly ResolvedWorkRecipe[]) =>
  recipes.flatMap((row) => (row.input.kind === "tts" ? [row.input] : []));

it("changes nothing for a project from before aliases, or with them off", () => {
  const markdown = "Dr. Grey reads.\n\nQuiet words.";
  const before = fingerprints(buildRecipes(context(markdown)));
  expect(fingerprints(buildRecipes(context(markdown, { use: false, aliases: [doctor] })))).toEqual(
    before,
  );
  // On, but the copied list is empty, or none of it appears in the text.
  expect(fingerprints(buildRecipes(context(markdown, { use: true })))).toEqual(before);
  expect(
    fingerprints(
      buildRecipes(
        context(markdown, {
          use: true,
          aliases: [{ ...doctor, written: "Prof.", spoken: "Professor" }],
        }),
      ),
    ),
  ).toEqual(before);
});

it("says a matched alias and keeps the written words for the transcript", () => {
  const markdown = "Dr. Grey reads.\n\nQuiet words.";
  const before = buildRecipes(context(markdown));
  const after = buildRecipes(context(markdown, { use: true, aliases: [doctor] }));
  expect(tts(after).map((input) => [input.text, input.spokenText])).toEqual([
    ["Doctor Grey reads.", "Dr. Grey reads."],
    ["Quiet words.", undefined],
  ]);
  // Only the paragraph the alias touches, and what is built from it, changes.
  const changed = Object.entries(fingerprints(after))
    .filter(([key, value]) => fingerprints(before)[key] !== value)
    .map(([key]) => key);
  expect(changed.some((key) => key.startsWith("audio:body:") && key.endsWith(":1"))).toBe(true);
  expect(changed).not.toContain("article:body");
  expect(tts(before).find((input) => input.text === "Quiet words.")).toBeDefined();
});

it("gives Narration Preparation the aliased sentences and the voice the aliased text", () => {
  const recipes = buildRecipes(
    context("Dr. Grey reads.", { use: true, aliases: [doctor], prepare: true }),
  );
  const preparation = recipes.find((row) => row.key.startsWith("narration:prepare:body:"));
  if (preparation?.input.kind !== "llm") throw new Error("Missing preparation");
  expect(JSON.stringify(preparation.input.messages)).toContain("Doctor ");
  expect(preparation.input.preparation?.source).toBe("Dr. Grey reads.");
});

it("applies an alias over the glossary where both name the same word", () => {
  const recipes = buildRecipes(
    context("Dr. Grey reads.\n\n## Pronunciation Glossary\nGrey: /ɡreɪ/\nDr: /dɑk/", {
      use: true,
      aliases: [doctor],
      glossary: true,
    }),
  );
  expect(tts(recipes).map((input) => input.text)).toEqual(["Doctor /ɡreɪ/ reads."]);
});
