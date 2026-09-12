import { expect, it } from "vitest";
import type { RevisionPieceView } from "../revisions/model.js";
import { catalogue, config, content, emptyView } from "./recipe-fixture.js";
import { planRevision } from "./recipe-save.js";
import { planRevisionWork } from "./recipe-work.js";

it("preserves every physical split request fingerprint and reuse after a title-only save", () => {
  const c = { ...config, sources: { ...config.sources, audio: "generate" as const } };
  const start = emptyView(c, content);
  const first = planRevision(start, { config: c, content });
  if (!first.ok) throw new Error("Fixture rejected.");
  const revision = {
    ...start.revision,
    config: first.config,
    content: first.content,
    fingerprints: first.fingerprints,
  };
  const split = {
    ...catalogue,
    tts: catalogue.tts.map((model) => ({ ...model, tts: { ...model.tts, maxCharacters: 8 } })),
  };
  const resolved = { articleMarkdown: start.articleMarkdown, researchNotes: null };
  const planned = planRevisionWork(
    revision,
    { outputs: [], pieces: [] },
    split,
    new Set(),
    resolved,
  );
  const parts = planned.recipes.filter((row) => row.input.kind === "tts");
  expect(parts.length).toBeGreaterThan(1);
  const pieces: readonly RevisionPieceView[] = parts.map((row, index) => ({
    key: row.key,
    stageKind: "audio",
    assetId: `asset-${index}`,
    fingerprint: row.fingerprint,
    recordId: `record-${index}`,
    publicationId: `piece-${index}`,
    selected: true,
    available: true,
    piece: {
      id: `piece-${index}`,
      stageId: "audio-stage",
      kind: "chunk",
      idx: index + 1,
      state: "done",
      payload: JSON.stringify({
        requestFingerprint: row.requestFingerprint,
        file: `assets/part-${index}`,
      }),
    },
  }));
  const saved = planRevision(
    { ...start, revision, pieces },
    { config: { ...revision.config, title: "New title" }, content: revision.content },
  );
  if (!saved.ok) throw new Error("Save rejected.");
  expect(saved.manifest.pieces).toEqual(pieces);
  const next = {
    ...revision,
    config: saved.config,
    content: saved.content,
    fingerprints: saved.fingerprints,
  };
  const rebuilt = planRevisionWork(
    next,
    saved.manifest,
    split,
    new Set(pieces.flatMap((row) => (row.assetId === null ? [] : [row.assetId]))),
    resolved,
  );
  expect(
    rebuilt.work
      .filter((row) => parts.some((part) => part.key === row.key))
      .map((row) => row.disposition),
  ).toEqual(parts.map(() => "reuse"));
});
