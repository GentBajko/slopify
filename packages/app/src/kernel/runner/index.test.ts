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

  it("keeps a stage done when its output was stored in the same instant as the cancel", async () => {
    // Cancel never rolls back a stored output. The stage decides for itself whether it got far
    // enough; the runner does not second-guess a clean resolve.
    const finishesAnyway: StageRun = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 2));
    };
    const { runner, stages, events } = harness(
      { video: finishesAnyway },
      {
        research: "skipped",
        article: "provided",
        audio: "provided",
        images: "provided",
        thumbnail: "skipped",
      },
    );

    runner.tick("p1");
    await runner.abortAll();

    expect(stages.stateOf("video")).toBe("done");
    expect(states(events)).toEqual(["video:running", "video:done"]);
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

describe("running.count", () => {
  it("still returns to zero when the tick after a stage throws", async () => {
    // stagesOf parses every row, so a schema surprise or a closed database throws out of
    // tick. The tally is replayed to every page that opens later, so it must not stick.
    const stages = store({ research: "skipped", article: "provided" });
    let reads = 0;
    const events: ProjectEvent[] = [];
    const counts: number[] = [];
    const runner = createRunner({
      stages: {
        ...stages,
        stagesOf: (projectId) => {
          reads += 1;
          // The first tick reads twice (eligibility, then the project state); the read
          // after that is the one the finishing stage's finally makes.
          if (reads > 2) {
            throw new Error("database is not open");
          }
          return stages.stagesOf(projectId);
        },
      },
      runs: { audio: async (): Promise<void> => {}, images: ok, thumbnail: ok },
      emit: (_projectId, event) => {
        events.push(event);
      },
      emitRunningCount: (count) => {
        counts.push(count);
      },
      log,
    });

    runner.tick("p1");
    await runner.settled();

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

  it("resolves without waiting out a stage the shutdown never started", async () => {
    let releaseAudio = (): void => {};
    const audioDone = new Promise<void>((resolve) => {
      releaseAudio = resolve;
    });
    const started: StageKind[] = [];
    const waits: StageRun = ({ stage, signal }) =>
      new Promise<void>((resolve, reject) => {
        started.push(stage.kind);
        if (stage.kind === "audio") {
          void audioDone.then(resolve);
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    // A registry where every downstream stage would block forever if it ever started.
    const { runner, stages } = harness(
      { audio: waits, images: waits, thumbnail: waits, video: waits },
      { research: "skipped", article: "provided", images: "provided", thumbnail: "skipped" },
    );

    runner.tick("p1");
    const stopping = runner.abortAll();
    releaseAudio();

    // Without the barrier, audio's finally would have released video, whose controller
    // abortAll had already passed, and this await would never return.
    await expect(stopping).resolves.toBeUndefined();
    expect(started).toEqual(["audio"]);
    expect(stages.stateOf("video")).toBe("pending");
  });

  it("does nothing when no stage is running", async () => {
    const { runner } = harness({});

    await expect(runner.abortAll()).resolves.toBeUndefined();
  });
});

describe("abortProject", () => {
  // Other projects are untouched, so the barrier and the aborts are both per project and this
  // store carries more than one.
  interface Rows {
    readonly store: StageStore;
    readonly stateOf: (stageId: string) => StageState;
  }

  function rowsFor(
    projects: readonly string[],
    initial: Partial<Record<StageKind, StageState>> = {},
  ): Rows {
    const rows: RunnerStage[] = projects.flatMap((projectId) =>
      stageKinds.map((kind) => ({
        id: `${projectId}:${kind}`,
        projectId,
        kind,
        state: initial[kind] ?? "pending",
      })),
    );
    const replace = (id: string, state: StageState): void => {
      const at = rows.findIndex((row) => row.id === id);
      const row = rows[at];
      if (row !== undefined) {
        rows[at] = { ...row, state };
      }
    };
    return {
      store: {
        stagesOf: (projectId) => rows.filter((row) => row.projectId === projectId),
        claim: (stageId) => {
          if (rows.find((row) => row.id === stageId)?.state !== "pending") {
            return false;
          }
          replace(stageId, "running");
          return true;
        },
        finish: (stageId, state) => {
          replace(stageId, state);
        },
      },
      stateOf: (stageId) => rows.find((row) => row.id === stageId)?.state ?? "pending",
    };
  }

  function runnerOver(rows: Rows, runs: Partial<Record<StageKind, StageRun>>): Runner {
    return createRunner({
      stages: rows.store,
      runs,
      emit: (): void => {},
      emitRunningCount: (): void => {},
      log,
    });
  }

  const ends: Partial<Record<StageKind, StageState>> = {
    research: "skipped",
    article: "provided",
    audio: "provided",
    images: "provided",
    thumbnail: "skipped",
  };

  it("stops the project it names and leaves every other project running", async () => {
    const rows = rowsFor(["p1", "p2"], ends);
    const held: StageRun = ({ signal }) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    const runner = runnerOver(rows, { video: held });

    runner.tick("p1");
    runner.tick("p2");
    await runner.abortProject("p1");

    expect(rows.stateOf("p1:video")).toBe("canceled");
    expect(rows.stateOf("p2:video")).toBe("running");
    await runner.abortAll();
  });

  // The barrier: the stage stays `done`, and the hand-over its own tick would have made
  // must not start the video under a controller the cancel never touched.
  it("keeps a stage that finished during the cancel done and starts no dependent", async () => {
    const rows = rowsFor(["p1"], {
      research: "skipped",
      article: "provided",
      thumbnail: "skipped",
    });
    const started: StageKind[] = [];
    const finishes: StageRun = async ({ stage }): Promise<void> => {
      started.push(stage.kind);
      await new Promise((resolve) => setTimeout(resolve, 2));
    };
    const runner = runnerOver(rows, { audio: finishes, images: finishes, video: finishes });

    runner.tick("p1");
    await runner.abortProject("p1");

    expect(rows.stateOf("p1:audio")).toBe("done");
    expect(rows.stateOf("p1:images")).toBe("done");
    expect(rows.stateOf("p1:video")).toBe("pending");
    expect(started).toEqual(["audio", "images"]);
  });

  // A canceled project never resumes on its own, but Retry does resume it - so the
  // barrier is only up for as long as the cancel takes.
  it("lets a later tick start the stage a retry made pending", async () => {
    const rows = rowsFor(["p1"], ends);
    const runner = runnerOver(rows, { video: ok });

    await runner.abortProject("p1");
    runner.tick("p1");
    await runner.settled();

    expect(rows.stateOf("p1:video")).toBe("done");
  });

  it("does nothing when the project has nothing in flight", async () => {
    const rows = rowsFor(["p1"], ends);
    const runner = runnerOver(rows, {});

    await expect(runner.abortProject("p1")).resolves.toBeUndefined();
    expect(rows.stateOf("p1:video")).toBe("pending");
  });
});
