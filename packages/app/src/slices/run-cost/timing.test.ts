import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { coveredMs, projectTiming } from "./timing.js";

const open: DatabaseSync[] = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close();
});

const at = (time: string) => Date.parse(`2026-09-27T${time}:00.000Z`);

// A project whose audio started at 10:00 and still runs, and whose images a crash left with
// an attempt that never ended.
function running(): DatabaseSync {
  const db = openDb(":memory:");
  open.push(db);
  migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
  db.exec(`
    INSERT INTO projects VALUES ('p1','Run','16:9','{}','2026-09-27','2026-09-27');
    INSERT INTO stages (id, project_id, kind, source, state) VALUES
      ('s1','p1','audio','generate','running'), ('s2','p1','images','generate','failed');
    INSERT INTO project_revisions (id, project_id, config, content, fingerprints, created_at)
      VALUES ('r1','p1','{}','{}','{}','2026-09-27');
    INSERT INTO project_heads VALUES ('p1','r1');
    INSERT INTO revision_work (id, project_id, revision_id, stage_id, kind, fingerprint, state,
      dispatch_state, created_at) VALUES
      ('w1','p1','r1','s1','audio','f','running','allowed','2026-09-27'),
      ('w2','p1','r1','s2','images','f','failed','allowed','2026-09-27');
    INSERT INTO attempts (id, stage_id, n, started_at, ended_at, revision_id, work_id) VALUES
      ('a1','s1',1,'2026-09-27T10:00:00.000Z',NULL,'r1','w1'),
      ('a2','s2',1,'2026-09-27T09:00:00.000Z',NULL,'r1','w2');
  `);
  return db;
}

describe("how long a project took", () => {
  it("counts time that steps running side by side share once", () => {
    expect(
      coveredMs([
        [at("10:02"), at("10:05")],
        [at("10:00"), at("10:02")],
        [at("10:03"), at("10:04")],
        [at("10:35"), at("10:36")],
      ]),
    ).toBe(6 * 60_000);
    expect(coveredMs([])).toBe(0);
  });

  it("keeps a running run's clock open, and never one a crash left open", () => {
    const timing = projectTiming(running(), "p1", at("10:12"));
    expect(timing.run).toEqual({ current: true, running: true, workingMs: 12 * 60_000 });
    expect(timing.byStage.get("images")).toBe(0);
  });

  it("falls back to the last run that ran something when the current revision reused it all", () => {
    const db = running();
    db.exec(`
      INSERT INTO project_revisions (id, project_id, parent_id, config, content, fingerprints,
        created_at) VALUES ('r2','p1','r1','{}','{}','{}','2026-09-28');
      UPDATE project_heads SET revision_id = 'r2';
    `);
    const run = projectTiming(db, "p1", at("10:12")).run;
    expect(run).toEqual({ current: false, running: true, workingMs: 12 * 60_000 });
  });
});
