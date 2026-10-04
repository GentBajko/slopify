import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
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
  it("edits a channel's own playlist list, showing the default it falls back to", async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    renderRouted(
      <StudioSettings />,
      testDeps({
        "GET /api/channels": jsonAnswer({
          channels: [channel("c1", "My channel"), channel("c2", "Lore")],
        }),
        "GET /api/studio/settings": jsonAnswer({
          playlists: [{ name: "Everything", byDefault: true }],
          channelPlaylists: { c1: [{ name: "Main tales", byDefault: true }] },
          pairing: { token: "t".repeat(32), origin: null, pairedAt: null },
        }),
        "PUT /api/studio/settings/playlists": async (request) => {
          const body = (await request.json()) as { playlists: unknown };
          saved.push(body);
          return jsonAnswer({ playlists: body.playlists })(request);
        },
      }),
    );
    const first = await screen.findByRole<HTMLInputElement>("textbox", {
      name: "Playlist 1 name",
    });
    await waitFor(() => expect(first.value).toBe("Everything"));
    const picker = screen.getByRole("combobox", { name: "Channel" });
    await screen.findByRole("option", { name: "Lore" });
    await user.selectOptions(picker, "c1");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Playlist 1 name" }).value).toBe(
      "Main tales",
    );
    await user.selectOptions(picker, "c2");
    expect(screen.queryByRole("textbox", { name: "Playlist 1 name" })).toBeNull();
    expect(screen.getByText(/uses the default list \(Everything\)/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Add playlist" }));
    await user.type(screen.getByRole("textbox", { name: "Playlist 1 name" }), "Lore tales");
    await user.click(screen.getByRole("button", { name: "Add playlist" }));
    await user.type(screen.getByRole("textbox", { name: "Playlist 2 name" }), "Villains");
    // The first added is on by default, later ones off until ticked.
    const defaults = screen.getAllByRole<HTMLInputElement>("checkbox", { name: "On by default" });
    expect(defaults.map((box) => box.checked)).toEqual([true, false]);
    await user.click(screen.getByRole("button", { name: "Save playlists" }));
    await waitFor(() =>
      expect(saved).toEqual([
        {
          playlists: [
            { name: "Lore tales", byDefault: true },
            { name: "Villains", byDefault: false },
          ],
          channelId: "c2",
        },
      ]),
    );
  });

  it("refuses a playlist listed twice before saving", async () => {
    const user = userEvent.setup();
    renderRouted(
      <StudioSettings />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [] }),
        "GET /api/studio/settings": jsonAnswer({
          playlists: [{ name: "Everything", byDefault: true }],
          channelPlaylists: {},
          pairing: { token: "t".repeat(32), origin: null, pairedAt: null },
        }),
      }),
    );
    await screen.findByRole("textbox", { name: "Playlist 1 name" });
    await user.click(screen.getByRole("button", { name: "Add playlist" }));
    await user.type(screen.getByRole("textbox", { name: "Playlist 2 name" }), "everything");
    expect(screen.getByText(/listed twice/).getAttribute("role")).toBe("alert");
    expect(screen.getByRole("button", { name: "Save playlists" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("keeps a channel's unsaved list when another channel is picked, and saves it on Enter", async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    renderRouted(
      <StudioSettings />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [channel("c1", "My channel")] }),
        "GET /api/studio/settings": jsonAnswer({
          playlists: [{ name: "Everything", byDefault: true }],
          channelPlaylists: {},
          pairing: { token: "secret-token-value", origin: null, pairedAt: null },
        }),
        "PUT /api/studio/settings/playlists": async (request) => {
          const body = (await request.json()) as { playlists: unknown };
          saved.push(body);
          return jsonAnswer({ playlists: body.playlists })(request);
        },
      }),
    );
    const first = await screen.findByRole<HTMLInputElement>("textbox", {
      name: "Playlist 1 name",
    });
    await waitFor(() => expect(first.value).toBe("Everything"));
    // The pairing token is masked until Show pairing token is pressed.
    expect(screen.queryByText("secret-token-value")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show pairing token" }));
    expect(screen.getByText("secret-token-value")).not.toBeNull();

    await user.type(first, " else");
    expect(screen.getByText(/Unsaved changes/)).not.toBeNull();
    const picker = screen.getByRole("combobox", { name: "Channel" });
    await screen.findByRole("option", { name: "My channel" });
    await user.selectOptions(picker, "c1");
    await user.selectOptions(picker, "");
    const again = screen.getByRole<HTMLInputElement>("textbox", { name: "Playlist 1 name" });
    expect(again.value).toBe("Everything else");
    await user.type(again, "{Enter}");
    await waitFor(() =>
      expect(saved).toEqual([{ playlists: [{ name: "Everything else", byDefault: true }] }]),
    );
  });

  it("offers the extension's download and install steps", async () => {
    renderRouted(
      <StudioSettings />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [] }),
        "GET /api/studio/settings": jsonAnswer({
          playlists: [],
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

describe("playlistsHint", () => {
  it("flags a shorts playlist that also takes long videos, and is quiet once it is set", async () => {
    const { playlistsHint } = await import("./settings-panel.js");
    expect(
      playlistsHint([
        { name: "Dungeons & Dragons", byDefault: true },
        { name: "D&D Shorts", byDefault: true },
      ]),
    ).toMatch(/^"D&D Shorts" takes long videos too/);
    expect(
      playlistsHint([
        { name: "Dungeons & Dragons", byDefault: true, for: "long" },
        { name: "D&D Shorts", byDefault: true, for: "shorts" },
      ]),
    ).toBeUndefined();
  });
});
