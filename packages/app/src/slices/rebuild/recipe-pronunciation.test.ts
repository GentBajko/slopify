import { expect, it } from "vitest";
import { audioRecipes } from "./recipe-audio.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content, emptyView } from "./recipe-fixture.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";
import { textRecipes } from "./recipe-text.js";
import { planRevisionWork } from "./recipes.js";

function context(markdown: string, prepare = false, limit = 24): RecipeContext {
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
    ...(prepare ? { narrationPrompt: "Delivery" } : {}),
    rendered: { ...config.rendered, narration: "Restrained." },
  };
  const value = { ...content, articleMarkdown: markdown, imageOrder: [], imageDefinitions: {} };
  return {
    config: selected,
    content: value,
    manifest: emptyView(selected, value),
    resolved: { articleMarkdown: markdown, researchNotes: null },
    catalogue: {
      ...catalogue,
      tts: catalogue.tts.map((row) => ({
        ...row,
        provider: "inworld",
        id: "inworld-tts-2",
        tts: { ...row.tts, maxCharacters: limit },
      })),
    },
  };
}
function part(recipes: readonly ResolvedWorkRecipe[]) {
  const found = recipes.find((row) => row.input.kind === "tts" && row.input.segment === "body");
  if (found?.input.kind !== "tts") throw new Error("Missing body request");
  return { recipe: found, input: found.input };
}
const article = (ipa = "dʒɑn", extra = "") =>
  `John reads.\n\nQuiet words.\n\n## Pronunciation Glossary\nJohn: /${ipa}/\n${extra}`;

it.each([false, true])(
  "refuses Unicode-equivalent conflicting terms before preparation=%s",
  (prepare) => {
    const recipes = buildRecipes(
      context("Σ σ ς.\n\n## Pronunciation Glossary\nΣ: /s/\nς: /z/", prepare),
    );
    expect(recipes.some((row) => row.refusal?.includes("conflicting pronunciations"))).toBe(true);
    expect(
      recipes.some((row) => row.input.kind === "tts" || row.key.startsWith("narration:prepare:")),
    ).toBe(false);
  },
);

it("preserves joining hyphens instead of partially pronouncing compounds", () => {
  const body = "Lich-king Lich‐king Lich‑king.";
  const recipes = buildRecipes(
    context(`${body}\n\n## Pronunciation Glossary\nLich: /lɪtʃ/`, false, 500),
  );
  expect(part(recipes).input.text).toBe(body);
});

it("extracts only glossary end matter and preserves the readable body", () => {
  const text = textRecipes(
    context(
      "John reads.\n\n## Sources Consulted\nInvalid: not IPA\n\n## Pronunciation Glossary\nJohn: /dʒɑn/",
    ),
  );
  expect(text.glossary).toMatchObject({ ok: true, entries: [{ term: "John" }] });
  expect(text.articleText?.trim()).toBe("John reads.");
});

it("keeps missing/false recipes identical even with malformed unused mappings", () => {
  const base = context(article("dʒɑn", "Unused: not IPA"));
  const absent = {
    ...base,
    config: {
      ...base.config,
      audio: {
        provider: "inworld",
        model: "inworld-tts-2",
        voice: "voice",
      },
    },
  };
  const off = {
    ...absent,
    config: {
      ...absent.config,
      audio: {
        ...absent.config.audio,
        usePronunciationGlossary: false,
      },
    },
  };
  expect(buildRecipes(off)).toEqual(buildRecipes(absent));
  expect(part(buildRecipes(off)).input.spokenText).toBeUndefined();
});

