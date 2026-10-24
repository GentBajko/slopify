import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { CheckpointHold } from "@app/slices/reviews/holds.js";
import { expect, it } from "vitest";
import { runSteps } from "./run-aside.js";

const project = {
  id: "p1",
  title: "Rope Tricks",
  format: "16:9",
  status: "pending",
  config: { sources: { video: "generate", audio: "generate" } },
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
} as unknown as ProjectSummary;

function stage(kind: StageKind, state: StageState): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: "generate",
    state,
    failureReason: null,
    attemptCount: 0,
    progressCurrent: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
  };
}

const stages = [stage("article", "done"), stage("images", "pending"), stage("video", "pending")];

const gate = { revisionId: "r1", fingerprint: "a".repeat(64), since: "2026-09-10T00:00:00.000Z" };
const steps = (over: Partial<ProjectSummary>, holding: readonly CheckpointHold[]) =>
  runSteps({
    stages,
    outputs: [],
    project: { ...project, ...over },
    resumable: false,
    holding,
    now: 0,
  }).map((step) => [step.name, step.state, step.detail]);

it("says a step waits for the person only at a checkpoint that holds the run", () => {
  expect(
    steps({}, [{ checkpointId: "images-gate", stage: "images", waitsFor: "person", ...gate }]),
  ).toEqual([
    ["Article", "Done", expect.anything()],
    ["Images", "Waiting for your review", "Press Approve at the top to carry on."],
    ["Video", "Not started", "Waits for the stages above"],
  ]);
  // The video's checkpoint, not reached yet, holds nothing.
  expect(steps({ status: "running" }, [])).toEqual([
    ["Article", "Done", expect.anything()],
    ["Images", "Not started", "Ready to run"],
    ["Video", "Not started", "Waits for the stages above"],
  ]);
});

it("reads a prepared project's video as Prepared, not as a review to approve", () => {
  expect(
    steps({ prepared: true }, [
      { checkpointId: "video-gate", stage: "video", waitsFor: "day", ...gate },
    ])[2],
  ).toEqual(["Video", "Prepared", "Its schedule makes it on its day."]);
});

it("says every step left waits for the agent while its review holds the run", () => {
  expect(steps({ waitingForAgent: true }, []).slice(1)).toEqual([
    ["Images", "Waiting for the agent", "Goes on once the agent answers."],
    ["Video", "Waiting for the agent", "Goes on once the agent answers."],
  ]);
  // Kept as is, its steps wait for nobody, as the project's state word says.
  expect(steps({ waitingForAgent: true, setAside: true }, [])[1]?.[1]).toBe("Not started");
});
