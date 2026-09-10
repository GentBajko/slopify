import { expect, it } from "vitest";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import { articleMessages, continuationMessages } from "../article/continuation.js";
import { plainText } from "../article/plain.js";
import { segmentMessages } from "../article/segments.js";
import { splitEndMatter } from "../article/split.js";
import { plannerMessages, subAgentMessages } from "../research/planner.js";
import { synthesisMessages } from "../research/synthesis.js";
import { thumbnailMessages } from "../thumbnail/by-llm.js";
import { catalogue, config, content, emptyView, readyView, workFor } from "./recipe-fixture.js";
import { validateRecipeInputs } from "./recipe-validation.js";
import { baselineFingerprints, legacyPieceKey, planRevision, planRevisionWork } from "./recipes.js";

it("keeps independent generated images when article text changes", () => {
  const work = workFor(readyView(), config, { ...content, articleMarkdown: "Changed story." }).work;
  expect(work.filter((r) => r.key.startsWith("image:")).map((r) => r.disposition)).toEqual([
    "reuse",
    "reuse",
  ]);
});
it("uses exact article messages, omits off research, and saves resolved thinking settings", () => {
  const c = {
    ...config,
    sources: { ...config.sources, article: "generate" as const },
    llm: { provider: "text", model: "text-model", thinking: "high" as const },
  };
  const base = emptyView(c, { ...content, articleMarkdown: undefined });
  const plan = planRevisionWork(base.revision, base, catalogue, new Set(), {
    articleMarkdown: null,
    researchNotes: "Old off notes.",
  });
  const article = plan.recipes.find((r) => r.key === "article:body");
  expect(article?.input).toMatchObject({
    kind: "llm",
    messages: articleMessages({ articlePrompt: "Write an article." }),
    thinkingConfig: { budget: 1024 },
    webSearch: false,
  });
  const remapped = {
    ...catalogue,
    llm: catalogue.llm.map((m) => ({
      ...m,
      llm: { ...m.llm, thinking: { high: { budget: 2048 } } },
    })),
  };
  const changed = planRevisionWork(base.revision, base, remapped, new Set(), {
    articleMarkdown: null,
    researchNotes: null,
  });
  expect(changed.recipes.find((r) => r.key === "article:body")?.requestFingerprint).not.toBe(
    article?.requestFingerprint,
  );
  expect(plan.work.find((r) => r.key === "audio:body:concat")).toBeUndefined();
});
it("materializes research planner, chapter, synthesis and continuation messages from actual inputs", () => {
  const c = {
    ...config,
    sources: { ...config.sources, research: "generate" as const, article: "generate" as const },
    values: { one: "1", two: "2" },
  };
  const view = emptyView(c);
  const brief = { articlePrompt: c.rendered.article ?? "", values: c.values };
  const resolved = {
    articleMarkdown: null,
    researchNotes: " Selected notes. ",
    research: {
      outline: ["A", "B"],
      findings: [
        { title: "A", notes: "Notes A" },
        { title: "B", notes: "Notes B" },
      ],
    },
    articleContinuation: "Raw text\n",
  };
  const recipes = planRevisionWork(view.revision, view, catalogue, new Set(), resolved).recipes;
  expect(recipes.find((r) => r.key === "research:planner")?.input).toMatchObject({
    messages: plannerMessages(brief),
  });
  expect(recipes.find((r) => r.key === "research:chapter:1")?.input).toMatchObject({
    messages: subAgentMessages(brief, "A", ["A", "B"]),
    webSearch: true,
  });
  expect(recipes.find((r) => r.key === "research:notes")?.input).toMatchObject({
    messages: synthesisMessages(brief, resolved.research.findings),
  });
  expect(recipes.find((r) => r.key === "article:continuation")?.input).toMatchObject({
    messages: continuationMessages(
      articleMessages({ articlePrompt: brief.articlePrompt, notes: resolved.researchNotes }),
      "Raw text\n",
    ),
  });
});
it("uses plain body in LLM entries and thumbnail; body article stays reusable for entry edits", () => {
  const c = {
    ...config,
    sources: { ...config.sources, audio: "generate" as const, thumbnail: "prompt_by_llm" as const },
    intro: { name: "Intro", mode: "llm" as const },
    rendered: { ...config.rendered, intro: "Introduce", thumbnailPrompt: "Summarize" },
  };
  const base = readyView(c);
  const next = { ...c, rendered: { ...c.rendered, intro: "New introduction" } };
  const plan = workFor(base, next);
  expect(plan.work.find((r) => r.key === "article:body")?.disposition).toBe("reuse");
  expect(plan.work.find((r) => r.key === "entry:intro:text")?.disposition).toBe("generate");
  const body = plainText(splitEndMatter(content.articleMarkdown ?? "").body);
  expect(plan.recipes.find((r) => r.key === "entry:intro:text")?.input).toMatchObject({
    messages: segmentMessages("New introduction", next, body),
  });
  expect(plan.recipes.find((r) => r.key === "thumbnail:prompt")?.input).toMatchObject({
    messages: thumbnailMessages({
      instruction: "Summarize",
      title: c.title,
      values: c.values,
      format: c.format,
      article: body,
    }),
  });
});
it("preserves generated article and narration after late publication on a title-only save", () => {
  const c = {
    ...config,
    sources: { ...config.sources, article: "generate" as const, audio: "generate" as const },
  };
  const stored = { ...content, articleMarkdown: undefined };
  const pending = emptyView(c, stored);
  const initial = planRevision(pending, { config: c, content: stored });
  if (!initial.ok) throw new Error("fixture");
  const completed = readyView(c, { ...content, articleEdited: false });
  const late = {
    ...completed,
    revision: { ...completed.revision, content: stored, fingerprints: initial.fingerprints },
    articleMarkdown: content.articleMarkdown ?? null,
  };
  const plan = workFor(late, { ...c, title: "Renamed" }, stored);
  expect(plan.work.find((r) => r.key === "article:body")?.disposition).toBe("reuse");
  expect(plan.work.find((r) => r.key === "audio:body:concat")?.disposition).toBe("reuse");
});
it("keeps manual article authoritative on prompt edits and resets it on explicit regenerate", () => {
  const c = { ...config, sources: { ...config.sources, article: "generate" as const } };
  const manual = { ...content, articleEdited: true };
  const base = readyView(c, manual);
  expect(
    workFor(base, { ...c, rendered: { article: "New prompt" } }, manual).work.find(
      (r) => r.key === "article:body",
    )?.disposition,
  ).toBe("reuse");
  const changed = planRevision(base, { config: c, content: manual, regenerate: ["article:body"] });
  expect(changed).toMatchObject({ ok: true, content: { articleEdited: false } });
});
it("excludes glossary and sources from narration and LLM entry dependencies", () => {
  const c = {
    ...config,
    sources: { ...config.sources, audio: "generate" as const },
    intro: { name: "Intro", mode: "llm" as const },
    rendered: { ...config.rendered, intro: "Introduce" },
  };
  const base = readyView(c);
  const plan = workFor(base, c, {
    ...content,
    articleMarkdown: `${content.articleMarkdown}\n\n## Sources Consulted\nhttps://example.test\n\n## Pronunciation Glossary\nHarbor: test`,
  });
  expect(
    plan.work
      .filter((r) => r.key.startsWith("audio:body:"))
      .every((r) => r.disposition === "reuse"),
  ).toBe(true);
  expect(plan.work.find((r) => r.key === "entry:intro:text")?.disposition).toBe("reuse");
});
it("defers narration after a generated article prompt changes despite retained displayed text", () => {
  const c = {
    ...config,
    sources: { ...config.sources, article: "generate" as const, audio: "generate" as const },
  };
  const base = readyView(c);
  const plan = workFor(base, { ...c, rendered: { article: "A different story" } });
  expect(plan.work.find((row) => row.key === "article:body")?.disposition).toBe("generate");
  expect(plan.recipes.filter((row) => row.input.kind === "tts")).toEqual([]);
  expect(plan.recipes.find((row) => row.key === "audio:body:future")).toMatchObject({
    deferred: true,
    unresolved: false,
  });
});
it("exposes provider payload only in internal recipes and gives retained work zero cost", () => {
  const plan = workFor(readyView());
  expect(plan.work.every((row) => !("input" in row))).toBe(true);
  expect(plan.costs.low).toBe(0);
  expect(plan.costs.high).toBe(0);
  expect(plan.costs.unknown).toBe(0);
});
it("keyword insertion order changes actual LLM messages while literal images stay unchanged", () => {
  const c = {
    ...config,
    sources: { ...config.sources, audio: "generate" as const },
    intro: { name: "Intro", mode: "llm" as const },
    rendered: { ...config.rendered, intro: "Introduce" },
    values: { alpha: "A", beta: "B" },
  };
  const plan = workFor(readyView(c), { ...c, values: { beta: "B", alpha: "A" } });
  expect(plan.work.find((row) => row.key === "entry:intro:text")?.disposition).toBe("generate");
  expect(plan.work.find((row) => row.key === "article:body")?.disposition).toBe("reuse");
  expect(
    plan.work
      .filter((row) => row.key.startsWith("image:"))
      .every((row) => row.disposition === "reuse"),
  ).toBe(true);
});
it("excludes old selected assets from changed work inputs while retaining their downloads", () => {
  const base = readyView();
  const changed = {
    ...content,
    imageDefinitions: {
      ...content.imageDefinitions,
      harbor: { source: "generate" as const, assetId: null, prompt: "Changed" },
    },
  };
  const plan = workFor(base, config, changed);
  const video = plan.recipes.find((row) => row.key === "export:video");
  expect(JSON.stringify(video?.input)).not.toContain("asset-image:harbor");
  expect(JSON.stringify(video?.input)).toContain("asset-image:hill");
});

