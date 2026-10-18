import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import {
  claimNextJob,
  enqueueJob,
  queuedJob,
  recoverJobs,
  runningJob,
  type SampleJob,
} from "./jobs.js";
import { createSampleRunner } from "./runner.js";

const open: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of open.splice(0).reverse()) await close();
});

function database(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
  for (const id of ["t1", "t2"])
    db.prepare(
      "INSERT INTO project_templates (id,head_version,creation_hash,created_at) VALUES (?,1,'h','a')",
    ).run(id);
  open.push(() => db.close());
  return db;
}

const job = (
  templateId: string,
  templateVersion: number,
  at: string,
  kind: SampleJob["kind"] = "save",
): SampleJob => ({
  templateId,
  templateVersion,
  ackHigh: 0.4,
  kind,
  requestedAt: at,
});

function gate(): { readonly promise: Promise<void>; readonly open: () => void } {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, open: release };
}

describe("sample jobs", () => {
  it("lets a newer request take the place of the queued one", () => {
    const db = database();
    enqueueJob(db, job("t1", 2, "a"));
    enqueueJob(db, job("t1", 3, "b"));
    expect(queuedJob(db, "t1")).toMatchObject({ templateVersion: 3, requestedAt: "b" });
  });

  it("never lets a free-only request replace a queued paid one of the same version", () => {
    const db = database();
    enqueueJob(db, job("t1", 2, "a"));
    enqueueJob(db, job("t1", 2, "b", "free"));
    expect(queuedJob(db, "t1")).toMatchObject({ kind: "save", requestedAt: "a" });
    enqueueJob(db, job("t1", 3, "c", "free"));
    expect(queuedJob(db, "t1")).toMatchObject({ kind: "free", templateVersion: 3 });
  });

  it("claims one job at a time across every template, oldest first", () => {
    const db = database();
    enqueueJob(db, job("t2", 1, "b"));
    enqueueJob(db, job("t1", 1, "a"));
    expect(claimNextJob(db)?.templateId).toBe("t1");
    expect(claimNextJob(db)).toBeUndefined();
  });

  it("keeps a newer request waiting behind the running job of its template", () => {
    const db = database();
    enqueueJob(db, job("t1", 1, "a"));
    claimNextJob(db);
    enqueueJob(db, job("t1", 2, "b"));
    expect(runningJob(db)).toMatchObject({ templateVersion: 1 });
    expect(queuedJob(db, "t1")).toMatchObject({ templateVersion: 2 });
  });

  it("queues an interrupted job again at start, unless a newer one waits", () => {
    const db = database();
    enqueueJob(db, job("t1", 1, "a"));
    claimNextJob(db);
    recoverJobs(db);
    expect(queuedJob(db, "t1")).toMatchObject({ templateVersion: 1 });
    claimNextJob(db);
    enqueueJob(db, job("t1", 2, "b"));
    recoverJobs(db);
    expect(runningJob(db)).toBeUndefined();
    expect(queuedJob(db, "t1")).toMatchObject({ templateVersion: 2 });
  });
});

describe("createSampleRunner", () => {
  function runner(db: DatabaseSync, make: (job: SampleJob, signal: AbortSignal) => Promise<void>) {
    const changed: string[] = [];
    const logged: string[] = [];
    const loop = createSampleRunner({
      db,
      log: { write: (_level, _event, fields) => logged.push(fields?.detail ?? "") },
      make,
      changed: (id) => changed.push(id),
    });
    open.push(() => loop.stop());
    return { loop, changed, logged };
  }

  it("makes each queued job in turn and tells the studio before and after", async () => {
    const db = database();
    const made: string[] = [];
    const { loop, changed } = runner(db, async (one) => {
      made.push(`${one.templateId}@${String(one.templateVersion)}`);
    });
    enqueueJob(db, job("t1", 1, "a"));
    enqueueJob(db, job("t2", 1, "b"));
    loop.start();
    await loop.idle();
    expect(made).toEqual(["t1@1", "t2@1"]);
    expect(changed).toEqual(["t1", "t1", "t2", "t2"]);
    expect(runningJob(db)).toBeUndefined();
  });

  it("finishes the running job before the newer Save of the same template", async () => {
    const db = database();
    const first = gate();
    const made: number[] = [];
    let aborted = false;
    const { loop } = runner(db, async (one, signal) => {
      made.push(one.templateVersion);
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      if (one.templateVersion === 1) await first.promise;
    });
    enqueueJob(db, job("t1", 1, "a"));
    loop.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    enqueueJob(db, job("t1", 2, "b"));
    loop.wake();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(made).toEqual([1]);
    first.open();
    await loop.idle();
    expect(made).toEqual([1, 2]);
    expect(aborted).toBe(false);
  });

  it("logs a job that fails and goes on with the next", async () => {
    const db = database();
    const { loop, logged } = runner(db, async (one) => {
      if (one.templateId === "t1") throw new Error("ffmpeg stopped");
    });
    enqueueJob(db, job("t1", 1, "a"));
    enqueueJob(db, job("t2", 1, "b"));
    loop.start();
    await loop.idle();
    expect(logged).toEqual(["The sample job of template t1 version 1 stopped: ffmpeg stopped"]);
    expect(runningJob(db)).toBeUndefined();
  });

  it("stops at shutdown, aborting a local render and keeping its job for the next start", async () => {
    const db = database();
    let seen: AbortSignal | undefined;
    const { loop } = runner(
      db,
      (_one, signal) =>
        new Promise((_resolve, reject) => {
          seen = signal;
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    enqueueJob(db, job("t1", 1, "a"));
    loop.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await loop.stop();
    expect(seen?.aborted).toBe(true);
    expect(runningJob(db)).toMatchObject({ templateId: "t1" });
    recoverJobs(db);
    expect(queuedJob(db, "t1")).toMatchObject({ templateVersion: 1 });
  });

  it("picks up a job queued while it waited, once woken", async () => {
    const db = database();
    const made: string[] = [];
    const { loop } = runner(db, async (one) => {
      made.push(one.templateId);
    });
    loop.start();
    await loop.idle();
    enqueueJob(db, job("t2", 1, "a"));
    loop.wake();
    await loop.idle();
    expect(made).toEqual(["t2"]);
  });
});
