import { expect, it } from "vitest";
import {
  failedRun,
  parkedOnAgent,
  projectStateWord,
  queuedRun,
  readsByWaitBesideFailure,
  retryingAt,
  waitsForPerson,
} from "./state-words.js";

it.each([
  [{ status: "pending", progress: 0 }, "Queued"],
  [{ status: "pending", progress: 0.5 }, "Waiting for your review"],
  [{ status: "pending", progress: 0.5, prepared: true }, "Waiting for its day"],
  [{ status: "pending", progress: 0.5, setAside: true }, "Kept as is"],
  [{ status: "pending", progress: 0.5, waitingForAgent: true }, "Waiting for the agent"],
  [
    { status: "pending", progress: 0.5, waitingForAgent: true, prepared: true },
    "Waiting for the agent",
  ],
  // Parked on an agent's review before anything was made: it waits for the agent, not its turn.
  [{ status: "pending", progress: 0, waitingForAgent: true }, "Waiting for the agent"],
  [{ status: "pending", progress: 0.5, stopped: true }, "Stopped"],
  // A step failed beside one held at the person's checkpoint before anything was made: the run
  // started, so it waits for the person, not its turn.
  [{ status: "pending", progress: 0, stepFailed: true }, "Waiting for your review"],
  [
    { status: "pending", progress: 0, stepFailed: true, waitingForAgent: true },
    "Waiting for the agent",
  ],
  // Stopped before anything was made: it isn't waiting its turn, it needs Continue the run.
  [{ status: "pending", progress: 0, stopped: true }, "Stopped"],
  [{ status: "pending", progress: 0.5, stopped: true, setAside: true }, "Kept as is"],
  [{ status: "paused", progress: 0.5, stopped: true }, "Paused"],
  [{ status: "running", progress: 0.5, waitingForAgent: true }, "Running"],
  [{ status: "running", progress: 0.5 }, "Running"],
  [{ status: "paused", progress: 0.5 }, "Paused"],
  // Held at a checkpoint with every step before it supplied: it made nothing, and still waits for
  // the person (or its day), not its turn.
  [
    { status: "pending", progress: 0, holding: [{ waitsFor: "person" }] },
    "Waiting for your review",
  ],
  [
    { status: "pending", progress: 0, holding: [{ waitsFor: "day" }], prepared: true },
    "Waiting for its day",
  ],
  // Waiting to run a step again by itself, nothing else running.
  [
    { status: "running", progress: 0.5, retryAt: "2026-09-27T10:00:00.000Z" },
    "Waiting to try again",
  ],
  [{ status: "failed", progress: 0.5, prepared: true }, "Failed"],
  [{ status: "partial", progress: 0.5 }, "Done with problems"],
  [{ status: "done", progress: 0.5 }, "Done"],
  [{ status: "canceled", progress: 0.5 }, "Canceled"],
] as const)("says %o as %s", (project, word) => {
  expect(projectStateWord(project)).toBe(word);
});

it.each([
  [{ status: "pending", progress: 0.5 }, true],
  [{ status: "pending", progress: 0 }, false],
  [{ status: "pending", progress: 0.5, prepared: true }, false],
  [{ status: "pending", progress: 0.5, setAside: true }, false],
  [{ status: "pending", progress: 0.5, waitingForAgent: true }, false],
  [{ status: "pending", progress: 0.5, stopped: true }, true],
  [{ status: "pending", progress: 0, stopped: true }, true],
  [{ status: "pending", progress: 0.5, stopped: true, setAside: true }, false],
  [{ status: "running", progress: 0.5 }, false],
  [{ status: "running", progress: 0.5, retryAt: "2026-09-27T10:00:00.000Z" }, false],
  [{ status: "paused", progress: 0.5 }, true],
  [{ status: "pending", progress: 0, holding: [{ waitsFor: "person" }] }, true],
] as const)("counts %o as waiting for the person: %s", (project, waits) => {
  expect(waitsForPerson(project)).toBe(waits);
});

it.each([
  [{ status: "pending", progress: 0 }, true],
  [{ status: "pending", progress: 0, stopped: true }, false],
  [{ status: "pending", progress: 0, waitingForAgent: true }, false],
  [{ status: "pending", progress: 0.5 }, false],
  [{ status: "running", progress: 0 }, false],
  [{ status: "pending", progress: 0, holding: [{ waitsFor: "person" }] }, false],
] as const)("counts %o as queued: %s", (project, queued) => {
  expect(queuedRun(project)).toBe(queued);
});

it("tells when a run tries a step again only while nothing of it runs", () => {
  const waiting = { state: "pending", retryAt: "2026-09-27T10:05:00.000Z" } as const;
  const sooner = { state: "pending", retryAt: "2026-09-27T10:01:00.000Z" } as const;
  expect(retryingAt([{ state: "done" }, waiting, sooner])).toBe("2026-09-27T10:01:00.000Z");
  expect(retryingAt([waiting, { state: "running" }])).toBeUndefined();
  expect(retryingAt([{ state: "pending", retryAt: null }, { state: "failed" }])).toBeUndefined();
});

// Only a waiting run is parked: a running or paused one with a review out is said as such.
it.each([
  [{ status: "pending", waitingForAgent: true }, true],
  [{ status: "running", waitingForAgent: true }, false],
  [{ status: "paused", waitingForAgent: true }, false],
  [{ status: "pending", waitingForAgent: true, setAside: true }, false],
  [{ status: "pending" }, false],
] as const)("counts %o as parked on an agent: %s", (project, parked) => {
  expect(parkedOnAgent(project)).toBe(parked);
});

// A step failed beside another that waits: the run reads by the wait and is listed as failed too.
it("lists a run failed, or waiting beside a failed step, as failed", () => {
  expect(failedRun({ status: "failed" })).toBe(true);
  expect(failedRun({ status: "pending", stepFailed: true })).toBe(true);
  expect(failedRun({ status: "pending" })).toBe(false);
  expect(failedRun({ status: "partial" })).toBe(false);
  expect(readsByWaitBesideFailure("pending", [{ state: "failed" }, { state: "pending" }])).toBe(
    true,
  );
  expect(readsByWaitBesideFailure("pending", [{ state: "pending" }])).toBe(false);
  expect(readsByWaitBesideFailure("failed", [{ state: "failed" }])).toBe(false);
  expect(waitsForPerson({ status: "pending", progress: 0, stepFailed: true })).toBe(true);
  expect(queuedRun({ status: "pending", progress: 0, stepFailed: true })).toBe(false);
});
