import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createCheckpointAuthority } from "../../kernel/runner/checkpoint-authority.js";
import { checkpointClosure, checkpointFingerprint } from "../../slices/checkpoints/fingerprint.js";
import {
  approveCheckpoint,
  listCheckpoints,
  saveCheckpointSet,
} from "../../slices/checkpoints/repo.js";
import { config, emptyView } from "../../slices/rebuild/recipe-fixture.js";
import { executionPlan } from "../../slices/rebuild/runtime-plan.js";
import { insertRevision } from "../../slices/revisions/repo.js";
import { revisionFixture } from "../../slices/revisions/revision.fake.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const catalogue = {
  schemaVersion: 1 as const,
  updatedAt: "2026-09-13",
  providers: {},
  llm: [],
  image: [],
  tts: [],
};
const close: (() => void)[] = [];
afterEach(() => {
  for (const dispose of close.splice(0)) dispose();
});
function fixture() {
  const h = revisionFixture();
  close.push(h.close);
  const { db } = h.deps;
  const view = emptyView({ ...config, sources: { ...config.sources, audio: "generate" } });
  insertRevision(db, view.revision);
  db.prepare("INSERT INTO project_heads VALUES (?,?)").run(h.projectId, view.revision.id);
  for (const kind of ["audio", "images", "video"]) {
    db.prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
    ).run(kind, h.projectId, kind);
    db.prepare(
      "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,recipe_context,state,dispatch_state,created_at) VALUES (?,?,?,?,?,?,?,'pending','allowed',?)",
    ).run(
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
  const plan = executionPlan(h.deps, view, catalogue);
  const fingerprint = checkpointFingerprint(
    view.revision,
    checkpointClosure("audio", plan.recipes),
  );
  const saved = saveCheckpointSet(db, {
    projectId: h.projectId,
    revisionId: view.revision.id,
    createdAt: h.deps.clock.now().toISOString(),
    checkpoints: [
      {
        checkpointId: "audio-gate",
        stage: "audio",
        workId: "audio-work",
        fingerprint,
        state: "held",
      },
    ],
  });
  if (!saved.ok) throw new Error("Checkpoint fixture failed");
  const wake = vi.fn();
  const hub = createHub(h.deps);
  const emit = vi.fn(hub.emit);
  const checkpoints = createCheckpointAuthority({
    decide: () => ({ kind: "eligible" }),
    approve: (projectId, checkpointId, identity) =>
      approveCheckpoint(db, {
        ...identity,
        projectId,
        checkpointId,
        approvedAt: h.deps.clock.now().toISOString(),
      }),
    inTransaction: () => db.isTransaction,
    wake,
    log: h.deps.log,
  });
  const app = createApp({
    ...h.deps,
    hub: { ...hub, emit },
    runner: {
      checkpoints,
      tick: wake,
      settled: async () => undefined,
      abortProject: async () => undefined,
      abortAll: async () => undefined,
    },
    version: "test",
    webDist: "/missing",
    probe: async () => ({ ran: false, stdout: "" }),
    flushSoon: () => undefined,
  });
  const send = (path: string, method: string, body?: unknown) =>
    app.request(`/api/projects/${h.projectId}/checkpoints${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  return {
    ...h,
    db,
    send,
    app,
    view,
    fingerprint,
    wake,
    emit,
    approval: { revisionId: view.revision.id, fingerprint, idempotencyKey: randomUUID() },
  };
}

it("refuses an unreadable work snapshot without leaking its contents or releasing work", async () => {
  const h = fixture();
  h.db.prepare("UPDATE revision_work SET recipe_context=?").run('{"private":"secret-snapshot"}');
  for (const response of [
    await h.send("", "GET"),
    await h.send("/audio-gate/approve", "POST", h.approval),
    await h.send("", "PATCH", { revisionId: h.view.revision.id, stages: ["audio", "images"] }),
  ]) {
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.text()).not.toContain("secret-snapshot");
  }
  expect(h.wake).not.toHaveBeenCalled();
  expect(h.emit).not.toHaveBeenCalled();
  expect(listCheckpoints(h.db, h.projectId, h.view.revision.id)).toHaveLength(1);
});

it("lists held gates with their exact review identity and dependent work", async () => {
  const h = fixture();
  const response = await h.send("", "GET");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    revisionId: h.view.revision.id,
    checkpoints: [
      {
        checkpointId: "audio-gate",
        state: "held",
        fingerprint: h.fingerprint,
        currentFingerprint: h.fingerprint,
        dependents: ["video"],
      },
    ],
  });
  expect(h.wake).not.toHaveBeenCalled();
});
it("approves once and publishes only the committed scoped release", async () => {
  const h = fixture();
  h.emit.mockImplementation((projectId, event) => {
    expect(h.db.isTransaction).toBe(false);
    expect(listCheckpoints(h.db, h.projectId, h.view.revision.id)[0]?.state).toBe("released");
    expect(projectId).toBe(h.projectId);
    expect(event).toMatchObject({
      type: "project.updated",
      projectId: h.projectId,
      revisionId: h.view.revision.id,
    });
  });
  const first = await h.send("/audio-gate/approve", "POST", h.approval);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ checkpoint: { state: "released" }, replayed: false });
  const again = await h.send("/audio-gate/approve", "POST", h.approval);
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({ checkpoint: { state: "released" }, replayed: true });
  expect(h.wake).toHaveBeenCalledTimes(1);
  expect(h.emit).toHaveBeenCalledTimes(1);
});
it.each(["revision", "fingerprint", "canceled", "finished", "changed-input"] as const)(
  "refuses %s approval without dispatch or leaking its identity",
  async (failure) => {
    const h = fixture();
    if (failure === "canceled") h.db.exec("UPDATE stages SET state='canceled' WHERE kind='images'");
    if (failure === "finished") h.db.exec("UPDATE stages SET state='done' WHERE kind='audio'");
    if (failure === "changed-input")
      h.db
        .prepare("UPDATE project_revisions SET content=? WHERE id=?")
        .run(
          JSON.stringify({ ...h.view.revision.content, articleMarkdown: "Changed narration" }),
          h.view.revision.id,
        );
    const body = {
      ...h.approval,
      ...(failure === "revision" ? { revisionId: "stale" } : {}),
      ...(failure === "fingerprint" ? { fingerprint: "b".repeat(64) } : {}),
    };
    const response = await h.send("/audio-gate/approve", "POST", body);
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.text()).not.toContain(h.fingerprint);
    expect(h.wake).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
  },
);
it("changes pending gates with server-derived identities and preserves unrelated approvals", async () => {
  const h = fixture();
  await h.send("/audio-gate/approve", "POST", h.approval);
  const response = await h.send("", "PATCH", {
    revisionId: h.view.revision.id,
    stages: ["audio", "images"],
  });
  expect(response.status).toBe(200);
  const rows = listCheckpoints(h.db, h.projectId, h.view.revision.id);
  expect(rows.find((row) => row.stage === "audio")).toMatchObject({
    checkpointId: "audio-gate",
    state: "released",
  });
  expect(rows.find((row) => row.stage === "images")).toMatchObject({
    state: "held",
    workId: "images-work",
  });
  expect(h.wake).toHaveBeenCalledTimes(1);
  const removed = await h.send("", "PATCH", { revisionId: h.view.revision.id, stages: ["images"] });
  expect(removed.status).toBe(200);
  expect(h.wake).toHaveBeenCalledTimes(2);
  expect(listCheckpoints(h.db, h.projectId, h.view.revision.id).map((row) => row.stage)).toEqual([
    "images",
  ]);
});
it.each(["running", "submitted"] as const)("refuses gate changes after %s work", async (state) => {
  const h = fixture();
  if (state === "running")
    h.db.exec("UPDATE revision_work SET state='running' WHERE id='audio-work'");
  else
    h.db
      .prepare(
        "INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,state,dispatch_state,submitted_at) VALUES ('piece','audio-work','audio',?,?,?,'pending','allowed',?)",
      )
      .run(
        h.fingerprint,
        h.fingerprint,
        JSON.stringify({ kind: "local", version: 1, operation: "concat-narration", values: [] }),
        h.deps.clock.now().toISOString(),
      );
  expect((await h.send("", "PATCH", { revisionId: h.view.revision.id, stages: [] })).status).toBe(
    409,
  );
  expect(listCheckpoints(h.db, h.projectId, h.view.revision.id)).toHaveLength(1);
  expect(h.wake).not.toHaveBeenCalled();
});
it("returns typed missing/invalid refusals and does not accept client-authored gate fields", async () => {
  const h = fixture();
  expect((await h.app.request("/api/projects/missing/checkpoints")).status).toBe(404);
  expect((await h.send("/missing/approve", "POST", h.approval)).status).toBe(404);
  expect(
    (await h.send("", "PATCH", { revisionId: h.view.revision.id, stages: ["audio", "audio"] }))
      .status,
  ).toBe(400);
  expect(
    (
      await h.send("", "PATCH", {
        revisionId: h.view.revision.id,
        stages: [],
        fingerprint: h.fingerprint,
      })
    ).status,
  ).toBe(400);
  expect(h.wake).not.toHaveBeenCalled();
});
