import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ManifestOutput, ManifestPiece, ProjectRevision } from "./model.js";
import {
  currentRevisionId,
  insertAsset,
  insertManifestOutput,
  insertManifestPiece,
  insertRevision,
  listRevisionHistory,
  outputsForRevision,
  piecesForRevision,
  revisionById,
  selectOutputRecord,
  selectPieceRecord,
} from "./repo.js";

const revision: ProjectRevision = {
  id: "r1",
  projectId: "p1",
  parentId: null,
  restoredFromId: null,
  config: {
    title: "Saved",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    imagePrompts: [],
    values: {},
    provided: { article: "Narration" },
    rendered: {},
    silenceGapSeconds: 0,
  },
  content: {
    articleEdited: false,
    provided: {},
    imageOrder: [],
    imageDefinitions: {},
    narrationOverrides: {},
    regenerationTokens: {},
    promptTemplates: {},
  },
  fingerprints: { "article:body": "hash" },
  createdAt: "2026-09-10",
};
const output: ManifestOutput = {
  slot: "audio:body",
  workKey: "audio:body:concat",
  assetId: "a1",
  fingerprint: "hash",
  state: "ready",
  output: {
    id: "o1",
    projectId: "p1",
    stageKind: "audio",
    role: "audio_body",
    path: "audio/body.wav",
    originalFilename: null,
    bytes: 42,
    durationMs: null,
    meta: { voice: "Saved" },
    createdAt: "old",
  },
};
const piece: ManifestPiece = {
  key: "audio:body:one:0",
  stageKind: "audio",
  assetId: "a1",
  fingerprint: "hash",
  piece: {
    id: "c1",
    stageId: "s1",
    kind: "chunk",
    idx: 1,
    state: "done",
    payload: '{"file":"audio/body.wav"}',
  },
};
let db: DatabaseSync;
beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, fixedClock("2026-09-10"));
  for (const id of ["p1", "p2"])
    db.prepare("INSERT INTO projects VALUES (?,'Saved','16:9','{}','old','old')").run(id);
  insertRevision(db, revision);
  insertRevision(db, { ...revision, id: "r2", projectId: "p2" });
  insertAsset(db, {
    id: "a1",
    projectId: "p1",
    path: "audio/body.wav",
    bytes: 42,
    createdAt: "old",
  });
  insertAsset(db, {
    id: "a2",
    projectId: "p2",
    path: "audio/body.wav",
    bytes: 42,
    createdAt: "old",
  });
});
afterEach(() => db.close());

