import { expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { config, content, emptyView, readyView } from "./recipe-fixture.js";
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