it("preserves ordinary split boundaries and fingerprints when no term matches", () => {
  const base = context(
    "A sentence. Another long sentence.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/",
    false,
    12,
  );
  const off = {
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
  const old = buildRecipes(off);
  const next = buildRecipes(base);
  expect(next.filter((row) => row.input.kind === "tts")).toEqual(
    old.filter((row) => row.input.kind === "tts"),
  );
  for (const key of ["audio:body:concat", "export:wav"])
    expect(next.find((row) => row.key === key)?.fingerprint).toBe(
      old.find((row) => row.key === key)?.fingerprint,
    );
  expect(next.some((row) => row.key === "narration:files:body")).toBe(true);
});

it("keeps the flag dormant for unsupported audio providers", () => {
  const base = context(article("dʒɑn", "Unused: invalid"));
  const dormant = {
    ...base,
    config: {
      ...base.config,
      audio: {
        provider: "voice",
        model: "tts",
        voice: "v1",
        usePronunciationGlossary: true,
      },
    },
  };
  const off = {
    ...dormant,
    config: {
      ...dormant.config,
      audio: {
        ...dormant.config.audio,
        usePronunciationGlossary: false,
      },
    },
  };
  expect(buildRecipes(dormant)).toEqual(buildRecipes(off));
});

it.each([false, true])(
  "rejects unused malformed mappings before cue/TTS recipes (prep=%s)",
  (prepare) => {
    const base = context(article("dʒɑn", "Unused: not IPA"), prepare);
    const recipes = buildRecipes(base);
    expect(recipes.some((row) => row.input.kind === "tts")).toBe(false);
    expect(recipes.some((row) => row.input.kind === "llm" && row.input.preparation)).toBe(false);
    expect(recipes.some((row) => row.unresolved && row.refusal)).toBe(true);
  },
);

it("does not hold generated entry TEXT solely because the glossary is invalid", () => {
  const base = context(article("dʒɑn", "Unused: invalid"), true);
  const next = {
    ...base,
    config: {
      ...base.config,
      intro: { name: "Intro", mode: "llm" as const },
      rendered: { ...base.config.rendered, intro: "Introduce John." },
    },
  };
  const recipes = buildRecipes(next);
  expect(recipes.find((row) => row.key === "entry:intro:text")).toMatchObject({
    deferred: false,
    input: { kind: "llm" },
  });
  expect(recipes.some((row) => row.input.kind === "llm" && row.input.preparation)).toBe(false);
});

it("applies mappings after a text override and bypasses a supplied chunk", () => {
  const base = context("Ordinary words.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/");
  const key = part(buildRecipes(base)).input.logicalKey;
  const overridden = {
    ...base,
    content: {
      ...base.content,
      narrationOverrides: { [key]: { kind: "text" as const, text: "John waits." } },
    },
  };
  expect(part(buildRecipes(overridden)).input).toMatchObject({
    text: "/dʒɑn/ waits.",
    spokenText: "John waits.",
    pronunciation: null,
  });
  const supplied = {
    ...overridden,
    content: {
      ...overridden.content,
      articleMarkdown: "Ordinary words.\n\n## Pronunciation Glossary\nUnused: invalid",
      narrationOverrides: { [key]: { kind: "asset" as const, assetId: "provided-chunk" } },
    },
  };
  const recipes = buildRecipes(supplied);
  expect(recipes.find((row) => row.key === `${key}:1`)?.input).toMatchObject({
    kind: "provided",
    assetId: "provided-chunk",
  });
  expect(recipes.some((row) => row.refusal || row.input.kind === "tts")).toBe(false);
});

it("bypasses malformed glossary data for supplied whole audio", () => {
  const base = context(article("dʒɑn", "Unused: invalid"), true);
  const supplied = {
    ...base,
    config: { ...base.config, sources: { ...base.config.sources, audio: "provide" as const } },
    content: { ...base.content, provided: { audio: "whole-audio" } },
  };
  const recipes = buildRecipes(supplied);
  expect(recipes.find((row) => row.key === "audio:provided")?.input.kind).toBe("provided");
  expect(
    recipes.some(
      (row) => row.refusal || row.input.kind === "tts" || row.key.startsWith("narration:prepare:"),
    ),
  ).toBe(false);
});

it("invalidates used requests only, keeping unused mappings out of identities", () => {
  const before = buildRecipes(context(article()));
  const unused = buildRecipes(context(article("dʒɑn", "Jane: /dʒeɪn/")));
  const used = buildRecipes(context(article("dʒɒn")));
  const tts = (rows: readonly ResolvedWorkRecipe[]) =>
    rows.filter((row) => row.input.kind === "tts");
  expect(tts(unused)).toEqual(tts(before));
  const first = part(before);
  expect(used.find((row) => row.key === first.recipe.key)?.requestFingerprint).not.toBe(
    first.recipe.requestFingerprint,
  );
  const other = before.find(
    (row) => row.input.kind === "tts" && row.input.logicalText === "Quiet words.",
  );
  expect(used.find((row) => row.key === other?.key)).toEqual(other);
});

it("binds pending body/entry futures to used spans while retaining cue fingerprints", () => {
  const base = context(article(), true);
  const selected = {
    ...base,
    config: {
      ...base.config,
      intro: { name: "Intro", mode: "text" as const },
      rendered: { ...base.config.rendered, intro: "John arrives." },
    },
  };
  const before = buildRecipes(selected);
  const changed = buildRecipes({
    ...selected,
    content: { ...selected.content, articleMarkdown: article("dʒɒn") },
  });
  for (const key of ["audio:body:future", "audio:intro:future"])
    expect(changed.find((row) => row.key === key)?.fingerprint).not.toBe(
      before.find((row) => row.key === key)?.fingerprint,
    );
  const cues = before.filter((row) => row.input.kind === "llm" && row.input.preparation);
  expect(cues).toHaveLength(3);
  for (const cue of cues)
    expect(changed.find((row) => row.key === cue.key)?.fingerprint).toBe(cue.fingerprint);
});

it("waits for the unresolved article glossary but keeps literal entry text ready", () => {
  const base = context("", true);
  const pending = {
    ...base,
    config: {
      ...base.config,
      sources: { ...base.config.sources, article: "generate" as const },
      provided: {},
      intro: { name: "Intro", mode: "text" as const },
      rendered: { ...base.config.rendered, intro: "John arrives." },
    },
    content: { ...base.content, articleMarkdown: undefined },
    resolved: { ...base.resolved, articleMarkdown: null },
  };
  const text = textRecipes(pending);
  const audio = audioRecipes(pending, text);
  expect(text.entries.intro?.recipe.input.kind).toBe("local");
  expect(audio.recipes.some((row) => row.input.kind === "tts")).toBe(false);
  for (const key of ["audio:intro:future", "narration:prepare:intro:future"])
    expect(audio.recipes.find((row) => row.key === key)?.dependsOn).toContain("article:body");
});

it("reports a blocked physical request when one IPA atom exceeds the catalog limit", () => {
  const base = context("John.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/", false, 5);
  if (!base.catalogue) throw new Error("Missing catalog");
  const view = emptyView(base.config, base.content);
  const plan = planRevisionWork(view.revision, view, base.catalogue, new Set(), base.resolved);
  expect(plan.recipes.some((row) => row.input.kind === "tts")).toBe(false);
  expect(
    plan.work.some((row) => row.key.startsWith("audio:body:") && row.disposition === "blocked"),
  ).toBe(true);
});

it("adds the other projects' pronunciations when sharing, with the project's own first", () => {
  const base = context("John and Szass Tam read.\n\n## Pronunciation Glossary\nJohn: /dʒɑn/");
  const shared = {
    ...base,
    config: {
      ...base.config,
      audio: { ...base.config.audio, voice: "voice", shareGlossary: true },
      sharedGlossary: [
        { term: "john", ipa: ["ʒɑn"] },
        { term: "Szass Tam", ipa: ["sæs", "tæm"] },
      ],
    },
  };
  expect(textRecipes(shared).glossary).toEqual({
    ok: true,
    entries: [
      { term: "John", ipa: ["dʒɑn"] },
      { term: "Szass Tam", ipa: ["sæs", "tæm"] },
    ],
  });
  // Off, or a project saved before sharing existed, ignores a copied list.
  const off = {
    ...shared,
    config: { ...shared.config, audio: { ...shared.config.audio, shareGlossary: false } },
  };
  expect(textRecipes(off).glossary).toEqual({
    ok: true,
    entries: [{ term: "John", ipa: ["dʒɑn"] }],
  });
});
