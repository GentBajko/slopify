import { expect, it } from "vitest";
import { createApi } from "@/api";
import { fakeFetch, jsonAnswer, testOrigin } from "@/test-app";
import {
  createPlayDraft,
  discardPlayDraft,
  draftAttachmentUrl,
  forkPlayDraft,
  listPlayDrafts,
  readPlayDraft,
  reviewPlayDraft,
  savePlayDraft,
  startPlayDraft,
  uploadPlayDraftAttachment,
} from "./draft-api";
import { freshDraftDocument } from "./draft-state";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const view = {
  draft: { id, version: 1, createdAt: "now", updatedAt: "now", document: freshDraftDocument },
  attachments: [],
  review: null,
  pendingStart: null,
  start: null,
};

it("validates successful create/read/save/fork replies and sends exact contracts", async () => {
  const api = createApi(
    testOrigin,
    fakeFetch({
      "POST /api/drafts": async (request) => {
        expect(await request.json()).toEqual({ id, document: freshDraftDocument });
        return jsonAnswer(view)(request);
      },
      [`GET /api/drafts/${id}`]: jsonAnswer(view),
      [`PUT /api/drafts/${id}`]: async (request) => {
        expect(await request.json()).toEqual({
          baseVersion: 1,
          mutationId: other,
          document: freshDraftDocument,
        });
        return jsonAnswer(view)(request);
      },
      [`POST /api/drafts/${id}/fork`]: async (request) => {
        expect(await request.json()).toEqual({ id: other, document: freshDraftDocument });
        return jsonAnswer(view)(request);
      },
    }),
  );
  expect(await createPlayDraft(api, { id, document: freshDraftDocument })).toEqual({
    ok: true,
    value: view,
  });
  expect(await readPlayDraft(api, id)).toEqual({ ok: true, value: view });
  expect(
    await savePlayDraft(api, {
      id,
      baseVersion: 1,
      mutationId: other,
      document: freshDraftDocument,
    }),
  ).toEqual({ ok: true, value: view });
  expect(
    await forkPlayDraft(api, { sourceId: id, id: other, document: freshDraftDocument }),
  ).toEqual({ ok: true, value: view });
});
it("keeps conflict, pending identity, validation paths and unreadable refusal recoverable", async () => {
  for (const reason of ["conflict", "invalid-draft", "pending-start"]) {
    const api = createApi(
      testOrigin,
      fakeFetch({
        [`GET /api/drafts/${id}`]: jsonAnswer(
          {
            title: "Conflict",
            status: 409,
            reason,
            currentVersion: 2,
            reviewId: other,
            fields: [{ field: "form.title", message: "Changed" }],
          },
          409,
        ),
      }),
    );
    expect(await readPlayDraft(api, id)).toMatchObject({
      ok: false,
      reason,
      currentVersion: 2,
      reviewId: other,
      fields: [{ field: "form.title", message: "Changed" }],
    });
  }
  const api = createApi(
    testOrigin,
    fakeFetch({
      [`GET /api/drafts/${id}`]: jsonAnswer(
        {
          title: "Bad Request",
          status: 400,
          errors: [{ path: "document.title", message: "Required" }],
        },
        400,
      ),
    }),
  );
  expect(await readPlayDraft(api, id)).toMatchObject({
    ok: false,
    fields: [{ field: "document.title", message: "Required" }],
  });
});
it("throws malformed successes, malformed errors and infrastructure failures", async () => {
  for (const [body, status] of [
    [{}, 200],
    [
      { ...view, draft: { ...view.draft, document: { ...freshDraftDocument, schemaVersion: 2 } } },
      200,
    ],
    [{}, 409],
    [{ title: "Server failed", status: 500 }, 500],
  ] as const) {
    const api = createApi(
      testOrigin,
      fakeFetch({ [`GET /api/drafts/${id}`]: jsonAnswer(body, status) }),
    );
    await expect(readPlayDraft(api, id)).rejects.toThrow();
  }
  const failure = new Error("Offline");
  await expect(
    readPlayDraft(
      createApi(testOrigin, async () => {
        throw failure;
      }),
      id,
    ),
  ).rejects.toBe(failure);
  await expect(
    readPlayDraft(
      createApi(testOrigin, async () => new Response("broken")),
      id,
    ),
  ).rejects.toThrow();
});
it("rejects invalid outgoing values before transport", async () => {
  const api = createApi(testOrigin, async () => {
    throw new Error("Must not fetch");
  });
  await expect(
    createPlayDraft(api, {
      id,
      document: { ...freshDraftDocument, extra: new Blob() },
    } as Parameters<typeof createPlayDraft>[1]),
  ).rejects.not.toThrow("Must not fetch");
});
it("parses lists, discard, review, start, uploads and preview URLs", async () => {
  const review = {
    id: other,
    draftId: id,
    draftVersion: 1,
    fingerprint: "x",
    runs: [],
    estimates: [],
  };
  const start = { requestId: other, projectIds: ["p1"], queue: [], replayed: true };
  const attachment = {
    id: other,
    kind: "images",
    name: "x.png",
    state: "ready",
    stagedFileId: "s1",
    bytes: 1,
    error: null,
  };
  const api = createApi(
    testOrigin,
    fakeFetch({
      "GET /api/drafts": jsonAnswer({
        drafts: [{ id, title: "Unreadable", version: 1, updatedAt: "now", readable: false }],
      }),
      [`DELETE /api/drafts/${id}`]: async (request) => {
        expect(await request.json()).toEqual({ baseVersion: 1 });
        return jsonAnswer({ discarded: true })(request);
      },
      [`POST /api/drafts/${id}/review`]: async (request) => {
        expect(await request.json()).toEqual({ baseVersion: 1 });
        return jsonAnswer(review)(request);
      },
      [`POST /api/drafts/${id}/start`]: async (request) => {
        expect(await request.json()).toEqual({ baseVersion: 1, reviewId: other });
        return jsonAnswer(start)(request);
      },
      [`PUT /api/drafts/${id}/attachments/${other}/file`]: async (request) => {
        expect((await request.formData()).get("file")).toBeInstanceOf(File);
        return jsonAnswer(attachment)(request);
      },
    }),
  );
  expect(await listPlayDrafts(api)).toMatchObject({
    ok: true,
    value: { drafts: [{ readable: false }] },
  });
  expect(await discardPlayDraft(api, { id, baseVersion: 1 })).toEqual({
    ok: true,
    value: { discarded: true },
  });
  expect(await reviewPlayDraft(api, { id, baseVersion: 1 })).toEqual({ ok: true, value: review });
  expect(await startPlayDraft(api, { draftId: id, baseVersion: 1, reviewId: other })).toEqual({
    ok: true,
    value: start,
  });
  expect(await uploadPlayDraftAttachment(api, id, other, new File(["x"], "x.png"))).toEqual({
    ok: true,
    value: attachment,
  });
  expect(draftAttachmentUrl(api, id, other)).toBe(
    `${testOrigin}/api/drafts/${id}/attachments/${other}/file`,
  );
});
