import { afterEach, expect, it } from "vitest";
import { recoverWork } from "../rebuild/repo.js";
import { waitingReviewFixture } from "../reviews/external-repo.fake.js";
import { projectHolds } from "../reviews/holds.js";
import { listProjectHeads } from "./heads.js";
import { setProjectPaused } from "./repo.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

// "While you were away" tells a pause or a stop that came again from the one it saw: each is
// counted when it happens, not read off the project's last change.
it("counts each pause and each stop a restart makes", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  const head = () => listProjectHeads(db).find((one) => one.id === "p1");
  const at = "2026-10-10T00:00:00.000Z";
  expect(head()).not.toHaveProperty("pauseCount");
  expect(head()).not.toHaveProperty("stopCount");
  setProjectPaused(db, "p1", true, at);
  setProjectPaused(db, "p1", true, at);
  expect(head()).toMatchObject({ paused: true, pauseCount: 1 });
  setProjectPaused(db, "p1", false, at);
  expect(head()).not.toHaveProperty("pauseCount");
  setProjectPaused(db, "p1", true, at);
  expect(head()).toMatchObject({ pauseCount: 2 });
  setProjectPaused(db, "p1", false, at);
  // The image step was allowed to run: the restart stops it. Already held, the next one doesn't.
  recoverWork(db);
  expect(head()).toMatchObject({ stopCount: 1 });
  recoverWork(db);
  expect(head()).toMatchObject({ stopCount: 1 });
  db.prepare("UPDATE revision_work SET dispatch_state='allowed'").run();
  recoverWork(db);
  expect(head()).toMatchObject({ stopCount: 2 });
});

// A step waiting to try again by itself is stopped by a restart like any other: only Continue the
// run starts it again, so the stop is counted.
it("counts the stop of a run whose step waits to try again by itself", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE external_reviews SET state='answered'").run();
  db.prepare(
    "UPDATE revision_work SET state='pending',dispatch_state='allowed',retry_at='2026-10-10T00:10:00.000Z'",
  ).run();
  recoverWork(db);
  expect(listProjectHeads(db).find((one) => one.id === "p1")).toMatchObject({ stopCount: 1 });
  expect(projectHolds(db, { projectId: "p1" }).stopped.has("p1")).toBe(true);
});

// A project still waiting its turn in a batch was never started: a restart leaves it queued and
// stops nothing.
it("counts no stop for a project still queued in a batch", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("INSERT INTO batches(id,created_at) VALUES ('b1','2026-10-10T00:00:00.000Z')").run();
  db.prepare(
    "INSERT INTO project_queue(project_id,batch_id,state) VALUES ('p1','b1','queued')",
  ).run();
  recoverWork(db);
  expect(listProjectHeads(db).find((one) => one.id === "p1")).not.toHaveProperty("stopCount");
});
