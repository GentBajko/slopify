import { expect, it } from "vitest";
import { type CalendarProject, projectLook } from "./attention";

const project: CalendarProject = {
  id: "p1",
  title: "Harbor",
  state: "pending",
  createdAt: "2026-09-10T00:00:00.000Z",
  finishedAt: null,
  scheduleId: "s1",
};

it("says a schedule's prepared project is Prepared, not waiting for review", () => {
  expect(projectLook({ ...project, prepared: true })).toEqual({
    tone: "waiting",
    word: "Prepared",
  });
  expect(projectLook(project).word).toBe("Queued");
});
