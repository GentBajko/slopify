import type { CastMember, Channel, ChannelSummary } from "@app/slices/channels/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
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

describe("Library → Channels", () => {
  it("lists each channel with its templates and cast", async () => {
    const summary: ChannelSummary = { ...channel, templates: 2, cast: 1 };
    renderRouted(
      <ChannelsRoute />,
      testDeps({ "GET /api/channels": jsonAnswer({ channels: [summary] }) }),
    );
    expect(await screen.findByText("My channel")).not.toBeNull();
    expect(screen.getByText("Default · 2 templates · 1 in the cast")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Open My channel" })).not.toBeNull();
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
    const list = await screen.findByRole("list", { name: "Cast" });
    expect(within(list).getByText("Tiamat")).not.toBeNull();
    expect(within(list).getByText("Creature · 1 picture · also the Dragon Queen")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Add to the cast" }));
    await user.selectOptions(screen.getByLabelText("Kind"), "place");
    await user.type(screen.getByLabelText("Name"), "Waterdeep");
    await user.type(screen.getByLabelText("Aliases"), "City of Splendors{Enter}");
    expect(screen.getByRole("button", { name: "Remove alias City of Splendors" })).not.toBeNull();
    // The drawer's own submit button, after the tab's opener.
    const submit = screen
      .getAllByRole("button", { name: "Add to the cast" })
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
});
