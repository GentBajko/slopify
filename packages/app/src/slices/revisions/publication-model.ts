import type { StageKind } from "../../kernel/pipeline.js";
import type { StagePiece } from "../../kernel/runner/piece-repo.js";
import type { Fingerprint, WorkKey } from "../../kernel/runner/work.js";
import type { PreparedAsset } from "../storage/assets.js";
import type { Output } from "../storage/model.js";
export interface PreparedOutput {
  readonly slot: string;
  readonly workKey: WorkKey;
  readonly output: Output;
  readonly asset: PreparedAsset;
  readonly fingerprint: Fingerprint;
}
export interface PreparedPiece {
  readonly key: string;
  readonly stageKind: StageKind;
  readonly piece: StagePiece;
  readonly asset: PreparedAsset | null;
  readonly fingerprint: Fingerprint;
}
export interface PublicationResult {
  readonly originRevisionId: string;
  readonly currentAttached: boolean;
}
