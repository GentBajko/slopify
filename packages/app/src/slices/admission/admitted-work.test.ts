import { afterEach, expect, it, vi } from "vitest";
import { revisionFixture } from "../revisions/revision.fake.js";
import { admittedStates, parkedKinds } from "./admitted-work.js";
import { stageStandingsByProject, stagesOf } from "./repo.js";

let close: (() => void) | undefined;
afterEach(() => {
  close?.();
  close = undefined;
});

// Every list, calendar and needs_attention read asks of each stage whether its work is admitted
// for the current version: a reservation is found by its step, not by a scan of every
// reservation ever made (seconds on a library of a few dozen projects).
it("finds a step's reservations by their index in every statement that asks", () => {
  const h = revisionFixture();
  close = h.close;
  const prepared = vi.spyOn(h.deps.db, "prepare");
  stageStandingsByProject(h.deps.db);
  stagesOf(h.deps.db, h.projectId);
  admittedStates(h.deps.db, h.projectId);
  parkedKinds(h.deps.db, h.projectId);
  const statements = prepared.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes("revision_work_reservations"));
  prepared.mockRestore();
  expect(statements).toHaveLength(4);
  for (const sql of statements) {
    const plan = h.deps.db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...(sql.includes("?") ? [h.projectId] : []))
      .map((row) => String(row.detail))
      .join("\n");
    expect(plan).not.toMatch(/SCAN r\b/);
    expect(plan).toMatch(/SEARCH r USING (COVERING )?INDEX revision_work_reservations_work/);
  }
});
