import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { planRevision } from "./recipes.js";

// The ambient bed is part of the video's render only when it is set, so every project made
// before it, and every one without it, keeps its fingerprints.
const narrated: RunConfig = { ...config, sources: { ...config.sources, audio: "generate" } };
const rain = { source: "rain", levelDb: -18, fadeInSeconds: 3, tailSeconds: 6 } as const;

function fingerprints(c: RunConfig, value: RevisionContent = content) {
  const planned = planRevision(emptyView(c, value), { config: c, content: value });
  if (!planned.ok) throw new Error(JSON.stringify(planned.fields));
  return planned.fingerprints;
}

describe("ambient bed fingerprints", () => {
  const before = fingerprints(narrated);

  it("stay exactly as they were without a bed", () => {
    expect(fingerprints({ ...narrated, ambientBed: undefined })).toEqual(before);
  });

  it("stay as they were with a bed the video cannot have", () => {
    // No narration to lie under, and no video to lie in.
    const silent = { ...config, sources: { ...config.sources, audio: "off" as const } };
    expect(fingerprints({ ...silent, ambientBed: rain })).toEqual(fingerprints(silent));
    const wav = { ...narrated, sources: { ...narrated.sources, video: "off" as const } };
    expect(fingerprints({ ...wav, ambientBed: rain })).toEqual(fingerprints(wav));
  });

  it("change only the video's render when a bed is set, and again with each setting", () => {
    const bedded = fingerprints({ ...narrated, ambientBed: rain });
    expect(bedded["export:video"]).not.toBe(before["export:video"]);
    for (const key of Object.keys(before).filter((one) => one !== "export:video"))
      expect(bedded[key]).toBe(before[key]);
    const changed = [
      { ...rain, source: "wind" as const },
      { ...rain, levelDb: -24 },
      { ...rain, fadeInSeconds: 0 },
      { ...rain, tailSeconds: 10 },
    ].map((bed) => fingerprints({ ...narrated, ambientBed: bed })["export:video"]);
    expect(new Set([bedded["export:video"], ...changed]).size).toBe(5);
  });

  it("follow the project's own file for an uploaded bed", () => {
    const upload = { ...narrated, ambientBed: { ...rain, source: "upload" as const } };
    const first = fingerprints(upload, { ...content, ambientBed: "a1" });
    const second = fingerprints(upload, { ...content, ambientBed: "a2" });
    expect(first["export:video"]).not.toBe(second["export:video"]);
    expect(first["export:video"]).not.toBe(before["export:video"]);
  });
});
