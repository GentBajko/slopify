import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  previewRebuildSchema,
  rebuildAdmissionSchema,
  rebuildPreviewSchema,
  startRebuildSchema,
} from "./model.js";

const request = {
  baseRevisionId: "r1",
  idempotencyKey: "28d63c99-6a95-497b-b248-685819239853",
  previewId: "preview1",
  acknowledgeUnknownCosts: false,
  confirmedProvidedWorkKeys: [],
};
const preview = {
  id: "preview1",
  projectId: "p1",
  baseRevisionId: "r1",
  planFingerprint: "hash",
  selection: { kind: "selected", workKeys: ["export:wav"] },
  changedInputs: [{ path: "title", before: null, after: "New title" }],
  work: [
    {
      key: "export:wav",
      stage: "video",
      kind: "local",
      disposition: "local",
      requestFingerprint: "request",
      fingerprint: "work",
      dependsOn: ["audio:body:concat"],
      reason: "Inputs changed.",
      inflight: false,
      pieceIds: [],
    },
  ],
  retained: [{ slot: "audio:body", outputId: "o1", assetId: "a1", state: "ready" }],
  providedReuseRequired: [],
  costs: {
    currency: "USD",
    rows: [{ stage: "Audio", low: null, high: null, detail: "Unknown price." }],
    low: 0,
    high: 0,
    unknown: 1,
    expectedWords: 500,
    catalogueDate: null,
    assumptions: ["Retained requests incur no new charge."],
  },
  wholeRequestNotice: null,
  warnings: [],
};

describe("rebuild request boundaries", () => {
  it("accepts full and selected previews while rejecting ambiguous or empty selections", () => {
    for (const selection of [{ kind: "allAffected" }, preview.selection]) {
      expect(
        previewRebuildSchema.parse({ baseRevisionId: "r1", request: selection }).request,
      ).toEqual(selection);
    }
    for (const selection of [
      { kind: "selected", workKeys: [] },
      { kind: "selected", workKeys: [""] },
      { kind: "selected", workKeys: ["x".repeat(201)] },
      { kind: "selected", workKeys: Array.from({ length: 10001 }, () => "image:i1") },
      { kind: "allAffected", workKeys: ["article:body"] },
      { kind: "all" },
    ]) {
      expect(
        previewRebuildSchema.safeParse({ baseRevisionId: "r1", request: selection }).success,
      ).toBe(false);
    }
  });

  it("requires bounded identifiers, a UUID and explicit cost acknowledgment for admission", () => {
    expect(startRebuildSchema.parse(request)).toEqual(request);
    for (const change of [
      { baseRevisionId: "" },
      { baseRevisionId: "x".repeat(65) },
      { previewId: "" },
      { idempotencyKey: "not-a-uuid" },
      { acknowledgeUnknownCosts: undefined },
      { acknowledgeUnknownCosts: "false" },
      { confirmedProvidedWorkKeys: [""] },
      { confirmedProvidedWorkKeys: ["x".repeat(201)] },
      { projectId: "different-project" },
    ]) {
      expect(startRebuildSchema.safeParse({ ...request, ...change }).success).toBe(false);
    }
    expect(
      previewRebuildSchema.safeParse({
        baseRevisionId: "r1",
        request: { kind: "allAffected" },
        projectId: "different-project",
      }).success,
    ).toBe(false);
  });
});

describe("rebuild response boundaries", () => {
  it("retains unknown costs and validates durable preview and admission identities", () => {
    expect(rebuildPreviewSchema.parse(preview)).toEqual(preview);
    const admission = { revisionId: "r1", admissionId: "a1", workIds: ["w1"], replayed: true };
    expect(rebuildAdmissionSchema.parse(admission)).toEqual(admission);
    expect(rebuildAdmissionSchema.safeParse({ ...admission, workIds: [""] }).success).toBe(false);
    expect(rebuildAdmissionSchema.safeParse({ ...admission, replayed: undefined }).success).toBe(
      false,
    );
  });

  it.each([
    { low: -1 },
    { high: Number.POSITIVE_INFINITY },
    { expectedWords: Number.NaN },
    { expectedWords: -1 },
    { unknown: 0.5 },
    { unknown: -1 },
    { rows: [{ stage: "Audio", low: -1, high: 0, detail: "Invalid price." }] },
  ])("rejects invalid cost values: %j", (change) => {
    expect(
      rebuildPreviewSchema.safeParse({ ...preview, costs: { ...preview.costs, ...change } })
        .success,
    ).toBe(false);
  });

  it("rejects unknown work dispositions and missing retention descriptors", () => {
    expect(
      rebuildPreviewSchema.safeParse({
        ...preview,
        work: preview.work.map((work) => ({ ...work, disposition: "run" })),
      }).success,
    ).toBe(false);
    expect(
      rebuildPreviewSchema.safeParse({
        ...preview,
        retained: [{ slot: "audio:body", outputId: "o1", state: "ready" }],
      }).success,
    ).toBe(false);
  });

  it("bundles runtime schemas for the editor without server dependencies", async () => {
    const result = await build({
      entryPoints: ["packages/app/src/slices/rebuild/model.ts"],
      bundle: true,
      platform: "browser",
      write: false,
      metafile: true,
    });
    expect(
      Object.keys(result.metafile.inputs).some(
        (path) => path.endsWith("/repo.ts") || path.endsWith("estimate/index.ts"),
      ),
    ).toBe(false);
  });
});
