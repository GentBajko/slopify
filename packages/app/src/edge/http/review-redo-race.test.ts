import { afterEach, expect, it, vi } from "vitest";
import { saveVerdict, verdictById } from "../../slices/reviews/repo.js";
import { mcpFixture } from "../mcp/mcp.fake.js";

// Redo waits on the rebuild while the item is made again; each test holds that wait open. The
// route only reads `ok` and a refusal's reason, so the answers carry no more than that.
const recovery = vi.hoisted(() => ({
  next: (): Promise<unknown> => Promise.reject(new Error("no recovery planned")),
}));
vi.mock("../../slices/rebuild/recovery.js", () => ({
  recoverProject: () => recovery.next(),
}));

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

function flagged() {
  const h = mcpFixture({ rebuild: true });
  open.push(h);
  saveVerdict(h.deps.db, {
    id: "v1",
    projectId: h.projectId,
    revisionId: "r0",
    itemKey: "article:body",
    stage: "article",
    itemFingerprint: "f",
    reviewFingerprint: "g",
    passed: false,
    reasons: ["A section repeats another."],
    outcome: "flagged",
    attempt: 1,
    action: null,
    actionAt: null,
    redoState: null,
    redoError: null,
    answeredBy: "model",
    actionBy: null,
    createdAt: "2026-09-10T00:00:00.000Z",
  });
  return h;
}

function held(): { readonly resolve: (result: unknown) => void } {
  let resolve = (_result: unknown): void => undefined;
  const promise = new Promise<unknown>((accept) => {
    resolve = accept;
  });
  recovery.next = () => promise;
  return { resolve };
}

const redoBody = JSON.stringify({
  baseRevisionId: "r0",
  idempotencyKey: "4f1c2b8e-0d7a-4c3e-9b1a-2e6f5d7c8a90",
});

it("refuses Overrule while a Redo is being started, and the Redo is recorded", async () => {
  const h = flagged();
  const rebuild = held();
  const redo = h.app.request(`/api/projects/${h.projectId}/reviews/v1/redo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: redoBody,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const overrule = await h.app.request(`/api/projects/${h.projectId}/reviews/v1/overrule`, {
    method: "POST",
  });
  expect(overrule.status).toBe(409);
  expect(verdictById(h.deps.db, h.projectId, "v1")?.action).toBeNull();
  rebuild.resolve({ ok: true, value: { warnings: [] } });
  expect((await redo).status).toBe(202);
  expect(verdictById(h.deps.db, h.projectId, "v1")?.action).toBe("redone");
});

it("lets Overrule go ahead once a Redo was refused", async () => {
  const h = flagged();
  const rebuild = held();
  const redo = h.app.request(`/api/projects/${h.projectId}/reviews/v1/redo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: redoBody,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  rebuild.resolve({ ok: false, reason: "running" });
  expect((await redo).status).toBe(409);
  const overrule = await h.app.request(`/api/projects/${h.projectId}/reviews/v1/overrule`, {
    method: "POST",
  });
  expect(overrule.status).toBe(200);
  expect(verdictById(h.deps.db, h.projectId, "v1")?.action).toBe("overruled");
});
