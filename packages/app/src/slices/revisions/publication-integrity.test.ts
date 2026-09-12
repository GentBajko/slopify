import { afterEach, expect, it } from "vitest";
import { imageFixture, mutationFixture, preparedOutput, publicationFor } from "./mutation.fake.js";
import { saveRevision } from "./mutations.js";
import type { PreparedPiece } from "./publication-model.js";
import { commitRevisionOutputs } from "./publish.js";
import { getRevisionView } from "./view.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = await imageFixture();
  cleanups.push(h.close);
  return h;
}
it("rejects an owned piece published under a sibling key or fingerprint", async () => {
  const h = await fixture();
  const publication = publicationFor(h.deps, h.base, "image:first");
  if (publication.pieceId === null) throw new Error("Expected piece.");
  const row: PreparedPiece = {
    key: "image:first",
    fingerprint: publication.work.fingerprint,
    stageKind: "images",
    asset: null,
    piece: {
      id: publication.pieceId,
      stageId: publication.work.stageId,
      kind: "image",
      idx: 1,
      state: "done",
      payload: null,
    },
  };
  expect(() =>
    commitRevisionOutputs(h.deps, publication, [], [{ ...row, key: "image:second" }]),
  ).toThrow("owned work");
  expect(() =>
    commitRevisionOutputs(h.deps, publication, [], [{ ...row, fingerprint: "wrong" }]),
  ).toThrow("owned work");
});
it("accepts durable resolved logical output provenance while origin authority remains deferred", async () => {
  const h = await fixture();
  const publication = publicationFor(h.deps, h.base, "image:first");
  h.deps.db
    .prepare("UPDATE project_revisions SET fingerprints=? WHERE id=?")
    .run(JSON.stringify({ "image:future": "deferred" }), h.base.revision.id);
  h.deps.db
    .prepare(
      "UPDATE revision_work_reservations SET logical_key='image:future',desired_fingerprint='deferred' WHERE piece_id=?",
    )
    .run(publication.pieceId);
  h.deps.db
    .prepare("UPDATE revision_work_pieces SET logical_fingerprint='resolved-logical' WHERE id=?")
    .run(publication.pieceId);
  const image = {
    ...preparedOutput(h.deps, publication, "image:first", "image", "image:first"),
    fingerprint: "resolved-logical",
  };
  expect(commitRevisionOutputs(h.deps, publication, [image], []).currentAttached).toBe(true);
});
it("retains a submitted work-level result after its origin reservation was removed", async () => {
  const h = await fixture();
  const piecePublication = publicationFor(h.deps, h.base, "image:first");
  const publication = {
    ...piecePublication,
    pieceId: null,
    publicationId: piecePublication.work.workId,
  };
  h.deps.db
    .prepare("UPDATE revision_work_reservations SET piece_id=NULL WHERE work_id=?")
    .run(publication.work.workId);
  const image = preparedOutput(h.deps, publication, "image:first", "image", "image:first");
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "change",
    edit: {
      config: h.base.revision.config,
      content: {
        ...h.base.revision.content,
        imageDefinitions: {
          ...h.base.revision.content.imageDefinitions,
          first: { source: "generate", assetId: null, prompt: "Different" },
        },
      },
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  expect(
    h.deps.db
      .prepare("SELECT 1 FROM revision_work_reservations WHERE work_id=?")
      .get(publication.work.workId),
  ).toBeUndefined();
  expect(commitRevisionOutputs(h.deps, publication, [image], []).currentAttached).toBe(false);
  expect(getRevisionView(h.deps, h.projectId, h.base.revision.id)?.outputs).toContainEqual(
    expect.objectContaining({ publicationId: publication.publicationId, selected: false }),
  );
});
it("rolls back all bundle members and assets on a later projection failure", async () => {
  const h = await mutationFixture();
  cleanups.push(h.close);
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: "generated",
    edit: {
      config: {
        ...h.config,
        sources: { ...h.config.sources, article: "generate" },
        llm: { provider: "text", model: "llm" },
        rendered: { article: "Write." },
      },
      content: { ...h.base.revision.content, promptTemplates: { article: "Write." } },
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const publication = publicationFor(h.deps, saved.view, "article:body");
  const md = preparedOutput(h.deps, publication, "article:body", "article_md");
  const txt = preparedOutput(h.deps, publication, "article:body", "article_txt");
  h.deps.db.exec(
    "CREATE TRIGGER fail_second BEFORE INSERT ON outputs WHEN NEW.role='article_txt' BEGIN SELECT RAISE(ABORT,'second member'); END",
  );
  expect(() => commitRevisionOutputs(h.deps, publication, [md, txt], [])).toThrow("second member");
  expect(
    h.deps.db
      .prepare("SELECT 1 FROM revision_outputs WHERE publication_id=?")
      .get(publication.publicationId),
  ).toBeUndefined();
  expect(
    h.deps.db.prepare("SELECT 1 FROM project_assets WHERE id=?").get(md.asset.id),
  ).toBeUndefined();
});
