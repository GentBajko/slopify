import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock, manualClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Log } from "../../kernel/log.js";
import { createLimitGate, recheckMs, resetMarginMs, resumeAfterRestart } from "./limits.js";
import { limitWaitsByProject, limitWaitsOf, listingWait } from "./panel.js";

const quiet: Log = { write: () => {} };
const open: DatabaseSync[] = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close();
});

function database(): DatabaseSync {
  const db = openDb(":memory:");
  open.push(db);
  migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
  for (const id of ["p1", "p2"])
    db.exec(`INSERT INTO projects VALUES ('${id}','Run','16:9','{}','2026-09-27','2026-09-27')`);
  db.exec(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','images','generate','running'), ('s2','p2','images','generate','running')",
  );
  return db;
}

const waiter = { projectId: "p1", stage: "images" as const };

describe("the plan-limit gate", () => {
  it("lets calls through while the plan has allowance", async () => {
    const db = database();
    const gate = createLimitGate({ db, clock: manualClock(), log: quiet, changed: () => {} });
    await gate.ready("codex", waiter, new AbortController().signal);
  });

  it("waits until the stated reset plus a margin, shows the wait, then clears it", async () => {
    const db = database();
    const clock = manualClock("2026-09-27T10:00:00.000Z");
    const changed: string[] = [];
    const gate = createLimitGate({ db, clock, log: quiet, changed: (id) => changed.push(id) });
    gate.exhausted({ account: "codex", resetsAt: "2026-09-27T14:00:00.000Z" });

    const waiting = gate.ready("codex", waiter, new AbortController().signal);
    await new Promise((resolve) => setImmediate(resolve));
    expect(limitWaitsOf(db, "p1")).toEqual([
      {
        account: "codex",
        name: "Codex",
        stage: "images",
        resetsAt: "2026-09-27T14:00:00.000Z",
        retryAt: new Date(Date.parse("2026-09-27T14:00:00.000Z") + resetMarginMs).toISOString(),
      },
    ]);
    // The lists read every project's waits at once; p2 waits on nothing.
    const listed = limitWaitsByProject(db);
    expect([...listed.keys()]).toEqual(["p1"]);
    expect(listed.get("p1")?.map(listingWait)).toEqual([
      {
        name: "Codex",
        stage: "images",
        resetsAt: "2026-09-27T14:00:00.000Z",
        retryAt: "2026-09-27T14:02:00.000Z",
      },
    ]);
    // Another CLI is not held up.
    await gate.ready(
      "claude-code",
      { projectId: "p2", stage: "images" },
      new AbortController().signal,
    );

    await clock.settle(waiting);
    expect(clock.now().toISOString()).toBe("2026-09-27T14:02:00.000Z");
    expect(limitWaitsOf(db, "p1")).toEqual([]);
    expect(changed).toEqual(["p1", "p1"]);
    // The allowance is back: the next call goes straight through.
    await gate.ready("codex", waiter, new AbortController().signal);
  });

  it("checks again later when the CLI named no reset time", async () => {
    const db = database();
    const clock = manualClock("2026-09-27T10:00:00.000Z");
    const gate = createLimitGate({ db, clock, log: quiet, changed: () => {} });
    gate.exhausted({ account: "gemini", resetsAt: null });
    await clock.settle(gate.ready("gemini", waiter, new AbortController().signal));
    expect(clock.waits).toEqual([recheckMs]);
  });

  it("never moves a known reset earlier", () => {
    const db = database();
    const gate = createLimitGate({
      db,
      clock: fixedClock("2026-09-27T10:00:00.000Z"),
      log: quiet,
      changed: () => {},
    });
    gate.exhausted({ account: "codex", resetsAt: "2026-09-28T10:00:00.000Z" });
    gate.exhausted({ account: "codex", resetsAt: "2026-09-27T12:00:00.000Z" });
    expect(db.prepare("SELECT resets_at FROM plan_limit_waits").get()).toEqual({
      resets_at: "2026-09-28T10:00:00.000Z",
    });
  });

  it("ends the wait on cancel or pause without making the call", async () => {
    const db = database();
    const gate = createLimitGate({ db, clock: manualClock(), log: quiet, changed: () => {} });
    gate.exhausted({ account: "codex", resetsAt: "2026-09-27T14:00:00.000Z" });
    const controller = new AbortController();
    const waiting = gate.ready("codex", waiter, controller.signal);
    controller.abort(new Error("paused by user"));
    await expect(waiting).rejects.toThrow("paused by user");
  });
});

describe("waiting across a restart", () => {
  it("keeps waiting on the stored reset after the app starts again", async () => {
    const db = database();
    const before = createLimitGate({
      db,
      clock: fixedClock("2026-09-27T10:00:00.000Z"),
      log: quiet,
      changed: () => {},
    });
    before.exhausted({ account: "codex", resetsAt: "2026-09-27T14:00:00.000Z" });

    // A new process: a fresh gate over the same database, a little later.
    const clock = manualClock("2026-09-27T11:00:00.000Z");
    const after = createLimitGate({ db, clock, log: quiet, changed: () => {} });
    await clock.settle(after.ready("codex", waiter, new AbortController().signal));
    expect(clock.waits).toEqual([3 * 3_600_000 + resetMarginMs]);
  });

  it("resumes the projects whose stage was waiting, and only those", async () => {
    const db = database();
    const gate = createLimitGate({ db, clock: manualClock(), log: quiet, changed: () => {} });
    gate.exhausted({ account: "codex", resetsAt: "2026-09-27T14:00:00.000Z" });
    // Both projects were waiting when the app stopped; p2 was paused meanwhile.
    const stopping = new AbortController();
    const first = gate.ready("codex", waiter, stopping.signal);
    const second = gate.ready("codex", { projectId: "p2", stage: "images" }, stopping.signal);
    await new Promise((resolve) => setImmediate(resolve));
    stopping.abort(new Error("shutting down"));
    await expect(first).rejects.toThrow();
    await expect(second).rejects.toThrow();
    // What the boot does before this: running stages become failed "interrupted".
    db.exec("UPDATE stages SET state = 'failed', failure_reason = 'interrupted'");
    db.exec("INSERT INTO project_controls (project_id, paused) VALUES ('p2', 1)");

    const resumed: string[] = [];
    const count = await resumeAfterRestart(
      db,
      async (projectId) => {
        resumed.push(projectId);
        return true;
      },
      quiet,
    );
    expect(resumed).toEqual(["p1"]);
    expect(count).toBe(1);
    expect(db.prepare("SELECT count(*) AS n FROM plan_limit_waiters").get()).toEqual({ n: 0 });
    // The reset itself is still stored, so the resumed calls wait for it again.
    expect(db.prepare("SELECT account FROM plan_limit_waits").all()).toEqual([
      { account: "codex" },
    ]);
  });
});
