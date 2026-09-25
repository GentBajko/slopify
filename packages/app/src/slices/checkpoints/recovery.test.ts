import { expect, it } from "vitest";
import { stageKinds } from "../../kernel/pipeline.js";
import { catalogue, config, emptyView } from "../rebuild/recipe-fixture.js";
import { admitInitialRevision } from "../rebuild/runtime-admission.js";
import { executionPlan } from "../rebuild/runtime-plan.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { readCheckpointStatus } from "./change.js";
import { checkpointClosure, checkpointFingerprint } from "./fingerprint.js";
import { settleReleasedCheckpoints } from "./recovery.js";
import { approveCheckpoint, listCheckpoints, saveCheckpointSet } from "./repo.js";
import { checkpointDecision } from "./rules.js";
import { sourceOf } from "../admission/model.js";

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

it("resolves and satisfies the exact current closure after its last invocation settles", async () => {
  const h = revisionFixture();
  try {
    const runtimeConfig = {
      ...h.config,
      sources: { ...h.config.sources, images: "generate" as const, video: "generate" as const },
      images: { provider: "fal", model: "image" },
      imagePrompts: [{ name: "image", number: 2 }],
      rendered: { "imagePrompts.0": "A harbor at dusk" },
    };
    const runtimeCatalogue = {
      ...catalogue,
      providers: { ...catalogue.providers, fal: { maxConcurrent: 5 } },
      image: [
        {
          provider: "fal",
          id: "image",
          name: "Image",
          enabled: true,
          deprecated: false,
          source: "https://example.test",
          pricing: {},
          keywords: [],
          image: { aspectRatios: ["16:9" as const, "9:16" as const] },
        },
      ],
    };
    h.deps.db
      .prepare("UPDATE projects SET config=? WHERE id=?")
      .run(JSON.stringify(runtimeConfig), h.projectId);
    for (const kind of stageKinds)
      h.deps.db
        .prepare("INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,?, 'pending')")
        .run(kind, h.projectId, kind, sourceOf(runtimeConfig.sources, kind));
    const base = await ensureBaseline(h.deps, h.projectId);
    if (!base.ok) throw new Error("Missing baseline");
    admitInitialRevision(h.deps, base.view, runtimeCatalogue);
    const work = h.deps.db
      .prepare("SELECT id FROM revision_work WHERE revision_id=? AND kind='images' LIMIT 1")
      .get(base.view.revision.id);
    if (typeof work?.id !== "string") throw new Error("Missing image work");
    const closure = checkpointClosure(
      "images",
      executionPlan(h.deps, base.view, runtimeCatalogue).recipes,
    );
    expect(
      saveCheckpointSet(h.deps.db, {
        projectId: h.projectId,
        revisionId: base.view.revision.id,
        checkpoints: [
          {
            checkpointId: "images-gate",
            stage: "images",
            workId: work.id,
            fingerprint: checkpointFingerprint(base.view.revision, closure),
            state: "held",
          },
        ],
        createdAt: h.deps.clock.now().toISOString(),
      }).ok,
    ).toBe(true);
    const gate = listCheckpoints(h.deps.db, h.projectId, base.view.revision.id)[0];
    if (gate === undefined) throw new Error("Missing checkpoint");
    expect(
      approveCheckpoint(h.deps.db, {
        projectId: h.projectId,
        revisionId: base.view.revision.id,
        checkpointId: gate.checkpointId,
        fingerprint: gate.fingerprint,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        approvedAt: h.deps.clock.now().toISOString(),
      }).ok,
    ).toBe(true);
    const status = readCheckpointStatus(h.deps, h.projectId);
    if (!status.ok) throw new Error("Missing checkpoint status");
    const workKeys = status.value.checkpoints[0]?.workKeys ?? [];
    const workIds = [
      ...new Set(
        h.deps.db
          .prepare("SELECT work_key,work_id FROM revision_work_reservations WHERE revision_id=?")
          .all(base.view.revision.id)
          .filter((row) => workKeys.includes(String(row.work_key)))
          .map((row) => String(row.work_id)),
      ),
    ];
    expect(workIds.length).toBeGreaterThan(1);
    for (const workId of workIds.slice(0, -1))
      h.deps.db.prepare("UPDATE revision_work SET state='done' WHERE id=?").run(workId);
    expect(settleReleasedCheckpoints(h.deps, h.projectId)).toEqual([]);
    const lastWorkId = workIds.at(-1);
    if (lastWorkId === undefined) throw new Error("Missing final checkpoint work");
    h.deps.db.prepare("UPDATE revision_work SET state='failed' WHERE id=?").run(lastWorkId);
    expect(settleReleasedCheckpoints(h.deps, h.projectId)).toMatchObject([
      { checkpointId: gate.checkpointId, state: "satisfied" },
    ]);
  } finally {
    h.close();
  }
});
