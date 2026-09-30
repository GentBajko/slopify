import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { expect, it } from "vitest";
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
const page = (variants: number, queue?: boolean) =>
  ({
    variants: Array.from({ length: variants }, (_, index) => ({
      id: String(index),
      title: "",
      values: {},
    })),
    ...(queue === undefined ? {} : { queue }),
  }) as unknown as PlayDraftDocument;

it("queues several videos unless Queue is off, when they all start", () => {
  expect(startLabel(review, page(0))).toBe("Start run");
  expect(startLabel(review, page(2))).toBe("Queue 3 videos");
  expect(startLabel(review, page(2, true))).toBe("Queue 3 videos");
  expect(startLabel(review, page(2, false))).toBe("Start 3 videos");
});
