import { afterEach, expect, it } from "vitest";
import { deferred } from "../../../test/revision-rebuild.fake.js";
import { withProjectControl } from "../../slices/control/lock.js";
import { paidServiceFixture } from "../../slices/rebuild/service.fake.js";
import { saveVerdict, verdictById } from "../../slices/reviews/repo.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

// A project whose image "one" failed its review, served by the real rebuild.
async function flagged() {
  const h = await paidServiceFixture();
  open.push(h);
  const app = createApp({
    ...h.deps,
    hub: createHub(h.deps),
    version: "test",
    webDist: "/missing",
    probe: async () => ({ ran: false, stdout: "" }),
    flushSoon: () => undefined,
    host: "127.0.0.1",
    rebuild: h.deps,
  });
  const head = currentRevisionId(h.deps.db, h.projectId) ?? "";
  saveVerdict(h.deps.db, {
    id: "v1",
    projectId: h.projectId,
    revisionId: head,
    itemKey: "image:one",
    stage: "images",
    itemFingerprint: "f",
    reviewFingerprint: "g",
    passed: false,
    reasons: ["The hand has six fingers."],
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
  const request = (action: "redo" | "overrule", baseRevisionId = head) =>
    app.request(`/api/projects/${h.projectId}/reviews/v1/${action}`, {
      method: "POST",
      ...(action === "redo"
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              baseRevisionId,
              idempotencyKey: "4f1c2b8e-0d7a-4c3e-9b1a-2e6f5d7c8a90",
            }),
          }
        : {}),
    });
  const action = () => verdictById(h.deps.db, h.projectId, "v1")?.action;
  return { h, request, action };
}

// Redo waits on the project's control lock before it makes anything; holding that lock keeps a
// Redo started but undecided for as long as a test needs.
function holdProject(h: Awaited<ReturnType<typeof paidServiceFixture>>): () => void {
  const gate = deferred<void>();
  void withProjectControl(h.deps.db, h.projectId, () => gate.promise);
  return () => gate.resolve();
}

it("refuses Overrule while a Redo is being started, and the Redo is recorded", async () => {
  const { h, request, action } = await flagged();
  const release = holdProject(h);
  const redo = request("redo");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect((await request("overrule")).status).toBe(409);
  expect(action()).toBeNull();
  release();
  expect((await redo).status).toBe(202);
  expect(action()).toBe("redone");
});

it("lets Overrule go ahead once a Redo was refused", async () => {
  const { h, request, action } = await flagged();
  const release = holdProject(h);
  const redo = request("redo", "an-older-version");
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  expect((await redo).status).toBe(409);
  expect((await request("overrule")).status).toBe(200);
  expect(action()).toBe("overruled");
});

it("answers a repeated Redo with the same key with its first answer", async () => {
  const { request, action } = await flagged();
  const first = await request("redo");
  expect(first.status).toBe(202);
  const again = await request("redo");
  expect(again.status).toBe(202);
  expect(await again.json()).toEqual(await first.json());
  expect(action()).toBe("redone");
});
