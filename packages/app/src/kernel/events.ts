import type { ProjectState, StageKind, StageState } from "./pipeline.js";

// What a run tells the open pages about itself (04-data-flow, Run step 5). The union
// lives below the edge because the runner and the stage slices produce these values and
// neither may import `edge`; `edge/events/hub.ts` only delivers them.

export interface StageStateEvent {
  readonly type: "stage.state";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly state: StageState;
  readonly failureReason?: string;
}

export interface StageProgressEvent {
  readonly type: "stage.progress";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly current: number;
  readonly total: number;
}

export interface ArticleDeltaEvent {
  readonly type: "article.delta";
  readonly projectId: string;
  readonly text: string;
}

export interface ImageLandedEvent {
  readonly type: "image.landed";
  readonly projectId: string;
  readonly outputId: string;
  readonly index: number;
}

export interface ProjectStateEvent {
  readonly type: "project.state";
  readonly projectId: string;
  readonly state: ProjectState;
}

export interface RunningCountEvent {
  readonly type: "running.count";
  readonly count: number;
}

export type ProjectEvent =
  | StageStateEvent
  | StageProgressEvent
  | ArticleDeltaEvent
  | ImageLandedEvent
  | ProjectStateEvent;

export type EmitProject = (event: ProjectEvent) => void;
