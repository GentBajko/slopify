import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { must, startFixture } from "../../slices/play-drafts/draft.fake.js";
import { draftViewSchema } from "../../slices/play-drafts/schema.js";
import { createDraft } from "../../slices/play-drafts/service.js";
import { uploadDraftAttachment } from "../../slices/play-drafts/uploads.js";
import { stagingPath } from "../../slices/storage/layout.js";
import { draftRoutes } from "./drafts.js";
import { problemFromError } from "./problem.js";

it("rejects audio, absent bytes, mismatched ownership, and unsafe attachment IDs", async () => {
  const h = startFixture();
  const app = new Hono().route("/api/drafts", draftRoutes(h.deps));
  const id = randomUUID();
  const attachmentId = randomUUID();
  const other = randomUUID();
  try {
    must(
      createDraft(h.deps, {
        id,
        document: {
          ...h.document,
          form: {
            ...h.document.form,
            provided: { ...h.document.form.provided, audio: { attachmentId, name: "audio.png" } },
          },
        },
      }),
    );
    must(createDraft(h.deps, { id: other, document: h.document }));
    const uploaded = must(
      await uploadDraftAttachment(h.deps, {
        draftId: id,
        attachmentId,
        content: (async function* () {
          yield Buffer.from("bytes");
        })(),
      }),
    );
    const path = `/api/drafts/${id}/attachments/${attachmentId}/file`;
    expect((await app.request(path)).status).toBe(404);
    const form = new FormData();
    form.set("file", new File(["bytes"], "a.png"));
    expect(
      (
        await app.request(`/api/drafts/${other}/attachments/${attachmentId}/file`, {
          method: "PUT",
          body: form,
        })
      ).status,
    ).toBe(404);
    expect((await app.request(`/api/drafts/${id}/attachments/..%2fsecret/file`)).status).toBe(400);
    if (uploaded.stagedFileId === null) throw new Error("Missing fixture upload");
    rmSync(stagingPath(h.deps.paths, uploaded.stagedFileId));
    expect((await app.request(path)).status).toBe(404);
  } finally {
    h.close();
  }
});

it.each(["abort", "stream-error"] as const)(
  "cleans partial uploaded bytes on %s without losing the document",
  async (failure) => {
    const h = startFixture();
    const app = new Hono()
      .onError((e, c) => problemFromError(c, e, h.deps))
      .route("/api/drafts", draftRoutes(h.deps));
    const id = randomUUID();
    const attachmentId = randomUUID();
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        provided: { ...h.document.form.provided, images: [{ attachmentId, name: "saved.png" }] },
      },
    };
    try {
      must(createDraft(h.deps, { id, document }));
      const aborter = new AbortController();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            Buffer.from(
              '--test\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\nbytes',
            ),
          );
          setTimeout(() => {
            if (failure === "abort") aborter.abort();
            else controller.error(new Error("socket failed"));
          }, 20);
        },
      });
      const request = new Request(
        `http://localhost/api/drafts/${id}/attachments/${attachmentId}/file`,
        {
          method: "PUT",
          headers: { "content-type": "multipart/form-data; boundary=test" },
          body,
          signal: aborter.signal,
          duplex: "half",
        },
      );
      const response = await app.request(request);
      expect(response.status).toBe(500);
      expect(await response.json()).toHaveProperty("correlationId");
      const view = draftViewSchema.parse(await (await app.request(`/api/drafts/${id}`)).json());
      expect(view.draft.document).toEqual(document);
      expect(view.attachments[0]).toMatchObject({ state: "reattach", stagedFileId: null });
      expect(h.deps.db.prepare("SELECT id FROM staged_files").all()).toEqual([]);
    } finally {
      h.close();
    }
  },
);

