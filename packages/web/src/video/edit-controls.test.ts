import { expect, it } from "vitest";
import { videoBadge } from "./edit-controls";

it("badges an image-to-video model without ever leaving it out", () => {
  expect(videoBadge("Kling", undefined)).toBe("Kling");
  expect(
    videoBadge("Kling", { standing: "no-access", checkedAt: null, sentence: "No.", source: "run" }),
  ).toBe("Kling · ✕ not on your plan");
  expect(
    videoBadge("Kling", { standing: "listed", checkedAt: null, sentence: null, source: null }),
  ).toBe("Kling · ? listed for you · not checked");
});
