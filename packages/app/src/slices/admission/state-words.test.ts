import { expect, it } from "vitest";
import { projectStateWord } from "./state-words.js";

it.each([
  [{ status: "pending", progress: 0 }, "Queued"],
  [{ status: "pending", progress: 0.5 }, "Waiting for your review"],
  [{ status: "pending", progress: 0.5, prepared: true }, "Prepared"],
  [{ status: "pending", progress: 0.5, setAside: true }, "Kept as is"],
  [{ status: "running", progress: 0.5 }, "Running"],
  [{ status: "paused", progress: 0.5 }, "Paused"],
  [{ status: "failed", progress: 0.5, prepared: true }, "Failed"],
  [{ status: "partial", progress: 0.5 }, "Done with problems"],
  [{ status: "done", progress: 0.5 }, "Done"],
  [{ status: "canceled", progress: 0.5 }, "Canceled"],
] as const)("says %o as %s", (project, word) => {
  expect(projectStateWord(project)).toBe(word);
});
