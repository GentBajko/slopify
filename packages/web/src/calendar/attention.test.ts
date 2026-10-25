import type { ProjectListing } from "@app/slices/admission/model.js";
import { expect, it } from "vitest";
import { attentionLine, type CalendarProject, projectLook } from "./attention";

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
  [{ prepared: true }, "waiting", "Waiting for its day"],
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
});

// A video made with a failed step reads as everywhere else, and is still ready to copy.
it("reads a video ready with a failed step as Done with problems", () => {
  expect(projectLook({ ...project, state: "partial", readyToUpload: true })).toEqual({
    tone: "waiting",
    word: "Done with problems",
    action: { kind: "upload" },
  });
  expect(projectLook({ ...project, state: "done", readyToUpload: true }).word).toBe(
    "Ready to upload",
  );
});

// The line above the weeks counts what Home counts, from every project of the channel shown.
it("counts the decisions, the failures and the videos ready to upload as Home does", () => {
  const listing = (over: Partial<ProjectListing>) =>
    ({
      id: "x",
      title: "x",
      status: "done",
      progress: 1,
      uploadedAt: null,
      config: { sources: { video: "generate" } },
      ...over,
    }) as ProjectListing;
  expect(
    attentionLine([
      listing({ status: "pending", progress: 0.5 }),
      listing({ status: "failed", progress: 0.5 }),
      listing({}),
      listing({ status: "partial" }),
      listing({ uploadedAt: "2026-09-01T00:00:00.000Z" }),
      listing({ sample: true }),
      listing({ status: "running", progress: 0.5 }),
    ]),
  ).toEqual({ text: "1 decision · 1 failed · 2 ready to upload", items: 4 });
  expect(attentionLine([listing({ status: "running", progress: 0.5 })])).toBeUndefined();
});
