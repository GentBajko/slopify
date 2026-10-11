import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// Remove breaths is made in the narration joins. On the run config only while on, so every
// project made before it keeps its fingerprints; on, it changes the joins and what is timed
// from them, and never a text-to-speech request.

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  chunking: { mode: "paragraph" },
  subtitles: { mode: "files", language: "en", fontId: "default", fontSize: 48, position: "bottom" },
};

function plan(c: RunConfig, value: RevisionContent = content): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: value.articleMarkdown ?? null, researchNotes: null },
    catalogue,
  });
}
function fingerprints(c: RunConfig): Readonly<Record<string, string>> {
  return Object.fromEntries(plan(c).map((one) => [one.key, one.fingerprint]));
}
function valuesOf(recipes: readonly ResolvedWorkRecipe[], key: string): unknown[] {
  const found = recipes.find((one) => one.key === key);
  return found?.input.kind === "local" ? (found.input.values as unknown[]) : [];
}

describe("Remove breaths fingerprints", () => {
  const before = fingerprints(narrated);

  it("stay exactly as they were with the setting absent or off", () => {
    expect(fingerprints({ ...narrated, removeBreaths: undefined })).toEqual(before);
    expect(fingerprints({ ...narrated, removeBreaths: false })).toEqual(before);
    expect(valuesOf(plan(narrated), "audio:body:concat")).toHaveLength(2);
  });

  it("change the join and what is timed from it, never a text-to-speech request", () => {
    const recipes = plan({ ...narrated, removeBreaths: true });
    const on = Object.fromEntries(recipes.map((one) => [one.key, one.fingerprint]));
    const changed = Object.keys(before).filter((key) => on[key] !== before[key]);
    expect(changed.filter((key) => key.startsWith("audio:"))).toEqual(["audio:body:concat"]);
    expect(on["subtitles:timing"]).not.toBe(before["subtitles:timing"]);
    expect(valuesOf(recipes, "audio:body:concat")[2]).toEqual(["breaths-v1"]);
  });

  it("follow the pauses when both are on", () => {
    const recipes = plan({ ...narrated, removeBreaths: true, sentencePauseSeconds: 0.4 });
    const values = valuesOf(recipes, "audio:body:concat");
    expect(values[2]).toEqual(["pauses-v1", 0.4, 0, ["paragraph", "end"]]);
    expect(values[3]).toEqual(["breaths-v1"]);
  });

  it("travel with the levelled join, which removes the same breaths", () => {
    const recipes = plan({
      ...narrated,
      removeBreaths: true,
      loudness: { videoLufs: -14, audioFilesLufs: -18 },
    });
    expect((valuesOf(recipes, "level:body")[1] as unknown[])[2]).toEqual(["breaths-v1"]);
  });
});
