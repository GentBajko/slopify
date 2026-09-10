import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { DownloadLink } from "./parts.js";

afterEach(cleanup);

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
