import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { retainedPreviewPlan } from "./preview-retained.js";
import { recipe } from "./recipe-model.js";
import { dependentClosure, recoverySelection, regenerationEdit } from "./recovery-selection.js";
import { paidServiceFixture } from "./service.fake.js";

it("reruns only generated images and selects their video closure", async () => {
  const h = await paidServiceFixture();
  try {
    const plan = retainedPreviewPlan(h.deps, h.base, h.catalogue);
    const edit = regenerationEdit(h.base, plan, "images");
    expect(edit?.regenerate).toEqual(["image:one", "image:two"]);
    expect(edit?.content).toEqual(h.base.revision.content);
    expect(recoverySelection(plan, "images")).toEqual({
      kind: "selected",
      workKeys: ["image:one", "image:two"],
    });
    expect(regenerationEdit(h.base, plan, "article")).toBeUndefined();
    expect(regenerationEdit(h.base, plan, "research")).toBeUndefined();
    expect(dependentClosure(plan.recipes, ["image:one"])).toEqual(["image:one"]);
    if (!edit) throw new Error("Missing regeneration edit");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "selection-save",
      edit,
    });
    expect(saved.ok).toBe(true);
    expect(h.ticks).toEqual([]);
  } finally {
    h.close();
  }
});

it("changes identical future research requests only when research is deliberately rerun", () => {
  const content = {
    provided: {},
    imageOrder: [],
    imageDefinitions: {},
    narrationOverrides: {},
    regenerationTokens: {},
    promptTemplates: {},
  };
  const input = { kind: "local", version: 1, operation: "provided-notes", values: "same" } as const;
  for (const key of [
    "research:planner",
    "research:chapter:1",
    "research:chapter:19",
    "research:notes",
  ]) {
    const before = recipe({ content }, key, "research", input);
    const after = recipe(
      {
        content: {
          ...content,
          regenerationTokens: { "research:all": "new-intent" },
        },
      },
      key,
      "research",
      input,
    );
    expect(after.requestFingerprint).toBe(before.requestFingerprint);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  }
  expect(recipe({ content }, "article:body", "article", input)).toEqual(
    recipe(
      { content: { ...content, regenerationTokens: { "research:all": "new-intent" } } },
      "article:body",
      "article",
      input,
    ),
  );
});