it.each(["from_prompt", "prompt_by_llm"] as const)(
  "uses the saved thumbnailPrompt template key for %s",
  (mode) => {
    const c = {
      ...config,
      sources: { ...config.sources, thumbnail: mode },
      rendered: { ...config.rendered, thumbnailPrompt: "Saved old instruction" },
      values: { topic: "Coast" },
    };
    const value = { ...content, promptTemplates: { thumbnailPrompt: "Show {{topic}}" } };
    const base = emptyView(c, value);
    const planned = planRevision(base, { config: c, content: value });
    expect(planned.ok).toBe(true);
    const work = workFor(base, c, value);
    if (mode === "from_prompt") {
      expect(work.recipes.find((row) => row.key === "thumbnail:image")?.input).toMatchObject({
        kind: "image",
        prompt: "Show Coast",
      });
    } else {
      expect(work.recipes.find((row) => row.key === "thumbnail:prompt")?.input).toMatchObject({
        messages: thumbnailMessages({
          instruction: "Show Coast",
          title: c.title,
          values: c.values,
          format: c.format,
          article: plainText(splitEndMatter(content.articleMarkdown ?? "").body),
        }),
      });
    }
    expect(validateRecipeInputs({ ...c, rendered: {} }, content).map((row) => row.field)).toContain(
      "rendered.thumbnailPrompt",
    );
  },
);
it("uses an adopted thumbnail prompt instead of deferring its image request again", () => {
  const c = {
    ...config,
    sources: { ...config.sources, thumbnail: "prompt_by_llm" as const },
    rendered: { ...config.rendered, thumbnailPrompt: "Summarize" },
  };
  const piece: StagePiece = {
    id: "written",
    stageId: "thumbnail-stage",
    kind: "prompt_written",
    idx: 1,
    state: "done",
    payload: JSON.stringify({ prompt: "A retained coastal image", sent: "Saved request" }),
  };
  const project = {
    id: "p1",
    title: c.title,
    format: c.format,
    config: c,
    createdAt: "now",
    updatedAt: "now",
  };
  const fingerprints = baselineFingerprints(project, [], [piece], content, [
    { id: piece.stageId, kind: "thumbnail" },
  ]);
  const key = legacyPieceKey(piece, "thumbnail");
  const fingerprint = fingerprints[key];
  if (fingerprint === undefined) throw new Error("Missing thumbnail fingerprint");
  const base = emptyView(c);
  const manifest = {
    outputs: [],
    pieces: [{ key, stageKind: "thumbnail" as const, piece, assetId: null, fingerprint }],
  };
  const plan = planRevisionWork(
    { ...base.revision, fingerprints },
    manifest,
    catalogue,
    new Set(),
    {
      articleMarkdown: content.articleMarkdown ?? null,
      researchNotes: null,
    },
  );
  expect(plan.recipes.find((row) => row.key === "thumbnail:image")?.input).toMatchObject({
    kind: "image",
    prompt: "A retained coastal image",
  });
});
