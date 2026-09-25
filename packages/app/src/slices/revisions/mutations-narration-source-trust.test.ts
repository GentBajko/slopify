import { afterEach, expect, it } from "vitest";
import { parsePronunciationGlossary } from "../narration/pronunciation.js";
import { pronunciationChunks } from "../narration/pronunciation-chunks.js";
import { buildRecipes } from "../rebuild/recipe-build.js";
import { mutationFixture } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { revisionContentSchema } from "./schema.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
const source = "Meet Dr. Doom today.";
const chunking = { mode: "words", words: 1 } as const;
const parsed = parsePronunciationGlossary("Dr. Doom: /dɒktə duːm/");
if (!parsed.ok) throw new Error(parsed.reason);
const merged = pronunciationChunks(source, chunking, parsed.entries)[0];
if (merged?.source === undefined) throw new Error("Missing merged source.");
const savedSource = merged.source;
const bindings = { [merged.key]: savedSource };
const key = merged.key;

async function fixture(enabled: boolean) {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const edit = {
    config: {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" as const },
      audio: {
        provider: "inworld",
        model: "inworld-tts-2",
        voice: "v",
        usePronunciationGlossary: enabled,
      },
      chunking,
    },
    content: {
      ...h.base.revision.content,
      articleMarkdown: `${source}\n\n## Pronunciation Glossary\nDr. Doom: /dɒktə duːm/`,
    },
  };
  const initial = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "initial",
    edit,
  });
  if (!initial.ok) throw new Error(JSON.stringify(initial));
  return { ...h, base: initial.view };
}

it("does not let client source metadata create a non-active merged override", async () => {
  const h = await fixture(false);
  const result = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "spoof",
    edit: {
      config: h.base.revision.config,
      content: {
        ...h.base.revision.content,
        narrationSources: bindings,
        narrationOverrides: { [key]: { kind: "text", text: "Replacement." } },
      },
    },
  });
  expect(result).toMatchObject({
    ok: false,
    reason: "invalid-edit",
    fields: [{ field: `content.narrationOverrides.${key}` }],
  });
});

it("derives authoritative source metadata even when the client omits or forges it", async () => {
  const h = await fixture(true);
  const initial = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "override",
    edit: {
      config: h.base.revision.config,
      content: {
        ...h.base.revision.content,
        narrationOverrides: { [key]: { kind: "text", text: "First replacement." } },
      },
    },
  });
  if (!initial.ok) throw new Error(JSON.stringify(initial));
  let base = initial.view;
  for (const forged of [
    undefined,
    { [key]: { ...savedSource, text: "Forged source." } },
  ] as const) {
    const { narrationSources: _sources, ...content } = base.revision.content;
    const edit = {
      config: base.revision.config,
      content: {
        ...content,
        articleMarkdown: source,
        narrationOverrides: { [key]: { kind: "text" as const, text: "Second replacement." } },
        ...(forged === undefined ? {} : { narrationSources: forged }),
      },
    };
    const request = {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: forged === undefined ? "omitted" : "forged",
      edit,
    };
    const next = await saveRevision(h.deps, request);
    if (!next.ok) throw new Error(JSON.stringify(next));
    expect(next.view.revision.content.narrationSources).toEqual(bindings);
    const recipes = buildRecipes({
      config: next.view.revision.config,
      content: next.view.revision.content,
      manifest: next.view,
      resolved: { articleMarkdown: next.view.articleMarkdown, researchNotes: null },
    });
    expect(recipes.find((row) => row.key === `${key}:1`)?.input).toMatchObject({
      kind: "tts",
      text: "Second replacement.",
    });
    const replay = await saveRevision(h.deps, {
      ...request,
      edit: { ...edit, content: { ...edit.content, narrationSources: bindings } },
    });
    expect(replay).toMatchObject({
      ok: true,
      duplicate: true,
      view: { revision: next.view.revision },
    });
    base = next.view;
  }
  const cleared = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: base.revision.id,
    idempotencyKey: "clear",
    edit: {
      config: base.revision.config,
      content: { ...base.revision.content, narrationOverrides: {} },
    },
  });
  expect(cleared.ok && cleared.view.revision.content.narrationSources).toBeUndefined();
});

it("validates bounded source metadata while retaining legacy omission", async () => {
  const h = await fixture(false);
  const content = h.base.revision.content;
  expect(revisionContentSchema.parse(content).narrationSources).toBeUndefined();
  expect(
    revisionContentSchema.parse({ ...content, narrationSources: bindings }).narrationSources,
  ).toEqual(bindings);
  for (const patch of [
    { start: -1 },
    { start: 0.5 },
    { start: 500001 },
    { text: "" },
    { text: "x".repeat(500001) },
    { bodyFingerprint: "invalid" },
    { chunkingFingerprint: "invalid" },
  ])
    expect(
      revisionContentSchema.safeParse({
        ...content,
        narrationSources: { [key]: { ...savedSource, ...patch } },
      }).success,
    ).toBe(false);
  expect(
    revisionContentSchema.safeParse({
      ...content,
      narrationSources: {
        a: { ...savedSource, text: "x".repeat(250001) },
        b: { ...savedSource, text: "x".repeat(250001) },
      },
    }).success,
  ).toBe(false);
});
