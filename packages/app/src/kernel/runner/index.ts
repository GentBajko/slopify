import type { EmitProject, ProjectEvent } from "../events.js";
import type { Log } from "../log.js";
import type { ProjectState, StageKind, StageState } from "../pipeline.js";
import { derive, deps as graph, satisfied } from "./graph.js";

export interface RunnerStage {
  readonly id: string;
  readonly projectId: string;
  readonly kind: StageKind;
  readonly state: StageState;
}

export interface StageStore {
  readonly stagesOf: (projectId: string) => readonly RunnerStage[];
  // One statement, `pending` → `running`, answering false when the row was no longer
  // pending. This is the runner's guarantee that a stage starts at most once.
  readonly claim: (stageId: string) => boolean;
  readonly finish: (stageId: string, state: StageState, failureReason: string | null) => void;
}

export interface StageContext {
  readonly stage: RunnerStage;
  readonly signal: AbortSignal;
  readonly emit: EmitProject;
}

// What the runner knows about a stage implementation. The slices that satisfy it are
// handed in from main.ts: kernel may not import them (03-conventions).
export type StageRun = (context: StageContext) => Promise<void>;

export interface RunnerDeps {
  readonly stages: StageStore;
  readonly runs: Readonly<Partial<Record<StageKind, StageRun>>>;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
  readonly emitRunningCount: (count: number) => void;
  readonly log: Log;
}

export interface Runner {
  readonly tick: (projectId: string) => void;
  readonly settled: () => Promise<void>;
  readonly abortAll: () => Promise<void>;
}

interface Inflight {
  readonly projectId: string;
  readonly controller: AbortController;
  readonly settled: Promise<void>;
}

export function createRunner(deps: RunnerDeps): Runner {
  const inflight = new Map<string, Inflight>();
  const announced = new Map<string, ProjectState>();
  let count = 0;
  let shuttingDown = false;

  const emitStage = (stage: RunnerStage, state: StageState, reason: string | null): void => {
    deps.emit(stage.projectId, {
      type: "stage.state",
      projectId: stage.projectId,
      stage: stage.kind,
      state,
      ...(reason === null ? {} : { failureReason: reason }),
    });
  };

  // The global tally is the number of projects with a stage in flight, so it is read off
  // the in-flight set rather than counted in the database (04-data-flow, Run step 5).
  const retally = (): void => {
    const projects = new Set<string>();
    for (const entry of inflight.values()) {
      projects.add(entry.projectId);
    }
    if (projects.size !== count) {
      count = projects.size;
      deps.emitRunningCount(count);
    }
  };

  const announce = (projectId: string): void => {
    const state = derive(deps.stages.stagesOf(projectId));
    if (announced.get(projectId) === state) {
      return;
    }
    announced.set(projectId, state);
    deps.emit(projectId, { type: "project.state", projectId, state });
  };

  const conclude = (stage: RunnerStage, state: StageState, reason: string | null): void => {
    try {
      deps.stages.finish(stage.id, state, reason);
    } catch (error) {
      // The page would otherwise sit on a stage that never leaves `running`; the event
      // still goes out, and the next boot marks the row interrupted (logic/01 §Q7).
      deps.log.write("error", "stage.finish", {
        projectId: stage.projectId,
        stage: stage.kind,
        detail: reasonOf(error),
      });
    }
    emitStage(stage, state, reason);
  };

  async function execute(stage: RunnerStage, controller: AbortController): Promise<void> {
    try {
      const run = deps.runs[stage.kind];
      if (run === undefined) {
        throw new Error(`no implementation is registered for the ${stage.kind} stage`);
      }
      await run({
        stage,
        signal: controller.signal,
        emit: (event: ProjectEvent): void => {
          deps.emit(stage.projectId, event);
        },
      });
      conclude(stage, "done", null);
    } catch (error) {
      if (controller.signal.aborted) {
        // logic/13 step 3 fixes the wording; a late rejection from the aborted call is
        // the expected way a stage learns it was canceled, so it is not logged as a fault.
        conclude(stage, "canceled", "canceled by user");
        return;
      }
      deps.log.write("error", "stage.failed", {
        projectId: stage.projectId,
        stage: stage.kind,
        detail: reasonOf(error),
      });
      conclude(stage, "failed", reasonOf(error));
    }
  }

  function start(stage: RunnerStage): void {
    const controller = new AbortController();
    let release = (): void => {};
    const entry: Inflight = {
      projectId: stage.projectId,
      controller,
      settled: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    // Registered before the stage body is invoked: a tick arriving while this stage is
    // starting has to see it in flight.
    inflight.set(stage.id, entry);
    retally();
    emitStage(stage, "running", null);
    void execute(stage, controller)
      .finally(() => {
        inflight.delete(stage.id);
        release();
        try {
          // The next stage is claimed before the tally is read, so a fan-out handing over
          // to the video stage never reports the project as briefly not running.
          tick(stage.projectId);
        } finally {
          // stagesOf parses rows and can throw. The tally is replayed to every page that
          // opens afterwards, so it is read whether or not the tick got that far.
          retally();
        }
      })
      .catch((error: unknown) => {
        deps.log.write("error", "stage.execute", {
          projectId: stage.projectId,
          stage: stage.kind,
          detail: reasonOf(error),
        });
      });
  }

  function tick(projectId: string): void {
    // A stage that finished in the same instant as the shutdown would otherwise release
    // its dependent, and abortAll would then be waiting on a render nobody asked for.
    // The project's state still goes out, so an open page sees the run stop.
    if (!shuttingDown) {
      startEligible(projectId);
    }
    announce(projectId);
  }

  function startEligible(projectId: string): void {
    const stages = deps.stages.stagesOf(projectId);
    const stateOf = (kind: StageKind): StageState =>
      stages.find((stage) => stage.kind === kind)?.state ?? "pending";
    for (const stage of stages) {
      if (stage.state !== "pending" || inflight.has(stage.id)) {
        continue;
      }
      if (!graph[stage.kind].every((kind) => satisfied(stateOf(kind)))) {
        continue;
      }
      // Nothing is awaited in this loop, so the fan-out after the article starts audio,
      // images and thumbnail together rather than one after another.
      if (deps.stages.claim(stage.id)) {
        start({ ...stage, state: "running" });
      }
    }
  }

  async function settled(): Promise<void> {
    while (inflight.size > 0) {
      await Promise.all([...inflight.values()].map((entry) => entry.settled));
    }
  }

  return {
    tick,
    settled,
    abortAll: async (): Promise<void> => {
      shuttingDown = true;
      for (const entry of inflight.values()) {
        entry.controller.abort();
      }
      await settled();
    },
  };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
