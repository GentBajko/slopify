import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildRecipes } from "../rebuild/recipe-build.js";
import { planRevision } from "../rebuild/recipe-save.js";
import { insertStagedFile } from "../storage/repo.js";
import type { RevisionDeps, RevisionEdit, RevisionView } from "./model.js";
import { mutationFixture } from "./mutation.fake.js";
import { restoreRevision, saveRevision } from "./mutations.js";
import { revisionViewSchema } from "./schema.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
const glossary = "Dr. Doom: /dɒktə duːm/\nP!nk: /pɪŋk/";
const markdown = (source: string, entries = glossary) =>
  `${source}\n\n## Pronunciation Glossary\n${entries}`;
function recipes(view: RevisionView) {
  return buildRecipes({
    config: view.revision.config,
    content: view.revision.content,
    manifest: view,
    resolved: { articleMarkdown: view.articleMarkdown, researchNotes: null },
  });
}
async function save(deps: RevisionDeps, view: RevisionView, id: string, edit: RevisionEdit) {
  const result = await saveRevision(deps, {
    projectId: view.revision.projectId,
    baseRevisionId: view.revision.id,
    idempotencyKey: id,
    edit,
  });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.view;
}
async function fixture(source = "Meet Dr. Doom today.") {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const deps = { ...h.deps, measureAudio: async () => 1000 };
  const base = await save(deps, h.base, "initial", {
    config: {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" },
      audio: {
        provider: "inworld",
        model: "inworld-tts-2",
        voice: "v",
        usePronunciationGlossary: true,
      },
      chunking: { mode: "words", words: 1 },
    },
    content: { ...h.base.revision.content, articleMarkdown: markdown(source) },
  });
  const keys = recipes(base).flatMap((row) =>
    row.input.kind === "tts" ? [row.input.logicalKey] : [],
  );
  const key = keys[0];
  if (key === undefined) throw new Error("Missing narration group.");
  return { ...h, deps, base, key, keys, source };
}
function upload(deps: RevisionDeps, key: string): RevisionEdit["uploads"] {
  writeFileSync(join(deps.paths.staging, "audio"), "audio");
  insertStagedFile(deps.db, {
    id: "audio",
    stageKind: "audio",
    path: "audio",
    originalFilename: "audio.wav",
    bytes: 5,
    state: "staged",
    createdAt: deps.clock.now().toISOString(),
  });
  return [{ stagedFileId: "audio", destination: { kind: "narration", key } }];
}

it.each(
  (["removed", "off", "invalid"] as const).flatMap((change) =>
    (["text", "asset"] as const).map((kind) => ({ change, kind })),
  ),
)("preserves saved $kind when the glossary is $change", async ({ change, kind }) => {
  const h = await fixture(kind === "text" ? "Meet Dr. Doom today." : "P!nk sings.");
  const edit: RevisionEdit = {
    config: h.base.revision.config,
    content: {
      ...h.base.revision.content,
      narrationOverrides: kind === "text" ? { [h.key]: { kind: "text", text: "P!nk waits." } } : {},
    },
    ...(kind === "asset" ? { uploads: upload(h.deps, h.key) } : {}),
  };
  const overridden = await save(h.deps, h.base, "override", edit);
  expect(overridden.revision.content.narrationSources?.[h.key]).toMatchObject({
    text: h.source,
    start: 0,
  });
  const preview = planRevision(overridden, {
    config: overridden.revision.config,
    content: { ...overridden.revision.content, articleMarkdown: markdown(h.source, "") },
  });
  expect(preview.ok && preview.recipes.some((row) => row.key === `${h.key}:1`)).toBe(true);
  const next = await save(h.deps, overridden, "glossary-change", {
    config:
      change === "off"
        ? {
            ...overridden.revision.config,
            audio: {
              ...overridden.revision.config.audio,
              provider: "inworld",
              model: "inworld-tts-2",
              voice: "v",
              usePronunciationGlossary: false,
            },
          }
        : overridden.revision.config,
    content: {
      ...overridden.revision.content,
      articleMarkdown: markdown(
        h.source,
        change === "invalid" ? "Broken: nope" : kind === "text" ? "P!nk: /pɪŋk/" : "",
      ),
    },
  });
  const active = recipes(next).find((row) => row.key === `${h.key}:1`);
  if (kind === "asset") {
    const override = overridden.revision.content.narrationOverrides[h.key];
    expect(active?.input).toMatchObject({
      kind: "provided",
      assetId: override?.kind === "asset" ? override.assetId : "missing",
    });
    expect(active?.refusal).toBeUndefined();
  } else if (change === "invalid") {
    expect(active?.refusal).toContain("Pronunciation Glossary");
  } else {
    expect(active?.input).toMatchObject({
      kind: "tts",
      text: change === "off" ? "P!nk waits." : "/pɪŋk/ waits.",
      logicalKey: h.key,
    });
  }
  expect(revisionViewSchema.parse(JSON.parse(JSON.stringify(next)))).toEqual(next);
  expect(getRevisionView(h.deps, h.projectId, overridden.revision.id)?.revision).toEqual(
    overridden.revision,
  );
  const replay = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "override",
    edit,
  });
  expect(replay).toMatchObject({
    ok: true,
    duplicate: true,
    view: { revision: overridden.revision },
  });
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
});

