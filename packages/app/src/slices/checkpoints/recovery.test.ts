import { expect, it } from "vitest";
import { config, emptyView } from "../rebuild/recipe-fixture.js";
import { checkpointClosure, checkpointFingerprint } from "./fingerprint.js";
import { checkpointDecision } from "./rules.js";

it("applies a stage approval to every matching sibling invocation without widening revision scope", () => {
  const revision = emptyView(config).revision;
  const recipes = ["one", "two"].map((key) => ({
    key,
    stage: "images" as const,
    kind: "provider" as const,
    fingerprint: key,
    requestFingerprint: key,
    dependsOn: [],
    unresolved: false,
  }));
  const row = {
    projectId: revision.projectId,
    revisionId: revision.id,
    checkpointId: "gate",
    stage: "images" as const,
    workId: "first-work",
    fingerprint: checkpointFingerprint(revision, checkpointClosure("images", recipes)),
    state: "released" as const,
    approvedAt: revision.createdAt,
    createdAt: revision.createdAt,
  };
  const work = {
    projectId: revision.projectId,
    revisionId: revision.id,
    workId: "second-work",
    stageId: "images",
    kind: "images" as const,
    fingerprint: "two",
  };
  expect(checkpointDecision(work, [row], revision, recipes)).toEqual({ kind: "eligible" });
  expect(checkpointDecision({ ...work, revisionId: "other" }, [row], revision, recipes)).toEqual({
    kind: "refused",
    reason: "conflict",
  });
});
