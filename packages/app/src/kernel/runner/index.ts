import { causedBy } from "../errors.js";
import type { EmitProject, ProjectEvent } from "../events.js";
import type { Log } from "../log.js";
import type { ProjectState, StageKind, StageState } from "../pipeline.js";
import type { CheckpointAuthority } from "./checkpoint-authority.js";
import { derive, deps as graph, satisfied } from "./graph.js";
import { type ProgressGate, progressGate } from "./progress.js";
import type { StageRunResult, WorkRef } from "./work.js";

export interface RunnerStage {
  readonly work: WorkRef;
  readonly id: string;
  readonly projectId: string;
  readonly kind: StageKind;
  readonly state: StageState;
}

export interface StageStore {
  readonly maySubmit: (work: WorkRef, pieceId?: string) => boolean;
  readonly stagesOf: (projectId: string) => readonly RunnerStage[];
  readonly standingsOf?: (projectId: string) => readonly Pick<RunnerStage, "kind" | "state">[];
  readonly ready?: (work: WorkRef) => boolean;
  // One statement, `pending` → `running`, false if the row moved on. A stage starts once.
  readonly claim: (work: WorkRef) => boolean;
  readonly finish: (work: WorkRef, state: StageState, failureReason: string | null) => void;
  readonly paused?: (projectId: string) => boolean;
  readonly dependenciesOf?: (projectId: string, kind: StageKind) => readonly StageKind[];
}

export interface StageContext {
  readonly work: WorkRef;
  readonly maySubmit: (pieceId?: string) => boolean;
  readonly stage: RunnerStage;
  readonly signal: AbortSignal;
  readonly emit: EmitProject;
}

// A stage implementation. main.ts hands the slices in; kernel may not import them.
export type StageRun = (context: StageContext) => Promise<StageRunResult>;

export interface RunnerDeps {
  readonly checkpoints?: CheckpointAuthority;
  readonly stages: StageStore;
  readonly runs: Readonly<Partial<Record<StageKind, StageRun>>>;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
  readonly emitRunningCount: (count: number) => void;
  readonly log: Log;
}

export interface Runner {
  readonly checkpoints?: CheckpointAuthority;
  readonly tick: (projectId: string) => void;
  readonly settled: () => Promise<void>;
  // Abort one project's in-flight calls and wait; others keep running.
  readonly abortProject: (projectId: string, mode?: "cancel" | "pause") => Promise<void>;
  readonly hasInflight?: (projectId: string) => boolean;
  readonly abortAll: () => Promise<void>;
}

interface Inflight {
  readonly work: WorkRef;
  readonly projectId: string;
  readonly controller: AbortController;
  readonly settled: Promise<void>;
}

const pauseReason = new Error("paused by user");

