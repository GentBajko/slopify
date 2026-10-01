import type { Stage } from "@app/slices/admission/model.js";
import { expect, it } from "vitest";
import { runningDetail } from "./running-now.js";

const video: Stage = {
  id: "s",
  projectId: "p",
  kind: "video",
  source: "generate",
  state: "running",
  failureReason: null,
  attemptCount: 1,
  progressCurrent: 50.9,
  progressTotal: 51,
  startedAt: null,
  finishedAt: null,
};

it("names the long render and its percentage instead of a step count that stands still", () => {
  expect(
    runningDetail({ ...video, activity: { label: "rendering the video", percent: 45 } }, 0),
  ).toBe("Rendering the video (45%)");
  expect(runningDetail(video, 0)).toBe("50 of 51 · time left unknown");
});
