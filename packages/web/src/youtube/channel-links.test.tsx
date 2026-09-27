import type { Channel } from "@app/slices/channels/model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ChannelRoute } from "@/routes/channel.js";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { ChannelLinksSettings } from "./channel-links";

afterEach(cleanup);

const defaultId = "00000000-0000-4000-8000-000000000001";
const otherId = "11111111-1111-4111-8111-111111111111";
const main: Channel = {
  id: defaultId,
  name: "My channel",
  isDefault: true,
  brand: {},
  seriesBrief: "",
  aiDisclosure: "auto",
  version: 2,
  createdAt: "a",
  updatedAt: "a",
};

function brandTab(channel: Channel, extra: Readonly<Record<string, Answer>>): unknown[] {
  const seen: unknown[] = [];
  renderRouted(
    <ChannelRoute channelId={channel.id} tab="brand" onTab={() => undefined} />,
    testDeps({
      [`GET /api/channels/${channel.id}`]: jsonAnswer({ channel, cast: [] }),
      "GET /api/fonts": jsonAnswer({ fonts: [] }),
      "GET /api/entries": jsonAnswer({ entries: [] }),
      "GET /api/document-themes": jsonAnswer({ builtIns: [], themes: [] }),
      [`PUT /api/channels/${channel.id}`]: async (request) => {
        seen.push(await request.json());
        return jsonAnswer({ ...channel, version: channel.version + 1 })(request);
      },
      ...extra,
    }),
  );
  return seen;
}

it("shows the default channel the links saved in Settings before, and saves them as its own", async () => {
  const user = userEvent.setup();
  const seen = brandTab(main, {
    "GET /api/settings/channel-links": jsonAnswer({
      links: [{ name: "Patreon", url: "https://patreon.com/me" }],
    }),
  });
  expect(
    ((await screen.findByRole("textbox", { name: "Name of link 1" })) as HTMLInputElement).value,
  ).toBe("Patreon");
  await user.click(screen.getByRole("button", { name: "Add link" }));
  await user.type(screen.getByRole("textbox", { name: "Name of link 2" }), "Discord");
  await user.type(
    screen.getByRole("textbox", { name: "Address of link 2" }),
    "https://discord.gg/abc",
  );
  await user.click(screen.getByRole("button", { name: "Save channel" }));
  await waitFor(() => expect(seen).toHaveLength(1));
  expect(seen[0]).toMatchObject({
    brand: {
      links: [
        { name: "Patreon", url: "https://patreon.com/me" },
        { name: "Discord", url: "https://discord.gg/abc" },
      ],
    },
  });
});

it("keeps each channel's own links, and saves an emptied list as empty", async () => {
  const user = userEvent.setup();
  const seen = brandTab(
    {
      ...main,
      id: otherId,
      name: "Night stories",
      isDefault: false,
      brand: { links: [{ name: "Patreon", url: "https://patreon.com/night" }] },
    },
    {},
  );
  expect(
    ((await screen.findByRole("textbox", { name: "Address of link 1" })) as HTMLInputElement).value,
  ).toBe("https://patreon.com/night");
  await user.click(screen.getByRole("button", { name: "Remove link 1" }));
  expect(screen.getByText(/No channel links yet/u)).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Save channel" }));
  await waitFor(() => expect(seen).toHaveLength(1));
  expect(seen[0]).toMatchObject({ brand: { links: [] } });
});

it("leaves the links out for a channel that never had any", async () => {
  const user = userEvent.setup();
  const seen = brandTab({ ...main, id: otherId, isDefault: false }, {});
  await user.click(await screen.findByRole("button", { name: "Save channel" }));
  await waitFor(() => expect(seen).toHaveLength(1));
  expect(seen[0]).toMatchObject({ brand: {} });
  expect((seen[0] as { brand: object }).brand).not.toHaveProperty("links");
});

it("points Settings → Channel links at the channel's Brand tab", async () => {
  renderRouted(<ChannelLinksSettings />, testDeps({}));
  expect(
    (await screen.findByRole("link", { name: "Open the default channel's links" })).getAttribute(
      "href",
    ),
  ).toBe(`/channels/${defaultId}`);
});
