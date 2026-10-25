import type { Stage } from "@app/slices/admission/model.js";
import { expect, it } from "vitest";
import { stageWords } from "@/lib/stage-words";
import { runLine, runningDetail } from "./running-now.js";

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
  // Nothing to go by: the time is left out rather than said unknown.
  expect(runningDetail(video, 0)).toBe("50 of 51");
  // A step of one call counts nothing worth saying: its state word alone says it runs.
  expect(runningDetail({ ...video, progressCurrent: 0, progressTotal: 1 }, 0)).toBeUndefined();
});

// Where the whole run stands: counted in the steps listed beside it, so the number and the name
// are the same row, with the step at work and its own time left only when there is something to
// go by.
it("says the step of the run, its name and its time left on this step", () => {
  const at = (kind: Stage["kind"], state: Stage["state"], over: Partial<Stage> = {}): Stage => ({
    ...video,
    id: kind,
    kind,
    state,
    progressCurrent: null,
    progressTotal: null,
    ...over,
  });
  const now = Date.parse("2026-09-27T10:04:00.000Z");
  const stages = [
    at("research", "done"),
    at("article", "done"),
    at("audio", "running", {
      startedAt: "2026-09-27T10:00:00.000Z",
      progressCurrent: 4,
      progressTotal: 8,
    }),
    at("images", "pending"),
    at("video", "pending"),
  ];
  const name = (kind: Stage["kind"]) => stageWords[kind];
  expect(runLine(stages, now, name)).toBe(
    "Step 3 of 5 · Narration · about 4 min left on this step",
  );
  // Steps finish out of order: the count still names the row at work.
  expect(
    runLine(
      [at("article", "done"), at("audio", "running"), at("images", "done"), at("video", "pending")],
      now,
      name,
    ),
  ).toBe("Step 2 of 4 · Narration");
  // Supplied steps are listed and counted like the rest.
  expect(
    runLine(
      [
        at("article", "provided"),
        at("images", "provided"),
        at("thumbnail", "running"),
        at("video", "pending"),
      ],
      now,
      name,
    ),
  ).toBe("Step 3 of 4 · Thumbnail");
  // No rate yet and no history: the time left is left out rather than guessed.
  expect(
    runLine([at("article", "done"), at("audio", "running"), at("video", "pending")], now, name),
  ).toBe("Step 2 of 3 · Narration");
  expect(runLine([at("article", "done")], now, name)).toBeUndefined();
});
