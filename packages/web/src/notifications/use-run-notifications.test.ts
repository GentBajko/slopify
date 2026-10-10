import { expect, it } from "vitest";
import { body, stage } from "@/routes/project-fixtures";
import { jsonAnswer, testDeps } from "@/test-app";
import { projectNoticeSubject } from "./use-run-notifications.js";

const held = body({
  status: "pending",
  stages: [stage("article", "done"), stage("images", "pending")],
  outputs: [],
});

const subjectOf = (project: Record<string, unknown>) =>
  projectNoticeSubject(
    testDeps({
      "GET /api/projects/p1": jsonAnswer({ ...held, project: { ...held.project, ...project } }),
    }).api,
    "p1",
  );

// The watcher stays quiet for a run the page says waits for an agent (`announces`).
it("reads from the project's page whether its run waits for an agent", async () => {
  expect(await subjectOf({ waitingForAgent: true })).toMatchObject({ waitingForAgent: true });
  expect(await subjectOf({})).toMatchObject({ waitingForAgent: false });
});
