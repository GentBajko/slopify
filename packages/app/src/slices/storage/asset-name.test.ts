import { describe, expect, it } from "vitest";
import { assetOf } from "./asset-name.js";
import type { Output, OutputRole } from "./model.js";

function output(role: OutputRole, over: Partial<Output> = {}): Output {
  return {
    id: "o1",
    projectId: "p1",
    stageKind: "article",
    role,
    path: `${role}.txt`,
    originalFilename: null,
    bytes: 4,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-03T00:00:00.000Z",
    ...over,
  };
}

describe("an output's asset name", () => {
  it("is the role with its underscores turned into hyphens", () => {
    expect(assetOf(output("article_md"))).toBe("article-md");
    expect(assetOf(output("audio_intro", { stageKind: "audio" }))).toBe("audio-intro");
    expect(assetOf(output("notes", { stageKind: "research" }))).toBe("notes");
  });

  it("carries an image's place in the slideshow, because a project holds many", () => {
    expect(assetOf(output("image", { stageKind: "images", meta: { index: 3 } }))).toBe("image-3");
  });

  it("falls back to the bare role for an image stored without an index", () => {
    expect(assetOf(output("image", { stageKind: "images" }))).toBe("image");
  });

  it("names the stage that sent the instructions, because every stage records its own", () => {
    expect(assetOf(output("instructions", { stageKind: "images" }))).toBe("images-instructions");
  });
});
