import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FilesView } from "@/api";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { FilesFolder } from "./settings-files.js";

afterEach(cleanup);

const native: FilesView = {
  docker: false,
  folder: "/home/you/.slopify/projects",
  projects: "/home/you/.slopify/projects",
  backups: "/home/you/.slopify/projects/Backups",
  exports: null,
  inDataDir: true,
  documentsRoot: "/home/you/Documents/Slopify",
  inDocuments: false,
  move: null,
  dockerCommand: null,
};

it("shows where the files are and moves them to Documents/Slopify", async () => {
  const move = vi.fn(
    jsonAnswer({
      ...native,
      move: {
        target: "/home/you/Documents/Slopify",
        phase: "copying",
        files: 1,
        totalFiles: 4,
        bytes: 1024,
        totalBytes: 4096,
        error: null,
        oldFolder: null,
      },
    }),
  );
  renderApp(
    <FilesFolder usageQueryKey={["storage-usage"]} />,
    testDeps({
      "GET /api/storage/files": jsonAnswer(native),
      "POST /api/storage/files/move": move,
    }),
  );
  expect(await screen.findByText("/home/you/.slopify/projects/Backups")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Move to Documents/Slopify" }));
  await waitFor(() => expect(move).toHaveBeenCalledTimes(1));
  expect(
    await screen.findByText(/Copying your files to \/home\/you\/Documents\/Slopify/),
  ).not.toBeNull();
});

it("shows why another folder can't be used", async () => {
  renderApp(
    <FilesFolder usageQueryKey={["storage-usage"]} />,
    testDeps({
      "GET /api/storage/files": jsonAnswer(native),
      "POST /api/storage/files/move": problemAnswer(
        "/usr is a system or shared folder. Choose a folder of your own.",
      ),
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Choose another folder" }));
  await userEvent.type(screen.getByLabelText("New folder"), "/usr");
  await userEvent.click(screen.getByRole("button", { name: "Move here" }));
  expect(await screen.findByText(/is a system or shared folder/)).not.toBeNull();
});

it("offers to continue a move that stopped", async () => {
  renderApp(
    <FilesFolder usageQueryKey={["storage-usage"]} />,
    testDeps({
      "GET /api/storage/files": jsonAnswer({
        ...native,
        move: {
          target: "/home/you/Documents/Slopify",
          phase: "interrupted",
          files: 0,
          totalFiles: 0,
          bytes: 0,
          totalBytes: 0,
          error: null,
          oldFolder: null,
        },
      }),
    }),
  );
  expect(await screen.findByRole("button", { name: "Continue moving" })).not.toBeNull();
});

it("gives Docker installs the installer command instead of a move button", async () => {
  renderApp(
    <FilesFolder usageQueryKey={["storage-usage"]} />,
    testDeps({
      "GET /api/storage/files": jsonAnswer({
        ...native,
        docker: true,
        folder: "/home/you/Slopify/Projects",
        projects: "/home/you/Slopify/Projects",
        backups: null,
        inDataDir: false,
        documentsRoot: null,
        dockerCommand: "npx @gentbajko/slopify@latest update --docker --projects-dir documents",
      }),
    }),
  );
  expect(
    await screen.findByText(
      "npx @gentbajko/slopify@latest update --docker --projects-dir documents",
    ),
  ).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Move to Documents/Slopify" })).toBeNull();
});
