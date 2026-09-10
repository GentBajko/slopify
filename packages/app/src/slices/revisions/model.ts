import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import type { StageKind } from "../../kernel/pipeline.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import type { Fingerprint, WorkKey } from "../../kernel/runner/work.js";
import type { RunConfig } from "../admission/model.js";
import type { FieldError } from "../admission/rules.js";
import type { Output } from "../storage/model.js";

export type { Fingerprint, WorkKey } from "../../kernel/runner/work.js";

export type OutputState = "ready" | "outdated" | "review";
export type ProvidedKind = "research" | "article" | "audio" | "thumbnail";
export interface ManualCue {
  readonly id: string;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}
export type NarrationOverride =
  | { readonly kind: "asset"; readonly assetId: string }
  | { readonly kind: "text"; readonly text: string };
export interface RevisionContent {
  readonly articleMarkdown?: string | undefined;
  readonly articleEdited?: boolean | undefined;
  readonly provided: Readonly<Partial<Record<ProvidedKind, string | undefined>>>;
  readonly imageOrder: readonly string[];
  readonly imageDefinitions: Readonly<
    Record<
      string,
      {
        readonly source: "generate" | "provide";
        readonly assetId: string | null;
        readonly prompt: string | null;
        readonly templateKey?: string | null | undefined;
      }
    >
  >;
  readonly narrationOverrides: Readonly<Record<string, NarrationOverride>>;
  readonly subtitleCues?:
    | {
        readonly audioFingerprint: string;
        readonly cues: readonly ManualCue[];
      }
    | undefined;
  readonly regenerationTokens: Readonly<Record<WorkKey, string>>;
  readonly promptTemplates: Readonly<Record<string, string | null>>;
}
export interface RevisionUpload {
  readonly stagedFileId: string;
  readonly destination:
    | { readonly kind: "provided"; readonly stage: "audio" | "thumbnail" }
    | { readonly kind: "image"; readonly imageKey: string }
    | { readonly kind: "narration"; readonly key: string };
}
export interface RevisionEdit {
  readonly config: RunConfig;
  readonly content: RevisionContent;
  readonly regenerate?: readonly WorkKey[] | undefined;
  readonly uploads?: readonly RevisionUpload[] | undefined;
}
export interface ProjectRevision {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly restoredFromId: string | null;
  readonly config: RunConfig;
  readonly content: RevisionContent;
  readonly fingerprints: Readonly<Record<WorkKey, Fingerprint>>;
  readonly createdAt: string;
}
export interface ProjectAsset {
  readonly id: string;
  readonly projectId: string;
  readonly path: string;
  readonly bytes: number | null;
  readonly createdAt: string;
}
export interface ManifestOutput {
  readonly slot: string;
  readonly workKey: WorkKey;
  readonly assetId: string;
  readonly output: Output;
  readonly fingerprint: Fingerprint;
  readonly state: OutputState;
}
export interface ManifestPiece {
  readonly key: string;
  readonly stageKind: StageKind;
  readonly piece: StagePiece;
  readonly assetId: string | null;
  readonly fingerprint: Fingerprint;
}
export interface RevisionManifest {
  readonly outputs: readonly ManifestOutput[];
  readonly pieces: readonly ManifestPiece[];
}
export interface RevisionOutputView extends ManifestOutput {
  readonly recordId: string;
  readonly publicationId: string | null;
  readonly selected: boolean;
  readonly available: boolean;
}
export interface RevisionPieceView extends ManifestPiece {
  readonly recordId: string;
  readonly publicationId: string | null;
  readonly selected: boolean;
  readonly available: boolean;
}
export interface RevisionView {
  readonly articleMarkdown: string | null;
  readonly revision: ProjectRevision;
  readonly outputs: readonly RevisionOutputView[];
  readonly pieces: readonly RevisionPieceView[];
  readonly current: boolean;
}
export interface RevisionSummary {
  readonly id: string;
  readonly parentId: string | null;
  readonly restoredFromId: string | null;
  readonly title: string;
  readonly createdAt: string;
  readonly current: boolean;
}
export type RevisionMutationResult =
  | { readonly ok: true; readonly view: RevisionView; readonly duplicate: boolean }
  | {
      readonly ok: false;
      readonly reason:
        | "no-project"
        | "no-revision"
        | "conflict"
        | "idempotency-conflict"
        | "invalid-edit";
      readonly currentRevisionId: string | null;
      readonly fields?: readonly FieldError[] | undefined;
    };
export type BaselineResult =
  | { readonly ok: true; readonly view: RevisionView; readonly created: boolean }
  | { readonly ok: false; readonly reason: "no-project" };

export interface RevisionDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
  readonly measureAudio?: ((path: string) => Promise<number>) | undefined;
}

export type RevisionOutputRecord = Omit<RevisionOutputView, "available">;
export type RevisionPieceRecord = Omit<RevisionPieceView, "available">;
