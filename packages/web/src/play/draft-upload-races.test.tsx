import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { problemAnswer } from "@/test-app";
import type { PlaySession } from "./draft-context";
import { ready, response } from "./draft-upload-test-fixture";
import { deferred, mountSession } from "./play-test-fixture";

let session: PlaySession;
afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});
it("ignores an older font failure after a newer upload succeeds", async () => {
  const pending = deferred();
  let calls = 0;
  mountSession(
    (next) => {
      session = next;
    },
    {
      "POST /api/fonts": () =>
        ++calls === 1
          ? pending.promise
          : response({ font: { id: "new-font", name: "New", family: "New", source: "uploaded" } }),
    },
  );
  let first = Promise.resolve();
  act(() => {
    first = session.uploadSubtitleFont(new File(["a"], "old.ttf"));
  });
  await waitFor(() => expect(calls).toBe(1));
  await act(() => session.uploadSubtitleFont(new File(["b"], "new.ttf")));
  await act(async () => {
    pending.resolve(await problemAnswer("Old failure")(new Request("http://test")));
    await first;
  });
  expect(session.error).toBeNull();
  expect(session.document.form.subtitles.fontId).toBe("new-font");
});

it("retains failed removal Save for retry without directly deleting the staged upload", async () => {
  const pending = deferred();
  let request: Request | undefined;
  let failRemoval = false;
  const bodies: string[] = [];
  const { playRoutes } = await import("./play-test-fixture");
  const base = playRoutes();
  mountSession(
    (next) => {
      session = next;
    },
    {
      "PUT /api/drafts/:id/attachments/:attachmentId/file": (sent) => {
        request = sent;
        return pending.promise;
      },
      "PUT /api/drafts/:id": async (sent) => {
        bodies.push(await sent.clone().text());
        if (failRemoval) {
          failRemoval = false;
          throw new Error("Offline removal");
        }
        const answer = base["PUT /api/drafts/:id"];
        if (!answer) throw new Error("Missing save");
        return answer(sent);
      },
    },
  );
  let uploaded = Promise.resolve();
  act(() => {
    uploaded = session.attach("audio", [new File(["wav"], "old.wav")]);
  });
  await waitFor(() => expect(request).toBeDefined());
  failRemoval = true;
  act(() =>
    session.edit({
      ...session.document,
      form: {
        ...session.document.form,
        provided: { ...session.document.form.provided, audio: null },
      },
    }),
  );
  await act(async () => {
    expect(await session.flush()).toBe(false);
  });
  expect(session.status).toBe("error");
  await act(async () => {
    if (request) pending.resolve(response(ready(request)));
    await uploaded;
  });
  expect(session.document.form.provided.audio).toBeNull();
  expect(session.edited).toBeGreaterThan(session.acknowledged);
  await act(async () => {
    expect(await session.flush()).toBe(true);
  });
  expect(bodies.at(-1)).toBe(bodies.at(-2));
  expect(session.status).toBe("saved");
});
it("sends no bytes for an attachment removed while its reservation Save is held", async () => {
  const pending = deferred();
  let reserve: Request | undefined;
  const upload = vi.fn((request: Request) => response(ready(request)));
  mountSession(
    (next) => {
      session = next;
    },
    {
      "POST /api/drafts": (request) => {
        reserve = request;
        return pending.promise;
      },
      "PUT /api/drafts/:id/attachments/:attachmentId/file": upload,
    },
  );
  let attached = Promise.resolve();
  act(() => {
    attached = session.attach("audio", [new File(["wav"], "old.wav")]);
  });
  await waitFor(() => expect(reserve).toBeDefined());
  act(() =>
    session.edit({
      ...session.document,
      form: {
        ...session.document.form,
        provided: { ...session.document.form.provided, audio: null },
      },
    }),
  );
  const { draftView } = await import("./play-test-fixture");
  const body = await reserve?.json();
  await act(async () => {
    const view = draftView(body.id);
    pending.resolve(response({ ...view, draft: { ...view.draft, document: body.document } }));
    await attached;
  });
  expect(upload).not.toHaveBeenCalled();
  expect(session.document.form.provided.audio).toBeNull();
});
it.each(["ready", "reattach"] as const)(
  "retains %s settlement when an older copying Save response arrives later",
  async (terminal) => {
    const uploadResponse = deferred();
    const saveResponse = deferred();
    let uploadRequest: Request | undefined;
    let saveRequest: Request | undefined;
    mountSession(
      (next) => {
        session = next;
      },
      {
        "GET /api/drafts/:id": () =>
          response({
            ...session.view,
            attachments: session.view?.attachments.map((one) => ({
              ...one,
              state: "reattach",
              stagedFileId: null,
              error: "Missing file",
            })),
          }),
        "PUT /api/drafts/:id/attachments/:attachmentId/file": (request) => {
          uploadRequest = request;
          return uploadResponse.promise;
        },
        "PUT /api/drafts/:id": (request) => {
          saveRequest = request;
          return saveResponse.promise;
        },
      },
    );
    let upload = Promise.resolve();
    act(() => {
      upload = session.attach("audio", [new File(["wav"], "old.wav")]);
    });
    await waitFor(() => expect(uploadRequest).toBeDefined());
    act(() => session.edit({ ...session.document, section: "style" }));
    let save = Promise.resolve(false);
    act(() => {
      save = session.flush();
    });
    await waitFor(() => expect(saveRequest).toBeDefined());
    const attachment = uploadRequest
      ? {
          ...ready(uploadRequest),
          state: terminal,
          stagedFileId: terminal === "ready" ? ready(uploadRequest).stagedFileId : null,
        }
      : undefined;
    await act(async () => {
      uploadResponse.resolve(response(attachment));
      await upload;
    });
    expect(session.view?.attachments[0]?.state).toBe(terminal);
    const body = await saveRequest?.json();
    const view = session.view;
    await act(async () => {
      saveResponse.resolve(
        response({
          ...view,
          draft: { ...view?.draft, document: body.document, version: 2 },
          attachments: [{ ...attachment, state: "copying", stagedFileId: null }],
        }),
      );
      await save;
    });
    expect(session.view?.attachments[0]?.state).toBe(terminal);
    const id = session.activeId;
    if (!id) throw new Error("Missing draft");
    await act(() => session.open(id));
    expect(session.view?.attachments[0]?.state).toBe("reattach");
  },
);
it("reattaches one image in place and retains the other image owners", async () => {
  const upload = vi.fn(async (request: Request) => {
    const file = (await request.formData()).get("file");
    return response({
      ...ready(request),
      kind: "images",
      name: file instanceof File ? file.name : "image.png",
    });
  });
  mountSession(
    (next) => {
      session = next;
    },
    { "PUT /api/drafts/:id/attachments/:attachmentId/file": upload },
  );
  await act(() =>
    session.attach("images", [new File(["one"], "one.png"), new File(["two"], "two.png")]),
  );
  const before = session.document.form.provided.images;
  const first = before[0];
  if (!first) throw new Error("Missing first image");
  await act(() =>
    session.attach("images", [new File(["new"], "replacement.png")], first.attachmentId),
  );
  expect(session.document.form.provided.images.map((one) => one.name)).toEqual([
    "replacement.png",
    "two.png",
  ]);
  expect(session.document.form.provided.images[0]?.attachmentId).not.toBe(first.attachmentId);
  expect(session.document.form.provided.images[1]).toEqual(before[1]);
  expect(upload).toHaveBeenCalledTimes(3);
});
