import type { ProjectListing } from "@app/slices/admission/model.js";
import type { CastMember, Channel, ChannelSummary } from "@app/slices/channels/model.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPaletteProvider, CommandRegistry } from "@/components/kit/command-palette";
import { type PlaySession, PlaySessionProvider } from "@/play/draft-context";
import { freshDraftDocument } from "@/play/draft-state";
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
const cleopatra: CastMember = {
  id: "7a0c1f3e-2b4d-4e6f-8a9b-0c1d2e3f4a5b",
  channelId: id,
  kind: "creature",
  name: "Cleopatra",
  aliases: ["the Last Pharaoh"],
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

const templateId = "11111111-1111-4111-8111-111111111111";

function listing(projectId: string, title: string): ProjectListing {
  return {
    id: projectId,
    title,
    status: "done",
    progress: 1,
    format: "16:9",
    channelId: id,
    uploadedAt: null,
    config: {
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "generate",
        thumbnail: "generate",
        video: "generate",
      },
    },
    createdAt: "2026-09-27T09:00:00.000Z",
    updatedAt: "2026-09-27T10:00:00.000Z",
  };
}

function Page({ start = "brand" as ChannelTab }) {
  const [tab, setTab] = useState<ChannelTab>(start);
  return <ChannelRoute channelId={id} tab={tab} onTab={setTab} />;
}

const common = {
  [`GET /api/channels/${id}`]: jsonAnswer({ channel, cast: [cleopatra] }),
  "GET /api/fonts": jsonAnswer({ fonts: [] }),
  "GET /api/entries": jsonAnswer({ entries: [] }),
  "GET /api/document-themes": jsonAnswer({ builtIns: [], themes: [] }),
  "GET /api/providers": jsonAnswer({ providers: [] }),
};

const otherId = "00000000-0000-4000-8000-000000000002";
const side: ChannelSummary = {
  ...channel,
  id: otherId,
  name: "Side",
  isDefault: false,
  templates: 0,
  cast: 0,
};

