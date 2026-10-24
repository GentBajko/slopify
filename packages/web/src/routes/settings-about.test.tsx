import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { AboutSettings, channelStoryUrl } from "./settings-about";

afterEach(cleanup);

const info = (over: Record<string, unknown> = {}) => ({
  currentVersion: "4.0.0",
  latestVersion: "4.0.0",
  available: false,
  busy: false,
  canUpdate: true,
  status: "idle",
  ...over,
});

describe("Settings → About", () => {
  it("leads with the version, says it is up to date, and keeps the slogan", async () => {
    renderApp(<AboutSettings />, testDeps({ "GET /api/update": jsonAnswer(info()) }));
    expect(await screen.findByText("Slopify 4.0.0")).not.toBeNull();
    expect(await screen.findByText("Up to date")).not.toBeNull();
    expect(screen.getByText("Free. Your keys, your machine.")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Check for updates" })).not.toBeNull();
  });

  it("is the update button: a ready version installs from here", async () => {
    const user = userEvent.setup();
    let installed = 0;
    renderApp(
      <AboutSettings />,
      testDeps({
        "GET /api/update": jsonAnswer(info({ latestVersion: "4.1.0", available: true })),
        "POST /api/update": (request) => {
          installed += 1;
          return jsonAnswer(info({ status: "installing" }))(request);
        },
      }),
    );
    expect(await screen.findByText("Version 4.1.0 is ready")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Update to 4.1.0" }));
    await waitFor(() => expect(installed).toBe(1));
  });

  it("opens What's new, offers diagnostics, and keeps only the channel story among links", async () => {
    const onWhatsNew = vi.fn();
    renderApp(
      <AboutSettings onWhatsNew={onWhatsNew} />,
      testDeps({ "GET /api/update": jsonAnswer(info()) }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Read what's new" }));
    expect(onWhatsNew).toHaveBeenCalledTimes(1);
    const diagnostics = screen.getByRole("link", { name: "Download diagnostics" });
    expect(diagnostics.getAttribute("download")).toBe("slopify-diagnostics.json");
    // The support links live in the rail's Support menu, not here as well.
    expect(screen.queryByRole("link", { name: "Patreon" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Buy Me a Coffee" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "How I run a channel with it" }).getAttribute("href"),
    ).toBe(channelStoryUrl);
    expect(channelStoryUrl.startsWith("https://")).toBe(true);
  });
});
