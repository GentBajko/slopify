import { afterEach, expect, it } from "vitest";
import { recoverWork } from "../rebuild/repo.js";
import { waitingReviewFixture } from "../reviews/external-repo.fake.js";
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
