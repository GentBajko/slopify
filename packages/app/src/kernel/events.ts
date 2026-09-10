import type { ProjectState, StageKind, StageState } from "./pipeline.js";

// What a run tells the open pages about itself. The union sits below the edge because the
// runner and the stage slices produce these values and neither may import `edge`;
// `edge/events/hub.ts` only delivers them.

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

export interface LlmPreviewEvent {
  readonly type: "llm.preview";
  readonly projectId: string;
  readonly stage: StageKind;
  readonly callId: string;
  readonly label?: string;
  readonly text: string;
  readonly reset?: boolean;
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

export interface ProjectUpdatedEvent {
  readonly type: "project.updated";
  readonly projectId: string;
}

export interface RunningCountEvent {
  readonly type: "running.count";
  readonly count: number;
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
