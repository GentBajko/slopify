import { expect, it } from "vitest";
import { projectStateWord, waitsForPerson } from "./state-words.js";

it.each([
  [{ status: "pending", progress: 0 }, "Queued"],
  [{ status: "pending", progress: 0.5 }, "Waiting for your review"],
  [{ status: "pending", progress: 0.5, prepared: true }, "Prepared"],
  [{ status: "pending", progress: 0.5, setAside: true }, "Kept as is"],
  [{ status: "pending", progress: 0.5, waitingForAgent: true }, "Waiting for the agent"],
  [
    { status: "pending", progress: 0.5, waitingForAgent: true, prepared: true },
    "Waiting for the agent",
  ],
  [{ status: "pending", progress: 0, waitingForAgent: true }, "Queued"],
  [{ status: "pending", progress: 0.5, stopped: true }, "Stopped"],
  // Stopped before anything was made: it isn't waiting its turn, it needs Continue the run.
  [{ status: "pending", progress: 0, stopped: true }, "Stopped"],
  [{ status: "pending", progress: 0.5, stopped: true, setAside: true }, "Kept as is"],
  [{ status: "paused", progress: 0.5, stopped: true }, "Paused"],
  [{ status: "running", progress: 0.5, waitingForAgent: true }, "Running"],
  [{ status: "running", progress: 0.5 }, "Running"],
  [{ status: "paused", progress: 0.5 }, "Paused"],
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
  [{ status: "paused", progress: 0.5 }, false],
] as const)("counts %o as waiting for the person: %s", (project, waits) => {
  expect(waitsForPerson(project)).toBe(waits);
});