export function createRunner(deps: RunnerDeps): Runner {
  const inflight = new Map<string, Inflight>();
  // ceiling: one entry per project ticked since boot, never evicted - a few dozen bytes
  // each, emptied by any restart. Evicting on a terminal state would re-announce it on the
  // next tick, so the upgrade is to drop the entry when the project is deleted.
  const announced = new Map<string, ProjectState>();
  // The projects a cancel is walking through. A set, not a flag, because a cancel leaves
  // every other project untouched. Held for the whole of abortProject: a stage that stores
  // its output in the same instant as the cancel stays `done`, and its hand-over to the
  // next stage is what must not happen.
  const stopped = new Set<string>();
  let count = 0;
  let shuttingDown = false;

  const emitStage = (stage: RunnerStage, state: StageState, reason: string | null): void => {
    deps.emit(stage.projectId, {
      type: "stage.state",
      revisionId: stage.work.revisionId,
      workId: stage.work.workId,
      projectId: stage.projectId,
      stage: stage.kind,
      state,
      ...(reason === null ? {} : { failureReason: reason }),
    });
  };

  // The global tally counts projects with a stage in flight, read off the in-flight set
  // rather than the database.
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
    const state = derive(
      deps.stages.standingsOf?.(projectId) ?? deps.stages.stagesOf(projectId),
      deps.stages.paused?.(projectId),
    );
    if (announced.get(projectId) === state) {
      return;
    }
    announced.set(projectId, state);
    deps.emit(projectId, { type: "project.state", projectId, state });
  };

  const conclude = (stage: RunnerStage, state: StageState, reason: string | null): void => {
    try {
      deps.stages.finish(stage.work, state, reason);
    } catch (error) {
      // The row stays `running` when the write fails. The event still goes out, and the
      // next boot marks the row interrupted.
      deps.log.write("error", "stage.finish", {
        projectId: stage.projectId,
        stage: stage.kind,
        detail: reasonOf(error),
      });
    }
    emitStage(stage, state, reason);
  };

  async function execute(stage: RunnerStage, controller: AbortController): Promise<void> {
    const tag = (event: ProjectEvent): ProjectEvent => ({
      ...event,
      revisionId: stage.work.revisionId,
      workId: stage.work.workId,
    });
    const progress: ProgressGate = progressGate((event) => deps.emit(stage.projectId, tag(event)));
    try {
      const run = deps.runs[stage.kind];
      if (run === undefined) {
        throw new Error(`no implementation is registered for the ${stage.kind} stage`);
      }
      const result = await run({
        stage,
        work: stage.work,
        maySubmit: (pieceId) =>
          !shuttingDown &&
          !stopped.has(stage.projectId) &&
          !deps.stages.paused?.(stage.projectId) &&
          (deps.checkpoints === undefined ||
            deps.checkpoints.beforeClaim(stage.work).kind === "eligible") &&
          deps.stages.maySubmit(stage.work, pieceId),
        signal: controller.signal,
        emit: (event: ProjectEvent): void => {
          if (event.type === "stage.progress") progress.offer(event);
          else deps.emit(stage.projectId, tag(event));
        },
      });
      progress.flush();
      progress.close();
      conclude(stage, result === "held" ? "pending" : "done", null);
    } catch (error) {
      progress.close();
      if (controller.signal.aborted) {
        // A late rejection from the aborted call is how a stage learns it was canceled, so
        // it is not logged as a fault.
        const paused = controller.signal.reason === pauseReason;
        conclude(stage, paused ? "pending" : "canceled", paused ? null : "canceled by user");
        return;
      }
      deps.log.write("error", "stage.failed", {
        projectId: stage.projectId,
        stage: stage.kind,
        detail: causedBy(error),
      });
      conclude(stage, "failed", reasonOf(error));
    }
  }

  function start(stage: RunnerStage): void {
    const controller = new AbortController();
    let release = (): void => {};
    const entry: Inflight = {
      work: stage.work,
      projectId: stage.projectId,
      controller,
      settled: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    // Registered before the body runs: a tick arriving mid-start has to see it in flight.
    inflight.set(stage.work.workId, entry);
    retally();
    emitStage(stage, "running", null);
    void execute(stage, controller)
      .finally(() => {
        inflight.delete(stage.work.workId);
        release();
        try {
          // Claim the next stage before reading the tally, so a hand-over never reports
          // the project as briefly not running.
          tick(stage.projectId);
        } finally {
          // stagesOf can throw. The tally is replayed to every page that opens later, so
          // it is read whether or not the tick got that far.
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
    // A stage finishing in the same instant as a shutdown or cancel would otherwise release
    // its dependent, leaving the abort waiting on a render nobody asked for - or one running
    // under a controller nobody aborted. The state still goes out, so an open page sees it.
    if (!shuttingDown && !stopped.has(projectId) && !deps.stages.paused?.(projectId)) {
      startEligible(projectId);
    }
    announce(projectId);
  }

  function startEligible(projectId: string): void {
    const stages = deps.stages.stagesOf(projectId);
    const satisfiedKind = (kind: StageKind): boolean => {
      const matches = stages.filter((stage) => stage.kind === kind);
      return matches.length > 0 && matches.every((stage) => satisfied(stage.state));
    };
    for (const stage of stages) {
      if (stage.state !== "pending" || inflight.has(stage.work.workId)) {
        continue;
      }
      const dependencies = deps.stages.dependenciesOf?.(projectId, stage.kind) ?? graph[stage.kind];
      if (
        deps.stages.ready === undefined
          ? !dependencies.every(satisfiedKind)
          : !deps.stages.ready(stage.work)
      ) {
        continue;
      }
      if (deps.stages.paused?.(projectId)) return;
      if (deps.checkpoints && deps.checkpoints.beforeClaim(stage.work).kind !== "eligible")
        continue;
      // Nothing is awaited here: the fan-out starts audio, images and thumbnail together.
      if (deps.stages.claim(stage.work)) {
        start({ ...stage, state: "running" });
      }
    }
  }

  async function settled(): Promise<void> {
    while (inflight.size > 0) {
      await Promise.all([...inflight.values()].map((entry) => entry.settled));
    }
  }

  async function settledOf(projectId: string): Promise<void> {
    for (;;) {
      const waiting = [...inflight.values()].filter((entry) => entry.projectId === projectId);
      if (waiting.length === 0) {
        return;
      }
      await Promise.all(waiting.map((entry) => entry.settled));
    }
  }

  return {
    ...(deps.checkpoints === undefined ? {} : { checkpoints: deps.checkpoints }),
    tick,
    settled,
    hasInflight: (projectId) =>
      [...inflight.values()].some((entry) => entry.projectId === projectId),
    abortProject: async (projectId: string, mode = "cancel"): Promise<void> => {
      // Up before the first abort, down only once every stage has stopped. In between, the
      // tick each finishing stage fires starts nothing.
      stopped.add(projectId);
      try {
        for (const entry of inflight.values()) {
          if (entry.projectId === projectId) {
            entry.controller.abort(mode === "pause" ? pauseReason : undefined);
          }
        }
        // No provider call continues after cancel returns. The wait makes it true.
        await settledOf(projectId);
      } finally {
        stopped.delete(projectId);
      }
      // The last stage's tick announced the project while the barrier was up, before every
      // row was written. This is the state the user asked for.
      announce(projectId);
    },
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
