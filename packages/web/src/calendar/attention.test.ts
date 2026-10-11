import { expect, it } from "vitest";
import { attentionMeta, type CalendarProject, needingAttention, projectLook } from "./attention";

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
  [{ stopped: true }, "waiting", "Stopped"],
  [{ setAside: true }, "done", "Kept as is"],
  [{ prepared: true, setAside: true }, "done", "Kept as is"],
  [{ prepared: true, progress: 0 }, "off", "Queued"],
  [{ progress: 0 }, "off", "Queued"],
  [{}, "waiting", "Waiting for your review"],
] as const)("says %o as %s %s", (over, tone, word) => {
  expect(projectLook({ ...project, ...over })).toEqual({ tone, word });
});

// A run a restart stopped needs the person's Continue the run, as on Home's Needs you.
it("asks the person to open a stopped run to continue it, and counts it as waiting", () => {
  const stopped = { ...project, stopped: true, needs: "stopped" } as const;
  expect(projectLook(stopped)).toEqual({
    tone: "waiting",
    word: "Stopped",
    action: { kind: "open", label: "Open to continue" },
  });
  expect(attentionMeta([stopped])).toBe("1 waiting for you");
  expect(needingAttention([project, stopped])).toEqual([stopped]);
});

// A step failed beside a wait reads by the wait and is one more item for the person, as on
// Home's Needs you: never Failed while the wait remains.
it("reads a step failed beside a wait by its wait and counts the failed step apart", () => {
  const agent = { ...project, waitingForAgent: true, stepFailed: true } as const;
  const review = { ...project, needs: "review", stepFailed: true } as const;
  expect(projectLook(agent)).toEqual({ tone: "waiting", word: "Waiting for the agent" });
  expect(projectLook(review)).toEqual({
    tone: "waiting",
    word: "Waiting for your review",
    action: { kind: "open", label: "Open to review" },
  });
  expect(needingAttention([project, agent, review])).toEqual([agent, review]);
  expect(attentionMeta([agent, review])).toBe("3 waiting for you");
  const ready = { ...project, state: "done", readyToUpload: true } as const;
  expect(attentionMeta([agent, ready])).toBe("1 waiting for you · 1 ready to upload");
});
