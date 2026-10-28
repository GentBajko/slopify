import { describe, expect, it } from "vitest";
import {
  defaultReviewPrompts,
  promiseItemKey,
  reviewKey,
  reviewSettingsForm,
  reviewSettingsFromForm,
  reviewStageLabels,
  reviewStages,
  reviewStagesInRunOrder,
  visionStages,
} from "./model.js";

describe("the promise check", () => {
  it("is a review stage of its own, read before the narration", () => {
    expect(reviewStages).toContain("promise");
    expect(reviewStageLabels.promise).toBe("Promise check (before narration)");
    expect(visionStages).not.toContain("promise");
    expect(reviewKey(promiseItemKey)).toBe("review:promise");
    expect(reviewStagesInRunOrder.slice(0, 2)).toEqual(["article", "promise"]);
    // The narration is made before the images, so its check comes first.
    expect(reviewStagesInRunOrder.indexOf("narration")).toBeLessThan(
      reviewStagesInRunOrder.indexOf("images"),
    );
    expect([...reviewStagesInRunOrder].sort()).toEqual([...reviewStages].sort());
  });

  it("judges the opening against the title and thumbnail by default", () => {
    const prompt = defaultReviewPrompts.promise;
    expect(prompt).toContain("first 30 seconds");
    expect(prompt).toContain("title and thumbnail");
    expect(prompt).toContain("name the sentence from the article that should come first");
  });

  it("keeps its mode and prompt between the form and the saved settings", () => {
    const saved = reviewSettingsFromForm(
      {
        provider: "openrouter",
        model: "m",
        retries: "1",
        stages: {
          promise: { mode: "redo", prompt: "My promise prompt" },
          article: { mode: "off", prompt: "" },
        },
      },
      () => true,
    ).settings;
    expect(saved).toEqual({
      provider: "openrouter",
      model: "m",
      retries: 1,
      stages: { promise: { mode: "redo", prompt: "My promise prompt" } },
    });
    expect(saved === undefined ? undefined : reviewSettingsForm(saved)).toEqual({
      provider: "openrouter",
      model: "m",
      retries: "1",
      stages: { promise: { mode: "redo", prompt: "My promise prompt" } },
    });
  });

  it("is dropped with the rest when the stage it reads makes nothing", () => {
    expect(
      reviewSettingsFromForm(
        {
          provider: "p",
          model: "m",
          retries: "",
          stages: { promise: { mode: "flag", prompt: "" } },
        },
        (stage) => stage !== "promise",
      ).settings,
    ).toBeUndefined();
  });
});
