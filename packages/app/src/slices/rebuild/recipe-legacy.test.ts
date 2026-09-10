import { expect, it } from "vitest";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import type { RunConfig } from "../admission/model.js";
import { config, content, readyView, workFor } from "./recipe-fixture.js";
import {
  baselineFingerprints,
  legacyOutputSlot,
  legacyOutputWorkKey,
  legacyPieceKey,
  planRevision,
} from "./recipes.js";

it("binds legacy image pieces by file path even when indices and order differ", () => {
  const base = readyView();
  const image = base.outputs.find((row) => row.workKey === "image:hill");
  if (image === undefined) throw new Error("Missing image fixture");
  const piece: StagePiece = {
    id: "image-piece",
    stageId: "images-stage",
    kind: "image",
    idx: 1,
    state: "done",
    payload: JSON.stringify({ file: image.output.path, index: 1 }),
  };
  expect(
    legacyPieceKey(
      piece,
      "images",
      base.outputs.map((row) => row.output),
    ),
  ).toBe(`image:${image.output.id}`);
  expect(legacyPieceKey({ ...piece, payload: null }, "images", [])).toBe("image:image-piece");
  expect(legacyPieceKey({ ...piece, kind: "chunk" }, "audio")).toBe("audio:body:image-piece:1");
});
it("keeps singleton metadata out of provider work and maps subtitle roles", () => {
  const output = readyView().outputs[0]?.output;
  if (output === undefined) throw new Error("No output");
  expect(legacyOutputWorkKey({ ...output, role: "subtitle_ass", stageKind: "video" })).toBe(
    "subtitles:files",
  );
  expect(legacyOutputWorkKey({ ...output, role: "instructions", stageKind: "article" })).toBe(
    "article:instructions",
  );
  expect(legacyOutputSlot({ ...output, role: "video", stageKind: "video" })).toBe("video:video");
});
it("baseline fingerprints use saved recipe inputs without inventing provider provenance", () => {
  const c = { ...config, sources: { ...config.sources, audio: "generate" as const } };
  const project = {
    id: "p1",
    title: c.title,
    format: c.format,
    config: c,
    createdAt: "now",
    updatedAt: "now",
  };
  const fingerprints = baselineFingerprints(project, [], [], content);
  const base = readyView(c);
  const titled = planRevision(
    { ...base, revision: { ...base.revision, fingerprints } },
    { config: { ...c, title: "Renamed" }, content },
  );
  expect(titled).toMatchObject({ ok: true });
  if (!titled.ok) throw new Error("Invalid fixture");
  expect(titled.manifest.outputs.find((row) => row.workKey === "audio:body:concat")?.state).toBe(
    "ready",
  );
  expect(base.outputs.every((row) => !("requestFingerprint" in row.output.meta))).toBe(true);
});
it("supplies an adoption fingerprint for every retained piece without requiring valid payload JSON", () => {
  const project = {
    id: "p1",
    title: config.title,
    format: config.format,
    config,
    createdAt: "now",
    updatedAt: "now",
  };
  const pieces: readonly StagePiece[] = [
    {
      id: "chunk1",
      stageId: "audio-stage",
      kind: "chunk",
      idx: 1,
      state: "done",
      payload: '{"text":"Spoken"}',
    },
    {
      id: "research1",
      stageId: "research-stage",
      kind: "chapter",
      idx: 1,
      state: "done",
      payload: '{"title":"Research","notes":"Saved notes"}',
    },
    {
      id: "bad-image",
      stageId: "images-stage",
      kind: "image",
      idx: 1,
      state: "failed",
      payload: "{broken JSON",
    },
    {
      id: "entry1",
      stageId: "article-stage",
      kind: "segment",
      idx: 1,
      state: "done",
      payload: '{"text":"Opening"}',
    },
    {
      id: "spoken1",
      stageId: "audio-stage",
      kind: "segment",
      idx: 2,
      state: "done",
      payload: null,
    },
    {
      id: "prompt1",
      stageId: "thumbnail-stage",
      kind: "prompt_written",
      idx: 1,
      state: "done",
      payload: '{"prompt":"Saved prompt"}',
    },
  ];
  const stages = [
    { id: "audio-stage", kind: "audio" as const },
    { id: "research-stage", kind: "research" as const },
    { id: "images-stage", kind: "images" as const },
    { id: "article-stage", kind: "article" as const },
    { id: "thumbnail-stage", kind: "thumbnail" as const },
  ];
  const before = structuredClone(pieces);
  const fingerprints = baselineFingerprints(project, [], pieces, content, stages);
  for (const piece of pieces) {
    const stage = stages.find((row) => row.id === piece.stageId);
    if (stage === undefined) throw new Error("Missing fixture stage");
    expect(fingerprints[legacyPieceKey(piece, stage.kind)]).toBeTypeOf("string");
  }
  const written = pieces.find((piece) => piece.id === "entry1");
  const spoken = pieces.find((piece) => piece.id === "spoken1");
  if (written === undefined || spoken === undefined) throw new Error("Missing segment fixtures");
  expect(legacyPieceKey(written, "article")).toBe("entry:intro:text");
  expect(legacyPieceKey(spoken, "audio")).toBe("audio:outro");
  expect(pieces).toEqual(before);
});
it.each([
  "{invalid",
  '{"file":3}',
  "null",
  JSON.stringify({ file: 3, prompt: "Coast", promptName: "Landscape" }),
])("keeps malformed image metadata %s as an unmatched legacy piece", (payload) => {
  const piece: StagePiece = {
    id: "preserved-image",
    stageId: "images",
    kind: "image",
    idx: 1,
    state: "done",
    payload,
  };
  const output = readyView().outputs.find((row) => row.output.role === "image")?.output;
  if (output === undefined) throw new Error("Missing image fixture");
  expect(
    legacyPieceKey(piece, "images", [
      { ...output, meta: { index: 1, prompt: "Coast", promptName: "Landscape" } },
    ]),
  ).toBe("image:preserved-image");
});

