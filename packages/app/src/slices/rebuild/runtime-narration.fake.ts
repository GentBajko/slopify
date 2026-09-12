import ffmpegStatic from "ffmpeg-static";
import { expect, vi } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import type { RevisionView } from "../revisions/model.js";
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
export const narrationCatalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { openrouter: { maxConcurrent: 5 }, "openai-tts": { maxConcurrent: 5 } },
  llm: [{ ...model, provider: "openrouter", id: "llm", llm: { webSearch: false, thinking: {} } }],
  tts: [
    { ...model, provider: "openai-tts", id: "tts", tts: { maxCharacters: 4, streaming: true } },
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
export async function narrationFixture(text = "abcdefgh"): Promise<
  ReturnType<typeof revisionFixture> & {
    readonly deps: ReturnType<typeof revisionFixture>["deps"] & { readonly ffmpeg: string };
    readonly count: ReturnType<typeof vi.fn>;
    readonly calls: { kind: string; key: string; text: string }[];
    readonly view: () => RevisionView;
    readonly pump: () => Promise<void>;
  }
> {
  const h = revisionFixture();
  const count = vi.fn();
  const deps = { ...h.deps, count, ffmpeg: resolveFfmpeg({}, ffmpegStatic) };
  const config = {
    ...h.config,
    sources: { ...h.config.sources, audio: "generate" as const },
    audio: { provider: "openai-tts", model: "tts", voice: "voice" },
    chunking: { mode: "paragraph" as const },
    provided: { article: text },
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
  admitInitialRevision(deps, base.view, narrationCatalogue);
  return { ...h, deps, count, calls, view, pump };
}