describe("Channels", () => {
  it("lists each channel with its templates and cast, the whole row opening it", async () => {
    const summary: ChannelSummary = { ...channel, templates: 2, cast: 1 };
    renderRouted(
      <ChannelsRoute />,
      testDeps({ "GET /api/channels": jsonAnswer({ channels: [summary, side] }) }),
    );
    expect(await screen.findByText("My channel")).not.toBeNull();
    expect(
      screen.getByText("Default · videos with no channel land here · 2 templates · 1 in the cast"),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "My channel" }).getAttribute("href")).toBe(
      `/channels/${id}`,
    );
    // One way in per row: no Open beside the name, no detail panel with another.
    expect(screen.queryByRole("link", { name: /^Open/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Rename My channel" })).not.toBeNull();
    // The default channel holds everything made before channels; it has no Delete.
    expect(screen.queryByRole("button", { name: "Delete My channel" })).toBeNull();
  });

  it("is the channel's own page when there is only one, with New channel beside it", async () => {
    const user = userEvent.setup();
    const summary: ChannelSummary = { ...channel, templates: 0, cast: 0 };
    renderRouted(
      <ChannelsRoute />,
      testDeps({ ...common, "GET /api/channels": jsonAnswer({ channels: [summary] }) }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "My channel" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Name and look" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.queryByRole("list", { name: "Channels" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "New channel" }));
    expect(await screen.findByRole("form", { name: "New channel" })).not.toBeNull();
  });

  it("renames a channel from its row, keeping its brand kit", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    const summary: ChannelSummary = { ...channel, templates: 0, cast: 0 };
    renderRouted(
      <ChannelsRoute />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [summary, side] }),
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
    const deleted: string[] = [];
    const summary: ChannelSummary = { ...channel, templates: 0, cast: 0 };
    renderRouted(
      <ChannelsRoute />,
      testDeps({
        "GET /api/channels": jsonAnswer({ channels: [summary, side] }),
        [`DELETE /api/channels/${otherId}`]: (request) => {
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
      testDeps({ ...common, "GET /api/channels": jsonAnswer({ channels: [summary, side] }) }),
    );
    await screen.findByRole("tab", { name: "Name and look" });
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
      brand: { captionColor: "#FFD700" },
      baseVersion: 3,
    });
  });

  it("asks the YouTube AI disclosure under Posting, after the name and look, and saves it with them", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    const disclosed: unknown[] = [];
    renderRouted(
      <Page />,
      testDeps({
        ...common,
        [`PUT /api/channels/${id}`]: recording(jsonAnswer({ ...channel, version: 4 }), seen),
        [`PUT /api/channels/${id}/ai-disclosure`]: recording(
          jsonAnswer({ ...channel, version: 5, aiDisclosure: "no" }),
          disclosed,
        ),
      }),
    );
    const name = await screen.findByLabelText("Channel name");
    const picker = screen.getByRole("combobox", { name: "YouTube AI disclosure" });
    // The legal question comes after the channel's own name, in the folded Posting.
    expect(name.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((picker as HTMLSelectElement).value).toBe("auto");
    await user.click(screen.getByText("Posting"));
    await user.click(screen.getByRole("button", { name: "About YouTube AI disclosure" }));
    expect(
      await screen.findByText(/Automatic says Yes only for YouTube.s three cases/),
    ).not.toBeNull();
    await user.keyboard("{Escape}");
    await user.selectOptions(picker, "no");
    expect(disclosed).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save channel" }));
    await waitFor(() => expect(disclosed).toEqual([{ aiDisclosure: "no" }]));
    expect(seen).toHaveLength(1);
  });

  it("offers Make a video in the header and names its tabs in plain words", async () => {
    renderRouted(<Page />, testDeps(common));
    await screen.findByLabelText("Channel name");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Name and look",
      "Cast1",
      "Projects",
      "Templates",
      "Schedules",
      "Memory",
      "Titles to avoid",
    ]);
    expect(screen.getByRole("link", { name: "Make a video" }).getAttribute("href")).toBe("/play");
    // No A/B test of this channel's videos was read, so no link to what worked.
    expect(screen.queryByRole("link", { name: "What worked on YouTube" })).toBeNull();
  });

  it("links to what worked on YouTube once a test of one of its videos was read", async () => {
    renderRouted(
      <Page />,
      testDeps({
        ...common,
        "GET /api/projects": jsonAnswer({
          projects: [{ ...listing("p1", "Cleopatra Awakens"), channelId: id }],
        }),
        "GET /api/studio/ab-results": jsonAnswer({
          results: [
            {
              projectId: "p1",
              projectTitle: "Cleopatra Awakens",
              short: null,
              videoId: "v",
              readAt: "a",
              variants: [],
            },
          ],
        }),
      }),
    );
    expect(
      (await screen.findByRole("link", { name: "What worked on YouTube" })).getAttribute("href"),
    ).toBe("/ab-results");
  });

  it("lists what the channel made, newest first, with Watch on the finished ones", async () => {
    renderRouted(
      <Page start="projects" />,
      testDeps({
        ...common,
        "GET /api/projects": jsonAnswer({
          projects: [
            { ...listing("p1", "Cleopatra Awakens"), channelId: id },
            {
              ...listing("p2", "The Library Burns"),
              channelId: id,
              status: "running",
              updatedAt: "2026-10-01T00:00:00.000Z",
            },
            { ...listing("p3", "Another channel's"), channelId: "elsewhere" },
          ],
        }),
      }),
    );
    const list = await screen.findByRole("list", { name: "Channel projects" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getAllByRole("link")[0]?.textContent)).toEqual([
      "The Library Burns",
      "Cleopatra Awakens",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("Running")).not.toBeNull();
    expect(within(rows[0] as HTMLElement).queryByRole("link", { name: /^Watch/ })).toBeNull();
    expect(
      within(rows[1] as HTMLElement)
        .getByRole("link", { name: "Watch Cleopatra Awakens" })
        .getAttribute("href"),
    ).toBe("/projects/p1?section=video");
  });

  it("lists the channel's templates with Make a video, their schedules and New schedule", async () => {
    const user = userEvent.setup();
    const made: string[] = [];
    const asked: string[] = [];
    const session = {
      review: { starting: false, uncertain: false, created: null },
      flush: async () => true,
      generation: () => 1,
      open: async (draftId: string) => {
        made.push(draftId);
        return true;
      },
    } as unknown as PlaySession;
    renderRouted(
      <PlaySessionProvider value={session}>
        <Page start="templates" />
      </PlaySessionProvider>,
      testDeps({
        ...common,
        "GET /api/project-templates": jsonAnswer({
          templates: [
            {
              id: templateId,
              name: "History starter",
              version: 1,
              updatedAt: "2026-09-27T10:00:00.000Z",
              channelId: id,
            },
          ],
        }),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
        [`POST /api/project-templates/${templateId}/instantiate`]: async (request) => {
          const { id: draftId } = (await request.json()) as { id: string };
          asked.push(draftId);
          return Response.json({
            draft: {
              draft: {
                id: draftId,
                version: 1,
                createdAt: "now",
                updatedAt: "now",
                document: freshDraftDocument,
              },
              attachments: [],
              review: null,
              pendingStart: null,
              start: null,
            },
          });
        },
      }),
    );
    const list = await screen.findByRole("list", { name: "Channel templates" });
    expect(within(list).getByRole("link", { name: "History starter" }).getAttribute("href")).toBe(
      `/templates/${templateId}`,
    );
    expect(within(list).getByText(/· No schedule$/)).not.toBeNull();
    expect(
      within(list)
        .getByRole("link", { name: "New schedule from History starter" })
        .getAttribute("href"),
    ).toBe("/calendar?tab=schedules");
    // With one channel there is nowhere to move it.
    expect(within(list).queryByRole("combobox")).toBeNull();
    await user.click(
      within(list).getByRole("button", { name: "Make a video from History starter" }),
    );
    // Create opens on the draft the template made.
    await waitFor(() => expect(made).toHaveLength(1));
    expect(made).toEqual(asked);
  });

  it("offers New schedule on a channel with templates and no schedule", async () => {
    renderRouted(
      <Page start="schedules" />,
      testDeps({
        ...common,
        "GET /api/project-templates": jsonAnswer({
          templates: [
            { id: templateId, name: "History starter", version: 1, updatedAt: "a", channelId: id },
          ],
        }),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "No schedules for this channel yet" }),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "New schedule" }).getAttribute("href")).toBe(
      "/calendar?tab=schedules",
    );
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
            { ...cleopatra, id: "9c2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a", name: "Alexandria" },
            201,
          ),
          seen,
        ),
      }),
    );
    const grid = await screen.findByRole("region", { name: "Cast" });
    expect(within(grid).getByText("Cleopatra")).not.toBeNull();
    expect(within(grid).getByText("Creature · 1 picture")).not.toBeNull();
    // Edit opens the member beside the gallery, with its aliases.
    await user.click(within(grid).getByRole("button", { name: "Edit Cleopatra" }));
    expect(screen.getByRole("button", { name: "Remove alias the Last Pharaoh" })).not.toBeNull();
    // The page header's primary action on the Cast tab.
    await user.click(screen.getAllByRole("button", { name: "Add to cast" })[0] as HTMLElement);
    await user.selectOptions(screen.getByLabelText("Kind"), "place");
    await user.type(screen.getByLabelText("Name"), "Alexandria");
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
      name: "Alexandria",
      aliases: ["City of Splendors"],
      description: "",
      host: false,
    });
  });

  it("marks a cast member as one of the channel's hosts", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    renderRouted(
      <Page start="cast" />,
      testDeps({
        ...common,
        [`PUT /api/channels/cast/${cleopatra.id}`]: recording(
          jsonAnswer({ ...cleopatra, host: true }),
          seen,
        ),
      }),
    );
    const grid = await screen.findByRole("region", { name: "Cast" });
    await user.click(within(grid).getByRole("button", { name: "Edit Cleopatra" }));
    await user.click(screen.getByRole("switch", { name: "One of the channel's hosts" }));
    // A host without a voice joins nothing yet, and the editor says so.
    expect(
      screen.getByText(/A host joins new podcasts and interviews only with a voice/),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({ name: "Cleopatra", host: true });
  });

  it("offers a cast member the voices that speak the channel's language, with Show all voices", async () => {
    const user = userEvent.setup();
    renderRouted(
      <Page start="cast" />,
      testDeps({
        ...common,
        [`GET /api/channels/${id}`]: jsonAnswer({
          channel: { ...channel, brand: { language: "de" } },
          cast: [{ ...cleopatra, voice: { provider: "openai-tts", model: "tts-1", voice: "" } }],
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
    await user.click(within(grid).getByRole("button", { name: "Edit Cleopatra" }));
    const names = () =>
      within(screen.getByLabelText("Voice"))
        .getAllByRole("option")
        .map((option) => option.textContent);
    await waitFor(() => expect(names()).toEqual(["Pick a voice", "Echo"]));
    await user.click(screen.getByRole("checkbox", { name: /Show all voices/ }));
    expect(names()).toEqual(["Pick a voice", "Alloy", "Echo"]);
  });
});
