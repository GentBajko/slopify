import type { CastMember, Channel, ChannelSummary } from "@app/slices/channels/model.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { ChannelRoute, type ChannelTab } from "./channel.js";
import { ChannelsRoute } from "./channels.js";

afterEach(cleanup);

const id = "00000000-0000-4000-8000-000000000001";
const channel: Channel = {
  id,
  name: "My channel",
  isDefault: true,
  brand: { endScreenText: "Subscribe" },
  seriesBrief: "",
  aiDisclosure: "auto",
  version: 3,
  createdAt: "a",
  updatedAt: "a",
};
const tiamat: CastMember = {
  id: "7a0c1f3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
  channelId: id,
  kind: "creature",
  name: "Tiamat",
  aliases: ["the Dragon Queen"],
  description: "",
  version: 1,
  images: [
    {
      id: "8b1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      source: "upload",
      prompt: null,
      state: "ready",
      error: null,
      sha256: "a".repeat(64),
      createdAt: "a",
    },
  ],
  createdAt: "a",
  updatedAt: "a",
};

function recording(answer: Answer, seen: unknown[]): Answer {
  return async (request) => {
    seen.push(await request.clone().json());
    return answer(request);
  };
}

function Page({ start = "brand" as ChannelTab }) {
  const [tab, setTab] = useState<ChannelTab>(start);
  return <ChannelRoute channelId={id} tab={tab} onTab={setTab} />;
}

const common = {
  [`GET /api/channels/${id}`]: jsonAnswer({ channel, cast: [tiamat] }),
  "GET /api/fonts": jsonAnswer({ fonts: [] }),
  "GET /api/entries": jsonAnswer({ entries: [] }),
  "GET /api/document-themes": jsonAnswer({ builtIns: [], themes: [] }),
  "GET /api/providers": jsonAnswer({ providers: [] }),
};

