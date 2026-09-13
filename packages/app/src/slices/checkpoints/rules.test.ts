import { expect, it } from "vitest";
import { type StageKind, stageStates } from "../../kernel/pipeline.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import type { WorkRecipe } from "../rebuild/dependencies.js";
import { emptyView } from "../rebuild/recipe-fixture.js";
import { checkpointClosure, checkpointFingerprint } from "./fingerprint.js";
import type { CheckpointRow } from "./model.js";
import { canChangeCheckpoint, checkpointDecision, isApprovalCurrent } from "./rules.js";

const revision = emptyView().revision;
const recipes: readonly WorkRecipe[] = [
  {
    key: "article",
    stage: "article",
    kind: "provider",
    requestFingerprint: "a",
    fingerprint: "a",
    dependsOn: [],
    unresolved: false,
  },
  {
    key: "audio",
    stage: "audio",
    kind: "provider",
    requestFingerprint: "s",
    fingerprint: "s",
    dependsOn: ["article"],
    unresolved: false,
  },
  {
    key: "images",
    stage: "images",
    kind: "provider",
    requestFingerprint: "i",
    fingerprint: "i",
    dependsOn: [],
    unresolved: false,
  },
  {
    key: "video",
    stage: "video",
    kind: "local",
    requestFingerprint: "v",
    fingerprint: "v",
    dependsOn: ["audio", "images"],
    unresolved: false,
  },
];
const gate: CheckpointRow = {
  projectId: revision.projectId,
  revisionId: revision.id,
  checkpointId: "audio-gate",
  stage: "audio",
  workId: "audio-work",
  fingerprint: checkpointFingerprint(revision, checkpointClosure("audio", recipes)),
  state: "held",
  createdAt: "2026-09-13T00:00:00Z",
  approvedAt: null,
};
const work = (kind: StageKind): WorkRef => ({
  projectId: revision.projectId,
  revisionId: revision.id,
  workId: `${kind}-work`,
  stageId: `${kind}-stage`,
  kind,
  fingerprint: `${kind}-invocation`,
});

it.each(["audio", "video"] as const)("holds %s behind an unreleased Audio checkpoint", (stage) => {
  expect(checkpointDecision(work(stage), [gate], revision, recipes)).toEqual({
    kind: "held",
    checkpointIds: [gate.checkpointId],
  });
});
it.each(["research", "article", "images"] as const)(
  "leaves independent %s work eligible",
  (stage) => {
    expect(checkpointDecision(work(stage), [gate], revision, recipes)).toEqual({
      kind: "eligible",
    });
  },
);
it("collects overlapping held gates deterministically and releases only currently approved work", () => {
  const images: CheckpointRow = {
    ...gate,
    checkpointId: "images-gate",
    stage: "images",
    workId: "images-work",
    fingerprint: checkpointFingerprint(revision, checkpointClosure("images", recipes)),
  };
  expect(checkpointDecision(work("video"), [images, gate], revision, recipes)).toEqual({
    kind: "held",
    checkpointIds: ["audio-gate", "images-gate"],
  });
  const approved = { ...gate, state: "released" as const, approvedAt: gate.createdAt };
  expect(checkpointDecision(work("audio"), [approved], revision, recipes)).toEqual({
    kind: "eligible",
  });
  expect(checkpointDecision(work("video"), [images, approved], revision, recipes)).toEqual({
    kind: "held",
    checkpointIds: ["images-gate"],
  });
  expect(checkpointDecision(work("images"), [images], revision, recipes)).toEqual({
    kind: "held",
    checkpointIds: ["images-gate"],
  });
});
it("requires matching project, revision, fingerprint and recorded approval state", () => {
  const approved = { ...gate, state: "released" as const, approvedAt: gate.createdAt };
  expect(isApprovalCurrent(approved, revision, gate.fingerprint)).toBe(true);
  expect(isApprovalCurrent({ ...approved, state: "satisfied" }, revision, gate.fingerprint)).toBe(
    true,
  );
  for (const changed of [
    { ...approved, projectId: "other" },
    { ...approved, revisionId: "old" },
    { ...approved, fingerprint: "changed" },
    { ...approved, approvedAt: null },
    { ...approved, state: "invalidated" as const },
  ])
    expect(isApprovalCurrent(changed, revision, gate.fingerprint)).toBe(false);
  expect(
    checkpointDecision(
      work("audio"),
      [approved],
      revision,
      recipes.map((row) => (row.key === "audio" ? { ...row, fingerprint: "changed" } : row)),
    ),
  ).toEqual({ kind: "held", checkpointIds: [gate.checkpointId] });
});
it("refuses foreign invocation authority, gate scope and canceled gates", () => {
  expect(
    checkpointDecision({ ...work("audio"), revisionId: "old" }, [gate], revision, recipes),
  ).toEqual({ kind: "refused", reason: "conflict" });
  expect(
    checkpointDecision(work("audio"), [{ ...gate, projectId: "other" }], revision, recipes),
  ).toEqual({ kind: "refused", reason: "conflict" });
  expect(
    checkpointDecision(
      work("audio"),
      [{ ...gate, workId: "different-invocation" }],
      revision,
      recipes,
    ),
  ).toEqual({ kind: "refused", reason: "conflict" });
  expect(
    checkpointDecision(work("audio"), [{ ...gate, state: "canceled" }], revision, recipes),
  ).toEqual({ kind: "refused", reason: "conflict" });
});
it.each(stageStates)("allows checkpoint add/remove only before the stage begins (%s)", (state) => {
  expect(canChangeCheckpoint(state, false)).toEqual(
    state === "pending" ? { kind: "eligible" } : { kind: "refused", reason: "conflict" },
  );
  expect(canChangeCheckpoint(state, true)).toEqual({ kind: "refused", reason: "conflict" });
});
