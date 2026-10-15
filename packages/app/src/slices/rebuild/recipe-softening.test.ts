import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestOutput, ManifestPiece, RevisionManifest } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// Soften breaths and Soften S sounds change the narration's sound and never move a word, so a
// project that turns them on keeps the word timing it has, and everything written from it: the
// description and the shorts' pick are not asked for again.

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  intro: { mode: "text", text: "Welcome." } as unknown as RunConfig["intro"],
  subtitles: { mode: "files", language: "en", fontId: "default", fontSize: 48, position: "bottom" },
  youtubeDescription: true,
  loudness: { videoLufs: -14, audioFilesLufs: -18 },
};
const softened: RunConfig = { ...narrated, removeBreaths: true, deEss: true };

function plan(c: RunConfig, manifest: RevisionManifest, history?: RevisionManifest) {
  return buildRecipes({
    config: c,
    content,
    manifest,
    ...(history === undefined ? {} : { history }),
    resolved: { articleMarkdown: content.articleMarkdown ?? null, researchNotes: null },
    catalogue,
  });
}

// Every recipe done, each with a ready output, as a finished project holds them. `tag` names the
// files, so a step made again gets a file of its own.
function finished(recipes: readonly ResolvedWorkRecipe[], tag: string): RevisionManifest {
  const output = (one: ResolvedWorkRecipe): ManifestOutput =>
    ({
      slot: one.key,
      workKey: one.key,
      assetId: `asset-${one.key}-${tag}`,
      fingerprint: one.fingerprint,
      state: "ready",
      output: { durationMs: 60_000 },
    }) as unknown as ManifestOutput;
  const piece = (one: ResolvedWorkRecipe): ManifestPiece =>
    ({
      key: one.key,
      stageKind: one.stage,
      piece: { state: "done" },
      assetId: `asset-${one.key}-${tag}`,
      fingerprint: one.fingerprint,
    }) as unknown as ManifestPiece;
  return { outputs: recipes.map(output), pieces: recipes.map(piece) };
}

// A finished project: planned again on what it made until nothing moves.
function settle(c: RunConfig): {
  manifest: RevisionManifest;
  recipes: readonly ResolvedWorkRecipe[];
} {
  let manifest: RevisionManifest = { outputs: [], pieces: [] };
  let recipes = plan(c, manifest);
  for (let round = 0; round < 8; round += 1) {
    manifest = finished(recipes, "first");
    const next = plan(c, manifest);
    if (next.every((one, at) => one.fingerprint === recipes[at]?.fingerprint))
      return { manifest, recipes };
    recipes = next;
  }
  throw new Error("the plan did not settle");
}

const fingerprintOf = (recipes: readonly ResolvedWorkRecipe[], key: string) =>
  recipes.find((one) => one.key === key)?.fingerprint;

describe("turning on Soften breaths and Soften S sounds", () => {
  const before = settle(narrated);
  const kept = ["subtitles:timing", "youtube:description", "subtitles:cues"];

  it("keeps the finished word timing and what was written from it", () => {
    const after = plan(softened, before.manifest, before.manifest);
    for (const key of kept)
      expect(fingerprintOf(after, key), key).toBe(fingerprintOf(before.recipes, key));
    // The narration itself is joined and levelled again, softened.
    expect(fingerprintOf(after, "audio:body:concat")).not.toBe(
      fingerprintOf(before.recipes, "audio:body:concat"),
    );
  });

  it("keeps them once the softened narration is made, and asks for no text again", () => {
    const after = plan(softened, before.manifest, before.manifest);
    const remade = new Set(
      after
        .filter((one) => fingerprintOf(before.recipes, one.key) !== one.fingerprint)
        .map((one) => one.key),
    );
    // The softened joins replace the old ones; the history keeps both.
    const made = finished(
      after.filter((one) => remade.has(one.key)),
      "softened",
    );
    const manifest: RevisionManifest = {
      outputs: [
        ...before.manifest.outputs.filter((row) => !remade.has(row.workKey)),
        ...made.outputs,
      ],
      pieces: [...before.manifest.pieces.filter((row) => !remade.has(row.key)), ...made.pieces],
    };
    const history: RevisionManifest = {
      outputs: [...before.manifest.outputs, ...made.outputs],
      pieces: [...before.manifest.pieces, ...made.pieces],
    };
    const later = plan(softened, manifest, history);
    for (const key of kept)
      expect(fingerprintOf(later, key), key).toBe(fingerprintOf(before.recipes, key));
    const provider = later.filter(
      (one) =>
        one.input.kind !== "local" && fingerprintOf(before.recipes, one.key) !== one.fingerprint,
    );
    expect(provider.map((one) => one.key)).toEqual([]);
  });

  it("times the words again when the narration itself changes", () => {
    const after = plan(
      { ...softened, silenceGapSeconds: (narrated.silenceGapSeconds ?? 0) + 1 },
      before.manifest,
      before.manifest,
    );
    expect(fingerprintOf(after, "subtitles:timing")).not.toBe(
      fingerprintOf(before.recipes, "subtitles:timing"),
    );
  });
});
