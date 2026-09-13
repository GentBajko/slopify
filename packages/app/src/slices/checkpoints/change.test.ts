import { afterEach, expect, it, vi } from "vitest";
import { config, emptyView } from "../rebuild/recipe-fixture.js";
import { insertRevision } from "../revisions/repo.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { changeCheckpoints, readCheckpointStatus } from "./change.js";
import { listCheckpoints } from "./repo.js";

const catalogue = {
  schemaVersion: 1 as const,
  updatedAt: "2026-09-13",
  providers: {},
  llm: [],
  image: [],
  tts: [],
};
const closers: (() => void)[] = [];
it("logs only bounded gate identity when a work snapshot cannot be resolved", () => {
  const h = fixture();
  expect(
    changeCheckpoints(h.deps, {
      projectId: h.projectId,
      revisionId: h.revisionId,
      stages: ["images"],
    }).ok,
  ).toBe(true);
  h.deps.db
    .prepare("UPDATE revision_work SET recipe_context=?")
    .run('{"secret":"private-payload"}');
  const write = vi.fn();
  expect(readCheckpointStatus({ ...h.deps, log: { write } }, h.projectId)).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(write).toHaveBeenCalledExactlyOnceWith("warn", "checkpoint.resolve", {
    projectId: h.projectId,
    stage: "images",
  });
});
afterEach(() => {
  for (const close of closers.splice(0)) close();
});
function fixture() {
  const h = revisionFixture();
  closers.push(h.close);
  const view = emptyView({ ...config, sources: { ...config.sources, audio: "generate" } });
  insertRevision(h.deps.db, view.revision);
  h.deps.db.prepare("INSERT INTO project_heads VALUES (?,?)").run(h.projectId, view.revision.id);
  for (const kind of ["audio", "images", "video"]) {
    h.deps.db
      .prepare(
        "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
      )
      .run(kind, h.projectId, kind);
    h.deps.db
      .prepare(
        "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,recipe_context,state,dispatch_state,created_at) VALUES (?,?,?,?,?,?,?,'pending','allowed',?)",
      )
      .run(
        `${kind}-work`,
        h.projectId,
        view.revision.id,
        kind,
        kind,
        "a".repeat(64),
        JSON.stringify(catalogue),
        h.deps.clock.now().toISOString(),
      );
  }
  return { ...h, revisionId: view.revision.id };
}
it("makes a repeated pre-start set a no-op and does not reuse a removed gate identity", () => {
  const h = fixture();
  const input = { projectId: h.projectId, revisionId: h.revisionId, stages: ["audio"] as const };
  const first = changeCheckpoints(h.deps, input);
  expect(first).toMatchObject({ ok: true, value: { changed: true, released: false } });
  const before = listCheckpoints(h.deps.db, h.projectId, h.revisionId);
  expect(changeCheckpoints(h.deps, input)).toMatchObject({ ok: true, value: { changed: false } });
  expect(listCheckpoints(h.deps.db, h.projectId, h.revisionId)).toEqual(before);
  expect(changeCheckpoints(h.deps, { ...input, stages: [] })).toMatchObject({
    ok: true,
    value: { released: true },
  });
  expect(changeCheckpoints(h.deps, input).ok).toBe(true);
  expect(listCheckpoints(h.deps.db, h.projectId, h.revisionId)[0]?.checkpointId).not.toBe(
    before[0]?.checkpointId,
  );
});
it("validates every changed stage before writing any part of the replacement", () => {
  const h = fixture();
  h.deps.db.exec("UPDATE revision_work SET state='running' WHERE kind='images'");
  expect(
    changeCheckpoints(h.deps, {
      projectId: h.projectId,
      revisionId: h.revisionId,
      stages: ["audio", "images"],
    }),
  ).toMatchObject({ ok: false, reason: "conflict" });
  expect(listCheckpoints(h.deps.db, h.projectId, h.revisionId)).toEqual([]);
});
it("refuses canceled projects and stale revisions without rewriting gates", () => {
  const h = fixture();
  const input = { projectId: h.projectId, revisionId: h.revisionId, stages: ["audio"] as const };
  expect(changeCheckpoints(h.deps, { ...input, revisionId: "stale" })).toMatchObject({
    ok: false,
    reason: "conflict",
  });
  h.deps.db.exec("UPDATE stages SET state='canceled' WHERE kind='video'");
  expect(changeCheckpoints(h.deps, input)).toMatchObject({ ok: false, reason: "conflict" });
});
