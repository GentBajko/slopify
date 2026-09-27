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

// One narration request finished and its audio is saved: the live view's waveform grows by
// that piece (`GET /api/projects/:id/narration/peaks`).
export interface NarrationPieceEvent extends EventOrigin {
  readonly type: "narration.piece";
  readonly projectId: string;
  readonly key: string;
  readonly durationMs: number | null;
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

export type ProjectEvent =
  | StageStateEvent
  | StageProgressEvent
  | ArticleDeltaEvent
  | LlmPreviewEvent
  | ImageLandedEvent
  | NarrationPieceEvent
  | ProjectStateEvent
  | ProjectUpdatedEvent;

export type EmitProject = (event: ProjectEvent) => void;
