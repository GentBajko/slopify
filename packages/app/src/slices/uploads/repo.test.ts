import { afterEach, expect, it } from "vitest";
import { emptyView } from "../rebuild/recipe-fixture.js";
import { waitingReviewFixture } from "../reviews/external-repo.fake.js";
import { insertRevision } from "../revisions/repo.js";
import { uploadedAndSettled } from "./repo.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

// p1, uploaded, whose images step was admitted by a remake of its current version
// (`recipe_context`) and held by a restart, its stage not finished.
function heldRemake() {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare(
    "UPDATE revision_work SET dispatch_state='held',recipe_context='{}' WHERE id='images-work'",
  ).run();
  db.prepare(
    "INSERT INTO project_uploads(project_id,uploaded_at) VALUES ('p1','2026-09-11')",
  ).run();
  return db;
}

it("keeps an uploaded project unsettled while a held remake of its current version waits", () => {
  const db = heldRemake();
  expect([...uploadedAndSettled(db)]).toEqual([]);
  expect([...uploadedAndSettled(db, "p1")]).toEqual([]);
});

it("settles it once the remade stage is finished, whatever its held step says", () => {
  const db = heldRemake();
  db.prepare("UPDATE stages SET state='done' WHERE id='images'").run();
  expect([...uploadedAndSettled(db)]).toEqual(["p1"]);
});

it("settles it when no version reserves the held step", () => {
  const db = heldRemake();
  db.prepare("DELETE FROM revision_work_reservations WHERE work_id='images-work'").run();
  expect([...uploadedAndSettled(db)]).toEqual(["p1"]);
});

// An edit after the remake made a new current version: the remake of the older one is nothing
// left to continue, so the project reads Done rather than Stopped.
it("settles it when only an older version reserves the held step", () => {
  const db = heldRemake();
  const newer = emptyView();
  insertRevision(db, {
    ...newer.revision,
    id: "r2",
    parentId: "r1",
    createdAt: "2026-09-12T00:00:00Z",
  });
  db.prepare("UPDATE project_heads SET revision_id='r2' WHERE project_id='p1'").run();
  expect([...uploadedAndSettled(db)]).toEqual(["p1"]);
});

it("keeps an uploaded project unsettled while a step is still allowed to run", () => {
  const db = heldRemake();
  db.prepare("UPDATE revision_work SET dispatch_state='allowed' WHERE id='images-work'").run();
  expect([...uploadedAndSettled(db)]).toEqual([]);
});

it("reads one project alone when asked for one", () => {
  const db = heldRemake();
  db.prepare("UPDATE stages SET state='done' WHERE id='images'").run();
  db.prepare(
    "INSERT INTO projects(id,title,format,config,created_at,updated_at) SELECT 'p2',title,format,config,created_at,updated_at FROM projects WHERE id='p1'",
  ).run();
  db.prepare(
    "INSERT INTO project_uploads(project_id,uploaded_at) VALUES ('p2','2026-09-11')",
  ).run();
  expect([...uploadedAndSettled(db)].sort()).toEqual(["p1", "p2"]);
  expect([...uploadedAndSettled(db, "p2")]).toEqual(["p2"]);
});
