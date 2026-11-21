import { expect, it } from "vitest";
import { type FingerprintValue, fingerprint, fingerprintJson } from "../../kernel/runner/work.js";
import { catalogue } from "../model-checks/catalogue.fake.js";
import { executionPlan, executionView } from "./runtime-plan.js";
import { workFixture } from "./work.fake.js";

// A recipe is fingerprinted as JSON writes its input (`recipe-model.ts`), now in one pass: every
// input a plan holds gets the fingerprint the write-read-write gave it.
const old = (value: unknown): string =>
  fingerprint(JSON.parse(JSON.stringify(value)) as FingerprintValue);

it("gives the old fingerprint for every recipe input of a plan", async () => {
  const h = await workFixture();
  try {
    const view = executionView(h.deps, h.work.projectId, h.work.revisionId);
    if (view === undefined) throw new Error("no view");
    const plan = executionPlan(h.deps, view, catalogue);
    expect(plan.recipes.length).toBeGreaterThan(0);
    for (const recipe of plan.recipes)
      expect([recipe.key, fingerprintJson(recipe.input)]).toEqual([recipe.key, old(recipe.input)]);
  } finally {
    h.close();
  }
});
