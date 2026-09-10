import { writeFileSync } from "node:fs";
import { afterEach, expect, it } from "vitest";
import { insertPiece } from "../../kernel/runner/piece-repo.js";
import type { RunConfig } from "../admission/model.js";
import { projectById, updateProjectConfig } from "../admission/repo.js";
import { catalogue } from "../rebuild/recipe-fixture.js";
import { planRevision, planRevisionWork, type RevisionWorkPlan } from "../rebuild/recipes.js";
import { outputPath } from "../storage/layout.js";
import { insertOutput } from "../storage/repo.js";
import { ensureBaseline } from "./adopt.js";
import type { RevisionView } from "./model.js";
import { revisionFixture } from "./revision.fake.js";

const fixtures: ReturnType<typeof revisionFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.close();
});
function setup(): ReturnType<typeof revisionFixture> {
  const h = revisionFixture();
  fixtures.push(h);
  return h;
}
function work(
  view: RevisionView,
  config = view.revision.config,
  markdown?: string,
): RevisionWorkPlan {
  const planned = planRevision(view, {
    config,
    content:
      markdown === undefined
        ? view.revision.content
        : { ...view.revision.content, articleMarkdown: markdown },
  });
  if (!planned.ok) throw new Error(JSON.stringify(planned.fields));
  return planRevisionWork(
    {
      ...view.revision,
      config: planned.config,
      content: planned.content,
      fingerprints: planned.fingerprints,
    },
    planned.manifest,
    catalogue,
    new Set(
      [...view.outputs, ...view.pieces]
        .filter((row) => row.available && row.assetId !== null)
        .map((row) => row.assetId)
        .filter((id): id is string => id !== null),
    ),
    { articleMarkdown: markdown ?? view.articleMarkdown, researchNotes: null },
  );
}
function seedAudio(h: ReturnType<typeof revisionFixture>, available = true): void {
  insertOutput(h.deps.db, {
    id: "audio",
    projectId: h.projectId,
    stageKind: "audio",
    role: "audio_body",
    path: "audio.mp3",
    bytes: 5,
    durationMs: 1000,
    originalFilename: "narration.mp3",
    meta: {},
    createdAt: h.deps.clock.now().toISOString(),
  });
  if (available) writeFileSync(outputPath(h.deps.paths, h.projectId, "audio.mp3"), "audio");
}
it.each([true, false])(
  "requires semantic review of supplied audio after an article edit (available=%s)",
  async (available) => {
    const h = setup();
    updateProjectConfig(
      h.deps.db,
      h.projectId,
      {
        ...h.config,
        sources: { ...h.config.sources, audio: "provide" },
        provided: { ...h.config.provided, audio: "consumed" },
      },
      h.deps.clock.now().toISOString(),
    );
    seedAudio(h, available);
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error("Expected baseline.");
    expect(baseline.view.outputs[0]?.workKey).toBe("audio:provided");
    expect(baseline.view.revision.content.provided.audio).toBe(baseline.view.outputs[0]?.assetId);
    const next = work(baseline.view, baseline.view.revision.config, "Different narration.");
    expect(next.work.find((row) => row.key === "audio:provided")?.disposition).toBe(
      available ? "review" : "blocked",
    );
  },
);
it.each(["from_prompt", "prompt_by_llm"] as const)(
  "adopts the real thumbnailPrompt key for %s",
  async (mode) => {
    const h = setup();
    const config: RunConfig = {
      ...h.config,
      sources: { ...h.config.sources, thumbnail: mode },
      thumbnailPrompt: "saved",
      llm: { provider: "text", model: "text-model" },
      images: { provider: "image", model: "v1" },
      rendered: { thumbnailPrompt: "Show {literal} mountains" },
    };
    updateProjectConfig(h.deps.db, h.projectId, config, h.deps.clock.now().toISOString());
    if (mode === "prompt_by_llm") {
      h.deps.db
        .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
        .run("thumbnail", h.projectId, "thumbnail", mode, "failed");
      insertPiece(h.deps.db, {
        id: "prompt",
        stageId: "thumbnail",
        kind: "prompt_written",
        idx: 1,
        state: "done",
        payload: JSON.stringify({
          prompt: "A retained image prompt",
          sent: "Show {literal} mountains",
        }),
      });
    }
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error("Expected baseline.");
    const preview = work(baseline.view);
    expect(baseline.view.revision.content.promptTemplates.thumbnailPrompt).toBeNull();
    const input = preview.recipes.find((row) => row.key === "thumbnail:image")?.input;
    expect(input?.kind).toBe("image");
    expect(input?.kind === "image" && input.prompt).toBe(
      mode === "from_prompt" ? "Show {literal} mountains" : "A retained image prompt",
    );
    if (mode === "prompt_by_llm") expect(baseline.view.pieces[0]?.key).toBe("thumbnail:prompt");
  },
);
it("uses retained Article-stage entry text as narration input for a supplied article", async () => {
  const h = setup();
  updateProjectConfig(
    h.deps.db,
    h.projectId,
    {
      ...h.config,
      sources: { ...h.config.sources, audio: "generate" },
      intro: { name: "opening", mode: "llm" },
      llm: { provider: "text", model: "text-model" },
      audio: { provider: "voice", model: "tts", voice: "v1" },
      rendered: { intro: "Write an introduction" },
    },
    h.deps.clock.now().toISOString(),
  );
  h.deps.db
    .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?,?)")
    .run("article", h.projectId, "article", "provide", "done");
  insertPiece(h.deps.db, {
    id: "entry",
    stageId: "article",
    kind: "segment",
    idx: 1,
    state: "done",
    payload: JSON.stringify({
      category: "intro",
      name: "opening",
      mode: "llm",
      text: "  The retained opening.  ",
    }),
  });
  const baseline = await ensureBaseline(h.deps, h.projectId);
  if (!baseline.ok) throw new Error("Expected baseline.");
  expect(baseline.view.pieces[0]?.key).toBe("entry:intro:text");
  const request = work(baseline.view).recipes.find((row) => row.key === "audio:intro:1")?.input;
  expect(request?.kind).toBe("tts");
  expect(request?.kind === "tts" && request.text).toBe("The retained opening.");
});
it("preserves ready article and body narration through an unrelated title edit", async () => {
  const h = setup();
  updateProjectConfig(
    h.deps.db,
    h.projectId,
    {
      ...h.config,
      sources: { ...h.config.sources, article: "generate", audio: "generate" },
      provided: {},
      llm: { provider: "text", model: "text-model" },
      audio: { provider: "voice", model: "tts", voice: "v1" },
      rendered: { article: "Write something." },
    },
    h.deps.clock.now().toISOString(),
  );
  seedAudio(h);
  writeFileSync(outputPath(h.deps.paths, h.projectId, "article.md"), "Saved generated article.");
  insertOutput(h.deps.db, {
    id: "article",
    projectId: h.projectId,
    stageKind: "article",
    role: "article_md",
    path: "article.md",
    bytes: 24,
    durationMs: null,
    originalFilename: null,
    meta: {},
    createdAt: h.deps.clock.now().toISOString(),
  });
  const baseline = await ensureBaseline(h.deps, h.projectId);
  if (!baseline.ok) throw new Error("Expected baseline.");
  const config = projectById(h.deps.db, h.projectId)?.config;
  if (config === undefined) throw new Error("Expected project.");
  const preview = work(baseline.view, { ...config, title: "Renamed" });
  expect(preview.work.find((row) => row.key === "article:body")?.disposition).toBe("reuse");
  expect(preview.work.find((row) => row.key === "audio:body:concat")?.disposition).toBe("reuse");
});
