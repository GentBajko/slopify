import { expect, it } from "vitest";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content, emptyView } from "./recipe-fixture.js";
import type { RecipeContext } from "./recipe-model.js";
import { narrationGlossary } from "./recipe-text.js";

function context(markdown: string, rules?: 1 | 2): RecipeContext {
  const selected = {
    ...config,
    sources: {
      ...config.sources,
      audio: "generate" as const,
      images: "off" as const,
      video: "off" as const,
    },
    audio: {
      provider: "inworld",
      model: "inworld-tts-2",
      voice: "voice",
      usePronunciationGlossary: true,
    },
    chunking: { mode: "paragraph" as const },
    ...(rules === undefined ? {} : { pronunciationRules: rules }),
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
const article =
  "Gygax's tower stood at Arach-Tinilith.\n\n## Pronunciation Glossary\n\n| Term | IPA |\n|---|---|\n| Gygax | ˈɡaɪɡæks |\n| Arach-Tinilith | əˈræk ˈtɪnɪlɪθ |\n| Bob | — |";
const spoken = (markdown: string, rules?: 1 | 2): string =>
  buildRecipes(context(markdown, rules))
    .flatMap((row) => (row.input.kind === "tts" ? [row.input.text] : []))
    .join(" ");

it("narrates a project saved before the rules were recorded exactly as it always did", () => {
  const text = spoken(article);
  expect(text).toContain("Gygax's tower");
  expect(text).toContain("Arach-Tinilith");
  expect(narrationGlossary(context(article))).toMatchObject({
    ok: true,
    entries: [{ term: "Gygax" }],
    skipped: [{ row: 2 }, { row: 3 }],
  });
  const withRules = buildRecipes(context(article, 1));
  expect(
    Object.fromEntries(buildRecipes(context(article)).map((row) => [row.key, row.fingerprint])),
  ).toEqual(Object.fromEntries(withRules.map((row) => [row.key, row.fingerprint])));
});

it("a project started under the new rules gets possessives and hyphenated names", () => {
  const text = spoken(article, 2);
  expect(text).toContain("/ˈɡaɪɡæksɪz/ tower");
  expect(text).toContain("/əˈræk.ˈtɪnɪlɪθ/.");
  expect(narrationGlossary(context(article, 2))).toMatchObject({ ok: true, unpronounced: 1 });
  expect(narrationGlossary(context(article, 2))).not.toHaveProperty("skipped");
});

it("the same article's recipes differ between the two rules, which is why old projects stay on 1", () => {
  const before = buildRecipes(context(article)).find((row) => row.key.startsWith("audio:body"));
  const after = buildRecipes(context(article, 2)).find((row) => row.key.startsWith("audio:body"));
  expect(before?.fingerprint).not.toBe(after?.fingerprint);
});
