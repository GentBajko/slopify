import { describe, expect, it } from "vitest";
import type { RunDraft } from "../admission/model.js";
import { admit } from "../admission/rules.js";
import { activeReviewStages, reviewFields } from "./rules.js";

const sources = {
  research: "off",
  article: "generate",
  audio: "generate",
  images: "generate",
  thumbnail: "from_prompt",
  video: "generate",
} as const;
const draft = (reviews: RunDraft["reviews"]) => ({ sources, reviews });

describe("review admission", () => {
  it("refuses a reviewer that can't be shown pictures for the picture stages", () => {
    for (const provider of ["openrouter", "gemini"]) {
      const fields = reviewFields(
        draft({
          provider,
          model: "m",
          stages: { images: { mode: "redo" }, thumbnail: { mode: "flag" } },
        }),
      );
      expect(fields).toEqual([expect.objectContaining({ field: "reviews.provider" })]);
      expect(fields[0]?.message).toContain("Images, Thumbnail reviews look at pictures");
      expect(fields[0]?.message).toContain("choose Claude Code or Codex");
    }
  });

  it("lets any text model review the article and the narration", () => {
    expect(
      reviewFields(
        draft({
          provider: "openrouter",
          model: "m",
          stages: { article: { mode: "flag" }, narration: { mode: "redo" } },
        }),
      ),
    ).toEqual([]);
  });

  it("takes Claude Code and Codex for pictures", () => {
    for (const provider of ["claude-code", "codex"])
      expect(
        reviewFields(draft({ provider, model: "m", stages: { images: { mode: "flag" } } })),
      ).toEqual([]);
  });

  it("asks for a reviewer and a sane number of redos only while a review is on", () => {
    expect(
      reviewFields(draft({ provider: "", model: "", stages: { images: { mode: "off" } } })),
    ).toEqual([]);
    expect(
      reviewFields(draft({ provider: "", model: "", stages: { article: { mode: "flag" } } })).map(
        (f) => f.field,
      ),
    ).toEqual(["reviews.provider"]);
    expect(
      reviewFields(
        draft({ provider: "codex", model: "m", retries: 9, stages: { article: { mode: "redo" } } }),
      ).map((f) => f.field),
    ).toEqual(["reviews.retries"]);
  });

  it("ignores reviews of stages that make nothing", () => {
    const provided = {
      sources: { ...sources, images: "provide" as const, article: "provide" as const },
      reviews: {
        provider: "openrouter",
        model: "m",
        stages: { images: { mode: "flag" as const } },
      },
    };
    expect(activeReviewStages(provided)).toEqual([]);
    expect(reviewFields(provided)).toEqual([]);
  });

  it("is part of the run's admission", () => {
    const result = admit({
      draft: {
        title: "T",
        format: "16:9",
        sources: { ...sources, article: "provide", audio: "off", thumbnail: "off", video: "off" },
        images: { provider: "fal", model: "m" },
        imagePrompts: [{ name: "Scene", number: 1 }],
        values: {},
        provided: { article: "Text" },
        silenceGapSeconds: 0,
        imageSeconds: 15,
        zoomPercent: 22.5,
        motionStyle: "zoom",
        edgeSilenceSeconds: 2,
        reviews: { provider: "openrouter", model: "m", stages: { images: { mode: "redo" } } },
      },
      staged: [],
      requiredSlots: [],
    });
    expect(result.ok ? [] : result.fields.map((field) => field.field)).toContain(
      "reviews.provider",
    );
  });
});
