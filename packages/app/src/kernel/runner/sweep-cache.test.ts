import { describe, expect, it } from "vitest";
import type { Log } from "../log.js";
import type { StageKind, StageState } from "../pipeline.js";
import { stageKinds } from "../pipeline.js";
import type { RunnerStage, StageRun } from "./index.js";
import { createRunner } from "./index.js";
import type { StageRunResult, WorkRef } from "./work.js";

// A sweep asks every pending stage whether it is ready, and each answer used to be worked out
// from scratch: the revision read back off disk (a stat for every output and every piece), the
// article re-read, every recipe re-derived from the narration up. Twelve images hid it; 240
// work items meant tens of thousands of rebuilds and the server stopped answering. The sweep
// now hands `ready` scratch space it keeps for that one sweep, so the work happens once —
// and a fresh one each sweep, so a step that has just finished is still seen.

const log: Log = { write: (): void => {} };
const ok: StageRun = async (): Promise<StageRunResult> => "done";

function work(kind: StageKind): WorkRef {
  return {
    projectId: "p1",
    kind,
    stageId: kind,
    revisionId: "r1",
    workId: `p1-${kind}-r1`,
    fingerprint: kind,
  };
}

function runnerWith(
  onReady: (work: WorkRef, pass?: Map<string, unknown>) => void,
  allow: () => boolean = () => true,
) {
  const rows: RunnerStage[] = stageKinds.map((kind) => ({
    work: work(kind),
    id: kind,
    projectId: "p1",
    kind,
    state: (kind === "document" ? "skipped" : "pending") as StageState,
  }));
  const replace = (id: string, state: StageState): void => {
    const at = rows.findIndex((row) => row.id === id);
    const row = rows[at];
    if (row !== undefined) rows[at] = { ...row, state };
  };
  return createRunner({
    stages: {
      stagesOf: () => rows,
      maySubmit: () => true,
      ready: (one, pass) => {
        onReady(one, pass);
        return allow();
      },
      claim: ({ stageId }) => {
        if (rows.find((row) => row.id === stageId)?.state !== "pending") return false;
        replace(stageId, "running");
        return true;
      },
      finish: ({ stageId }, state) => {
        replace(stageId, state);
      },
    },
    runs: Object.fromEntries(stageKinds.map((kind) => [kind, ok])),
    emit: () => {},
    emitRunningCount: () => {},
    log,
  });
}

describe("an eligibility sweep", () => {
  it("hands every stage in one sweep the same scratch space", async () => {
    const seen: (Map<string, unknown> | undefined)[] = [];
    const runner = runnerWith((_one, pass) => seen.push(pass));
    runner.tick("p1");
    await runner.settled();
    runner.tick("p1");
    await runner.settled();
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every((one) => one !== undefined)).toBe(true);
    // Whatever a sweep asked, it asked with one Map; a later sweep brings its own.
    expect(new Set(seen).size).toBeLessThan(seen.length);
  });

  it("gives each sweep a fresh one, so finished work is not read from a stale plan", async () => {
    const seen: (Map<string, unknown> | undefined)[] = [];
    let allow = false;
    const runner = runnerWith(
      (_one, pass) => {
        pass?.set("planned", true);
        seen.push(pass);
      },
      () => allow,
    );
    // A sweep that releases nothing still asks, and fills its own scratch space.
    runner.tick("p1");
    await runner.settled();
    const first = new Set(seen);
    expect(first.size).toBe(1);
    allow = true;
    runner.tick("p1");
    await runner.settled();
    const sweeps = new Set(seen);
    // The second sweep did not reuse the first's: a step finished in between.
    expect(sweeps.size).toBeGreaterThan(1);
    for (const one of sweeps) expect(one?.get("planned")).toBe(true);
  });
});
