import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import type { RunConfig } from "../src/slices/admission/model.js";
import { recoverCheckpointWork } from "../src/slices/checkpoints/recovery.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import type { RevisionContent } from "../src/slices/revisions/model.js";
import { current } from "./revision-rebuild.fake.js";
import { reviewedRun } from "./revision-reviews-stages.fake.js";

// The picture check over pictures drawn from Scenes from the article. Until the scenes are
// written each picture is a step waiting on them, so its check is planned only once its
// scene is known: the run has to take the check up then, and again after a restart.

// The scenes call: one scene per picture and thumbnail it lists.
const scenes = (request: LlmCompletion): readonly string[] => {
  const system = request.messages[0]?.content ?? "";
  const count = (label: string) => Number(new RegExp(`${label}: (\\d+)`).exec(system)?.[1] ?? "0");
  return [
    JSON.stringify(
      Array.from({ length: count("Pictures") + count("Thumbnails") }, (_, at) => `Scene ${at}.`),
    ),
  ];
};
const scened = (base: RunConfig): RunConfig => ({
  ...base,
  llm: { provider: "openrouter", model: "llm" },
  provided: { article: "Rope holds fast.\n\nRope frays at last." },
  imageScenes: true,
});
const sceneImages = (content: RevisionContent): RevisionContent => ({
  ...content,
  imageOrder: ["one", "two"],
  imageDefinitions: {
    one: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
    two: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
  },
  promptTemplates: { "imagePrompts.0": "An engraving.\n\nScene: {{Scene}}" },
});
// The pictures the reviewer has answered for.
const checked = (deps: { readonly db: DatabaseSync }, projectId: string) =>
  deps.db
    .prepare(
      "SELECT item_key FROM review_verdicts WHERE project_id=? AND item_key LIKE 'image:%' ORDER BY item_key",
    )
    .all(projectId)
    .map((row) => row.item_key);

it("checks each picture drawn from a scene once its scene is written", {
  timeout: 30_000,
}, async () => {
  const { h, deps, asked } = await reviewedRun({
    fail: () => undefined,
    work: scenes,
    config: scened,
    content: sceneImages,
    reviews: { retries: 0, stages: { images: { mode: "flag" } } },
  });
  expect(asked).toHaveLength(2);
  expect(checked(deps, h.projectId)).toEqual(["image:one", "image:two"]);
});

// `ownAnchor`: the checks a version before this fix admitted on Continue were reserved under
// their own key, which the version's plan never lists, so nothing could take them up.
for (const ownAnchor of [false, true])
  it(`takes the picture checks up again on Continue after a restart stopped them${ownAnchor ? " (reserved under their own key)" : ""}`, {
    timeout: 30_000,
  }, async () => {
    const hold = { blocks: true, waiting: 0 };
    const { h, deps, runner, asked, wire } = await reviewedRun({
      fail: () => undefined,
      work: scenes,
      config: scened,
      content: sceneImages,
      reviews: { retries: 0, stages: { images: { mode: "flag" } } },
      holdReviews: hold,
      unsettled: true,
    });
    // Both pictures are drawn and their checks wait on the reviewer when the app quits.
    await vi.waitFor(() => expect(hold.waiting).toBeGreaterThan(0), { timeout: 10_000 });
    await runner.abortAll();
    expect(checked(deps, h.projectId)).toEqual([]);
    // Boot (`main.ts`): recover the work, then wire a new runner.
    recoverCheckpointWork(deps.db);
    const head = current(deps, h.projectId).revision;
    if (ownAnchor)
      expect(
        deps.db
          .prepare(
            "UPDATE revision_work_reservations SET logical_key=work_key,desired_fingerprint=fingerprint WHERE revision_id=? AND work_key LIKE 'review:image:%'",
          )
          .run(head.id).changes,
      ).toBe(2);
    expect(Object.keys(head.fingerprints).filter((key) => key.startsWith("review:"))).toEqual([]);
    const next = wire();
    hold.blocks = false;
    // Continue the run (`POST /api/projects/:id/resume`).
    expect(
      await recoverProject({ ...deps, runner: next }, h.projectId, {
        baseRevisionId: head.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" },
      }),
    ).toMatchObject({ ok: true });
    await vi.waitFor(
      async () => {
        next.tick(h.projectId);
        await next.settled();
        expect(checked(deps, h.projectId)).toEqual(["image:one", "image:two"]);
      },
      { timeout: 10_000, interval: 50 },
    );
    expect(asked).toHaveLength(2);
  });
