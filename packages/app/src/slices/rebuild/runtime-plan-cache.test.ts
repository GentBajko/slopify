import { afterEach, describe, expect, it } from "vitest";
import { catalogue } from "../model-checks/catalogue.fake.js";
import { executionPlan, executionView } from "./runtime-plan.js";
import { workFixture } from "./work.fake.js";

// Ten callers ask for the plan and each used to derive it from scratch, which is what pinned
// the server at 240 images. It is kept now while nothing it is derived from has changed, and
// derived again the moment any of that changes, because a stale plan would start the wrong
// work (`runtime-plan-inputs.test.ts` changes each input in turn).

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

  it("is kept through a write that changes nothing it is derived from", async () => {
    const { deps, view, work } = await fixture();
    const before = executionPlan(deps, view, catalogue);
    // A step's progress, as every running step writes many times over.
    deps.db.prepare("UPDATE revision_work SET progress_current=1 WHERE id=?").run(work.workId);
    expect(executionPlan(deps, view, catalogue)).toBe(before);
  });

  it("is derived again when the version it is derived from changes", async () => {
    const { deps, view, work } = await fixture();
    const before = executionPlan(deps, view, catalogue);
    deps.db
      .prepare("UPDATE project_revisions SET fingerprints=? WHERE id=?")
      .run(JSON.stringify({ changed: "yes" }), work.revisionId);
    const changed = executionView(deps, work.projectId, work.revisionId);
    if (changed === undefined) throw new Error("no view");
    const after = executionPlan(deps, changed, catalogue);
    expect(after).not.toBe(before);
    // Same recipes: the fingerprints are not what the recipes are built from.
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

  // A dozen runs go at once, each asking for its plan after every step, and a redo plans the
  // versions its held work came from too. Keeping only nine threw every plan away before its
  // own project asked again.
  it("keeps the plans of a dozen versions at once", async () => {
    const { deps, work, nextRevision } = await fixture();
    const views = Array.from({ length: 16 }, (_, n) => {
      nextRevision(`v${n}`, { "image:i1": "old" });
      const view = executionView(deps, work.projectId, `v${n}`);
      if (view === undefined) throw new Error("no view");
      return view;
    });
    const first = views.map((view) => executionPlan(deps, view, catalogue));
    views.forEach((view, n) => {
      expect(executionPlan(deps, view, catalogue)).toBe(first[n]);
    });
  });
});