describe("retained revisions", () => {
  it("round-trips immutable config and scopes all revision reads to the project", () => {
    expect(revisionById(db, "p1", "r1")).toEqual(revision);
    expect(revisionById(db, "p2", "r1")).toBeUndefined();
    expect(currentRevisionId(db, "p1")).toBeUndefined();
    db.exec("INSERT INTO project_heads VALUES ('p1','r1')");
    expect(currentRevisionId(db, "p1")).toBe("r1");
    expect(listRevisionHistory(db, "p1")).toEqual([
      {
        id: "r1",
        parentId: null,
        restoredFromId: null,
        title: "Saved",
        createdAt: "2026-09-10",
        current: true,
      },
    ]);
    expect(() =>
      insertRevision(db, { ...revision, config: { ...revision.config, title: "Changed" } }),
    ).toThrow();
    expect(revisionById(db, "p1", "r1")).toEqual(revision);
  });

  it("enforces ownership for parents, restores, heads, manifests and receipts", () => {
    expect(() => insertRevision(db, { ...revision, id: "r3", parentId: "r2" })).toThrow();
    expect(() => insertRevision(db, { ...revision, id: "r3", restoredFromId: "r2" })).toThrow();
    expect(() => db.exec("INSERT INTO project_heads VALUES ('p1','r2')")).toThrow();
    expect(() => insertManifestOutput(db, revision, { ...output, assetId: "a2" }, "m1")).toThrow();
    expect(() => insertManifestPiece(db, revision, { ...piece, assetId: "a2" }, "m2")).toThrow();
    expect(() =>
      db.exec("INSERT INTO revision_mutations VALUES ('p1','key1','save','hash','r1','r2','old')"),
    ).toThrow();
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("permits one selected result per slot while keeping historical descriptors", () => {
    insertManifestOutput(db, revision, output, "m1");
    insertManifestOutput(db, revision, { ...output, state: "outdated" }, "m2");
    selectOutputRecord(db, "r1", output.slot, "m1");
    expect(() => db.exec("UPDATE revision_outputs SET selected=1 WHERE id='m2'")).toThrow();
    selectOutputRecord(db, "r1", output.slot, "m2");
    expect(outputsForRevision(db, "p1", "r1")).toEqual([
      { ...output, recordId: "m1", publicationId: null, selected: false },
      { ...output, state: "outdated", recordId: "m2", publicationId: null, selected: true },
    ]);
    expect(outputsForRevision(db, "p2", "r1")).toEqual([]);
  });

  it("retains text-only and file pieces and one selected piece per key", () => {
    insertManifestPiece(db, revision, piece, "m1");
    insertManifestPiece(db, revision, { ...piece, assetId: null }, "m2");
    selectPieceRecord(db, "r1", piece.key, "m1");
    expect(() => db.exec("UPDATE revision_pieces SET selected=1 WHERE id='m2'")).toThrow();
    selectPieceRecord(db, "r1", piece.key, "m2");
    expect(piecesForRevision(db, "p1", "r1")).toEqual([
      { ...piece, recordId: "m1", publicationId: null, selected: false },
      { ...piece, assetId: null, recordId: "m2", publicationId: null, selected: true },
    ]);
    expect(piecesForRevision(db, "p2", "r1")).toEqual([]);
  });

  it("leaves the current selection intact when replacement selection fails", () => {
    insertManifestOutput(db, revision, output, "m1");
    insertManifestPiece(db, revision, piece, "m2");
    selectOutputRecord(db, "r1", output.slot, "m1");
    selectPieceRecord(db, "r1", piece.key, "m2");
    expect(() => selectOutputRecord(db, "r1", output.slot, "missing")).toThrow();
    expect(() => selectPieceRecord(db, "r1", piece.key, "missing")).toThrow();
    expect(outputsForRevision(db, "p1", "r1")[0]?.selected).toBe(true);
    expect(piecesForRevision(db, "p1", "r1")[0]?.selected).toBe(true);
  });

  it("rejects unexpected clone ID collisions instead of discarding requested history", () => {
    insertManifestOutput(db, revision, output, "m1");
    insertManifestPiece(db, revision, piece, "m2");
    expect(() => insertManifestOutput(db, revision, output, "m1")).toThrow();
    expect(() => insertManifestPiece(db, revision, piece, "m2")).toThrow();
  });

  it("deduplicates only the same durable publication and rejects conflicting payloads", () => {
    insertManifestOutput(db, revision, output, "m1", "pub1");
    insertManifestOutput(db, revision, output, "ignored1", "pub1");
    insertManifestPiece(db, revision, piece, "m2", "pub1");
    insertManifestPiece(db, revision, piece, "ignored2", "pub1");
    expect(outputsForRevision(db, "p1", "r1")).toHaveLength(1);
    expect(piecesForRevision(db, "p1", "r1")).toHaveLength(1);
    expect(() =>
      insertManifestOutput(db, revision, { ...output, fingerprint: "other" }, "ignored3", "pub1"),
    ).toThrow();
    expect(() =>
      insertManifestPiece(db, revision, { ...piece, fingerprint: "other" }, "ignored4", "pub1"),
    ).toThrow();
    expect(outputsForRevision(db, "p1", "r1")[0]?.recordId).toBe("m1");
  });

  it("deduplicates serializable metadata when optional fields are explicitly undefined", () => {
    const withOptionalMetadata = {
      ...output,
      output: { ...output.output, meta: { provider: undefined } },
    };
    insertManifestOutput(db, revision, withOptionalMetadata, "m1", "pub1");
    expect(() =>
      insertManifestOutput(db, revision, withOptionalMetadata, "m2", "pub1"),
    ).not.toThrow();
    expect(outputsForRevision(db, "p1", "r1")[0]?.output.meta).toEqual({});
  });

  it("reuses exactly the registered asset identity and rejects path or ID collisions", () => {
    insertAsset(db, {
      id: "a1",
      projectId: "p1",
      path: "audio/body.wav",
      bytes: 42,
      createdAt: "old",
    });
    expect(() =>
      insertAsset(db, {
        id: "new",
        projectId: "p1",
        path: "audio/body.wav",
        bytes: 42,
        createdAt: "old",
      }),
    ).toThrow();
    expect(() =>
      insertAsset(db, {
        id: "a1",
        projectId: "p1",
        path: "other.wav",
        bytes: 42,
        createdAt: "old",
      }),
    ).toThrow();
    expect(() =>
      insertAsset(db, {
        id: "a1",
        projectId: "p2",
        path: "other.wav",
        bytes: 42,
        createdAt: "old",
      }),
    ).toThrow();
  });

  it("deletes one entire project history without touching another project", () => {
    insertManifestOutput(db, revision, output, "m1");
    insertManifestPiece(db, revision, piece, "m2");
    insertRevision(db, { ...revision, id: "r3", parentId: "r1", restoredFromId: "r1" });
    db.exec("INSERT INTO project_heads VALUES ('p1','r3')");
    db.exec("INSERT INTO revision_mutations VALUES ('p1','key1','save','hash','r1','r3','old')");
    db.exec("DELETE FROM projects WHERE id='p1'");
    for (const table of [
      "project_revisions",
      "project_assets",
      "project_heads",
      "revision_outputs",
      "revision_pieces",
      "revision_mutations",
    ])
      expect(db.prepare(`SELECT * FROM ${table} WHERE project_id='p1'`).all()).toEqual([]);
    expect(revisionById(db, "p2", "r2")?.id).toBe("r2");
    expect(db.prepare("SELECT id FROM project_assets").all()).toEqual([{ id: "a2" }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("deletes more than 1100 retained revisions without recursive self-cascades", () => {
    let parentId = "r1";
    for (let index = 0; index < 1200; index++) {
      const id = `history${index}`;
      insertRevision(db, { ...revision, id, parentId, restoredFromId: "r1" });
      parentId = id;
    }
    insertManifestOutput(db, revision, output, "m1");
    insertManifestPiece(db, revision, piece, "m2");
    db.prepare("INSERT INTO project_heads VALUES ('p1',?)").run(parentId);
    db.prepare(
      "INSERT INTO revision_mutations VALUES ('p1','key1','restore','hash','r1',?,'old')",
    ).run(parentId);
    expect(() => db.exec("DELETE FROM project_revisions WHERE id='r1'")).toThrow();
    expect(listRevisionHistory(db, "p1")).toHaveLength(1201);
    db.exec("DELETE FROM projects WHERE id='p1'");
    for (const table of [
      "project_revisions",
      "project_assets",
      "project_heads",
      "revision_outputs",
      "revision_pieces",
      "revision_mutations",
    ])
      expect(db.prepare(`SELECT * FROM ${table} WHERE project_id='p1'`).all()).toEqual([]);
    expect(revisionById(db, "p2", "r2")?.id).toBe("r2");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("rejects corrupt persisted JSON descriptors at the repository boundary", () => {
    insertManifestOutput(db, revision, output, "m1");
    insertManifestPiece(db, revision, piece, "m2");
    db.exec("UPDATE revision_outputs SET descriptor='{}'");
    db.exec("UPDATE revision_pieces SET descriptor='{}'");
    expect(() => outputsForRevision(db, "p1", "r1")).toThrow();
    expect(() => piecesForRevision(db, "p1", "r1")).toThrow();
    db.exec("UPDATE project_revisions SET config='{}' WHERE id='r1'");
    expect(() => revisionById(db, "p1", "r1")).toThrow();
  });
});
