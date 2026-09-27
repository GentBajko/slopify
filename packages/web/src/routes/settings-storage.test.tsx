import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { StorageUsage } from "@/api";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { ProjectStorageList } from "./settings-storage.js";

afterEach(cleanup);

const project = (over: Partial<StorageUsage["byProject"][number]>) => ({
  id: "p1",
  title: "Cleopatra",
  bytes: 3 * 1024 * 1024,
  outputsBytes: 1024 * 1024,
  workingBytes: 2 * 1024 * 1024,
  removableFiles: 12,
  removableBytes: 2 * 1024 * 1024,
  finished: true,
  ...over,
});

it("splits each project into outputs and working files, largest first", () => {
  renderApp(
    <ProjectStorageList
      projects={[project({ id: "small", title: "Small", bytes: 10 }), project({})]}
      queryKey={["storage-usage"]}
    />,
    testDeps({}),
  );
  const rows = within(screen.getByRole("list", { name: "Storage by project" })).getAllByRole(
    "listitem",
  );
  expect(rows[0]?.textContent).toContain("Cleopatra");
  expect(rows[0]?.textContent).toContain("outputs 1 MB · working files 2 MB");
});

it("spells out the trade-off before removing working files, then says what it freed", async () => {
  const trim = vi.fn(jsonAnswer({ ok: true, files: 12, bytesFreed: 2 * 1024 * 1024 }));
  renderApp(
    <ProjectStorageList projects={[project({})]} queryKey={["storage-usage"]} />,
    testDeps({ "POST /api/storage/projects/p1/keep-outputs": trim }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Keep outputs only" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/frees 2 MB/)).not.toBeNull();
  expect(within(dialog).getByText(/has to make those files again first/)).not.toBeNull();
  expect(trim).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Keep outputs only" }));
  await waitFor(() => expect(trim).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/Freed 2 MB from "Cleopatra"/)).not.toBeNull();
});

it("offers nothing on a project that has not finished or has nothing left to remove", () => {
  renderApp(
    <ProjectStorageList
      projects={[
        project({ id: "a", finished: false }),
        project({ id: "b", title: "Trimmed", removableBytes: 0, removableFiles: 0 }),
      ]}
      queryKey={["storage-usage"]}
    />,
    testDeps({}),
  );
  for (const button of screen.getAllByRole("button", { name: "Keep outputs only" }))
    expect(button.hasAttribute("disabled")).toBe(true);
});
