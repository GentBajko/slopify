import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { StagedFile } from "@/api";
import { emptyAnswer, jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { RevisionUpload } from "./revision-upload.js";

afterEach(cleanup);
const staged: StagedFile = {
  id: "upload1",
  stageKind: "images",
  path: "upload1.png",
  originalFilename: "scene.png",
  bytes: 3,
  state: "staged",
  createdAt: "2026-09-12T00:00:00.000Z",
};
function deferred<T>() {
  let resolve = (_value: T): void => {
    throw new Error("Promise not initialized");
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function choose(): void {
  fireEvent.change(screen.getByLabelText("Replace image"), {
    target: { files: [new File(["png"], "scene.png", { type: "image/png" })] },
  });
}
it("waits for copied bytes and applies completion through the latest draft callback", async () => {
  const user = userEvent.setup();
  const result = deferred<Response>();
  const ready = vi.fn();
  const pending = vi.fn();
  function Harness() {
    const [draft, setDraft] = useState("old");
    return (
      <>
        <button type="button" onClick={() => setDraft("new")}>
          Edit draft
        </button>
        <RevisionUpload
          label="Replace image"
          kind="images"
          onReady={(file) => ready(draft, file)}
          onPending={pending}
        />
      </>
    );
  }
  renderApp(
    <Harness />,
    testDeps({
      "POST /api/staging/images": jsonAnswer({ ...staged, state: "copying" }, 201),
      "GET /api/staging": () => result.promise,
    }),
  );
  choose();
  await screen.findByText("Copying upload…");
  expect(pending).toHaveBeenCalledWith(true);
  expect(ready).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Edit draft" }));
  result.resolve(
    new Response(JSON.stringify({ files: [staged] }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await waitFor(() => expect(ready).toHaveBeenCalledWith("new", staged));
  expect(pending).toHaveBeenLastCalledWith(false);
});
it("cancels before the upload response arrives and discards that exact staging ID", async () => {
  const user = userEvent.setup();
  const response = deferred<Response>();
  const removed = vi.fn(emptyAnswer());
  const ready = vi.fn();
  const pending = vi.fn();
  renderApp(
    <RevisionUpload label="Replace image" kind="images" onReady={ready} onPending={pending} />,
    testDeps({
      "POST /api/staging/images": () => response.promise,
      "DELETE /api/staging/upload1": removed,
    }),
  );
  choose();
  await user.click(screen.getByRole("button", { name: "Cancel upload" }));
  expect(pending).toHaveBeenLastCalledWith(true);
  response.resolve(
    new Response(JSON.stringify(staged), { headers: { "content-type": "application/json" } }),
  );
  await screen.findByText("Upload canceled.");
  expect(ready).not.toHaveBeenCalled();
  expect(removed).toHaveBeenCalledTimes(1);
  expect(pending).toHaveBeenLastCalledWith(false);
});
it("cannot resurrect a removed editor after its in-flight staging poll resolves", async () => {
  const polled = deferred<Response>();
  const called = deferred<void>();
  const ready = vi.fn();
  const removed = vi.fn(emptyAnswer());
  const pending = vi.fn();
  const mounted = renderApp(
    <RevisionUpload label="Replace image" kind="images" onReady={ready} onPending={pending} />,
    testDeps({
      "POST /api/staging/images": jsonAnswer({ ...staged, state: "copying" }, 201),
      "GET /api/staging": () => {
        called.resolve();
        return polled.promise;
      },
      "DELETE /api/staging/upload1": removed,
    }),
  );
  choose();
  await called.promise;
  mounted.unmount();
  polled.resolve(
    new Response(JSON.stringify({ files: [staged] }), {
      headers: { "content-type": "application/json" },
    }),
  );
  await waitFor(() => expect(removed).toHaveBeenCalledTimes(1));
  expect(ready).not.toHaveBeenCalled();
  expect(pending).toHaveBeenLastCalledWith(false);
});
it("shows staging failure and cleanup failure together without accepting a missing file", async () => {
  const ready = vi.fn();
  renderApp(
    <RevisionUpload
      label="Replace image"
      kind="images"
      onReady={ready}
      onPending={() => undefined}
    />,
    testDeps({
      "POST /api/staging/images": jsonAnswer({ ...staged, state: "copying" }, 201),
      "GET /api/staging": jsonAnswer({ files: [] }),
      "DELETE /api/staging/upload1": problemAnswer("Disk unavailable", 500),
    }),
  );
  choose();
  const error = await screen.findByRole("alert");
  expect(error.textContent).toContain("failed before staging completed");
  expect(error.textContent).toContain("Cleanup failed: Disk unavailable");
  expect(ready).not.toHaveBeenCalled();
});
it("allows a retry after a failed upload without fabricating a staged reference", async () => {
  const ready = vi.fn();
  let requests = 0;
  renderApp(
    <RevisionUpload
      label="Replace image"
      kind="images"
      onReady={ready}
      onPending={() => undefined}
    />,
    testDeps({
      "POST /api/staging/images": (request) => {
        requests++;
        return (requests === 1 ? problemAnswer("No space", 500) : jsonAnswer(staged, 201))(request);
      },
    }),
  );
  choose();
  await screen.findByText("No space");
  expect(ready).not.toHaveBeenCalled();
  choose();
  await waitFor(() => expect(ready).toHaveBeenCalledExactlyOnceWith(staged));
});
