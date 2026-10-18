import ffmpegStatic from "ffmpeg-static";
import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { currentRevisionId } from "../revisions/repo.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { materializeAdmittedWork } from "./runtime-materialize.js";
import { runRevisionInvocation } from "./runtime-run.js";
import { executionStages, invocationReady } from "./runtime-store.js";

const model = {
  name: "Test",
  enabled: true,
  deprecated: false,
  keywords: [],
  source: "https://example.test",
  pricing: {},
};
const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { openrouter: { maxConcurrent: 5 }, fal: { maxConcurrent: 5 } },
  llm: [{ ...model, provider: "openrouter", id: "llm", llm: { webSearch: false, thinking: {} } }],
  tts: [],
  image: [{ ...model, provider: "fal", id: "image", image: { aspectRatios: ["16:9", "9:16"] } }],
};
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

// The keyword digest end to end: it is written in the Article stage once the article is, and the
// thumbnail is drawn from its answer, with a release date the project has none of left out.
it("writes the digest after the article and draws the thumbnail from it", async () => {
  const h = revisionFixture();
  try {
    const deps = { ...h.deps, ffmpeg: resolveFfmpeg({}, ffmpegStatic) };
    const config = {
      ...h.config,
      sources: {
        research: "off" as const,
        article: "generate" as const,
        audio: "off" as const,
        images: "off" as const,
        thumbnail: "from_prompt" as const,
        video: "off" as const,
      },
      llm: { provider: "openrouter", model: "llm" },
      images: { provider: "fal", model: "image" },
      articlePrompt: "Article",
      thumbnailPrompt: "Thumb",
      provided: {},
      rendered: {
        article: "Write the article.",
        thumbnailPrompt: "Words: {{Slopify_Thumbnail_Text}}\nOut {{Slopify_Release_Date}}",
      },
    };
    deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    for (const kind of stageKinds)
      deps.db
        .prepare(
          "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
        )
        .run(kind, h.projectId, kind);
    const base = await ensureBaseline(deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    const asked: string[] = [];
    const drawn: string[] = [];
    let active = "";
    const providers: StageProviders = {
      llm: async () => {
        asked.push(active);
        return {
          ok: true,
          value: {
            text:
              active === "article:digest"
                ? JSON.stringify({
                    summary: "S.",
                    hook: "H.",
                    thumbnailText: "BUILT UNDER WATER",
                    keyFacts: ["F."],
                    quote: "Q.",
                    tags: ["t"],
                  })
                : "## One\n\nThe city fell.",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 2 },
          },
        };
      },
      tts: async () => {
        throw new Error("Unexpected narration");
      },
      image: async (input) => {
        drawn.push(input.prompt);
        return { ok: true, value: { bytes: png, mime: "image/png" } };
      },
      forPiece: (id) => {
        const row = deps.db.prepare("SELECT work_key FROM revision_work_pieces WHERE id=?").get(id);
        active = String(row?.work_key);
        return providers;
      },
    };
    admitInitialRevision(deps, base.view, catalogue);
    for (let pass = 0; pass < 30; pass++) {
      materializeAdmittedWork(deps, h.projectId);
      const stage = executionStages(deps, h.projectId).find(
        (row) => row.kind !== "video" && row.state === "pending" && invocationReady(deps, row.work),
      );
      if (stage === undefined) break;
      expect(claimWork(deps.db, stage.work)).toBe(true);
      const context: StageContext = {
        work: stage.work,
        stage,
        signal: new AbortController().signal,
        maySubmit: (id) => maySubmit(deps.db, stage.work, id),
        emit: () => undefined,
      };
      expect(await runRevisionInvocation(deps, context, providers)).toBe("done");
      finishWork(deps.db, stage.work, "done", null);
    }
    expect(asked).toEqual(["article:body", "article:digest"]);
    expect(drawn).toEqual(["Words: BUILT UNDER WATER"]);
    const id = currentRevisionId(deps.db, h.projectId);
    const view = id === undefined ? undefined : getRevisionView(deps, h.projectId, id);
    const digest = view?.pieces.find((row) => row.key === "article:digest");
    expect(JSON.parse(digest?.piece.payload ?? "{}")).toMatchObject({
      digest: { Slopify_Thumbnail_Text: "BUILT UNDER WATER" },
    });
  } finally {
    h.close();
  }
}, 30_000);
