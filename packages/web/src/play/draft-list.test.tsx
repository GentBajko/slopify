import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { startedAt } from "@/lib/utils";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession, usePlaySession } from "./draft-context";
import { DraftList } from "./draft-list";
import { draftView, playRoutes } from "./play-test-fixture";

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});
it("lists server drafts with no browser identity and offers recovery for unreadable records", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const remove = vi.fn(
    jsonAnswer(
      { title: "Failure", status: 409, detail: "Cannot discard", reason: "conflict" },
      409,
    ),
  );
  renderApp(
    <PlayDraftProvider>
      <DraftList />
    </PlayDraftProvider>,
    testDeps(
      playRoutes({
        "GET /api/drafts": jsonAnswer({
          drafts: [
            { id, title: "Recovered", version: 1, updatedAt: "2026-09-13", readable: false },
          ],
        }),
        [`DELETE /api/drafts/${id}`]: remove,
      }),
    ),
  );
  fireEvent.click(await screen.findByText("Drafts"));
  await screen.findByText("Recovered");
  const edited = screen.getByText(`Last edited ${startedAt("2026-09-13")}`);
  expect(edited.getAttribute("datetime")).toBe("2026-09-13");
  expect(screen.getByText(/unsupported or corrupt/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Discard Recovered" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
  await screen.findByText("Cannot discard");
  // The draft stays listed; the list reopens from the same Drafts control.
  fireEvent.click(screen.getByText("Drafts"));
  expect(await screen.findByText("Recovered")).toBeTruthy();
});
it("discards an active dirty draft at the confirmed version without saving discarded edits", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const calls: string[] = [];
  let session: PlaySession | undefined;
  function Consumer() {
    session = usePlaySession();
    return <DraftList />;
  }
  renderApp(
    <PlayDraftProvider>
      <Consumer />
    </PlayDraftProvider>,
    testDeps(
      playRoutes({
        "GET /api/drafts": jsonAnswer({
          drafts: [
            {
              id,
              title: "Active",
              version: 1,
              updatedAt: "2026-09-13T10:00:00.000Z",
              readable: true,
            },
          ],
        }),
        "PUT /api/drafts/:id": async (request) => {
          calls.push("save");
          const body = await request.json();
          return jsonAnswer({
            ...draftView(id),
            draft: { ...draftView(id).draft, version: 2, document: body.document },
          })(request);
        },
        [`DELETE /api/drafts/${id}`]: async (request) => {
          calls.push("delete");
          expect(await request.json()).toEqual({ baseVersion: 1 });
          return jsonAnswer({ discarded: true })(request);
        },
      }),
    ),
  );
  fireEvent.click(await screen.findByText("Drafts"));
  await screen.findByText("Active");
  await act(() => session?.open(id));
  act(() => {
    if (session)
      session.edit({ ...session.document, form: { ...session.document.form, title: "Dirty" } });
  });
  fireEvent.click(screen.getByRole("button", { name: "Discard Active" }));
  expect(calls).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
  await waitFor(() => expect(session?.view).toBeNull());
  expect(session?.document.form.title).toBe("");
  expect(calls).toEqual(["delete"]);
});

it("removes a successfully discarded draft from the open list immediately", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  renderApp(
    <PlayDraftProvider>
      <DraftList />
    </PlayDraftProvider>,
    testDeps(
      playRoutes({
        "GET /api/drafts": jsonAnswer({
          drafts: [
            {
              id,
              title: "To discard",
              version: 1,
              updatedAt: "2026-09-13T10:00:00.000Z",
              readable: true,
            },
          ],
        }),
      }),
    ),
  );
  fireEvent.click(await screen.findByText("Drafts"));
  fireEvent.click(await screen.findByRole("button", { name: "Discard To discard" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
  await waitFor(() => expect(screen.queryByText("To discard")).toBeNull());
});

it("clears a corrupt remembered identity after explicit list discard", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const map = new Map([["slopify.play-draft", id]]);
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
    clear: () => map.clear(),
  };
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  try {
    renderApp(
      <PlayDraftProvider>
        <DraftList />
      </PlayDraftProvider>,
      testDeps(
        playRoutes({
          "GET /api/drafts": jsonAnswer({
            drafts: [
              {
                id,
                title: "Broken",
                version: 1,
                updatedAt: "2026-09-13T10:00:00.000Z",
                readable: false,
              },
            ],
          }),
          [`GET /api/drafts/${id}`]: jsonAnswer({ broken: true }),
        }),
      ),
    );
    // The state word beside Drafts says the remembered draft could not be used; the full
    // sentence is Play's action bar's to show.
    await screen.findByText("Couldn't save");
    fireEvent.click(screen.getByText("Drafts"));
    fireEvent.click(screen.getByRole("button", { name: "Discard Broken" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
    await waitFor(() => expect(map.has("slopify.play-draft")).toBe(false));
    await waitFor(() => expect(screen.queryByText("Couldn't save")).toBeNull());
  } finally {
    cleanup();
    if (original) Object.defineProperty(window, "localStorage", original);
    else Object.defineProperty(window, "localStorage", { configurable: true, value: undefined });
  }
});
