import { describe, expect, it } from "vitest";
import { body, output, stage } from "@/routes/project-fixtures";
import { revisionView } from "./revision-fixture";
import {
  sectionLead,
  sectionName,
  sectionOf,
  sectionSummary,
  sectionsOf,
  shownStage,
} from "./sections";

const config = revisionView().revision.config;
const project = {
  ...body({ status: "running", stages: [], outputs: [] }).project,
  format: "16:9" as const,
  config,
};

describe("the project page's sections", () => {
  it("files research under Article and the thumbnail under Images", () => {
    expect(sectionOf("research")).toBe("article");
    expect(sectionOf("thumbnail")).toBe("images");
    expect(sectionOf("audio")).toBe("audio");
    const sections = sectionsOf([
      stage("research", "done"),
      stage("article", "done"),
      stage("audio", "done"),
      stage("images", "done"),
      stage("thumbnail", "skipped"),
      stage("video", "done"),
      stage("document", "skipped"),
    ]);
    expect(sections.map((one) => one.kind)).toEqual([
      "article",
      "audio",
      "images",
      "video",
      "document",
    ]);
    expect(sections[0]?.companion?.kind).toBe("research");
    // A companion switched off is not carried at all.
    expect(sections[2]?.companion).toBeUndefined();
  });

  it("lets a companion that needs the reader speak for its section", () => {
    const article = stage("article", "pending");
    for (const state of ["running", "failed", "canceled"] as const) {
      const research = stage("research", state);
      expect(shownStage({ kind: "article", stage: article, companion: research })).toBe(research);
    }
    const research = stage("research", "done");
    expect(shownStage({ kind: "article", stage: article, companion: research })).toBe(article);
    // The section's own failure comes first.
    const failed = stage("images", "failed");
    expect(
      shownStage({ kind: "images", stage: failed, companion: stage("thumbnail", "failed") }),
    ).toBe(failed);
  });

  it("names the section after the thumbnail when Images is off", () => {
    const section = {
      kind: "images" as const,
      stage: stage("images", "skipped"),
      companion: stage("thumbnail", "done"),
    };
    expect(sectionLead(section)).toBe("thumbnail");
    expect(sectionName(section, config)).toBe("Thumbnail");
    expect(sectionSummary(section, [output("thumbnail", "thumbnail")], project)).toBe("1 image");
    expect(sectionName({ kind: "images", stage: stage("images", "skipped") }, config)).toBe(
      "Images",
    );
  });

  it("says which stage a borrowed summary is about", () => {
    expect(
      sectionSummary(
        {
          kind: "article",
          stage: stage("article", "pending"),
          companion: stage("research", "running"),
        },
        [],
        project,
      ),
    ).toBe("Research: chapter 1 of 4");
    expect(
      sectionSummary(
        { kind: "article", stage: stage("article", "done"), companion: stage("research", "done") },
        [],
        project,
      ),
    ).toBe("Article ready");
  });
});
