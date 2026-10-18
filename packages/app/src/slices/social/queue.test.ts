import { afterEach, describe, expect, it } from "vitest";
import { expireWaiting, takeNext } from "./queue.js";
import { readPost, writeProgress } from "./repo.js";
import { socialDb } from "./social.fake.js";
import { noProgress } from "./state.js";

const now = new Date("2026-10-18T10:00:00.000Z");
let db = socialDb([{ id: "p1" }, { id: "p2" }]);
afterEach(() => {
  db.close();
  db = socialDb([{ id: "p1" }, { id: "p2" }]);
});
const wait = (projectId: string, platform: "x" | "instagram", at: string) =>
  writeProgress(
    db,
    { projectId, platform },
    { ...noProgress, state: "waiting", waitingAt: at },
    now,
  );

describe("takeNext", () => {
  it("takes the oldest waiting post of the site and marks it filling", () => {
    wait("p2", "x", "2026-10-18T09:00:00.000Z");
    wait("p1", "x", "2026-10-18T09:30:00.000Z");
    wait("p1", "instagram", "2026-10-18T08:00:00.000Z");
    const next = takeNext(db, "x", now, () => true);
    expect(next?.post.projectId).toBe("p2");
    expect(next?.waiting).toBe(1);
    expect(readPost(db, { projectId: "p2", platform: "x" }).state).toBe("filling");
    expect(takeNext(db, "x", now, () => true)?.post.projectId).toBe("p1");
    expect(takeNext(db, "x", now, () => true)).toBeUndefined();
  });

  it("takes only the named project's post when the tab names one", () => {
    wait("p2", "x", "2026-10-18T09:00:00.000Z");
    wait("p1", "x", "2026-10-18T09:30:00.000Z");
    expect(takeNext(db, "x", now, () => true, "p1")?.post.projectId).toBe("p1");
    expect(readPost(db, { projectId: "p2", platform: "x" }).state).toBe("waiting");
    expect(takeNext(db, "x", now, () => true, "p1")).toBeUndefined();
  });

  it("skips a post that isn't ready yet", () => {
    wait("p1", "instagram", "2026-10-18T09:00:00.000Z");
    expect(takeNext(db, "instagram", now, () => false)).toBeUndefined();
    expect(readPost(db, { projectId: "p1", platform: "instagram" }).state).toBe("waiting");
  });
});

describe("expireWaiting", () => {
  it("stops a post waiting over a day, saying what to do", () => {
    wait("p1", "x", "2026-10-17T09:59:00.000Z");
    wait("p2", "x", "2026-10-17T10:01:00.000Z");
    expireWaiting(db, now, () => false);
    const stale = readPost(db, { projectId: "p1", platform: "x" });
    expect(stale.state).toBe("failed");
    expect(stale.message).toMatch(/waited a day .* press Fill in X again\./);
    expect(readPost(db, { projectId: "p2", platform: "x" }).state).toBe("waiting");
  });

  it("leaves a post that waits for its release time", () => {
    wait("p1", "instagram", "2026-10-10T09:00:00.000Z");
    expireWaiting(db, now, () => true);
    expect(readPost(db, { projectId: "p1", platform: "instagram" }).state).toBe("waiting");
  });
});