describe("Channels", () => {
  it("lists each channel with its templates and cast", async () => {
    const summary: ChannelSummary = { ...channel, templates: 2, cast: 1 };
    renderRouted(
      <ChannelsRoute />,
      testDeps({ "GET /api/channels": jsonAnswer({ channels: [summary] }) }),
    );
    expect(await screen.findByText("My channel")).not.toBeNull();
    expect(screen.getByText("Default · 2 templates · 1 in the cast")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Open My channel" }).getAttribute("href")).toBe(
      `/channels/${id}`,
    );
    expect(screen.getByRole("button", { name: "Rename My channel" })).not.toBeNull();
    // The default channel holds everything made before channels; it has no Delete.
    expect(screen.queryByRole("button", { name: "Delete My channel" })).toBeNull();
  });

  it("renames a channel from its row, keeping its brand kit", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    const summary: ChannelSummary = { ...channel, templates: 0, cast: 0 };
    renderRouted(
      <ChannelsRoute />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [summary] }),
        [`PUT /api/channels/${id}`]: recording(jsonAnswer({ ...channel, name: "Lore" }), seen),
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Rename My channel" }));
    const name = screen.getByLabelText("Channel name");
    await user.clear(name);
    await user.type(name, "Lore");
    await user.click(screen.getByRole("button", { name: "Rename channel" }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({
      name: "Lore",
      brand: { endScreenText: "Subscribe" },
      seriesBrief: "",
      baseVersion: 3,
    });
  });

  it("deletes a channel from its row after confirming", async () => {
    const user = userEvent.setup();
    const other = "00000000-0000-4000-8000-000000000002";
    const deleted: string[] = [];
    const side: ChannelSummary = {
      ...channel,
      id: other,
      name: "Side",
      isDefault: false,
      templates: 0,
      cast: 0,
    };
    renderRouted(
      <ChannelsRoute />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [side] }),
        [`DELETE /api/channels/${other}`]: (request) => {
          deleted.push(request.method);
          return new Response(null, { status: 204 });
        },
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete Side" }));
    expect(deleted).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Delete channel" }));
    await waitFor(() => expect(deleted).toEqual(["DELETE"]));
  });

  it("offers New channel and, on a channel, Add to cast in the command palette", async () => {
    const registry = new CommandRegistry();
    const summary: ChannelSummary = { ...channel, templates: 0, cast: 0 };
    renderRouted(
      <CommandPaletteProvider registry={registry}>
        <ChannelsRoute />
        <Page />
      </CommandPaletteProvider>,
      testDeps({ ...common, "GET /api/channels": jsonAnswer({ channels: [summary] }) }),
    );
    await screen.findByRole("tab", { name: "Brand" });
    const titles = () => registry.list().map((command) => [command.title, command.group]);
    await waitFor(() =>
      expect(titles()).toEqual(
        expect.arrayContaining([
          ["New channel", "Channels"],
          ["Add to cast", "Channel"],
        ]),
      ),
    );
    // Add to cast switches to the Cast tab and opens an empty editor beside the gallery.
    act(() =>
      registry
        .list()
        .find((command) => command.title === "Add to cast")
        ?.run(),
    );
    expect(screen.getByRole("tab", { name: /Cast/ }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("form", { name: "Cast member" })).not.toBeNull();
  });

  it("saves the brand kit with blank fields left out", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    renderRouted(
      <Page />,
      testDeps({
        ...common,
        [`PUT /api/channels/${id}`]: recording(jsonAnswer({ ...channel, version: 4 }), seen),
      }),
    );
    await user.type(await screen.findByLabelText("Caption colour"), "#ffd700");
    await user.clear(screen.getByLabelText("End screen text"));
    await user.click(screen.getByRole("button", { name: "Save channel" }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({
      name: "My channel",
      seriesBrief: "",
      brand: { captionColor: "#ffd700" },
      baseVersion: 3,
    });
  });

  it("saves the YouTube AI disclosure as soon as it is picked", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    renderRouted(
      <Page />,
      testDeps({
        ...common,
        [`PUT /api/channels/${id}/ai-disclosure`]: recording(
          jsonAnswer({ ...channel, aiDisclosure: "no" }),
          seen,
        ),
      }),
    );
    const picker = await screen.findByRole("combobox", { name: "YouTube AI disclosure" });
    expect((picker as HTMLSelectElement).value).toBe("auto");
    expect(
      screen.getByText(/Automatic says Yes when an AI voice or AI images are used/),
    ).not.toBeNull();
    await user.selectOptions(picker, "no");
    await waitFor(() => expect(seen).toEqual([{ aiDisclosure: "no" }]));
    await waitFor(() => expect((picker as HTMLSelectElement).value).toBe("no"));
  });

  it("shows the cast with its pictures and adds a member with aliases", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    renderRouted(
      <Page start="cast" />,
      testDeps({
        ...common,
        [`POST /api/channels/${id}/cast`]: recording(
          jsonAnswer(
            { ...tiamat, id: "9c2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a", name: "Waterdeep" },
            201,
          ),
          seen,
        ),
      }),
    );
    const grid = await screen.findByRole("region", { name: "Cast" });
    expect(within(grid).getByText("Tiamat")).not.toBeNull();
    expect(within(grid).getByText("Creature · 1 picture")).not.toBeNull();
    // Edit opens the member beside the gallery, with its aliases.
    await user.click(within(grid).getByRole("button", { name: "Edit Tiamat" }));
    expect(screen.getByRole("button", { name: "Remove alias the Dragon Queen" })).not.toBeNull();
    // The page header's primary action on the Cast tab.
    await user.click(screen.getAllByRole("button", { name: "Add to cast" })[0] as HTMLElement);
    await user.selectOptions(screen.getByLabelText("Kind"), "place");
    await user.type(screen.getByLabelText("Name"), "Waterdeep");
    await user.type(screen.getByLabelText("Aliases"), "City of Splendors{Enter}");
    expect(screen.getByRole("button", { name: "Remove alias City of Splendors" })).not.toBeNull();
    // The editor's own submit button, after the header's opener.
    const submit = screen
      .getAllByRole("button", { name: "Add to cast" })
      .find((button) => button.getAttribute("form") === "cast-member-form");
    if (submit === undefined) throw new Error("No submit button");
    await user.click(submit);
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({
      kind: "place",
      name: "Waterdeep",
      aliases: ["City of Splendors"],
      description: "",
    });
  });

  it("offers a cast member the voices that speak the channel's language, with Show all voices", async () => {
    const user = userEvent.setup();
    renderRouted(
      <Page start="cast" />,
      testDeps({
        ...common,
        [`GET /api/channels/${id}`]: jsonAnswer({
          channel: { ...channel, brand: { language: "de" } },
          cast: [{ ...tiamat, voice: { provider: "openai-tts", model: "tts-1", voice: "" } }],
        }),
        "GET /api/settings/voices": jsonAnswer({
          voices: [
            { id: "1", provider: "openai-tts", voiceId: "alloy", name: "Alloy", languages: ["en"] },
            { id: "2", provider: "openai-tts", voiceId: "echo", name: "Echo", languages: ["de"] },
          ],
        }),
      }),
    );
    const grid = await screen.findByRole("region", { name: "Cast" });
    await user.click(within(grid).getByRole("button", { name: "Edit Tiamat" }));
    const names = () =>
      within(screen.getByLabelText("Voice"))
        .getAllByRole("option")
        .map((option) => option.textContent);
    await waitFor(() => expect(names()).toEqual(["Pick a voice", "Echo"]));
    await user.click(screen.getByLabelText(/Show all voices/));
    expect(names()).toEqual(["Pick a voice", "Alloy", "Echo"]);
  });
});
