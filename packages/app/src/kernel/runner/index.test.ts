import { describe, expect, it } from "vitest";
import type { ProjectEvent } from "../events.js";
import type { Log } from "../log.js";
import type { StageKind, StageState } from "../pipeline.js";
import { stageKinds } from "../pipeline.js";
import type { Runner, RunnerStage, StageRun, StageStore } from "./index.js";
import { createRunner } from "./index.js";

const log: Log = { write: (): void => {} };

interface Store extends StageStore {
  readonly rows: RunnerStage[];
  readonly claims: string[];
  readonly stateOf: (kind: StageKind) => StageState;
  readonly reasonOf: (kind: StageKind) => string | null;
}

function store(initial: Partial<Record<StageKind, StageState>> = {}): Store {
  const rows: RunnerStage[] = stageKinds.map((kind) => ({
    id: kind,
    projectId: "p1",
    kind,
    state: initial[kind] ?? "pending",
  }));
  const reasons = new Map<string, string | null>();
  const claims: string[] = [];
  const replace = (id: string, state: StageState): void => {
    const at = rows.findIndex((row) => row.id === id);
    const row = rows[at];
    if (row !== undefined) {
      rows[at] = { ...row, state };
    }
  };
  return {
    rows,
    claims,
    stagesOf: (projectId) => rows.filter((row) => row.projectId === projectId),
    claim: (stageId) => {
      claims.push(stageId);
      // The single statement the real store runs: it only fires while the row is pending.
      if (rows.find((row) => row.id === stageId)?.state !== "pending") {
        return false;
      }
      replace(stageId, "running");
      return true;
    },
    finish: (stageId, state, failureReason) => {
      replace(stageId, state);
      reasons.set(stageId, failureReason);
    },
    stateOf: (kind) => rows.find((row) => row.kind === kind)?.state ?? "pending",
    reasonOf: (kind) => reasons.get(kind) ?? null,
  };
}

interface Harness {
  readonly runner: Runner;
  readonly events: ProjectEvent[];
  readonly counts: number[];
  readonly stages: Store;
}

function harness(
  runs: Partial<Record<StageKind, StageRun>>,
  initial: Partial<Record<StageKind, StageState>> = {},
): Harness {
  const stages = store(initial);
  const events: ProjectEvent[] = [];
  const counts: number[] = [];
  const runner = createRunner({
    stages,
    runs,
    emit: (_projectId, event) => {
      events.push(event);
    },
    emitRunningCount: (count) => {
      counts.push(count);
    },
    log,
  });
  return { runner, events, counts, stages };
}

const ok: StageRun = async (): Promise<void> => {};

function states(events: readonly ProjectEvent[]): string[] {
  return events
    .filter((event) => event.type === "stage.state")
    .map((event) => `${event.stage}:${event.state}`);
}

function projectStates(events: readonly ProjectEvent[]): string[] {
  return events.filter((event) => event.type === "project.state").map((event) => event.state);
}

describe("tick", () => {
  it("walks the graph from research to video, one stage releasing the next", async () => {
    const { runner, events, stages } = harness({
      research: ok,
      article: ok,
      audio: ok,
      images: ok,
      thumbnail: ok,
      video: ok,
    });

    runner.tick("p1");
    await runner.settled();

    expect(stages.rows.every((row) => row.state === "done")).toBe(true);
    expect(states(events).slice(0, 4)).toEqual([
      "research:running",
      "research:done",
      "article:running",
      "article:done",
    ]);
    expect(states(events).slice(-2)).toEqual(["video:running", "video:done"]);
  });

  it("starts audio, images, and thumbnail together rather than one after another", async () => {
    let live = 0;
    let peak = 0;
    const concurrent: StageRun = async (): Promise<void> => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => setTimeout(resolve, 5));
      live -= 1;
    };
    const { runner } = harness(
      { audio: concurrent, images: concurrent, thumbnail: concurrent, video: ok },
      { research: "skipped", article: "provided" },
    );

    runner.tick("p1");
    await runner.settled();

    expect(peak).toBe(3);
  });

  it("starts a stage once even when several ticks race its own completion", async () => {
    const started: StageKind[] = [];
    const counted: StageRun = async ({ stage }): Promise<void> => {
      started.push(stage.kind);
      // Ticks land while this stage is in flight, and once more from its own finally.
      await new Promise((resolve) => setTimeout(resolve, 1));
    };
    const { runner, stages } = harness({
      research: counted,
      article: counted,
      audio: counted,
      images: counted,
      thumbnail: counted,
      video: counted,
    });

    runner.tick("p1");
    for (let n = 0; n < 20; n += 1) {
      runner.tick("p1");
    }
    const storm = setInterval(() => {
      runner.tick("p1");
    }, 1);
    await runner.settled();
    clearInterval(storm);

    // Six starts for six stages: the in-flight set turned every extra tick away.
    expect(started.sort()).toEqual([...stageKinds].sort());
    expect(stages.claims).toEqual([...stageKinds]);
  });

  it("starts a stage once even when the stage list it reads is stale", async () => {
    // The second guard on its own: this store keeps reporting every stage as pending, as
    // a snapshot taken before a sibling tick claimed the row would, so only `claim` can
    // refuse the duplicate.
    const stale = store();
    const honest = stale.claim;
    const frozen = stale.stagesOf("p1").map((row) => ({ ...row }));
    const started: StageKind[] = [];
    const runner = createRunner({
      stages: {
        stagesOf: () => frozen,
        claim: honest,
        finish: stale.finish,
      },
      runs: {
        research: async ({ stage }): Promise<void> => {
          started.push(stage.kind);
          await new Promise((resolve) => setTimeout(resolve, 2));
        },
      },
      emit: (): void => {},
      emitRunningCount: (): void => {},
      log,
    });

    for (let n = 0; n < 10; n += 1) {
      runner.tick("p1");
    }
    await runner.settled();
    for (let n = 0; n < 5; n += 1) {
      runner.tick("p1");
    }
    await runner.settled();

    expect(started).toEqual(["research"]);
    // Refused every time after the first, which is the only reason it ran once.
    expect(stale.claims.length).toBeGreaterThan(1);
    expect(stale.stateOf("research")).toBe("done");
  });

  it("releases a dependent on provided and skipped exactly as on done", async () => {
    const { runner, stages } = harness(
      { video: ok },
      {
        research: "skipped",
        article: "provided",
        audio: "provided",
        images: "provided",
        thumbnail: "skipped",
      },
    );

    runner.tick("p1");
    await runner.settled();

    expect(stages.stateOf("video")).toBe("done");
  });

  it("leaves a dependent pending when its dependency failed", async () => {
    const { runner, stages } = harness(
      {
        audio: async (): Promise<void> => {
          throw new Error("the narration provider said no");
        },
        images: ok,
        thumbnail: ok,
        video: ok,
      },
      { research: "skipped", article: "provided" },
    );

    runner.tick("p1");
    await runner.settled();

    expect(stages.stateOf("audio")).toBe("failed");
    expect(stages.reasonOf("audio")).toBe("the narration provider said no");
    expect(stages.stateOf("images")).toBe("done");
    expect(stages.stateOf("video")).toBe("pending");
  });

  it("fails a pending stage loudly when no implementation is registered", async () => {
    const { runner, stages } = harness(
      {},
      {
        research: "skipped",
        article: "provided",
        audio: "provided",
        images: "provided",
        thumbnail: "skipped",
      },
    );

    runner.tick("p1");
    await runner.settled();

    expect(stages.stateOf("video")).toBe("failed");
    expect(stages.reasonOf("video")).toBe("no implementation is registered for the video stage");
  });

  it("never starts a provided or skipped stage", async () => {
    const { runner, stages } = harness(
      { research: ok, article: ok, audio: ok, images: ok, thumbnail: ok, video: ok },
      { research: "skipped", article: "provided", audio: "provided" },
    );

    runner.tick("p1");
    await runner.settled();

    expect(stages.claims).not.toContain("research");
    expect(stages.claims).not.toContain("article");
    expect(stages.claims).not.toContain("audio");
    expect(stages.stateOf("article")).toBe("provided");
  });
});

