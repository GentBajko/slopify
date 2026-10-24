import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { defaultVoicesSettings } from "@app/slices/voices/model.js";
import { expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { type ReviewState, startLabel } from "./review-state";

const review: ReviewState = {
  receipt: null,
  pending: false,
  starting: false,
  uncertain: false,
  valid: false,
  error: null,
  fields: [],
  created: null,
};
const page = (variants: number, queue?: boolean): PlayDraftDocument => ({
  ...freshDraftDocument,
  variants: Array.from({ length: variants }, (_, index) => ({
    id: String(index),
    title: "",
    values: {},
  })),
  ...(queue === undefined ? {} : { queue }),
});

it("names what it makes, and queues several unless Queue is off, when they all start", () => {
  expect(startLabel(review, page(0))).toBe("Make the video");
  expect(startLabel(review, page(2))).toBe("Queue 3 videos");
  expect(startLabel(review, page(2, true))).toBe("Queue 3 videos");
  expect(startLabel(review, page(2, false))).toBe("Make 3 videos");
});

it("says the podcast, the audiobook, the article or the images for what is being made", () => {
  const as = (
    sources: Partial<PlayDraftDocument["form"]["sources"]>,
    variants = 0,
    voices?: PlayDraftDocument["form"]["voices"],
  ): string => {
    const document = page(variants, false);
    return startLabel(review, {
      ...document,
      form: {
        ...document.form,
        sources: { ...document.form.sources, ...sources },
        ...(voices === undefined ? {} : { voices }),
      },
    });
  };
  const quiet = { images: "off", video: "off" } as const;
  const podcast = defaultVoicesSettings("podcast");
  expect(as({ ...quiet, audio: "generate" }, 0, podcast)).toBe("Make the podcast");
  expect(as({ ...quiet, audio: "generate" })).toBe("Make the audiobook");
  expect(as({ ...quiet, audio: "off" })).toBe("Make the article");
  expect(as({ article: "off", audio: "off", images: "generate", video: "off" })).toBe(
    "Make the images",
  );
  expect(as({ ...quiet, audio: "generate" }, 1, podcast)).toBe("Make 2 episodes");
});
