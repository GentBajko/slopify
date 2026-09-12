import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer } from "@/test-app";
import type { PlaySession } from "./draft-context";
import { acknowledgeSave } from "./draft-save";
import { deferred, draftView, mountSession } from "./play-test-fixture";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
let session: PlaySession;
function mount(over: Readonly<Record<string, Answer>> = {}) {
  return mountSession((next) => {
    session = next;
  }, over);
}
function edit(title: string) {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
}
afterEach(() => {
  cleanup();
  window.localStorage?.clear();
  vi.useRealTimers();
});
it("acknowledges the sent generation without overwriting newer local edits", () => {
  const current = { edited: 3, acknowledged: 1, version: 1 };
  expect(acknowledgeSave(current, 2, 2)).toEqual({ edited: 3, acknowledged: 2, version: 2 });
});
it("creates on the first edit and serializes debounced saves without replacing newer values", async () => {
  const creates: Request[] = [];
  const saves: Request[] = [];
  const replies: ReturnType<typeof deferred>[] = [];
  mount({
    "POST /api/drafts": async (request) => {
      creates.push(request.clone());
      const body = await request.json();
      return jsonAnswer({
        ...draftView(body.id),
        draft: { ...draftView(body.id).draft, document: body.document },
      })(request);
    },
    "PUT /api/drafts/:id": (request) => {
      saves.push(request.clone());
      const reply = deferred();
      replies.push(reply);
      return reply.promise;
    },
  });
  expect(creates).toHaveLength(0);
  edit("A");
  await waitFor(() => expect(session.status).toBe("saved"));
  expect(creates).toHaveLength(1);
  vi.useFakeTimers();
  edit("AB");
  await act(() => vi.advanceTimersByTimeAsync(499));
  expect(saves).toHaveLength(0);
  edit("ABC");
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(saves).toHaveLength(1);
  edit("ABCD");
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(saves).toHaveLength(1);
  const body1 = await saves[0]?.json();
  await act(async () => {
    replies[0]?.resolve(
      jsonAnswer({ ...draftView(body1.id ?? session.view?.draft.id, "ABC", 2) })(
        new Request("http://test"),
      ) as Response,
    );
  });
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("ABCD");
  expect(saves).toHaveLength(2);
  const body2 = await saves[1]?.json();
  expect(body2.baseVersion).toBe(2);
  expect(body2.document.form.title).toBe("ABCD");
  expect(session.status).toBe("saving");
  await act(async () => {
    replies[1]?.resolve(
      jsonAnswer(draftView(session.view?.draft.id ?? first, "ABCD", 3))(
        new Request("http://test"),
      ) as Response,
    );
  });
  expect(session.status).toBe("saved");
  expect(session.edited).toBe(session.acknowledged);
});
it("retries a lost response with its frozen identity before newer edits", async () => {
  const bodies: unknown[] = [];
  let failed = false;
  mount({
    "PUT /api/drafts/:id": async (request) => {
      const body = await request.json();
      bodies.push(body);
      if (!failed) {
        failed = true;
        throw new Error("Offline");
      }
      return jsonAnswer(
        draftView(session.view?.draft.id ?? first, body.document.form.title, body.baseVersion + 1),
      )(request);
    },
  });
  edit("A");
  await waitFor(() => expect(session.status).toBe("saved"));
  edit("B");
  await act(async () => {
    expect(await session.flush()).toBe(false);
  });
  expect(session.error).toContain("Offline");
  edit("C");
  await act(async () => {
    expect(await session.flush()).toBe(true);
  });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toMatchObject({ baseVersion: 2, document: { form: { title: "C" } } });
});
it("pauses conflicts, preserves failed new drafts and forks current local values", async () => {
  const write = vi.fn(
    jsonAnswer(
      {
        title: "Conflict",
        status: 409,
        reason: "conflict",
        detail: "Changed elsewhere",
        currentVersion: 2,
      },
      409,
    ),
  );
  const fork = vi.fn(async (request: Request) => {
    const body = await request.json();
    return jsonAnswer({
      ...draftView(body.id),
      draft: { ...draftView(body.id).draft, document: body.document },
    })(request);
  });
  mount({ "PUT /api/drafts/:id": write, "POST /api/drafts/:id/fork": fork });
  edit("A");
  await waitFor(() => expect(session.status).toBe("saved"));
  edit("Local");
  await act(async () => {
    expect(await session.flush()).toBe(false);
    await session.newDraft();
  });
  expect(session.status).toBe("conflict");
  expect(session.document.form.title).toBe("Local");
  expect(write).toHaveBeenCalledTimes(1);
  await act(() => session.saveAsNew());
  expect(fork).toHaveBeenCalledTimes(1);
  expect(session.document.form.title).toBe("Local");
  expect(session.status).toBe("saved");
});
it("navigates an untouched draft in memory and persists requested sections before reveal", async () => {
  const create = vi.fn(async (request: Request) => {
    const body = await request.json();
    return jsonAnswer({
      ...draftView(body.id),
      draft: { ...draftView(body.id).draft, document: body.document },
    })(request);
  });
  mount({ "POST /api/drafts": create });
  await act(() => session.navigate("style"));
  expect(create).not.toHaveBeenCalled();
  edit("Title");
  await act(() => session.navigate("review", "title"));
  expect(session.document.section).toBe("review");
  expect(session.reveal).toMatchObject({ section: "review", field: "title" });
  expect(session.status).toBe("saved");
});
it("ignores a delayed open after selecting a different draft", async () => {
  const slow = deferred();
  mount({
    [`GET /api/drafts/${first}`]: () => slow.promise,
    [`GET /api/drafts/${second}`]: jsonAnswer(draftView(second, "Second")),
  });
  let opened: Promise<void> = Promise.resolve();
  act(() => {
    opened = session.open(first);
  });
  await act(() => session.open(second));
  await act(async () => {
    slow.resolve(jsonAnswer(draftView(first, "First"))(new Request("http://test")) as Response);
    await opened;
  });
  expect(session.document.form.title).toBe("Second");
});
it("keeps corrupt restores recoverable and does not clear pending font metadata", async () => {
  const saved = draftView(first);
  const fontUpload = { operationId: second, name: "Missing.ttf" };
  const fonts = vi.fn(jsonAnswer({ fonts: [] }));
  mount({
    [`GET /api/drafts/${first}`]: jsonAnswer({
      ...saved,
      draft: { ...saved.draft, document: { ...saved.draft.document, fontUpload } },
    }),
    [`GET /api/drafts/${second}`]: jsonAnswer({ broken: true }),
    "GET /api/fonts": fonts,
  });
  await act(() => session.open(first));
  expect(session.document.fontUpload).toEqual(fontUpload);
  expect(fonts).toHaveBeenCalled();
  await act(() => session.open(second));
  expect(session.document.fontUpload).toEqual(fontUpload);
  expect(session.error).toBeTruthy();
});
it("saves attachment ownership before upload and ignores completion after another draft opens", async () => {
  const upload = deferred();
  const received: Request[] = [];
  mount({
    "PUT /api/drafts/:id/attachments/:attachmentId/file": (request) => {
      received.push(request);
      return upload.promise;
    },
    [`GET /api/drafts/${second}`]: jsonAnswer(draftView(second, "Other")),
  });
  let pending = Promise.resolve();
  act(() => {
    pending = session.attach("audio", [new File(["audio"], "narration.wav")]);
  });
  await waitFor(() => expect(received).toHaveLength(1));
  const attachment = session.document.form.provided.audio;
  expect(attachment?.name).toBe("narration.wav");
  await act(() => session.open(second));
  await act(async () => {
    upload.resolve(
      jsonAnswer({
        id: attachment?.attachmentId,
        kind: "audio",
        name: "narration.wav",
        state: "ready",
        stagedFileId: "narration",
        bytes: 5,
        error: null,
      })(new Request("http://test")) as Response,
    );
    await pending;
  });
  expect(session.view?.draft.id).toBe(second);
  expect(session.view?.attachments).toEqual([]);
});
it("allows correcting a refused save without replaying the refused body", async () => {
  const bodies: unknown[] = [];
  mount({
    "PUT /api/drafts/:id": async (request) => {
      const body = await request.json();
      bodies.push(body);
      return bodies.length === 1
        ? jsonAnswer(
            { title: "Refused", status: 400, reason: "invalid-edit", detail: "Correct the form" },
            400,
          )(request)
        : jsonAnswer(draftView(session.activeId ?? first, body.document.form.title, 2))(request);
    },
  });
  edit("First");
  await waitFor(() => expect(session.status).toBe("saved"));
  edit("Refused");
  await act(() => session.flush());
  edit("Corrected");
  await act(() => session.flush());
  expect(bodies[1]).toMatchObject({ document: { form: { title: "Corrected" } } });
  expect(session.status).toBe("saved");
});
it("flushes dirty values when opening the same draft outside conflict recovery", async () => {
  let persisted = "Server";
  const save = vi.fn(async (request: Request) => {
    const body = await request.json();
    persisted = body.document.form.title;
    return jsonAnswer(draftView(first, persisted, 2))(request);
  });
  mount({
    [`GET /api/drafts/${first}`]: (request) => jsonAnswer(draftView(first, persisted))(request),
    "PUT /api/drafts/:id": save,
  });
  await act(() => session.open(first));
  edit("Local");
  await act(() => session.open(first));
  expect(save).toHaveBeenCalledTimes(1);
  expect(session.document.form.title).toBe("Local");
});
it("keeps the debounce when first-create acknowledgement arrives after another keystroke", async () => {
  const response = deferred();
  let created: { id: string; document: PlaySession["document"] } | undefined;
  const saves = vi.fn(async (request: Request) => {
    const body = await request.json();
    return jsonAnswer(draftView(created?.id ?? first, body.document.form.title, 2))(request);
  });
  mount({
    "POST /api/drafts": async (request) => {
      created = await request.json();
      return response.promise;
    },
    "PUT /api/drafts/:id": saves,
  });
  edit("A");
  await waitFor(() => expect(created).toBeDefined());
  vi.useFakeTimers();
  edit("AB");
  await act(() => vi.advanceTimersByTimeAsync(100));
  await act(async () => {
    const view = draftView(created?.id ?? first, "A");
    response.resolve(
      jsonAnswer({ ...view, draft: { ...view.draft, document: created?.document } })(
        new Request("http://test"),
      ) as Response,
    );
  });
  expect(saves).not.toHaveBeenCalled();
  expect(session.status).toBe("unsaved");
  await act(() => vi.advanceTimersByTimeAsync(399));
  expect(saves).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(saves).toHaveBeenCalledTimes(1);
  expect(session.status).toBe("saved");
});
