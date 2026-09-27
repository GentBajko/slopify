import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { config, content, emptyView, workFor } from "./recipe-fixture.js";
import { planRevision } from "./recipes.js";

function fingerprints(value: RunConfig): Readonly<Record<string, string>> {
  const planned = planRevision(emptyView(value), { config: value, content });
  if (!planned.ok) throw new Error(JSON.stringify(planned.fields));
  return planned.fingerprints;
}
function recipeOf(value: RunConfig, key: string) {
  return workFor(emptyView(value), value).recipes.find((recipe) => recipe.key === key);
}
function timingOperation(value: RunConfig): unknown {
  const timing = recipeOf(value, "subtitles:timing");
  return timing?.input.kind === "local" ? timing.input.operation : undefined;
}
function digest(value: RunConfig): string {
  const all = fingerprints(value);
  const sorted = Object.keys(all)
    .sort()
    .map((key) => [key, all[key]]);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

// Everything that talks to an LLM or times words: article, captions, description and shorts.
const english: RunConfig = {
  ...config,
  sources: { ...config.sources, article: "generate", audio: "generate" },
  subtitles: {
    mode: "burn-in",
    language: "en",
    fontId: "default",
    fontSize: 48,
    position: "bottom",
  },
  youtubeDescription: true,
  shorts: { enabled: true, count: 2, minSeconds: 60, maxSeconds: 90 },
};

describe("project language and the recipes", () => {
  it("keeps every English fingerprint as it was before languages existed", () => {
    // Recorded before the language setting was added: an English project hashes the same, so
    // no English project is re-run by this feature.
    expect(Object.keys(fingerprints(english))).toContain("article:body");
    expect(fingerprints(english)["subtitles:timing"]).toBe(
      "1b9f060f9a8b23071ef4695c259414c6b83af82d225071bc6416c0af6086ed0e",
    );
    expect(digest(english)).toBe(
      "89d3e4c00f343375bfa130491dcd3bc1f7ffcb4e6969f931852bcf4d86ef6553",
    );
    expect(fingerprints({ ...english, language: "en" })).toEqual(fingerprints(english));
  });

  it("times each language with its own operation", () => {
    expect(timingOperation(english)).toBe("wav2vec2-en-a19f851-v2-omissions");
    expect(timingOperation({ ...english, language: "de" })).toBe("wav2vec2-xlsr56-2d48b01-v1");
    expect(timingOperation({ ...english, language: "ja" })).toBe("sentence-timing-v1");
  });

  it("re-makes the language's text and timing when the language changes", () => {
    const before = fingerprints(english);
    const after = fingerprints({ ...english, language: "es" });
    for (const key of ["subtitles:timing", "article:body", "youtube:description", "shorts:pick"])
      expect(after[key], key).not.toBe(before[key]);
  });
});
