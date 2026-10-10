import { expect, it } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { jsonAnswer, testDeps } from "@/test-app";
import { projectNoticeSubject } from "./use-run-notifications.js";

const held = body({
  status: "pending",
  stages: [stage("article", "done"), stage("images", "pending")],
  outputs: [],
});

const subjectOf = (project: Record<string, unknown>, holding: readonly unknown[] = []) =>
  projectNoticeSubject(
    testDeps({
      "GET /api/projects/p1": jsonAnswer({
        ...held,
        project: { ...held.project, ...project },
        holding,
      }),
    }).api,
    "p1",
  );

const dayHold = {
  checkpointId: "video-gate",
  stage: "video",
  waitsFor: "day",
  revisionId: "r1",
  fingerprint: "a".repeat(64),
  since: "2026-09-13T00:00:00.000Z",
};

// The watcher stays quiet for a run the page says waits for an agent (`announces`).
it("reads from the project's page whether its run waits for an agent", async () => {
  expect(await subjectOf({ waitingForAgent: true })).toMatchObject({ waitingForAgent: true });
  expect(await subjectOf({})).toMatchObject({ waitingForAgent: false });
});

// Nor for a prepared one its schedule's own hold holds until its day, by the server's rule
// (`atItsDay`): one still on its way to that hold is the person's to hear about.
it("reads from the project's page whether its day's hold holds it", async () => {
  expect(await subjectOf({ prepared: true }, [dayHold])).toMatchObject({ atItsDay: true });
  expect(await subjectOf({ prepared: true })).toMatchObject({ atItsDay: false });
  expect(await subjectOf({})).toMatchObject({ atItsDay: false });
});