function json(method: string, value: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) };
}
it("streams saved image uploads with authoritative names and enforces preview ownership", async () => {
  const h = startFixture();
  const app = new Hono().route("/api/drafts", draftRoutes(h.deps));
  const id = randomUUID();
  const attachmentId = randomUUID();
  const otherId = randomUUID();
  const document = {
    ...h.document,
    form: {
      ...h.document.form,
      provided: { ...h.document.form.provided, images: [{ attachmentId, name: "saved.png" }] },
    },
  };
  try {
    await app.request("/api/drafts", json("POST", { id, document }));
    await app.request("/api/drafts", json("POST", { id: otherId, document: h.document }));
    const path = `/api/drafts/${id}/attachments/${attachmentId}/file`;
    expect((await app.request(path)).status).toBe(404);
    const form = new FormData();
    form.set("file", new File(["image bytes"], "../../other.jpg"));
    const uploaded = await app.request(path, { method: "PUT", body: form });
    expect(uploaded.status).toBe(200);
    expect(await uploaded.json()).toMatchObject({
      id: attachmentId,
      name: "saved.png",
      state: "ready",
      bytes: 11,
    });
    expect(await (await app.request(path)).text()).toBe("image bytes");
    expect(
      (await app.request(`/api/drafts/${otherId}/attachments/${attachmentId}/file`)).status,
    ).toBe(404);
    expect((await app.request(path, { method: "PUT", body: form })).status).toBe(409);
  } finally {
    h.close();
  }
});

it("keeps draft topology recoverable after a truncated upload", async () => {
  const h = startFixture();
  const app = new Hono()
    .onError((e, c) => problemFromError(c, e, h.deps))
    .route("/api/drafts", draftRoutes(h.deps));
  const id = randomUUID();
  const attachmentId = randomUUID();
  const document = {
    ...h.document,
    form: {
      ...h.document.form,
      provided: { ...h.document.form.provided, images: [{ attachmentId, name: "saved.png" }] },
    },
  };
  try {
    await app.request("/api/drafts", json("POST", { id, document }));
    const response = await app.request(`/api/drafts/${id}/attachments/${attachmentId}/file`, {
      method: "PUT",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: '--test\r\nContent-Disposition: form-data; name="file"; filename="one.png"\r\n\r\nbytes\r\n--test\r\nContent-Disposition: form-data; name="field"\r\n\r\nunterminated',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ detail: expect.stringContaining("multipart") });
    const view = draftViewSchema.parse(await (await app.request(`/api/drafts/${id}`)).json());
    expect(view.draft.document).toEqual(document);
    expect(view.attachments[0]).toMatchObject({ state: "reattach", stagedFileId: null });
    expect(h.deps.db.prepare("SELECT id FROM staged_files").all()).toEqual([]);
  } finally {
    h.close();
  }
});

it("handles malformed and aborted uploads even when the attachment is refused before reading", async () => {
  const h = startFixture();
  const app = new Hono()
    .onError((e, c) => problemFromError(c, e, h.deps))
    .route("/api/drafts", draftRoutes(h.deps));
  const path = `/api/drafts/${randomUUID()}/attachments/${randomUUID()}/file`;
  try {
    const missingBoundary = await app.request(path, {
      method: "PUT",
      headers: { "content-type": "multipart/form-data" },
      body: "bytes",
    });
    expect(missingBoundary.status).toBe(400);
    const malformed = await app.request(path, {
      method: "PUT",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: '--test\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\nunterminated',
    });
    expect(malformed.status).toBe(400);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            '--test\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\n\r\nbytes',
          ),
        );
        setTimeout(() => controller.error(new Error("socket failed")), 10);
      },
    });
    const failed = await app.request(
      new Request(`http://localhost${path}`, {
        method: "PUT",
        headers: { "content-type": "multipart/form-data; boundary=test" },
        body: stream,
        duplex: "half",
      }),
    );
    expect(failed.status).toBe(500);
    expect(h.deps.db.prepare("SELECT id FROM staged_files").all()).toEqual([]);
  } finally {
    h.close();
  }
});
