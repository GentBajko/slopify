import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { StorageUsage } from "@/api";
import { jsonAnswer, renderApp, renderRouted, testDeps } from "@/test-app";
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
  historyFiles: 0,
  historyBytes: 0,
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

it("draws no clean-up that would free nothing, and says why a project has none", () => {
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
  // No greyed buttons: what cannot apply is left out, and the row says why.
  expect(screen.queryByRole("button", { name: "Keep outputs only" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Delete all old versions/ })).toBeNull();
  expect(screen.getByText(/not finished yet/)).not.toBeNull();
});

it("marks the bundled samples in the one list and leaves their files alone", async () => {
  renderRouted(
    <ProjectStorageList
      projects={[project({ id: "sample-1", title: "The Library of Alexandria" })]}
      samples={new Set(["sample-1"])}
      queryKey={["storage-usage"]}
    />,
    testDeps({}),
  );
  const row = (await screen.findByText("The Library of Alexandria")).closest("li") as HTMLElement;
  expect(within(row).getByText(/^Sample · /)).not.toBeNull();
  expect(within(row).getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
    "/projects/sample-1",
  );
  expect(within(row).queryByRole("button", { name: "Keep outputs only" })).toBeNull();
});

it("deletes one project's old versions after asking, and offers both clean-ups for every project", async () => {
  const old = vi.fn(jsonAnswer({ ok: true, files: 3, bytesFreed: 5 * 1024 * 1024 }));
  renderApp(
    <ProjectStorageList
      projects={[project({ historyFiles: 3, historyBytes: 5 * 1024 * 1024 })]}
      queryKey={["storage-usage"]}
    />,
    testDeps({ "POST /api/storage/projects/p1/old-versions/delete": old }),
  );
  expect(
    screen
      .getByRole("button", { name: /Delete all old versions \(5 MB\)/ })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: /Clean up everything \(7 MB\)/ }).hasAttribute("disabled"),
  ).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Delete old versions" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/3 file\(s\) of older versions/)).not.toBeNull();
  expect(old).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete old versions" }));
  await waitFor(() => expect(old).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/Freed 5 MB from "Cleopatra"/)).not.toBeNull();
});
