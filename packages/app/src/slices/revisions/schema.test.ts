import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { runConfigSchema as legacyConfigSchema } from "../admission/repo.js";
import { runConfigSchema } from "../admission/schema.js";
import { outputSchema, stagedFileSchema } from "../storage/schema.js";
import {
  baselineSuccessSchema,
  restoreRevisionSchema,
  revisionContentSchema,
  revisionEditSchema,
  revisionMutationSuccessSchema,
  revisionSummarySchema,
  revisionViewSchema,
  saveRevisionSchema,
} from "./schema.js";

const config = {
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
};
const content = {
  provided: {},
  imageOrder: [],
  imageDefinitions: {},
  narrationOverrides: {},
  regenerationTokens: {},
  promptTemplates: {},
};
const output = {
  id: "o1",
  projectId: "p1",
  stageKind: "audio",
  role: "audio_body",
  path: "audio/body.wav",
  originalFilename: null,
  bytes: 42,
  durationMs: null,
  meta: {},
  createdAt: "old",
};
const view = {
  articleMarkdown: "Narration",
  revision: {
    id: "r1",
    projectId: "p1",
    parentId: null,
    restoredFromId: null,
    config,
    content,
    fingerprints: {},
    createdAt: "old",
  },
  outputs: [
    {
      recordId: "m1",
      publicationId: null,
      selected: true,
      available: false,
      slot: "audio:body",
      workKey: "audio:body:concat",
      assetId: "a1",
      output,
      fingerprint: "hash",
      state: "outdated",
    },
  ],
  pieces: [
    {
      recordId: "m2",
      publicationId: "chunk1",
      selected: false,
      available: true,
      key: "audio:body:one:0",
      stageKind: "audio",
      piece: {
        id: "chunk1",
        stageId: "stage1",
        kind: "chunk",
        idx: 1,
        state: "done",
        payload: null,
      },
      assetId: null,
      fingerprint: "hash",
    },
  ],
  current: true,
};

describe("revision boundaries", () => {
  it("defaults legacy article provenance without changing the saved config schema", () => {
    expect(revisionContentSchema.parse(content).articleEdited).toBe(false);
    expect(runConfigSchema).toBe(legacyConfigSchema);
    expect(revisionEditSchema.parse({ config, content }).config).toEqual(config);
  });

  it("accepts each upload destination and rejects file paths as asset IDs", () => {
    for (const destination of [
      { kind: "provided", stage: "audio" },
      { kind: "provided", stage: "thumbnail" },
      { kind: "image", imageKey: "image1" },
      { kind: "narration", key: "audio:body:one" },
    ]) {
      expect(
        revisionEditSchema.safeParse({
          config,
          content,
          uploads: [{ stagedFileId: "staged1", destination }],
        }).success,
      ).toBe(true);
    }
    expect(
      revisionContentSchema.safeParse({ ...content, provided: { audio: "../outside.wav" } })
        .success,
    ).toBe(false);
    expect(
      revisionEditSchema.safeParse({
        config,
        content,
        uploads: [
          { stagedFileId: "staged1", destination: { kind: "provided", stage: "research" } },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown request fields and invalid identifiers", () => {
    const save = { baseRevisionId: "r1", idempotencyKey: "key1", edit: { config, content } };
    expect(saveRevisionSchema.safeParse(save).success).toBe(true);
    expect(saveRevisionSchema.safeParse({ ...save, projectId: "other" }).success).toBe(false);
    expect(saveRevisionSchema.safeParse({ ...save, baseRevisionId: "" }).success).toBe(false);
    expect(
      revisionEditSchema.safeParse({ config: { ...config, rogue: true }, content }).success,
    ).toBe(false);
    expect(revisionContentSchema.safeParse({ ...content, rogue: true }).success).toBe(false);
    expect(
      restoreRevisionSchema.safeParse({
        baseRevisionId: "r1",
        idempotencyKey: "key1",
        targetRevisionId: "r0",
      }).success,
    ).toBe(true);
    expect(
      restoreRevisionSchema.safeParse({
        baseRevisionId: "r1",
        idempotencyKey: "key1",
        targetRevisionId: "a/b",
      }).success,
    ).toBe(false);
  });

  it.each([
    { id: "c1", text: "   ", start: 0, end: 1 },
    { id: "c1", text: "Hi", start: -1, end: 1 },
    { id: "c1", text: "Hi", start: 1, end: 1 },
    { id: "c1", text: "Hi", start: 2, end: 1 },
    { id: "c1", text: "Hi", start: 0, end: Number.POSITIVE_INFINITY },
  ])("rejects an invalid cue %j", (cue) => {
    expect(
      revisionContentSchema.safeParse({
        ...content,
        subtitleCues: { audioFingerprint: "hash", cues: [cue] },
      }).success,
    ).toBe(false);
  });

  it("validates descriptor values and preserves nullable media duration", () => {
    expect(outputSchema.parse(output).durationMs).toBeNull();
    expect(outputSchema.safeParse({ ...output, durationMs: -1 }).success).toBe(false);
    expect(outputSchema.safeParse({ ...output, bytes: -1 }).success).toBe(false);
    expect(outputSchema.safeParse({ ...output, role: "subtitles_json" }).success).toBe(false);
    expect(
      stagedFileSchema.safeParse({
        id: "s1",
        stageKind: "audio",
        path: "s1",
        originalFilename: "take.wav",
        bytes: 0,
        state: "copying",
        createdAt: "old",
      }).success,
    ).toBe(true);
  });

  it("parses complete responses including resolved text and retained publication identities", () => {
    expect(revisionViewSchema.parse(view).outputs[0]).toEqual(view.outputs[0]);
    expect(revisionViewSchema.safeParse({ ...view, articleMarkdown: undefined }).success).toBe(
      false,
    );
    expect(
      revisionMutationSuccessSchema.safeParse({ ok: true, view, duplicate: true }).success,
    ).toBe(true);
    expect(baselineSuccessSchema.safeParse({ ok: true, view, created: false }).success).toBe(true);
    expect(
      revisionSummarySchema.safeParse({
        id: "r1",
        parentId: null,
        restoredFromId: null,
        title: "Saved",
        createdAt: "old",
        current: false,
      }).success,
    ).toBe(true);
  });

  it("bundles response schemas for the browser without Node builtins", async () => {
    const bundled = await build({
      entryPoints: ["packages/app/src/slices/revisions/schema.ts"],
      bundle: true,
      platform: "browser",
      write: false,
      metafile: true,
    });
    expect(
      Object.keys(bundled.metafile.inputs).some(
        (path) => path.endsWith("admission/repo.ts") || path.endsWith("storage/repo.ts"),
      ),
    ).toBe(false);
  });
});
