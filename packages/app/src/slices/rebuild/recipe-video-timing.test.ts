import { expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { config, content, emptyView, readyView } from "./recipe-fixture.js";
import { visualRecipes } from "./recipe-visual.js";
import { planRevision } from "./recipes.js";

// The keys whose fingerprint an edit changes, which is what the rebuild re-runs.
function changed(before: RunConfig, after: RunConfig): readonly string[] {
  const base = emptyView(before);
  const a = planRevision(base, { config: before, content });
  const b = planRevision(base, { config: after, content });
  if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]));
  const keys = new Set([...Object.keys(a.fingerprints), ...Object.keys(b.fingerprints)]);
  return [...keys].filter((key) => a.fingerprints[key] !== b.fingerprints[key]).sort();
}

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
};
const captioned: RunConfig = {
  ...narrated,
  subtitles: {
    mode: "burn-in",
    language: "en",
    fontId: "default",
    fontSize: 48,
    position: "bottom",
  },
};

it("re-renders only the video when the seconds per image change", () => {
  expect(changed(config, { ...config, imageSeconds: 30 })).toEqual(["export:video"]);
  expect(changed(captioned, { ...captioned, imageSeconds: 30 })).toEqual(["export:video"]);
});

it("re-renders only the video when the zoom changes", () => {
  expect(changed(config, { ...config, zoomPercent: 0 })).toEqual(["export:video"]);
  expect(changed(captioned, { ...captioned, zoomPercent: 10 })).toEqual(["export:video"]);
});

it("re-renders only the video when the motion changes", () => {
  for (const motionStyle of ["pan", "mixed", "still"] as const) {
    expect(changed(config, { ...config, motionStyle })).toEqual(["export:video"]);
    expect(changed(captioned, { ...captioned, motionStyle })).toEqual(["export:video"]);
  }
  expect(changed({ ...config, motionStyle: "pan" }, { ...config, motionStyle: "mixed" })).toEqual([
    "export:video",
  ]);
});

it("keeps the video of a project saved before the motion setting", () => {
  // Such a project reads as "zoom", which renders what it always did. Its render values
  // are the ones from before the setting, so its fingerprint and its video stay as they
  // were; the other styles add their name.
  const values = (motionStyle: RunConfig["motionStyle"]) => {
    const video = visualRecipes({ ...config, motionStyle }, content, null, null).find(
      (one) => one.key === "export:video",
    );
    const recorded = video?.input.kind === "local" ? video.input.values : undefined;
    return Array.isArray(recorded) ? recorded.slice(-3) : undefined;
  };
  expect(values("zoom")).toEqual([15, 22.5, "slideshow-zoom-v2"]);
  expect(values("pan")).toEqual([22.5, "pan", "slideshow-zoom-v2"]);
});

it("keeps the article and images when the seconds per image change on a ready project", () => {
  const result = planRevision(readyView(), { config: { ...config, imageSeconds: 30 }, content });
  if (!result.ok) throw new Error(JSON.stringify(result.fields));
  expect(
    Object.fromEntries(result.manifest.outputs.map((row) => [row.workKey, row.state])),
  ).toEqual({
    "article:body": "ready",
    "image:harbor": "ready",
    "image:hill": "ready",
    "export:video": "outdated",
  });
});

it("re-exports without touching narration when the edge silence changes", () => {
  expect(changed(narrated, { ...narrated, edgeSilenceSeconds: 4 })).toEqual(["export:video"]);
  // The lead-in moves every caption, so their timing is redone with the export.
  expect(changed(captioned, { ...captioned, edgeSilenceSeconds: 4 })).toEqual([
    "export:video",
    "subtitles:cues",
    "subtitles:files",
    "subtitles:timing",
  ]);
  const wav: RunConfig = {
    ...narrated,
    sources: { ...narrated.sources, images: "off", video: "off" },
  };
  expect(changed(wav, { ...wav, edgeSilenceSeconds: 4 })).toEqual(["export:wav"]);
});

it("ignores the edge silence of a video without narration", () => {
  expect(changed(config, { ...config, edgeSilenceSeconds: 4 })).toEqual([]);
});
