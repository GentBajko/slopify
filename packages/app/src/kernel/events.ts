import type { ProjectState, StageKind, StageState } from "./pipeline.js";

// What a run tells the open pages about itself. The union sits below the edge because the
// runner and the stage slices produce these values and neither may import `edge`;
// `edge/events/hub.ts` only delivers them.

export interface EventOrigin {
  readonly revisionId?: string;
  readonly workId?: string;
  readonly workPieceId?: string;
}

export interface StageStateEvent extends EventOrigin {
  readonly type: "stage.state";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly state: StageState;
  readonly failureReason?: string;
}

export interface StageProgressEvent extends EventOrigin {
  readonly type: "stage.progress";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly current: number;
  readonly total: number;
}

export interface ArticleDeltaEvent extends EventOrigin {
  readonly type: "article.delta";
  readonly projectId: string;
  readonly text: string;
}

export interface LlmPreviewEvent extends EventOrigin {
  readonly type: "llm.preview";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly callId: string;
  readonly label?: string;
  readonly text: string;
  readonly reset?: boolean;
}

export interface ImageLandedEvent extends EventOrigin {
  readonly type: "image.landed";
  readonly projectId: string;
  readonly outputId: string;
  readonly index: number;
}

export interface ProjectStateEvent extends EventOrigin {
  readonly type: "project.state";
  readonly projectId: string;
  readonly state: ProjectState;
}

export interface ProjectUpdatedEvent extends EventOrigin {
  readonly type: "project.updated";
  readonly projectId: string;
}

export interface RunningCountEvent extends EventOrigin {
  readonly type: "running.count";
  readonly count: number;
}

// A schedule's topic generation held new topics for approval. Not a project event: the
// notifications slice turns it into "5 new topics are waiting for you" and open pages
// refresh their schedules.
export interface ScheduleTopicsEvent {
  readonly type: "schedule.topics";
  readonly scheduleId: string;
  readonly scheduleName: string;
  // Held by this generation, and held in total now.
  readonly added: number;
  readonly waiting: number;
}

export type ProjectEvent =
  | StageStateEvent
  | StageProgressEvent
  | ArticleDeltaEvent
  | LlmPreviewEvent
  | ImageLandedEvent
  | ProjectStateEvent
  | ProjectUpdatedEvent;

export type EmitProject = (event: ProjectEvent) => void;
