import { fingerprint } from "../../kernel/runner/work.js";
import type { WorkRecipe } from "../rebuild/dependencies.js";
import type { ProjectRevision } from "../revisions/model.js";
import type { CheckpointStage } from "./model.js";

export function checkpointClosure(
  stage: CheckpointStage,
  work: readonly WorkRecipe[],
): readonly WorkRecipe[] {
  const held = new Set(work.filter((row) => row.stage === stage).map((row) => row.key));
  let previous = -1;
  while (previous !== held.size) {
    previous = held.size;
    for (const row of work) if (row.dependsOn.some((key) => held.has(key))) held.add(row.key);
  }
  return work.filter((row) => held.has(row.key)).toSorted(byKey);
}

function byKey(a: WorkRecipe, b: WorkRecipe): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function checkpointFingerprint(
  revision: ProjectRevision,
  closure: readonly WorkRecipe[],
): string {
  return fingerprint({
    projectId: revision.projectId,
    work: closure.toSorted(byKey).map((row) => ({
      key: row.key,
      stage: row.stage,
      kind: row.kind,
      requestFingerprint: row.requestFingerprint,
      fingerprint: row.fingerprint,
      revisionFingerprint: revision.fingerprints[row.key] ?? null,
      unresolved: row.unresolved,
      dependencies: [...new Set(row.dependsOn)].sort().map((key) => ({
        key,
        fingerprint: revision.fingerprints[key] ?? null,
      })),
    })),
  });
}