it("preserves a regeneration-only merged group through glossary removal", async () => {
  const h = await fixture();
  const regenerated = await save(h.deps, h.base, "regenerate", {
    config: h.base.revision.config,
    content: h.base.revision.content,
    regenerate: [`${h.key}:1`],
  });
  const token = regenerated.revision.content.regenerationTokens[h.key];
  expect(token).toBeDefined();
  const next = await save(h.deps, regenerated, "remove", {
    config: regenerated.revision.config,
    content: { ...regenerated.revision.content, articleMarkdown: markdown(h.source, "") },
  });
  expect(recipes(next).find((row) => row.key === `${h.key}:1`)?.input).toMatchObject({
    kind: "tts",
    text: h.source,
    logicalKey: h.key,
  });
  expect(next.revision.content.regenerationTokens[h.key]).toBe(token);
});

it("restores a pronunciation revision and its source bindings without admitting narration", async () => {
  const h = await fixture();
  const original = await save(h.deps, h.base, "override", {
    config: h.base.revision.config,
    content: {
      ...h.base.revision.content,
      narrationOverrides: { [h.key]: { kind: "text", text: "Dr. Doom returns." } },
    },
  });
  const changed = await save(h.deps, original, "disable-audio", {
    config: {
      ...original.revision.config,
      sources: { ...original.revision.config.sources, audio: "off" },
    },
    content: original.revision.content,
  });
  const request = {
    projectId: h.projectId,
    baseRevisionId: changed.revision.id,
    targetRevisionId: original.revision.id,
    idempotencyKey: "restore-pronunciation",
  };
  const restored = await restoreRevision(h.deps, request);
  if (!restored.ok) throw new Error(JSON.stringify(restored));
  expect(restored.view.revision.content).toEqual(original.revision.content);
  expect(recipes(restored.view).find((row) => row.key === `${h.key}:1`)?.input).toMatchObject({
    kind: "tts",
    text: "/dɒktə/ /duːm/ returns.",
    logicalKey: h.key,
  });
  expect(
    h.deps.db
      .prepare(
        "SELECT DISTINCT w.kind,w.dispatch_state FROM revision_work w JOIN revision_work_reservations r ON r.work_id=w.id WHERE r.revision_id=? AND r.work_key LIKE 'narration:%'",
      )
      .all(restored.view.revision.id),
  ).toEqual([{ kind: "audio", dispatch_state: "held" }]);
  expect(await restoreRevision(h.deps, request)).toMatchObject({ ok: true, duplicate: true });
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
});

it("retains repeated saved groups and ordinary overrides without attaching unnecessary metadata", async () => {
  const h = await fixture("Before. Meet Dr. Doom today. Middle. Meet Dr. Doom today. After.");
  const overrides = Object.fromEntries(
    h.keys.map((key, index) => [key, { kind: "text" as const, text: `Replacement ${index}.` }]),
  );
  const overridden = await save(h.deps, h.base, "override", {
    config: h.base.revision.config,
    content: { ...h.base.revision.content, narrationOverrides: overrides },
  });
  expect(
    Object.values(overridden.revision.content.narrationSources ?? {}).map((row) => row.start),
  ).toEqual([8, 37]);
  const next = await save(h.deps, overridden, "remove", {
    config: overridden.revision.config,
    content: { ...overridden.revision.content, articleMarkdown: markdown(h.source, "") },
  });
  const inputs = recipes(next).flatMap((row) => (row.input.kind === "tts" ? [row.input] : []));
  expect(inputs.map((row) => row.logicalKey)).toEqual(h.keys);
  expect(inputs.map((row) => row.text)).toEqual(h.keys.map((_, index) => `Replacement ${index}.`));
  expect(next.revision.content.narrationSources).toEqual(
    overridden.revision.content.narrationSources,
  );
});

it.each(["body", "chunking"] as const)(
  "does not rebind a saved override after %s changes",
  async (change) => {
    const h = await fixture();
    const overridden = await save(h.deps, h.base, "override", {
      config: h.base.revision.config,
      content: {
        ...h.base.revision.content,
        narrationOverrides: { [h.key]: { kind: "text", text: "Replacement." } },
      },
    });
    const next = await save(h.deps, overridden, "source-change", {
      config:
        change === "chunking"
          ? { ...overridden.revision.config, chunking: { mode: "words", words: 2 } }
          : overridden.revision.config,
      content: {
        ...overridden.revision.content,
        articleMarkdown: markdown(change === "body" ? `Before. ${h.source}` : h.source, ""),
      },
    });
    expect(next.revision.content.narrationSources).toBeUndefined();
    expect(next.revision.content.narrationOverrides).toEqual(
      overridden.revision.content.narrationOverrides,
    );
    expect(recipes(next).some((row) => row.key === `${h.key}:1`)).toBe(false);
  },
);

it("binds the original group when the first override is saved together with Off", async () => {
  const h = await fixture();
  const next = await save(h.deps, h.base, "override-off", {
    config: {
      ...h.base.revision.config,
      audio: {
        provider: "inworld",
        model: "inworld-tts-2",
        voice: "v",
        usePronunciationGlossary: false,
      },
    },
    content: {
      ...h.base.revision.content,
      narrationOverrides: { [h.key]: { kind: "text", text: "Replacement." } },
    },
  });
  expect(next.revision.content.narrationSources?.[h.key]?.text).toBe(h.source);
  expect(recipes(next).find((row) => row.key === `${h.key}:1`)?.input).toMatchObject({
    kind: "tts",
    text: "Replacement.",
  });
});
