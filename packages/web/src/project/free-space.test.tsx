import type { ProjectState } from "@app/kernel/pipeline.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { FreeSpaceOffer } from "./free-space.js";

afterEach(cleanup);

const gb = 1024 * 1024 * 1024;
const storage = (over: Record<string, unknown> = {}): Answer =>
  jsonAnswer({
    outputsBytes: 300 * 1024 * 1024,
    workingBytes: 1.2 * gb,
    removableFiles: 42,
    removableBytes: 1.2 * gb,
    finished: true,
    ...over,
  });

function show(
  status: ProjectState,
  sample: boolean,
  routes: Readonly<Record<string, Answer>>,
): void {
  renderRouted(
    <FreeSpaceOffer projectId="p1" title="Tiamat" status={status} sample={sample} />,
    testDeps(routes),
  );
}

it("offers a finished project's working files, says what it frees, and asks first", async () => {
  const user = userEvent.setup();
  const trim = vi.fn(jsonAnswer({ ok: true, files: 42, bytesFreed: 1.2 * gb }));
  show("done", false, {
    "GET /api/storage/projects/p1": storage(),
    "POST /api/storage/projects/p1/keep-outputs": trim,
  });
  const button = await screen.findByRole("button", {
    name: "Free 1.2 GB: keep the outputs, drop the working files",
  });
  await user.click(button);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/removes 42 working file\(s\) and frees 1.2 GB/)).not.toBeNull();
  expect(trim).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", { name: "Free 1.2 GB" }));
  await waitFor(() => expect(trim).toHaveBeenCalledOnce());
  expect(await screen.findByText(/Freed 1.2 GB from "Tiamat"/)).not.toBeNull();
});

it("offers nothing on a sample, a running project, or one with nothing left to drop", async () => {
  const asked = vi.fn(storage());
  show("done", true, { "GET /api/storage/projects/p1": asked });
  show("running", false, { "GET /api/storage/projects/p1": asked });
  // Neither asks the server: a sample and a running project are never offered it.
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(asked).not.toHaveBeenCalled();
  cleanup();
  const empty = vi.fn(storage({ removableBytes: 0, removableFiles: 0 }));
  show("done", false, { "GET /api/storage/projects/p1": empty });
  await waitFor(() => expect(empty).toHaveBeenCalledOnce());
  expect(screen.queryByRole("region", { name: "Free space" })).toBeNull();
  cleanup();
  // Finished by its steps, but a rebuild is waiting: the server says not finished.
  const waiting = vi.fn(storage({ finished: false }));
  show("done", false, { "GET /api/storage/projects/p1": waiting });
  await waitFor(() => expect(waiting).toHaveBeenCalledOnce());
  expect(screen.queryByRole("button")).toBeNull();
});
