import type { DraftView } from "@app/slices/play-drafts/model.js";
import { saveDraftInputSchema } from "@app/slices/play-drafts/schema.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { mountSupplied, ready, response } from "./draft-upload-test-fixture";
import { draftView, mountPlay } from "./play-test-fixture";

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});
it("offers Reattach after prerequisite Save retry and after reopening the saved draft", async () => {
  let failed = false;
  let saved: DraftView | undefined;
  const upload = vi.fn((request: Request) => response({ ...ready(request), name: "picked.wav" }));
  await mountSupplied({
    "PUT /api/drafts/:id": async (request) => {
      const id = new URL(request.url).pathname.split("/")[3];
      const body = saveDraftInputSchema.parse({ ...(await request.json()), id });
      const ref = body.document.form.provided.audio;
      if (ref?.name === "picked.wav" && !failed) {
        failed = true;
        throw new Error("Offline reservation");
      }
      const view = draftView(body.id);
      saved = {
        ...view,
        draft: { ...view.draft, version: body.baseVersion + 1, document: body.document },
        attachments: ref
          ? [
              {
                id: ref.attachmentId,
                name: ref.name,
                kind: "audio",
                state: "pending",
                stagedFileId: null,
                bytes: 0,
                error: null,
              },
            ]
          : [],
      };
      return response(saved);
    },
    "PUT /api/drafts/:id/attachments/:attachmentId/file": upload,
  });
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.upload(
    screen.getByLabelText("Narration file"),
    new File(["wav"], "picked.wav", { type: "audio/wav" }),
  );
  await screen.findByText(/Offline reservation/);
  await screen.findByLabelText("Reattach picked.wav");
  expect(screen.queryByText("Copying")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByLabelText("Reattach picked.wav");
  expect(screen.queryByText("Copying")).toBeNull();
  expect(upload).not.toHaveBeenCalled();
  if (!saved) throw new Error("Missing saved draft");
  cleanup();
  await mountPlay({
    "GET /api/drafts": () =>
      response({
        drafts: [
          {
            id: saved?.draft.id,
            title: "Reopen upload",
            version: 2,
            updatedAt: "2026-09-13",
            readable: true,
          },
        ],
      }),
    "GET /api/drafts/:id": () => response(saved),
    "PUT /api/drafts/:id/attachments/:attachmentId/file": upload,
  });
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(screen.getByRole("button", { name: "Drafts" }));
  await userEvent.click(await screen.findByRole("button", { name: "Reopen upload" }));
  await screen.findByLabelText("Reattach picked.wav");
  expect(screen.queryByText("Copying")).toBeNull();
  await userEvent.upload(
    screen.getByLabelText("Reattach picked.wav"),
    new File(["wav"], "picked.wav", { type: "audio/wav" }),
  );
  await screen.findByText("Staged");
  expect(upload).toHaveBeenCalledTimes(1);
});

it("releases a failed first-save reservation without requiring a server view", async () => {
  const { act } = await import("@testing-library/react");
  const { mountSession } = await import("./play-test-fixture");
  let session: import("./draft-context").PlaySession | undefined;
  mountSession(
    (next) => {
      session = next;
    },
    {
      "POST /api/drafts": () => {
        throw new Error("Offline create");
      },
    },
  );
  await act(() => session?.attach("audio", [new File(["wav"], "first.wav")]));
  const ref = session?.document.form.provided.audio;
  if (!session || !ref) throw new Error("Missing local attachment");
  expect(session.view).toBeNull();
  expect(session.status).toBe("error");
  expect(session.attachmentUploading(ref.attachmentId)).toBe(false);
});

it.each(["new", "discard"] as const)(
  "aborts upload after %s draft and ignores its late settlement",
  async (action) => {
    const { act, waitFor } = await import("@testing-library/react");
    const { deferred, mountSession } = await import("./play-test-fixture");
    const held = deferred();
    let session: import("./draft-context").PlaySession | undefined;
    let request: Request | undefined;
    mountSession(
      (next) => {
        session = next;
      },
      {
        "PUT /api/drafts/:id/attachments/:attachmentId/file": (sent) => {
          request = sent;
          return held.promise;
        },
      },
    );
    let attached: Promise<void> | undefined;
    act(() => {
      attached = session?.attach("audio", [new File(["wav"], "old.wav")]);
    });
    await waitFor(() => expect(request).toBeDefined());
    const id = session?.document.form.provided.audio?.attachmentId;
    if (!id || !request) throw new Error("Missing upload");
    expect(session?.attachmentUploading(id)).toBe(true);
    await act(() => {
      if (action === "new") return session?.newDraft();
      if (session?.view)
        return session.discard({ id: session.view.draft.id, version: session.view.draft.version });
      throw new Error("Missing saved draft");
    });
    expect(request.signal.aborted).toBe(true);
    expect(session?.attachmentUploading(id)).toBe(false);
    await act(async () => {
      if (request) held.resolve(response(ready(request)));
      await attached;
    });
    expect(session?.view).toBeNull();
    expect(session?.document.form.provided.audio).toBeNull();
  },
);

it.each(["media", "font"] as const)(
  "does not begin %s bytes after unmount during prerequisite Save",
  async (kind) => {
    const { act, waitFor } = await import("@testing-library/react");
    const { createDraftInputSchema } = await import("@app/slices/play-drafts/schema.js");
    const { deferred, mountSession } = await import("./play-test-fixture");
    const held = deferred();
    let session: import("./draft-context").PlaySession | undefined;
    let request: Request | undefined;
    const upload = vi.fn(() => response({}));
    const mounted = mountSession(
      (next) => {
        session = next;
      },
      {
        "POST /api/drafts": (sent) => {
          request = sent;
          return held.promise;
        },
        "PUT /api/drafts/:id/attachments/:attachmentId/file": upload,
        "POST /api/fonts": upload,
      },
    );
    let attached: Promise<void> | undefined;
    act(() => {
      attached =
        kind === "media"
          ? session?.attach("audio", [new File(["wav"], "old.wav")])
          : session?.uploadSubtitleFont(new File(["font"], "old.ttf"));
    });
    await waitFor(() => expect(request).toBeDefined());
    if (!request) throw new Error("Missing Save");
    const body = createDraftInputSchema.parse(await request.json());
    mounted.unmount();
    await act(async () => {
      const view = draftView(body.id);
      held.resolve(response({ ...view, draft: { ...view.draft, document: body.document } }));
      await attached;
    });
    expect(upload).not.toHaveBeenCalled();
  },
);
