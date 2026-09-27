import { expect, it } from "vitest";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content, emptyView } from "./recipe-fixture.js";
import type { RecipeContext } from "./recipe-model.js";
import { narrationGlossary } from "./recipe-text.js";

function context(markdown: string): RecipeContext {
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

it("keeps the 2.5.0 fingerprints of a glossary that already parsed", () => {
  // Pinned from 2.5.0: skipping bad rows must not outdate a project whose glossary was valid.
  const recipes = buildRecipes(
    context(
      "John reads.\n\nQuiet words.\n\n## Pronunciation Glossary\n\n| Term | IPA |\n|---|---|\n| John | /dʒɑn/ |\n\nQuiet: /kwaɪət/",
    ),
  );
  expect(Object.fromEntries(recipes.map((row) => [row.key, row.fingerprint]))).toEqual({
    "article:body": "f45a9b96344fcb782133c6ee6dc96987c803e26586cc2ee42a56f0804f236bb4",
    "audio:body:0ac6d3b24a57f34d0ca4-1:1":
      "57f414f141280c7c85b999b342610e28d773e433c9be94e587da37924402bd90",
    "audio:body:216091e969e3aeb1d4a3-1:1":
      "964297251d093dd9e1370c9147472532d5083997be13c382bebfa9060bd2d9b5",
    "narration:files:body": "b338e5239cdf43801642905b2ea36a60b7107f4c6db1a03e7bf9aa8d3cc09742",
    "audio:body:concat": "f1c4295b7ac5cb038f8e6b1c3e183198b6ac1a4c36542bd6714f848dd63552b3",
    "export:wav": "556557365d04b451b2e59666bf8100fcee4193f6560ca030f79986fc6b279348",
  });
});

it("narrates a bare-IPA table glossary and reports only the skipped row", () => {
  const markdown =
    "Tiamat rules. Caverna do Dragão aired.\n\n## Pronunciation Glossary\n\n| Name / Term | IPA |\n|---|---|\n| Tiamat | ˈtiːəmɑːt |\n| Caverna do Dragão | kaˈvɛʁnɐ du dɾaˈɡɐ̃w̃ |";
  const recipes = buildRecipes(context(markdown));
  expect(recipes.some((row) => row.refusal !== undefined)).toBe(false);
  const tts = recipes.flatMap((row) => (row.input.kind === "tts" ? [row.input.text] : []));
  expect(tts.join(" ")).toContain("/ˈtiːəmɑːt/ rules.");
  expect(tts.join(" ")).toContain("Caverna do Dragão aired.");
  expect(narrationGlossary(context(markdown))).toMatchObject({
    ok: true,
    skipped: [{ row: 2 }],
  });
});