describe("project.state", () => {
  it("announces running once and done once, and nothing in between", async () => {
    const { runner, events } = harness(
      { video: ok },
      {
        research: "skipped",
        article: "provided",
        audio: "provided",
        images: "provided",
        thumbnail: "skipped",
      },
    );

    runner.tick("p1");
    await runner.settled();

    expect(projectStates(events)).toEqual(["running", "done"]);
  });

  it("announces failed when a stage failed and canceled takes precedence", async () => {
    const { runner, events } = harness(
      {
        audio: async (): Promise<void> => {
          throw new Error("boom");
        },
        images: ok,
        thumbnail: ok,
      },
      { research: "skipped", article: "provided", video: "canceled" },
    );

    runner.tick("p1");
    await runner.settled();

    expect(projectStates(events).at(-1)).toBe("canceled");
  });
});

describe("running.count", () => {
  it("reports the tally only when it changes", async () => {
    const slow: StageRun = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    };
    const { runner, counts } = harness(
      { audio: slow, images: slow, thumbnail: slow, video: slow },
      { research: "skipped", article: "provided" },
    );

    runner.tick("p1");
    await runner.settled();

    // The tally counts projects, not stages: three siblings in flight are still one,
    // and handing over to the video stage never drops it back to zero.
    expect(counts).toEqual([1, 0]);
  });
});

describe("abortAll", () => {
  it("cancels every stage in flight and waits for them to settle", async () => {
    const waits: StageRun = ({ signal }) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const { runner, stages, events } = harness(
      { audio: waits, images: waits, thumbnail: waits },
      { research: "skipped", article: "provided" },
    );

    runner.tick("p1");
    await runner.abortAll();

    for (const kind of ["audio", "images", "thumbnail"] as const) {
      expect(stages.stateOf(kind)).toBe("canceled");
      expect(stages.reasonOf(kind)).toBe("canceled by user");
    }
    expect(projectStates(events).at(-1)).toBe("canceled");
  });

  it("never starts a stage that a sibling released as the shutdown landed", async () => {
    let releaseThumbnail = (): void => {};
    const finishes = new Promise<void>((resolve) => {
      releaseThumbnail = resolve;
    });
    const started: StageKind[] = [];
    const waits: StageRun = ({ stage, signal }) =>
      new Promise<void>((resolve, reject) => {
        started.push(stage.kind);
        if (stage.kind === "thumbnail") {
          void finishes.then(resolve);
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const { runner, stages } = harness(
      { audio: waits, images: waits, thumbnail: waits, video: waits },
      { research: "skipped", article: "provided" },
    );

    runner.tick("p1");
    const stopping = runner.abortAll();
    // The thumbnail wins the race and completes cleanly; its finally ticks the project.
    releaseThumbnail();
    await stopping;

    expect(started).not.toContain("video");
    expect(stages.stateOf("video")).toBe("pending");
    expect(stages.stateOf("thumbnail")).toBe("done");
  });

  it("does nothing when no stage is running", async () => {
    const { runner } = harness({});

    await expect(runner.abortAll()).resolves.toBeUndefined();
  });
});
