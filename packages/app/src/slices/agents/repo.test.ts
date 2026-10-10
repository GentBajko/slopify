import { afterEach, expect, it } from "vitest";
import { waitingReviewFixture } from "../reviews/external-repo.fake.js";
import { listRevisionHistory } from "../revisions/repo.js";
import {
  agentActionsOf,
  lastStarter,
  recentAgentActions,
  recordAgentAction,
  recordStart,
} from "./repo.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const action = (
  id: string,
  projectId: string | null,
  at: string,
  revisionId: string | null = null,
) => ({
  id,
  projectId,
  scheduleId: null,
  tool: projectId === null ? "set_notification_url" : "resume_project",
  title: projectId === null ? "Save the Notification URL" : "Continue the run",
  revisionId,
  createdAt: at,
});

it("records an agent's actions newest first, keeps one on a deleted project without it, and marks the version it saved", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  recordAgentAction(db, action("a1", "p1", "2026-09-10T00:01:00.000Z"));
  recordAgentAction(db, action("a2", "p1", "2026-09-10T00:02:00.000Z", f.revisionId));
  recordAgentAction(db, action("a3", "gone", "2026-09-10T00:03:00.000Z"));
  recordAgentAction(db, action("a4", null, "2026-09-10T00:04:00.000Z"));
  expect(agentActionsOf(db, "p1").map((one) => one.id)).toEqual(["a2", "a1"]);
  expect(listRevisionHistory(db, "p1").map((revision) => revision.byAgent)).toEqual([true]);
  expect(recentAgentActions(db).map((one) => [one.id, one.projectId, one.subject])).toEqual([
    ["a4", null, null],
    ["a3", null, null],
    ["a2", "p1", "Saved"],
    ["a1", "p1", "Saved"],
  ]);
});

it("remembers who last started a project's work", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  expect(lastStarter(db, "p1")).toBeNull();
  recordStart(db, { projectId: "p1", actor: "agent", at: "t1" });
  expect(lastStarter(db, "p1")).toBe("agent");
  recordStart(db, { projectId: "p1", actor: "person", at: "t2" });
  expect(lastStarter(db, "p1")).toBe("person");
});

it("lists only the latest 20 changes on the Agents list", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  for (let minute = 1; minute <= 21; minute++)
    recordAgentAction(
      db,
      action(
        `a${String(minute)}`,
        "p1",
        `2026-09-10T00:${String(minute).padStart(2, "0")}:00.000Z`,
      ),
    );
  const listed = recentAgentActions(db).map((one) => one.id);
  expect(listed).toHaveLength(20);
  expect(listed[0]).toBe("a21");
  expect(listed).not.toContain("a1");
  expect(agentActionsOf(db, "p1")).toHaveLength(21);
});

it("records a call sent again with its idempotencyKey once, and still fails loudly on anything else", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  recordAgentAction(db, action("a1", "p1", "2026-09-10T00:01:00.000Z"), "key-1");
  recordAgentAction(db, action("a2", "p1", "2026-09-10T00:02:00.000Z"), "key-1");
  expect(agentActionsOf(db, "p1").map((one) => one.id)).toEqual(["a1"]);
  // The same row id twice is a bug, not a replay.
  expect(() =>
    recordAgentAction(db, action("a1", "p1", "2026-09-10T00:03:00.000Z"), "key-2"),
  ).toThrow(/UNIQUE constraint failed: agent_actions\.id/);
});
