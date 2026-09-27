import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { StudioSettings } from "./settings-panel.js";

afterEach(cleanup);

const channel = (id: string, name: string) => ({
  id,
  name,
  isDefault: id === "c1",
  brand: {},
  seriesBrief: "",
  version: 1,
  createdAt: "x",
  updatedAt: "x",
  templates: 0,
  cast: 0,
});

describe("Settings → YouTube Studio", () => {
  it("saves a channel's own playlist, showing the default it falls back to", async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    renderApp(
      <StudioSettings />,
      testDeps({
        "GET /api/channels": jsonAnswer({
          channels: [channel("c1", "My channel"), channel("c2", "Lore")],
        }),
        "GET /api/studio/settings": jsonAnswer({
          playlist: "Everything",
          channelPlaylists: { c1: "Main tales" },
          pairing: { token: "t".repeat(32), origin: null, pairedAt: null },
        }),
        "PUT /api/studio/settings/playlist": async (request) => {
          const body = (await request.json()) as { playlist: string };
          saved.push(body);
          return jsonAnswer({ playlist: body.playlist })(request);
        },
      }),
    );
    const input = await screen.findByRole<HTMLInputElement>("textbox", { name: "Playlist" });
    await waitFor(() => expect(input.value).toBe("Everything"));
    const picker = screen.getByRole("combobox", { name: "Channel" });
    await screen.findByRole("option", { name: "Lore" });
    await user.selectOptions(picker, "c1");
    expect(input.value).toBe("Main tales");
    await user.selectOptions(picker, "c2");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Default: Everything");
    await user.type(input, "Lore tales");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toEqual([{ playlist: "Lore tales", channelId: "c2" }]));
  });

  it("offers the extension's download and install steps", async () => {
    renderApp(
      <StudioSettings />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [] }),
        "GET /api/studio/settings": jsonAnswer({
          playlist: null,
          channelPlaylists: {},
          pairing: { token: "t".repeat(32), origin: null, pairedAt: null },
        }),
      }),
    );
    const section = await screen.findByRole("region", { name: "Install the Studio extension" });
    expect(section.querySelectorAll("ol li")).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: /Download for (Chrome|Firefox)/ }).getAttribute("href"),
    ).toMatch(/^http:\/\/slopify\.test\/api\/studio\/extension\/(chrome|firefox)\.zip$/);
  });
});
