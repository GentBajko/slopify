import { afterEach, expect, it } from "vitest";
import { imageFixture, preparedOutput, publicationFor } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import { commitRevisionOutputs } from "./publish.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
async function fixture() {
  const h = await imageFixture();
  cleanups.push(h.close);
  return h;
}
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

it("attaches unchanged late work to the current revision, preserving origin image order", async () => {
  const h = await fixture();
  const publication = publicationFor(h.deps, h.base, "image:first");
  const image = preparedOutput(h.deps, publication, "image:first", "image", "image:first");
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "reorder",
    edit: {
      config: h.base.revision.config,
      content: { ...h.base.revision.content, imageOrder: ["second", "first"] },
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  expect(commitRevisionOutputs(h.deps, publication, [image], []).currentAttached).toBe(true);
  expect(
    getRevisionView(h.deps, h.projectId, h.base.revision.id)?.outputs.find(
      (row) => row.publicationId === publication.publicationId,
    )?.output.meta.index,
  ).toBe(1);
  expect(
    getRevisionView(h.deps, h.projectId, saved.view.revision.id)?.outputs.find(
      (row) => row.publicationId === publication.publicationId,
    )?.output.meta.index,
  ).toBe(2);
});

it.each(["prompt", "regenerate"] as const)(
  "keeps a late %s replacement only in its original revision",
  async (change) => {
    const h = await fixture();
    const publication = publicationFor(h.deps, h.base, "image:first");
    const image = preparedOutput(h.deps, publication, "image:first", "image", "image:first");
    const content =
      change === "prompt"
        ? {
            ...h.base.revision.content,
            imageDefinitions: {
              ...h.base.revision.content.imageDefinitions,
              first: { source: "generate" as const, prompt: "Changed", assetId: null },
            },
          }
        : h.base.revision.content;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "change",
      edit: {
        config: h.base.revision.config,
        content,
        ...(change === "regenerate" ? { regenerate: ["image:first"] } : {}),
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const provider = Promise.resolve(image);
    expect(commitRevisionOutputs(h.deps, publication, [await provider], []).currentAttached).toBe(
      false,
    );
    expect(getRevisionView(h.deps, h.projectId, h.base.revision.id)?.outputs).toContainEqual(
      expect.objectContaining({ publicationId: publication.publicationId, selected: false }),
    );
    expect(
      getRevisionView(h.deps, h.projectId, saved.view.revision.id)?.outputs.some(
        (row) => row.publicationId === publication.publicationId,
      ),
    ).toBe(false);
  },
);

it("does not reselect or append a replay after a newer selection and head", async () => {
  const h = await fixture();
  const publication = publicationFor(h.deps, h.base, "image:first");
  const image = preparedOutput(h.deps, publication, "image:first", "image", "image:first");
  commitRevisionOutputs(h.deps, publication, [image], []);
  h.deps.db
    .prepare("UPDATE revision_outputs SET selected=0 WHERE publication_id=?")
    .run(publication.publicationId);
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "title",
    edit: { config: { ...h.base.revision.config, title: "New" }, content: h.base.revision.content },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const before = h.deps.db.prepare("SELECT * FROM revision_outputs ORDER BY id").all();
  expect(commitRevisionOutputs(h.deps, publication, [image], []).currentAttached).toBe(false);
  expect(h.deps.db.prepare("SELECT * FROM revision_outputs ORDER BY id").all()).toEqual(before);
  expect(() =>
    commitRevisionOutputs(
      h.deps,
      publication,
      [{ ...image, output: { ...image.output, meta: { index: 4 } } }],
      [],
    ),
  ).toThrow("complete retained result");
  expect(() =>
    commitRevisionOutputs(h.deps, publication, [image, { ...image, slot: "extra" }], []),
  ).toThrow("complete retained result");
});

it("rejects descriptor ownership mismatches before registering files", async () => {
  const h = await fixture();
  const publication = publicationFor(h.deps, h.base, "image:first");
  for (const bad of [
    { projectId: "other" },
    { stageKind: "article" as const },
    { path: "other.txt" },
    { bytes: 1000 },
  ]) {
    const image = preparedOutput(h.deps, publication, "image:first", "image", "image:first");
    expect(() =>
      commitRevisionOutputs(
        h.deps,
        publication,
        [{ ...image, output: { ...image.output, ...bad } }],
        [],
      ),
    ).toThrow("owned asset");
    expect(
      h.deps.db.prepare("SELECT 1 FROM project_assets WHERE id=?").get(image.asset.id),
    ).toBeUndefined();
  }
});

it("never recreates a deleted project for late work", async () => {
  const h = await fixture();
  const publication = publicationFor(h.deps, h.base, "image:first");
  const image = preparedOutput(h.deps, publication, "image:first", "image", "image:first");
  h.deps.db.prepare("DELETE FROM projects WHERE id=?").run(h.projectId);
  expect(commitRevisionOutputs(h.deps, publication, [image], []).currentAttached).toBe(false);
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM project_assets").get()).toEqual({ n: 0 });
  expect(h.deps.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("rejects cross-project assets and retains deselected publications", async () => {
  const h = await fixture();
  const { db } = h.deps;
  const revisionId = h.base.revision.id;
  db.exec("INSERT INTO projects VALUES ('other','Other','16:9','{}','old','old')");
  db.exec("INSERT INTO project_assets VALUES ('foreign','other','file.wav',1,'old')");
  const put = db.prepare(`INSERT INTO revision_outputs
    (id,project_id,revision_id,slot,work_key,asset_id,fingerprint,state,descriptor,
     publication_id,selected,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  expect(() =>
    put.run(
      "bad",
      h.projectId,
      revisionId,
      "wav",
      "export:wav",
      "foreign",
      "f",
      "ready",
      "{}",
      "publication",
      1,
      "old",
    ),
  ).toThrow();
  db.prepare("INSERT INTO project_assets VALUES (?,?,?,?,?)").run(
    "owned",
    h.projectId,
    "old.wav",
    1,
    "old",
  );
  put.run(
    "first",
    h.projectId,
    revisionId,
    "wav",
    "export:wav",
    "owned",
    "f",
    "ready",
    "{}",
    "pub1",
    0,
    "old",
  );
  put.run(
    "second",
    h.projectId,
    revisionId,
    "wav",
    "export:wav",
    "owned",
    "g",
    "ready",
    "{}",
    "pub2",
    1,
    "old",
  );
  expect(() =>
    put.run(
      "third",
      h.projectId,
      revisionId,
      "wav",
      "export:wav",
      "owned",
      "g",
      "ready",
      "{}",
      "pub3",
      1,
      "old",
    ),
  ).toThrow();
  expect(() =>
    put.run(
      "duplicate",
      h.projectId,
      revisionId,
      "wav",
      "export:wav",
      "owned",
      "g",
      "ready",
      "{}",
      "pub2",
      0,
      "old",
    ),
  ).toThrow();
  expect(db.prepare("SELECT count(*) AS n FROM revision_outputs WHERE slot='wav'").get()).toEqual({
    n: 2,
  });
  db.prepare("DELETE FROM projects WHERE id=?").run(h.projectId);
  expect(db.prepare("SELECT id FROM project_assets").all()).toEqual([{ id: "foreign" }]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