it("keeps supplied audio under its provided recipe and requires review after an article edit", () => {
  const c: RunConfig = {
    ...config,
    sources: { ...config.sources, audio: "provide", images: "off", video: "off" },
  };
  const value = {
    ...content,
    provided: { audio: "supplied-audio" },
    imageOrder: [],
    imageDefinitions: {},
  };
  const base = readyView(c, value);
  const selected = base.outputs.find((row) => row.workKey === "audio:provided");
  if (selected === undefined) throw new Error("Missing supplied audio fixture");
  const output = { ...selected.output, stageKind: "audio" as const, role: "audio_body" as const };
  const project = {
    id: "p1",
    title: c.title,
    format: c.format,
    config: c,
    createdAt: "now",
    updatedAt: "now",
  };
  const fingerprints = baselineFingerprints(project, [output], [], value);
  const key = legacyOutputWorkKey(output, c);
  const fingerprint = fingerprints[key];
  if (fingerprint === undefined) throw new Error("Missing adopted fingerprint");
  const adopted = {
    ...base,
    revision: { ...base.revision, fingerprints },
    outputs: [{ ...selected, output, workKey: key, fingerprint, assetId: "supplied-audio" }],
  };
  expect(
    workFor(adopted, c, { ...value, articleMarkdown: "Changed narration." }).work.find(
      (row) => row.key === "audio:provided",
    )?.disposition,
  ).toBe("review");
  expect(key).toBe("audio:provided");
  expect(fingerprints["audio:body:concat"]).toBeUndefined();
  expect(legacyOutputWorkKey(output)).toBe("audio:body:concat");
  expect(legacyOutputWorkKey(output, { sources: { ...c.sources, audio: "generate" } })).toBe(
    "audio:body:concat",
  );
});
it("maps a retained thumbnail prompt to its actual request key", () => {
  const piece: StagePiece = {
    id: "written",
    stageId: "thumbnail",
    kind: "prompt_written",
    idx: 1,
    state: "done",
    payload: JSON.stringify({ prompt: "Saved image", sent: "Saved request" }),
  };
  expect(legacyPieceKey(piece, "thumbnail")).toBe("thumbnail:prompt");
});
