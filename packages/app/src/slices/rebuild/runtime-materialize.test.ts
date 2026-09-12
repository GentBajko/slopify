import { describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { commitRevisionOutputs } from "../revisions/publish.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { getRevisionView } from "../revisions/view.js";
import { writeAsset } from "../storage/assets.js";
import { admitInitialRevision, admitPendingRevision } from "./runtime-admission.js";
import { materializeAdmittedWork } from "./runtime-materialize.js";
import { workPieces } from "./work-records.js";

const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { openrouter: { maxConcurrent: 5 }, "openai-tts": { maxConcurrent: 5 } },
  image: [],
  llm: [
    {
      provider: "openrouter",
      id: "test",
      name: "Test",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: {},
      llm: { webSearch: true, thinking: { high: { effort: "high" } } },
    },
  ],
  tts: [
    {
      provider: "openai-tts",
      id: "tts",
      name: "Test TTS",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: {},
      tts: { maxCharacters: 20, streaming: true },
    },
  ],
};
async function fixture() {
  const h = revisionFixture();
  const config = {
    ...h.config,
    llm: { provider: "openrouter", model: "test", thinking: "high" as const },
    audio: { provider: "openai-tts", model: "tts", voice: "voice" },
    sources: { ...h.config.sources, article: "generate" as const, audio: "generate" as const },
    provided: {},
    rendered: { article: "Write a history" },
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
  if (!base.ok) throw new Error("Expected baseline");
  admitInitialRevision(h.deps, base.view, catalogue);
  const work = h.deps.db
    .prepare(
      "SELECT w.* FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id WHERE p.work_key='article:body'",
    )
    .get();
  if (work === undefined) throw new Error("Missing article work");
  const piece = workPieces(h.deps.db, String(work.id))[0];
  if (piece === undefined) throw new Error("Missing article piece");
  const text = "First sentence. Second sentence. Third sentence.";
  const asset = writeAsset(h.deps, h.projectId, "article.md", Buffer.from(text));
  await commitRevisionOutputs(
    h.deps,
    {
      work: {
        projectId: h.projectId,
        revisionId: base.view.revision.id,
        workId: String(work.id),
        stageId: "article",
        kind: "article",
        fingerprint: String(work.fingerprint),
      },
      pieceId: piece.id,
      publicationId: piece.id,
    },
    [
      {
        slot: "article:article_md",
        workKey: piece.key,
        asset,
        fingerprint: piece.logicalFingerprint ?? piece.fingerprint,
        output: {
          id: h.deps.ids.next(),
          projectId: h.projectId,
          stageKind: "article",
          role: "article_md",
          path: asset.path,
          originalFilename: null,
          bytes: asset.bytes,
          durationMs: null,
          meta: {},
          createdAt: asset.createdAt,
        },
      },
    ],
    [],
  );
  return { ...h, config, base: base.view };
}

describe("deferred admitted work", () => {
  it("materializes every provider part under the original revision after a title-only save", async () => {
    const h = await fixture();
    try {
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "title",
        edit: { config: { ...h.config, title: "New title" }, content: h.base.revision.content },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      materializeAdmittedWork(h.deps, h.projectId);
      const parts = h.deps.db
        .prepare(
          "SELECT w.revision_id,p.* FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id WHERE json_extract(p.input_json,'$.kind')='tts' AND p.dispatch_state='allowed'",
        )
        .all();
      expect(parts.length).toBeGreaterThan(1);
      expect(parts.every((row) => row.revision_id === h.base.revision.id)).toBe(true);
      const count = parts.length;
      materializeAdmittedWork(h.deps, h.projectId);
      expect(
        h.deps.db
          .prepare(
            "SELECT COUNT(*) AS n FROM revision_work_pieces WHERE json_extract(input_json,'$.kind')='tts' AND dispatch_state='allowed'",
          )
          .get()?.n,
      ).toBe(count);
    } finally {
      h.close();
    }
  });

  it("does not materialize revoked narration after a voice edit", async () => {
    const h = await fixture();
    try {
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "voice",
        edit: {
          config: { ...h.config, audio: { ...h.config.audio, voice: "other" } },
          content: h.base.revision.content,
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      materializeAdmittedWork(h.deps, h.projectId);
      expect(
        h.deps.db
          .prepare(
            "SELECT COUNT(*) AS n FROM revision_work_pieces WHERE json_extract(input_json,'$.kind')='tts' AND dispatch_state='allowed'",
          )
          .get()?.n,
      ).toBe(0);
    } finally {
      h.close();
    }
  });
});

it("resumes accepted narration with the admitted split and exact model snapshot", async () => {
  const h = await fixture();
  try {
    materializeAdmittedWork(h.deps, h.projectId);
    const before = h.deps.db
      .prepare(
        "SELECT p.* FROM revision_work_pieces p JOIN revision_work_reservations r ON r.piece_id=p.id WHERE json_extract(p.input_json,'$.kind')='tts'",
      )
      .all();
    const first = before[0];
    if (first === undefined) throw new Error("Missing narration");
    h.deps.db
      .prepare(
        "UPDATE revision_work_pieces SET continuation='accepted-operation',submitted_at='today',state='failed',dispatch_state='held' WHERE id=?",
      )
      .run(String(first.id));
    h.deps.db
      .prepare("UPDATE revision_work SET state='failed',dispatch_state='held' WHERE id=?")
      .run(String(first.work_id));
    const changed: Catalogue = {
      ...catalogue,
      tts: catalogue.tts.map((model) => ({
        ...model,
        enabled: false,
        tts: { ...model.tts, maxCharacters: 5 },
      })),
    };
    const view = getRevisionView(h.deps, h.projectId, h.base.revision.id);
    if (view === undefined) throw new Error("Missing view");
    admitPendingRevision(h.deps, view, changed);
    materializeAdmittedWork(h.deps, h.projectId);
    const after = h.deps.db
      .prepare(
        "SELECT p.* FROM revision_work_pieces p JOIN revision_work_reservations r ON r.piece_id=p.id WHERE json_extract(p.input_json,'$.kind')='tts'",
      )
      .all();
    expect(after.map((piece) => [piece.id, piece.input_json])).toEqual(
      before.map((piece) => [piece.id, piece.input_json]),
    );
    expect(after.find((piece) => piece.id === first.id)).toMatchObject({
      continuation: "accepted-operation",
      submitted_at: "today",
      dispatch_state: "allowed",
    });
  } finally {
    h.close();
  }
});
