import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { firstRunView } from "./first-run.js";

const at = "2026-09-27T10:00:00.000Z";

// A template studio sample (or its bake-off copy) is the studio's, never the person's first
// project: the first-run screen stays until they make one of their own.
it("does not count a template studio sample as the person's first project", () => {
  const db = openDb(":memory:");
  migrate(db, fixedClock(at));
  db.prepare(
    "INSERT INTO project_templates (id,head_version,creation_hash,created_at) VALUES ('t1',1,'h',?)",
  ).run(at);
  db.prepare(
    "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES ('sample','Studio sample','16:9','{}',?,?)",
  ).run(at, at);
  db.prepare(
    "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES ('t1','sample','Topic','fixed',0,?)",
  ).run(at);
  expect(firstRunView(db, [])).toMatchObject({ show: true, settle: false });
  db.prepare(
    "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES ('mine','Mine','16:9','{}',?,?)",
  ).run(at, at);
  expect(firstRunView(db, [])).toMatchObject({ show: false, settle: true });
});
