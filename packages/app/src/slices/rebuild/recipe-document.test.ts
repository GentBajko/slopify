import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content, emptyView, readyView, workFor } from "./recipe-fixture.js";

const withDocument: RunConfig = {
  ...config,
  sources: { ...config.sources, document: "generate" },
  document: { theme: "dicemaster" },
};

function recipesFor(c: RunConfig) {
  const view = emptyView(c);
  return buildRecipes({
    config: c,
    content,
    manifest: view,
    resolved: { articleMarkdown: view.articleMarkdown, researchNotes: null },
  });
}

function changed(c: RunConfig, next: RunConfig, value = content): readonly string[] {
  return workFor(readyView(c), next, value)
    .work.filter((row) => row.disposition !== "reuse")
    .map((row) => row.key);
}

describe("document recipe", () => {
  it("is made locally from the article alone when there is no thumbnail", () => {
    const document = recipesFor(withDocument).find((row) => row.key === "document:pdf");

    expect(document).toMatchObject({
      stage: "document",
      kind: "local",
      dependsOn: ["article:body"],
      input: { kind: "local", operation: "render-document" },
    });
  });

  it("waits for the thumbnail as its cover and the research notes for their links", () => {
    const document = recipesFor({
      ...withDocument,
      sources: {
        ...withDocument.sources,
        research: "provide",
        article: "generate",
        thumbnail: "from_prompt",
      },
      provided: { research: "Notes with https://example.test" },
      thumbnailPrompt: "Cover",
      rendered: { ...withDocument.rendered, thumbnailPrompt: "Cover" },
    }).find((row) => row.key === "document:pdf");

    expect(document?.dependsOn).toEqual(["article:body", "research:notes", "thumbnail:image"]);
    expect(document?.dependsOn).not.toContain("audio:body:concat");
    expect(document?.dependsOn.some((key) => key.startsWith("image:"))).toBe(false);
  });

  it("is not planned while the stage is off, or on a config saved before it existed", () => {
    expect(recipesFor(config).some((row) => row.stage === "document")).toBe(false);
    expect(
      recipesFor({ ...withDocument, sources: { ...withDocument.sources, document: "off" } }).some(
        (row) => row.stage === "document",
      ),
    ).toBe(false);
  });

  it("goes stale when the article is edited, leaving the images and video retained", () => {
    expect(
      changed(withDocument, withDocument, { ...content, articleMarkdown: "A rewritten article." }),
    ).toEqual(["article:body", "document:pdf"]);
  });

  it("goes stale alone when the theme changes", () => {
    expect(changed(withDocument, { ...withDocument, document: { theme: "plain" } })).toEqual([
      "document:pdf",
    ]);
  });

  it("goes stale alone when the title changes", () => {
    expect(changed(withDocument, { ...withDocument, title: "Renamed" })).toEqual(["document:pdf"]);
  });

  it("leaves everything else alone when it is switched on", () => {
    expect(changed(config, withDocument)).toEqual(["document:pdf"]);
  });
});
