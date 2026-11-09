import { afterEach, describe, expect, it } from "vitest";
import { catalogue } from "../model-checks/catalogue.fake.js";
import { executionPlan, executionView } from "./runtime-plan.js";
import { workFixture } from "./work.fake.js";

// Ten callers ask for the plan and each used to derive it from scratch, which is what pinned
// the server at 240 images. It is kept now while nothing in the database has changed, and
// thrown away the moment anything is written, because a stale plan would start the wrong work.

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

async function fixture() {
  const h = await workFixture();
  cleanups.push(h.close);
  const view = executionView(h.deps, h.work.projectId, h.work.revisionId);
  if (view === undefined) throw new Error("no view");
  return { ...h, view };
}

describe("the execution plan", () => {
  it("is derived once while nothing has been written", async () => {
    const { deps, view } = await fixture();
    const first = executionPlan(deps, view, catalogue);
    const second = executionPlan(deps, view, catalogue);
    const third = executionPlan(deps, view, catalogue);
    // The same object back: no second derivation, which is the whole point.
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("is derived again after anything is written", async () => {
    const { deps, view, work } = await fixture();
    const before = executionPlan(deps, view, catalogue);
    deps.db.prepare("UPDATE revision_work SET progress_current=1 WHERE id=?").run(work.workId);
    const after = executionPlan(deps, view, catalogue);
    expect(after).not.toBe(before);
    // Same inputs, so the plan it derives says the same thing.
    expect(after.recipes.map((one) => one.key)).toEqual(before.recipes.map((one) => one.key));
  });

  it("does not hand one catalogue's plan to another", async () => {
    const { deps, view } = await fixture();
    const first = executionPlan(deps, view, catalogue);
    const other = { ...catalogue, updatedAt: "2099-01-01" };
    expect(executionPlan(deps, view, other)).not.toBe(first);
  });

  it("keeps each revision's plan apart", async () => {
    const a = await fixture();
    const b = await fixture();
    const planA = executionPlan(a.deps, a.view, catalogue);
    const planB = executionPlan(b.deps, b.view, catalogue);
    expect(planB).not.toBe(planA);
  });
});
