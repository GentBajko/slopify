import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession } from "./draft-context";
import { deferred, draftView, mountSession, playRoutes, SessionProbe } from "./play-test-fixture";

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
it("does not apply a late restore over edits made while it was loading", async () => {
  const response = deferred();
  mount({ [`GET /api/drafts/${first}`]: () => response.promise });
  let opened: Promise<boolean> = Promise.resolve(true);
  act(() => {
    opened = session.open(first);
  });
  await act(async () => {});
  edit("Typed while opening");
  await act(async () => {
    response.resolve(jsonAnswer(draftView(first, "Old"))(new Request("http://test")) as Response);
    await opened;
  });
  expect(session.document.form.title).toBe("Typed while opening");
});
it("keeps a restored draft saved if choices fail and can start fresh after a corrupt read", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  mount({
    [`GET /api/drafts/${first}`]: jsonAnswer(draftView(first)),
    [`GET /api/drafts/${second}`]: jsonAnswer({ broken: true }),
    "GET /api/fonts": () => {
      throw new Error("Fonts unavailable");
    },
  });
  await act(() => session.open(first));
  expect(session.status).toBe("saved");
  await act(() => session.navigate("style"));
  expect(session.document.section).toBe("style");
  await act(() => session.newDraft());
  await act(() => session.open(second));
  expect(session.error).toBeTruthy();
  await act(() => session.newDraft());
  expect(session.error).toBeNull();
  expect(session.view).toBeNull();
  log.mockRestore();
});
it("keeps successful saves successful when browser identity storage throws", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get: () => {
      throw new Error("Storage disabled");
    },
  });
  try {
    mount();
    edit("Durable");
    await waitFor(() => expect(session.status).toBe("saved"));
    expect(session.acknowledged).toBe(1);
  } finally {
    if (original) Object.defineProperty(window, "localStorage", original);
    else Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
    log.mockRestore();
  }
});
it("remaps shared attachments when edits arrive during save-as-new", async () => {
  const attachmentId = "00000000-0000-4000-8000-000000000003";
  const newAttachment = "00000000-0000-4000-8000-000000000004";
  const initial = draftView(first);
  const document = {
    ...initial.draft.document,
    form: {
      ...initial.draft.document.form,
      provided: { ...initial.draft.document.form.provided, audio: { attachmentId, name: "a.wav" } },
    },
  };
  const response = deferred();
  let forkBody: { id: string; document: typeof document } | undefined;
  mount({
    [`GET /api/drafts/${first}`]: jsonAnswer({ ...initial, draft: { ...initial.draft, document } }),
    "POST /api/drafts/:id/fork": async (request) => {
      forkBody = await request.json();
      return response.promise;
    },
  });
  await act(() => session.open(first));
  let fork = Promise.resolve();
  act(() => {
    fork = session.saveAsNew();
  });
  await waitFor(() => expect(forkBody).toBeDefined());
  edit("Newer");
  vi.useFakeTimers();
  await act(() => vi.advanceTimersByTimeAsync(500));
  expect(session.status).not.toBe("error");
  const forked = draftView(forkBody?.id ?? second);
  await act(async () => {
    response.resolve(
      jsonAnswer({
        ...forked,
        draft: {
          ...forked.draft,
          document: {
            ...document,
            form: {
              ...document.form,
              provided: {
                ...document.form.provided,
                audio: { attachmentId: newAttachment, name: "a.wav" },
              },
            },
          },
        },
      })(new Request("http://test")) as Response,
    );
    await fork;
  });
  expect(session.document.form.title).toBe("Newer");
  expect(session.document.form.provided.audio?.attachmentId).toBe(newAttachment);
  await act(() => session.flush());
  expect(session.status).toBe("saved");
});
it("does not clear a new selection when an older discard completes", async () => {
  const response = deferred();
  mount({
    [`DELETE /api/drafts/${first}`]: () => response.promise,
    [`GET /api/drafts/${second}`]: jsonAnswer(draftView(second, "Other")),
  });
  await act(() => session.open(first));
  let discarded = Promise.resolve();
  act(() => {
    discarded = session.discard({ id: first, version: 1 });
  });
  await act(() => session.open(second));
  await act(async () => {
    response.resolve(jsonAnswer({ discarded: true })(new Request("http://test")) as Response);
    await discarded;
  });
  expect(session.view?.draft.id).toBe(second);
});
it("keeps saves and font uploads alive while the form is unmounted", async () => {
  const response = deferred();
  let hide = () => {};
  let show = () => {};
  function Page() {
    const [visible, setVisible] = useState(true);
    hide = () => setVisible(false);
    show = () => setVisible(true);
    return visible ? (
      <SessionProbe
        capture={(next) => {
          session = next;
        }}
      />
    ) : null;
  }
  renderApp(
    <PlayDraftProvider>
      <Page />
    </PlayDraftProvider>,
    testDeps(playRoutes({ "POST /api/fonts": () => response.promise })),
  );
  let uploaded = Promise.resolve();
  act(() => {
    uploaded = session.uploadSubtitleFont(new File(["font"], "Custom.ttf"));
  });
  await waitFor(() => expect(session.document.fontUpload?.name).toBe("Custom.ttf"));
  act(() => hide());
  await act(async () => {
    response.resolve(
      jsonAnswer({ font: { id: "custom", name: "Custom", family: "Custom", source: "uploaded" } })(
        new Request("http://test"),
      ) as Response,
    );
    await uploaded;
  });
  act(() => show());
  expect(session.document.form.subtitles.fontId).toBe("custom");
  expect(session.document.fontUpload).toBeNull();
  expect(session.status).toBe("saved");
});
