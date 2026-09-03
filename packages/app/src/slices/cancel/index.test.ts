import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { stagesOf } from "../admission/repo.js";
import type { CancelDeps } from "./index.js";
import { canceledByUser, cancelProject } from "./index.js";

// `logic/13` from the slice's side: the abort is the runner's, and what is left on the
// rows afterwards is this module's.

const silent: Log = { write: (): void => {} };
const projectId = "p1";
const clock = fixedClock("2026-09-03T09:00:00.000Z");

interface Harness {
  readonly db: DatabaseSync;
  readonly events: ProjectEvent[];
  readonly deps: CancelDeps;
  readonly stateOf: (kind: StageKind) => StageState;
}

// `abort` stands in for the runner: it is what the aborted stages' own unwinding writes.
function harness(
  states: Partial<Record<StageKind, StageState>>,
  abort: (db: DatabaseSync) => void = concludes,
): Harness {
  const db = openDb(join(mkdtempSync(join(tmpdir(), "slopify-cancel-")), "test.db"));
  migrate(db, clock);
  db.prepare("INSERT INTO projects VALUES (?, 'Rope', '16:9', '{}', ?, ?)").run(
    projectId,
    "2026-09-03",
    "2026-09-03",
  );
  for (const kind of stageKinds) {
    db.prepare(
      "INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, ?, ?, 'generate', ?)",
    ).run(`s-${kind}`, projectId, kind, states[kind] ?? "pending");
  }
  const events: ProjectEvent[] = [];
  return {
    db,
    events,
    stateOf: (kind) =>
      stagesOf(db, projectId).find((stage) => stage.kind === kind)?.state ?? "pending",
    deps: {
      db,
      clock,
      log: silent,
      abort: (): Promise<void> => {
        abort(db);
        return Promise.resolve();
      },
      emit: (_projectId, event) => {
        events.push(event);
      },
    },
  };
}

// The runner's own answer to an aborted stage: `canceled` with §Q111's reason.
function concludes(db: DatabaseSync): void {
  db.prepare(
    "UPDATE stages SET state = 'canceled', failure_reason = ? WHERE state = 'running'",
  ).run(canceledByUser);
}

describe("cancelProject", () => {
  // Step 3: "mark each `running` stage `canceled`; `pending` stages stay `pending`; the
  // project reads `canceled`".
  it("reports the stages it stopped and leaves the pending ones pending", async () => {
    const h = harness({ audio: "running", images: "running", article: "done" });

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: ["audio", "images"], state: "canceled" });
    expect(h.stateOf("video")).toBe("pending");
    expect(h.stateOf("article")).toBe("done");
  });

  // §Q113: "a stage whose output was stored in the same instant as the cancel stays
  // `done`; cancel never rolls back a stored output".
  it("does not count a stage that finished while the cancel was landing", async () => {
    const h = harness({ audio: "running", images: "running" }, (db) => {
      db.prepare("UPDATE stages SET state = 'done' WHERE kind = 'audio'").run();
      concludes(db);
    });

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: ["images"], state: "canceled" });
    expect(h.stateOf("audio")).toBe("done");
  });

  // Step 4: "a second click is a no-op".
  it("changes nothing and aborts nothing when the project is not running", async () => {
    let aborts = 0;
    const h = harness({ audio: "canceled", article: "done" }, () => {
      aborts += 1;
    });

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: [], state: "canceled" });
    expect(aborts).toBe(0);
    expect(h.events).toEqual([]);
  });

  // The invariant of step 3: "after cancel completes no stage of the project is
  // `running`" - true even when the runner could not write the row itself.
  it("marks a stage the runner left running and tells the page about it", async () => {
    const h = harness({ audio: "running" }, () => {});

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: ["audio"], state: "canceled" });
    expect(h.events).toEqual([
      {
        type: "stage.state",
        projectId,
        stage: "audio",
        state: "canceled",
        failureReason: canceledByUser,
      },
      { type: "project.state", projectId, state: "canceled" },
    ]);
  });

  // The runner announced the state it left the project in; saying it again would tell
  // every open page the same thing twice.
  it("stays quiet when the runner already wrote every row", async () => {
    const h = harness({ audio: "running" });

    await cancelProject(h.deps, projectId);

    expect(h.events).toEqual([]);
  });

  it("answers no-project for an id that has none", async () => {
    const h = harness({ audio: "running" });

    await expect(cancelProject(h.deps, "nope")).resolves.toEqual({
      ok: false,
      reason: "no-project",
    });
  });
});
