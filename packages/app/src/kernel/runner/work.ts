import type { StageKind } from "../pipeline.js";

export type WorkKey = string;
export type Fingerprint = string;
export type FingerprintValue =
  | null
  | boolean
  | number
  | string
  | readonly FingerprintValue[]
  | { readonly [key: string]: FingerprintValue };

export interface WorkRef {
  readonly projectId: string;
  readonly revisionId: string;
  readonly workId: string;
  readonly stageId: string;
  readonly kind: StageKind;
  readonly fingerprint: Fingerprint;
}

export interface PublicationRef {
  readonly work: WorkRef;
  readonly pieceId: string | null;
  readonly publicationId: string;
}

export type AttemptResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: "held" };
export type StageRunResult = "done" | "held";
