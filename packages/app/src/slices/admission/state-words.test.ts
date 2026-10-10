import { expect, it } from "vitest";
import { projectStateWord } from "./state-words.js";

it.each([
  [{ status: "pending", started: false }, "Queued"],
  [{ status: "pending", started: true }, "Waiting for your review"],
  [{ status: "pending", started: true, prepared: true }, "Prepared"],
  [{ status: "pending", started: true, setAside: true }, "Kept as is"],
  [{ status: "running", started: true }, "Running"],
  [{ status: "paused", started: true }, "Paused"],
  [{ status: "failed", started: true, prepared: true }, "Failed"],
  [{ status: "partial", started: true }, "Done with problems"],
  [{ status: "done", started: true }, "Done"],
  [{ status: "canceled", started: true }, "Canceled"],
] as const)("says %o as %s", (project, word) => {
  expect(projectStateWord(project)).toBe(word);
});
