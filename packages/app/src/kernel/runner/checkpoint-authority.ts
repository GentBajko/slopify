import type { Log } from "../log.js";
import type { WorkRef } from "./work.js";

export type CheckpointDecision =
  | { readonly kind: "eligible" }
  | { readonly kind: "held"; readonly checkpointIds: readonly string[] }
  | { readonly kind: "refused"; readonly reason: string };
export interface CheckpointIdentity {
  readonly revisionId: string;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}
export type CheckpointResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string; readonly value?: T };
export interface CheckpointAuthority<T = unknown> {
  readonly beforeClaim: (work: WorkRef) => CheckpointDecision;
  readonly release: (
    projectId: string,
    checkpointId: string,
    identity: CheckpointIdentity,
  ) => CheckpointResult<T>;
}
interface AuthorityDeps<T> {
  readonly decide: CheckpointAuthority<T>["beforeClaim"];
  readonly approve: CheckpointAuthority<T>["release"];
  readonly inTransaction: () => boolean;
  readonly wake: (projectId: string) => void;
  readonly log: Log;
}

export function createCheckpointAuthority<T>(deps: AuthorityDeps<T>): CheckpointAuthority<T> {
  return {
    beforeClaim: deps.decide,
    release: (projectId, checkpointId, identity) => {
      // A nested savepoint cannot authorize dispatch before its caller commits.
      if (deps.inTransaction()) return { ok: false, reason: "conflict" };
      const result = deps.approve(projectId, checkpointId, identity);
      if (result.ok) {
        try {
          deps.wake(projectId);
        } catch (error) {
          deps.log.write("error", "checkpoint.wake", {
            projectId,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return result;
    },
  };
}
