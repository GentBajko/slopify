import { expect, it } from "vitest";
import { catalogue, config, content, readyView } from "./recipe-fixture.js";
import { planRevision, planRevisionWork } from "./recipes.js";

it.each(["output", "piece"] as const)(
  "does not reuse an unselected matching %s publication",
  (kind) => {
    const base = readyView();
    const selectedImage = base.outputs.find((row) => row.workKey === "image:harbor");
    if (selectedImage === undefined) throw new Error("No image fixture");
    const resolved = { articleMarkdown: base.articleMarkdown, researchNotes: null };
    const desired = planRevisionWork(
      base.revision,
      { outputs: [], pieces: [] },
      catalogue,
      new Set(),
      resolved,
    );
    const recipe = desired.recipes.find((row) => row.key === "image:harbor");
    if (recipe === undefined) throw new Error("No image recipe");
    const assetId = "late-unselected";
    const late = {
      outputs: kind === "output" ? [{ ...selectedImage, selected: false, assetId }] : [],
      pieces:
        kind === "piece"
          ? [
              {
                key: recipe.key,
                stageKind: "images" as const,
                selected: false,
                assetId,
                fingerprint: recipe.fingerprint,
                piece: {
                  id: "late-piece",
                  stageId: "images-stage",
                  kind: "image" as const,
                  idx: 1,
                  state: "done" as const,
                  payload: JSON.stringify({ requestFingerprint: recipe.requestFingerprint }),
                },
              },
            ]
          : [],
    };
    const planned = planRevisionWork(base.revision, late, catalogue, new Set([assetId]), resolved);
    expect(planned.work.find((row) => row.key === recipe.key)?.disposition).toBe("generate");
    expect(planned.changedInputs.find((row) => row.path === recipe.key)?.before).toBeNull();
  },
);
it("carries only selected references into a saved revision and leaves original history intact", () => {
  const base = readyView();
  const image = base.outputs.find((row) => row.workKey === "image:harbor");
  if (image === undefined) throw new Error("No image");
  const staleOutput = {
    ...image,
    recordId: "stale",
    selected: false,
    assetId: "late-old-result",
    fingerprint: "different-request",
  };
  const stalePiece = {
    key: image.workKey,
    stageKind: "images" as const,
    assetId: "late-piece-file",
    fingerprint: "old-piece",
    recordId: "stale-piece",
    publicationId: "old-publication",
    selected: false,
    available: true,
    piece: {
      id: "old-piece",
      stageId: "images-stage",
      kind: "image" as const,
      idx: 1,
      state: "done" as const,
      payload: null,
    },
  };
  const history = { ...base, outputs: [staleOutput, ...base.outputs], pieces: [stalePiece] };
  const before = structuredClone(history);
  const result = planRevision(history, { config: { ...config, title: "Retitled" }, content });
  if (!result.ok) throw new Error("Rejected title");
  expect(result.manifest.outputs.some((row) => row.assetId === staleOutput.assetId)).toBe(false);
  expect(result.manifest.pieces).toEqual([]);
  expect(result.manifest.outputs.map((row) => row.assetId)).toEqual(
    base.outputs.map((row) => row.assetId),
  );
  expect(history).toEqual(before);
});
it("keeps unavailable selected provided-output evidence for semantic review", () => {
  const suppliedConfig = { ...config, sources: { ...config.sources, audio: "provide" as const } };
  const supplied = { ...content, provided: { audio: "old-provided" } };
  const base = readyView(suppliedConfig, supplied);
  const changed = planRevision(base, {
    config: suppliedConfig,
    content: {
      ...supplied,
      articleMarkdown: "Changed narration meaning",
      provided: { audio: "replacement" },
    },
  });
  if (!changed.ok) throw new Error("Invalid fixture edit");
  const plan = planRevisionWork(
    {
      ...base.revision,
      config: changed.config,
      content: changed.content,
      fingerprints: changed.fingerprints,
    },
    changed.manifest,
    catalogue,
    new Set(["replacement"]),
    { articleMarkdown: changed.content.articleMarkdown ?? null, researchNotes: null },
  );
  expect(plan.work.find((row) => row.key === "audio:provided")?.disposition).toBe("review");
  expect(plan.changedInputs.find((row) => row.path === "audio:provided")?.before).toBe(
    base.outputs.find((row) => row.workKey === "audio:provided")?.fingerprint,
  );
});
