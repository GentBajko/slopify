export const stageKinds = ["research", "article", "audio", "images", "thumbnail", "video"] as const;
export type StageKind = (typeof stageKinds)[number];

export const outputRoles = [
  "notes",
  "article_md",
  "article_txt",
  "sources",
  "glossary",
  "audio_body",
  "audio_intro",
  "audio_outro",
  "image",
  "thumbnail",
  "video",
  "render_params",
  "instructions",
] as const;
export type OutputRole = (typeof outputRoles)[number];

export const stagedFileStates = ["copying", "staged"] as const;
export type StagedFileState = (typeof stagedFileStates)[number];

export interface OutputMeta {
  readonly promptName?: string | undefined;
  readonly index?: number | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly voice?: string | undefined;
}

export interface Output {
  readonly id: string;
  readonly projectId: string;
  readonly stageKind: StageKind;
  readonly role: OutputRole;
  // Relative to the project folder, always with forward slashes.
  readonly path: string;
  readonly originalFilename: string | null;
  readonly bytes: number;
  readonly durationMs: number | null;
  readonly meta: OutputMeta;
  readonly createdAt: string;
}

export interface StagedFile {
  readonly id: string;
  readonly stageKind: StageKind;
  // Relative to the staging folder. Always the id: a client never names a path.
  readonly path: string;
  readonly originalFilename: string;
  readonly bytes: number;
  readonly state: StagedFileState;
  readonly createdAt: string;
}

// A staged upload belongs to no project yet, so its progress cannot ride a project
// channel; the form that started it watches the global one (logic/05 §Q43).
export interface StagingProgressEvent {
  readonly type: "staging.progress";
  readonly stagedFileId: string;
  readonly stageKind: StageKind;
  readonly originalFilename: string;
  readonly bytes: number;
  readonly state: StagedFileState;
}

export interface StagingFailedEvent {
  readonly type: "staging.failed";
  readonly stagedFileId: string;
  readonly stageKind: StageKind;
  readonly originalFilename: string;
  readonly detail: string;
}

export type StagingEvent = StagingProgressEvent | StagingFailedEvent;

export type EmitStaging = (event: StagingEvent) => void;
