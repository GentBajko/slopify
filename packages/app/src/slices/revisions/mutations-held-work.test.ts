import { afterEach, expect, it } from "vitest";
import { executionStandings } from "../rebuild/runtime-store.js";
import type { RevisionView } from "./model.js";
import { imageFixture, preparedOutput, publicationFor } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { commitRevisionOutputs } from "./publish.js";
import { getRevisionView } from "./view.js";

type Fixture = Awaited<ReturnType<typeof imageFixture>>;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function withPrompt(
  h: Fixture,
  view: RevisionView,
  prompt: string,
  key: string,
): Promise<RevisionView> {
  const first = view.revision.content.imageDefinitions.first;
  if (first === undefined) throw new Error("Expected the first image.");
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: view.revision.id,
    idempotencyKey: key,
    edit: {
      config: view.revision.config,
      content: {
        ...view.revision.content,
        imageDefinitions: {
          ...view.revision.content.imageDefinitions,
          first: { ...first, prompt },
        },
      },
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  return saved.view;
}
function rowCount(h: Fixture, key: string): number {
  return Number(
    h.deps.db
      .prepare(
        "SELECT count(*) AS n FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id WHERE p.work_key=?",
      )
      .get(key)?.n,
  );
}
function reserved(h: Fixture, view: RevisionView, key: string) {
  return h.deps.db
    .prepare(
      "SELECT r.work_id,w.state FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.revision_id=? AND r.work_key=?",
    )
    .get(view.revision.id, key);
}

it("reserves the finished result again when an edit is undone, instead of a new held copy", async () => {
  const h = await imageFixture();
  cleanups.push(h.close);
  const publication = publicationFor(h.deps, h.base, "image:first");
  commitRevisionOutputs(
    h.deps,
    publication,
    [preparedOutput(h.deps, publication, "image:first", "image")],
    [],
  );
  h.deps.db
    .prepare("UPDATE revision_work SET state='done' WHERE id=?")
    .run(publication.work.workId);
  h.deps.db
    .prepare("UPDATE revision_work_pieces SET state='done' WHERE work_id=?")
    .run(publication.work.workId);
  const fresh = getRevisionView(h.deps, h.projectId, h.base.revision.id);
  if (fresh === undefined) throw new Error("Missing revision.");
  const changed = await withPrompt(h, fresh, "Changed", "changed");
  expect(reserved(h, changed, "image:first")).toMatchObject({ state: "pending" });
  const undone = await withPrompt(h, changed, "First", "undone");
  expect(reserved(h, undone, "image:first")).toEqual({
    work_id: publication.work.workId,
    state: "done",
  });
  expect(undone.outputs.find((row) => row.workKey === "image:first" && row.selected)?.state).toBe(
    "ready",
  );
  expect(rowCount(h, "image:first")).toBe(2);
  expect(executionStandings(h.deps, h.projectId).find((row) => row.kind === "images")).toEqual({
    kind: "images",
    state: "pending",
  });
});

it("keeps one held row per step however often a waiting edit is saved", async () => {
  const h = await imageFixture();
  cleanups.push(h.close);
  let view = h.base;
  for (const [index, prompt] of ["Changed", "First", "Changed", "First", "Changed"].entries())
    view = await withPrompt(h, view, prompt, `save-${index}`);
  // The fixture's held row for "First", and one for "Changed" - not one per save.
  expect(rowCount(h, "image:first")).toBe(2);
  expect(rowCount(h, "image:second")).toBe(1);
  expect(reserved(h, view, "image:first")).toMatchObject({ state: "pending" });
});

it("drops a held step planned for a result the version no longer wants, rather than carry it", async () => {
  const h = await imageFixture();
  cleanups.push(h.close);
  const changed = await withPrompt(h, h.base, "Changed", "changed");
  const held = reserved(h, changed, "image:first") as { work_id: string } | undefined;
  if (held === undefined) throw new Error("Expected a held step.");
  // The held step was planned for another result than the version now asks for (a newer
  // Slopify plans the same edit differently, say), and nobody started it.
  h.deps.db
    .prepare(
      "UPDATE revision_work_reservations SET fingerprint='stale' WHERE work_id=? AND desired_fingerprint IS NULL",
    )
    .run(held.work_id);
  h.deps.db.prepare("UPDATE revision_work SET fingerprint='stale' WHERE id=?").run(held.work_id);
  h.deps.db
    .prepare("UPDATE revision_work_pieces SET fingerprint='stale' WHERE work_id=?")
    .run(held.work_id);
  const again = await withPrompt(h, changed, "Changed", "again");
  expect((reserved(h, again, "image:first") as { work_id: string }).work_id).not.toBe(held.work_id);
});
