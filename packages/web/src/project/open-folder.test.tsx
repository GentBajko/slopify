import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { OpenFolder } from "./open-folder.js";
import { DownloadLink } from "./parts.js";

afterEach(cleanup);

it("shows a selectable Docker path without claiming a desktop was opened", async () => {
  renderApp(
    <DownloadLink projectId="p1" asset="video" />,
    testDeps({
      "POST /api/projects/p1/open-folder": jsonAnswer({
        opened: false,
        location: "docker-host",
        path: "/home/u/Slopify/Projects/p1",
      }),
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Open folder" }));
  expect(
    (await screen.findByRole("textbox", { name: "Saved folder path" })).getAttribute("value"),
  ).toBe("/home/u/Slopify/Projects/p1");
  expect(screen.getByText(/Slopify runs in Docker, which can't open windows/)).not.toBeNull();
  expect(screen.getByText(/npx @gentbajko\/slopify@latest --docker/)).not.toBeNull();
  expect(screen.getByRole("link", { name: "Download" })).not.toBeNull();
  expect(screen.queryByText(/opened a window/i)).toBeNull();
});

it("shows no path when the host helper opened the Docker folder", async () => {
  const open = vi.fn(
    jsonAnswer({ opened: true, location: "docker-host", path: "/home/u/Slopify/Projects/p1" }),
  );
  renderApp(
    <DownloadLink projectId="p1" asset="video" />,
    testDeps({ "POST /api/projects/p1/open-folder": open }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Open folder" }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("button", { name: "Open folder" })).not.toBeNull();
  expect(screen.queryByRole("textbox", { name: "Saved folder path" })).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it("uses the historical record endpoint for a retained folder", async () => {
  const request = vi.fn(
    jsonAnswer({
      opened: false,
      location: "docker-host",
      path: "/home/u/Slopify/Projects/p1/history",
    }),
  );
  renderApp(
    <OpenFolder projectId="p1" asset="video" folder={{ revisionId: "old", recordId: "record" }} />,
    testDeps({ "POST /api/projects/p1/revisions/old/record/open-folder": request }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Open folder" }));
  expect(
    (await screen.findByRole("textbox", { name: "Saved folder path" })).getAttribute("value"),
  ).toContain("/history");
  expect(request).toHaveBeenCalledTimes(1);
});

it("keeps downloads and opens the output folder only on demand", async () => {
  const open = vi.fn(jsonAnswer({ opened: true }));
  renderApp(
    <DownloadLink projectId="p1" asset="images.zip" label="Download all" />,
    testDeps({ "POST /api/projects/p1/open-folder": open }),
  );
  expect(screen.getByRole("link", { name: "Download all" }).getAttribute("href")).toContain(
    "/files/p1/images.zip",
  );
  expect(open).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Open folder" }));
  expect(open).toHaveBeenCalledTimes(1);
});

it("shows a folder failure beside the working download", async () => {
  renderApp(
    <DownloadLink projectId="p1" asset="video" />,
    testDeps({
      "POST /api/projects/p1/open-folder": problemAnswer("No file manager is available.", 503),
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Open folder" }));
  expect((await screen.findByRole("alert")).textContent).toContain("No file manager");
  expect(screen.getByRole("link", { name: "Download" })).not.toBeNull();
});
