import { readFileSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import type { RevisionView } from "../revisions/model.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { admitPendingRevision } from "./legacy-admission.fake.js";
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
  providers: { openrouter: { maxConcurrent: 5 }, "openai-tts": { maxConcurrent: 5 } },
  llm: [{ ...model, provider: "openrouter", id: "llm", llm: { webSearch: false, thinking: {} } }],
  tts: [
    { ...model, provider: "openai-tts", id: "tts", tts: { maxCharacters: 4000, streaming: true } },
  ],
  image: [],
};
function narrationBytes(): Uint8Array {
  const bytes = Buffer.alloc(44 + 1600);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(1600, 40);
  return bytes;
}
async function entryFixture(mode: "text" | "llm") {
  const h = revisionFixture();
  const deps = { ...h.deps, ffmpeg: resolveFfmpeg({}, ffmpegStatic) };
  const config = {
    ...h.config,
    sources: { ...h.config.sources, article: "generate" as const, audio: "generate" as const },
    llm: { provider: "openrouter", model: "llm" },
    audio: { provider: "openai-tts", model: "tts", voice: "voice" },
    articlePrompt: "Article",
    intro: { name: "Intro", mode },
    outro: { name: "Outro", mode },
    provided: {},
    rendered: { article: "Write the article.", intro: "Original intro.", outro: "Original outro." },
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
  const calls: { kind: string; key: string; text: string }[] = [];
  let activeKey = "";
  const providers: StageProviders = {
    llm: async (input) => {
      const prompt = input.messages[0]?.content ?? "";
      calls.push({ kind: "llm", key: activeKey, text: prompt });
      return {
        ok: true,
        value: {
          text:
            activeKey === "article:body"
              ? "The completed article body."
              : (prompt.split("\n")[0] ?? ""),
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 2 },
        },
      };
    },
    tts: async (input) => {
      calls.push({ kind: "tts", key: activeKey, text: input.text });
      return { ok: true, value: { bytes: narrationBytes(), container: "mp3" } };
    },
    image: async () => {
      throw new Error("Unexpected image request");
    },
    forPiece: (id) => {
      const row = deps.db.prepare("SELECT work_key FROM revision_work_pieces WHERE id=?").get(id);
      activeKey = String(row?.work_key);
      return providers;
    },
  };
  const view = (): RevisionView => {
    const id = currentRevisionId(deps.db, h.projectId);
    const current = id === undefined ? undefined : getRevisionView(deps, h.projectId, id);
    if (current === undefined) throw new Error("Missing current revision");
    return current;
  };
  const pump = async (): Promise<void> => {
    for (let pass = 0; pass < 30; pass++) {
      materializeAdmittedWork(deps, h.projectId);
      const stage = executionStages(deps, h.projectId).find(
        (row) => row.kind !== "video" && row.state === "pending" && invocationReady(deps, row.work),
      );
      if (stage === undefined) return;
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
    throw new Error("Entry fixture did not settle");
  };
  admitInitialRevision(deps, base.view, catalogue);
  return { ...h, deps, calls, view, pump };
}
function selected(view: RevisionView, role: string) {
  const output = view.outputs.find(
    (row) => row.selected && row.state === "ready" && row.output.role === role,
  );
  if (output === undefined) throw new Error(`Missing selected ${role}`);
  return output;
}

it.each(["text", "llm"] as const)(
  "rebuilds only the edited %s intro while retaining article, body audio and outro",
  async (mode) => {
    const h = await entryFixture(mode);
    try {
      await h.pump();
      const base = h.view();
      const article = selected(base, "article_md");
      const body = selected(base, "audio_body");
      const outro = selected(base, "audio_outro");
      const intro = selected(base, "audio_intro");
      const oldBytes = readFileSync(outputPath(h.deps.paths, h.projectId, intro.output.path));
      h.calls.length = 0;
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: base.revision.id,
        idempotencyKey: "intro-edit",
        edit: {
          config: base.revision.config,
          content: {
            ...base.revision.content,
            promptTemplates: {
              ...base.revision.content.promptTemplates,
              intro: "Replacement intro.",
            },
          },
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      expect(h.calls).toEqual([]);
      admitPendingRevision(h.deps, saved.view, catalogue);
      await h.pump();
      const next = h.view();
      expect(selected(next, "article_md").output.id).toBe(article.output.id);
      expect(selected(next, "audio_body").assetId).toBe(body.assetId);
      expect(selected(next, "audio_outro").assetId).toBe(outro.assetId);
      expect(selected(next, "audio_intro").assetId).not.toBe(intro.assetId);
      expect(h.calls.filter((call) => call.kind === "llm").map((call) => call.key)).toEqual(
        mode === "llm" ? ["entry:intro:text"] : [],
      );
      expect(h.calls.filter((call) => call.kind === "tts").map((call) => call.text)).toEqual([
        "Replacement intro.",
      ]);
      expect(readFileSync(outputPath(h.deps.paths, h.projectId, intro.output.path))).toEqual(
        oldBytes,
      );
      const piece = next.pieces.find((row) => row.selected && row.key === "entry:intro:text");
      expect(JSON.parse(piece?.piece.payload ?? "{}")).toMatchObject({
        text: "Replacement intro.",
      });
    } finally {
      h.close();
    }
  },
  30_000,
);

it("retains a literal intro and outro when article text changes", async () => {
  const h = await entryFixture("text");
  try {
    await h.pump();
    const base = h.view();
    const intro = selected(base, "audio_intro");
    const outro = selected(base, "audio_outro");
    const body = selected(base, "audio_body");
    h.calls.length = 0;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "article-edit",
      edit: {
        config: base.revision.config,
        content: {
          ...base.revision.content,
          articleEdited: true,
          articleMarkdown: "Edited article body.",
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    expect(h.calls).toEqual([]);
    admitPendingRevision(h.deps, saved.view, catalogue);
    await h.pump();
    const next = h.view();
    expect(selected(next, "audio_intro").assetId).toBe(intro.assetId);
    expect(selected(next, "audio_outro").assetId).toBe(outro.assetId);
    expect(selected(next, "audio_body").assetId).not.toBe(body.assetId);
    expect(h.calls.filter((call) => call.kind === "llm")).toEqual([]);
    expect(h.calls.filter((call) => call.kind === "tts").map((call) => call.text)).toEqual([
      "Edited article body.",
    ]);
    expect(
      next.pieces.find((row) => row.selected && row.key === "entry:intro:text")?.piece.id,
    ).toBe(base.pieces.find((row) => row.selected && row.key === "entry:intro:text")?.piece.id);
  } finally {
    h.close();
  }
}, 30_000);
