import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content, emptyView, readyView, workFor } from "./recipe-fixture.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { priceRecipe } from "./recipe-work.js";
import { planRevision } from "./recipes.js";

const narrated: RunConfig = { ...config, sources: { ...config.sources, audio: "generate" } };
const described: RunConfig = { ...narrated, youtubeDescription: true };
const captioned: RunConfig = {
  ...described,
  subtitles: { mode: "files", language: "en", fontId: "default", fontSize: 48, position: "bottom" },
};

function recipesFor(c: RunConfig, value = content) {
  const view = emptyView(c, value);
  return buildRecipes({
    config: c,
    content: value,
    manifest: view,
    resolved: { articleMarkdown: view.articleMarkdown, researchNotes: null },
  });
}

// The keys whose fingerprint an edit changes, which is what the rebuild re-runs.
function changed(before: RunConfig, after: RunConfig, next = content): readonly string[] {
  const base = emptyView(before);
  const a = planRevision(base, { config: before, content });
  const b = planRevision(base, { config: after, content: next });
  if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]));
  const keys = new Set([...Object.keys(a.fingerprints), ...Object.keys(b.fingerprints)]);
  return [...keys].filter((key) => a.fingerprints[key] !== b.fingerprints[key]).sort();
}

describe("YouTube description recipe", () => {
  it("runs after the word timing, in the Video stage, beside the render", () => {
    const recipes = recipesFor(captioned);
    const description = recipes.find((row) => row.key === "youtube:description");
    expect(description).toMatchObject({
      stage: "video",
      kind: "provider",
      dependsOn: ["subtitles:timing"],
      input: { kind: "local", operation: "youtube-description-v1" },
    });
    expect(recipes.find((row) => row.key === "export:video")?.dependsOn).not.toContain(
      "youtube:description",
    );
  });

  it("times the narration with captions off, making no caption files", () => {
    const keys = recipesFor(described).map((row) => row.key);
    expect(keys).toContain("subtitles:timing");
    expect(keys).toContain("youtube:description");
    expect(keys).not.toContain("subtitles:cues");
    expect(keys).not.toContain("subtitles:files");
  });

  it("is not planned when off, on a config saved before it existed, or without narration", () => {
    for (const c of [
      narrated,
      { ...narrated, youtubeDescription: false },
      { ...config, youtubeDescription: true },
    ]) {
      const keys = recipesFor(c).map((row) => row.key);
      expect(keys).not.toContain("youtube:description");
      expect(keys).not.toContain("subtitles:timing");
    }
  });

  it("keeps the caption timing's identity when it is switched on", () => {
    expect(changed(captioned, { ...captioned, youtubeDescription: false })).toEqual([
      "youtube:description",
    ]);
    expect(changed({ ...captioned, youtubeDescription: false }, captioned)).toEqual([
      "youtube:description",
    ]);
    expect(changed(narrated, described)).toEqual(["subtitles:timing", "youtube:description"]);
  });

  it("goes stale with the narration it was timed from", () => {
    const edited = { ...content, articleMarkdown: "A rewritten article.", articleEdited: true };
    expect(changed(described, described, edited)).toContain("youtube:description");
    expect(changed(described, { ...described, silenceGapSeconds: 2 })).toContain(
      "youtube:description",
    );
    expect(changed(described, { ...described, edgeSilenceSeconds: 3 })).toContain(
      "youtube:description",
    );
  });

  it("stays current when only the look of the video changes", () => {
    for (const next of [
      { ...captioned, motionStyle: "pan" as const },
      { ...captioned, zoomPercent: 0 },
      { ...captioned, imageSeconds: 30 },
      {
        ...captioned,
        subtitles: {
          mode: "burn-in" as const,
          language: "en" as const,
          fontId: "default",
          fontSize: 60,
          position: "top" as const,
        },
      },
    ])
      expect(changed(captioned, next)).not.toContain("youtube:description");
  });

  it("goes stale alone when its prompt, model or the title changes", () => {
    expect(
      changed(described, {
        ...described,
        descriptionPrompt: "Mine",
        rendered: { ...described.rendered, description: "Chapters only." },
      }),
    ).toEqual(["youtube:description"]);
    expect(changed(described, { ...described, llm: { provider: "text", model: "other" } })).toEqual(
      ["youtube:description"],
    );
    expect(changed(described, { ...described, title: "Renamed" })).toEqual(["youtube:description"]);
  });

  it("leaves the article, images and video retained on a ready project when switched on", () => {
    const plan = workFor(readyView(narrated), described);
    expect(
      plan.work
        .filter((row) => row.disposition !== "reuse")
        .map((row) => row.key)
        .sort(),
    ).toEqual(["subtitles:timing", "youtube:description"]);
  });

  it("is a paid LLM call on the project's text model", () => {
    const description = recipesFor(described).find((row) => row.key === "youtube:description");
    if (description === undefined) throw new Error("Missing description recipe");
    expect(recipeProviderChoice(description, described)).toEqual({
      provider: "text",
      model: "text-model",
      family: "llm",
    });
    expect(
      priceRecipe(
        {
          ...description,
          disposition: "generate",
          inflight: false,
          pieceIds: [],
          reason: "Inputs changed or a required output is missing.",
        },
        description,
      ),
    ).toMatchObject({ kind: "llm", provider: "text", model: "text-model", outputCharacters: 2400 });
  });
  it("writes only the description again when asked to regenerate it", () => {
    expect(
      changed(described, described, {
        ...content,
        regenerationTokens: { "youtube:description": "again" },
      }),
    ).toEqual(["youtube:description"]);
  });
});
