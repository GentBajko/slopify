import type { DatabaseSync } from "node:sqlite";
import type { Ids } from "../src/kernel/ids.js";
import { type AttemptStore, sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { RunnerStage } from "../src/kernel/runner/index.js";

// These old slice composition tests deliberately exercise pre-revision storage. Runtime
// activation tests use the production attempt store and real persisted WorkRefs instead.
export function legacyAttempts(db: DatabaseSync, ids: Ids): AttemptStore {
  const store = sqliteAttempts(db, ids);
  return {
    start: ({ stageId, pieceId, n, startedAt }) => store.start({ stageId, pieceId, n, startedAt }),
    end: store.end,
  };
}

export function legacyStage(stage: Omit<RunnerStage, "work">): RunnerStage {
  return {
    ...stage,
    work: {
      projectId: stage.projectId,
      stageId: stage.id,
      kind: stage.kind,
      revisionId: "legacy-test",
      workId: `${stage.id}-legacy`,
      fingerprint: stage.kind,
    },
  };
}
