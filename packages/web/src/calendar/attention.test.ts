import { expect, it } from "vitest";
import { type CalendarProject, projectLook } from "./attention";

const project: CalendarProject = {
  id: "p1",
  title: "Harbor",
  state: "pending",
  createdAt: "2026-09-10T00:00:00.000Z",
  finishedAt: null,
  scheduleId: "s1",
  progress: 0.8,
};

// The calendar says a project's state as Projects does (`projectStateOf`).
it.each([
  [{ prepared: true }, "waiting", "Prepared"],
  [{ waitingForAgent: true }, "waiting", "Waiting for the agent"],
  [{ setAside: true }, "done", "Kept as is"],
  [{ prepared: true, setAside: true }, "done", "Kept as is"],
  [{ prepared: true, progress: 0 }, "off", "Queued"],
  [{ progress: 0 }, "off", "Queued"],
  [{}, "waiting", "Waiting for your review"],
] as const)("says %o as %s %s", (over, tone, word) => {
  expect(projectLook({ ...project, ...over })).toEqual({ tone, word });
});
