import { expect, it } from "vitest";
import { projectStateOf } from "./state-words.js";

it.each([
  [
    { status: "pending", progress: 0 },
    { tone: "off", word: "Queued" },
  ],
  [
    { status: "pending", progress: 0, stopped: true },
    { tone: "waiting", word: "Stopped" },
  ],
  [
    { status: "pending", progress: 0, waitingForAgent: true },
    { tone: "waiting", word: "Waiting for the agent" },
  ],
  [
    { status: "pending", progress: 0.5 },
    { tone: "waiting", word: "Waiting for your review" },
  ],
  [
    { status: "pending", progress: 0.5, setAside: true },
    { tone: "done", word: "Kept as is" },
  ],
  [
    { status: "running", progress: 0.5, stopped: true },
    { tone: "running", word: "Running" },
  ],
] as const)("shows %o with its lamp as %o", (project, look) => {
  expect(projectStateOf(project)).toEqual(look);
});
