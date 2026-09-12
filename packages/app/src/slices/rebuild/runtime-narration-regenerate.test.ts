import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { fingerprint } from "../../kernel/runner/work.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { admitInitialRevision, admitPendingRevision } from "./runtime-admission.js";
import { materializeAdmittedWork } from "./runtime-materialize.js";
import { narrationCatalogue } from "./runtime-narration.fake.js";
import { runRevisionInvocation } from "./runtime-run.js";
import { executionStages } from "./runtime-store.js";
import { workPieces } from "./work-records.js";

it("carries one deferred body regeneration token into every later physical narration request", async () => {
  const h = revisionFixture();
  try {
    const config = {
      ...h.config,
      sources: { ...h.config.sources, article: "generate" as const, audio: "generate" as const },
      llm: { provider: "openrouter", model: "llm" },
      audio: { provider: "openai-tts", model: "tts", voice: "voice" },
      chunking: { mode: "paragraph" as const },
      provided: {},
      rendered: { article: "Write an article." },
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(config), h.projectId);
    for (const kind of stageKinds)
      h.deps.db
        .prepare(
          "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
        )
        .run(kind, h.projectId, kind);
    const base = await ensureBaseline(h.deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    const catalogue: Catalogue = {
      ...narrationCatalogue,
      tts: narrationCatalogue.tts.map((model) => ({
        ...model,
        tts: { ...model.tts, maxCharacters: 8 },
      })),
    };
    admitInitialRevision(h.deps, base.view, catalogue);
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.view.revision.id,
      idempotencyKey: "regenerate-future",
      edit: { config, content: base.view.revision.content, regenerate: ["audio:body:future"] },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const token = saved.view.revision.content.regenerationTokens["audio:body:future"];
    expect(typeof token).toBe("string");
    expect(
      h.deps.db
        .prepare(
          "SELECT count(*) AS n FROM revision_work_pieces WHERE json_extract(input_json,'$.kind')='tts'",
        )
        .get()?.n,
    ).toBe(0);
    admitPendingRevision(h.deps, saved.view, catalogue);
    const article = executionStages(h.deps, h.projectId).find((row) =>
      workPieces(h.deps.db, row.work.workId).some((piece) => piece.key === "article:body"),
    );
    if (article === undefined) throw new Error("Missing article work");
    const providers: StageProviders = {
      llm: async () => ({
        ok: true,
        value: {
          text: "Alpha. Beta.\n\nGamma. Delta.",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 2 },
        },
      }),
      tts: async () => {
        throw new Error("Materialization must not submit narration");
      },
      image: async () => {
        throw new Error("Unexpected image");
      },
      forPiece: () => providers,
    };
    const context: StageContext = {
      stage: article,
      work: article.work,
      signal: new AbortController().signal,
      maySubmit: (id) => maySubmit(h.deps.db, article.work, id),
      emit: () => undefined,
    };
    expect(claimWork(h.deps.db, article.work)).toBe(true);
    expect(await runRevisionInvocation({ ...h.deps, ffmpeg: "unused" }, context, providers)).toBe(
      "done",
    );
    finishWork(h.deps.db, article.work, "done", null);
    materializeAdmittedWork(h.deps, h.projectId);
    const parts = executionStages(h.deps, h.projectId).flatMap((row) =>
      workPieces(h.deps.db, row.work.workId).filter((piece) => piece.input.kind === "tts"),
    );
    expect(
      parts.map((piece) => (piece.input.kind === "tts" ? piece.input.text : "")).sort(),
    ).toEqual(["Alpha. ", "Beta.", "Delta.", "Gamma. "]);
    expect(new Set(parts.map((piece) => piece.id)).size).toBe(4);
    expect(parts.map((piece) => piece.generationToken)).toEqual([token, token, token, token]);
    expect(parts.map((piece) => piece.fingerprint)).toEqual(
      parts.map((piece) => fingerprint([piece.requestFingerprint, token ?? null])),
    );
    expect(parts.every((piece) => piece.submittedAt === null)).toBe(true);
    materializeAdmittedWork(h.deps, h.projectId);
    const repeated = executionStages(h.deps, h.projectId).flatMap((row) =>
      workPieces(h.deps.db, row.work.workId).filter((piece) => piece.input.kind === "tts"),
    );
    expect(repeated.map((piece) => piece.id)).toEqual(parts.map((piece) => piece.id));
    const first = parts[0];
    if (first?.input.kind !== "tts") throw new Error("Missing concrete narration group");
    const group = first.input.logicalKey;
    const again = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      idempotencyKey: "regenerate-one-group",
      edit: {
        config: saved.view.revision.config,
        content: saved.view.revision.content,
        regenerate: [group],
      },
    });
    if (!again.ok) throw new Error(JSON.stringify(again));
    const groupToken = again.view.revision.content.regenerationTokens[group];
    expect(typeof groupToken).toBe("string");
    expect(groupToken).not.toBe(token);
    admitPendingRevision(h.deps, again.view, catalogue);
    materializeAdmittedWork(h.deps, h.projectId);
    const current = executionStages(h.deps, h.projectId).flatMap((row) =>
      workPieces(h.deps.db, row.work.workId).filter((piece) => piece.input.kind === "tts"),
    );
    expect(current).toHaveLength(4);
    for (const piece of current) {
      if (piece.input.kind !== "tts") throw new Error("Unexpected non-narration piece");
      const expected = piece.input.logicalKey === group ? groupToken : token;
      if (piece.input.logicalKey !== group)
        expect(parts.some((old) => old.id === piece.id)).toBe(true);
      else expect(parts.some((old) => old.id === piece.id)).toBe(false);
      expect(piece.generationToken).toBe(expected);
      expect(piece.fingerprint).toBe(fingerprint([piece.requestFingerprint, expected ?? null]));
    }
  } finally {
    h.close();
  }
});
