import { randomUUID } from "node:crypto";
import { discardDraft, listDrafts, readDraft, saveDraft } from "@app/slices/play-drafts/service.js";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PlayDraftProvider, type PlaySession } from "./draft-context";
import { DraftList } from "./draft-list";
import { sqliteSessionFixture } from "./draft-sqlite-fixture";
import { playRoutes, SessionProbe } from "./play-test-fixture";

let session: PlaySession;
let client: QueryClient;
function Probe() {
  client = useQueryClient();
  return (
    <SessionProbe
      capture={(value) => {
        session = value;
      }}
    />
  );
}
afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});
function otherWriter(h: ReturnType<typeof sqliteSessionFixture>, id: string, title: string) {
  const read = readDraft(h.deps, id);
  if (!read.ok) throw new Error(read.reason);
  const { document, version } = read.value.draft;
  expect(
    saveDraft(h.deps, {
      id,
      baseVersion: version,
      mutationId: randomUUID(),
      document: { ...document, form: { ...document.form, title } },
    }).ok,
  ).toBe(true);
}

it.each([
  [true, "success"],
  [false, "success"],
  [true, "conflict"],
  [false, "conflict"],
  [true, "transport failure"],
  [true, "lost delete acknowledgement"],
] as const)("confirmed discard after lost create=%s handles %s", async (lostCreate, outcome) => {
  const h = sqliteSessionFixture();
  let createFailed = false;
  let deleteFailed = false;
  const deleteVersions: number[] = [];
  try {
    renderApp(
      <PlayDraftProvider>
        <Probe />
        <DraftList />
      </PlayDraftProvider>,
      testDeps(
        playRoutes({
          ...h.routes,
          "GET /api/drafts": (request) => jsonAnswer({ drafts: listDrafts(h.deps) })(request),
          "DELETE /api/drafts/:id": async (request) => {
            const body = await request.json();
            deleteVersions.push(body.baseVersion);
            if (outcome === "transport failure") throw new Error("Delete offline");
            const result = discardDraft(h.deps, {
              id: new URL(request.url).pathname.split("/")[3] ?? "",
              baseVersion: body.baseVersion,
            });
            if (outcome === "lost delete acknowledgement" && !deleteFailed) {
              deleteFailed = true;
              expect(result.ok).toBe(true);
              throw new Error("Delete acknowledgement lost");
            }
            return result.ok
              ? jsonAnswer(result.value)(request)
              : jsonAnswer(
                  {
                    title: "Draft refused",
                    status: 409,
                    detail: `Delete ${result.reason}`,
                    ...result,
                  },
                  409,
                )(request);
          },
          "POST /api/drafts": async (request) => {
            const response = await h.routes["POST /api/drafts"]?.(request);
            if (lostCreate && !createFailed) {
              createFailed = true;
              throw new Error("Create acknowledgement lost");
            }
            if (!response) throw new Error("Missing create route");
            return response;
          },
        }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tab A" } });
    await waitFor(() => expect(session.status).toBe(lostCreate ? "error" : "saved"));
    const id = session.activeId ?? "";
    otherWriter(h, id, "Tab B");
    if (!lostCreate)
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tab A local" } });
    await act(async () => {
      await session.flush();
    });
    expect(session.status).toBe("conflict");
    expect(session.view === null).toBe(lostCreate);
    await act(() => client.invalidateQueries({ queryKey: ["play-drafts"] }));
    fireEvent.click(screen.getByText("Drafts"));
    fireEvent.click(await screen.findByRole("button", { name: "Discard Tab B" }));
    if (outcome === "conflict") otherWriter(h, id, "Tab C");
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
    if (outcome !== "success") {
      await screen.findByText(
        outcome === "conflict"
          ? "Delete conflict"
          : outcome === "transport failure"
            ? "Delete offline"
            : "Delete acknowledgement lost",
      );
      expect(session.activeId).toBe(id);
      expect(session.status).toBe("conflict");
      expect(session.document.form.title).toBe(lostCreate ? "Tab A" : "Tab A local");
      expect(screen.getByRole("button", { name: "Confirm discard" })).toBeTruthy();
      if (outcome === "lost delete acknowledgement")
        fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
      else {
        const remaining = readDraft(h.deps, id);
        expect(remaining.ok && remaining.value.draft.document.form.title).toBe(
          outcome === "conflict" ? "Tab C" : "Tab B",
        );
        expect(deleteVersions).toEqual([2]);
        return;
      }
    }
    await waitFor(() => expect(session.activeId).toBeNull());
    expect(readDraft(h.deps, id).ok).toBe(false);
    expect(session.status).toBe("unsaved");
    expect(session.document.form.title).toBe("");
    expect(screen.queryByRole("button", { name: "Confirm discard" })).toBeNull();
    expect(deleteVersions).toEqual(outcome === "lost delete acknowledgement" ? [2, 2] : [2]);
  } finally {
    cleanup();
    h.close();
  }
});

it("waits for a creation retry before deleting so a late POST cannot recreate the draft", async () => {
  const h = sqliteSessionFixture();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let creates = 0;
  let deletes = 0;
  try {
    renderApp(
      <PlayDraftProvider>
        <Probe />
        <DraftList />
      </PlayDraftProvider>,
      testDeps(
        playRoutes({
          ...h.routes,
          "GET /api/drafts": (request) => jsonAnswer({ drafts: listDrafts(h.deps) })(request),
          "POST /api/drafts": async (request) => {
            creates++;
            if (creates === 2) await held;
            const response = await h.routes["POST /api/drafts"]?.(request);
            if (creates === 1) throw new Error("Create acknowledgement lost");
            if (!response) throw new Error("Missing create route");
            return response;
          },
          "DELETE /api/drafts/:id": async (request) => {
            deletes++;
            const { baseVersion } = await request.json();
            const result = discardDraft(h.deps, {
              id: new URL(request.url).pathname.split("/")[3] ?? "",
              baseVersion,
            });
            expect(result.ok).toBe(true);
            return jsonAnswer(result.ok ? result.value : result)(request);
          },
        }),
      ),
    );
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Retrying" } });
    await waitFor(() => expect(session.status).toBe("error"));
    const id = session.activeId ?? "";
    let retry = Promise.resolve(false);
    act(() => {
      retry = session.flush();
    });
    await waitFor(() => expect(creates).toBe(2));
    await act(() => client.invalidateQueries({ queryKey: ["play-drafts"] }));
    fireEvent.click(screen.getByText("Drafts"));
    fireEvent.click(await screen.findByRole("button", { name: "Discard Retrying" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
    await act(async () => {});
    expect(deletes).toBe(0);
    await act(async () => {
      release();
      await retry;
    });
    await waitFor(() => expect(session.activeId).toBeNull());
    expect(deletes).toBe(1);
    expect(readDraft(h.deps, id).ok).toBe(false);
    expect(session.view).toBeNull();
  } finally {
    release();
    cleanup();
    h.close();
  }
});
