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

// Links from Settings shown on the default channel are not its own yet: there is something to
// save, so Save channel does not wait for another change.
it("offers Save channel at once to keep the links Settings held as the channel's own", async () => {
  const user = userEvent.setup();
  const seen = brandTab(main, {
    "GET /api/settings/channel-links": jsonAnswer({
      links: [{ name: "Patreon", url: "https://patreon.com/me" }],
    }),
  });
  await screen.findByRole("textbox", { name: "Name of link 1" });
  await user.click(screen.getByRole("button", { name: "Save channel" }));
  await waitFor(() => expect(seen).toHaveLength(1));
  expect(seen[0]).toMatchObject({
    brand: { links: [{ name: "Patreon", url: "https://patreon.com/me" }] },
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
  // The fold's line says the list is empty now.
  expect(screen.queryByRole("textbox", { name: "Address of link 1" })).toBeNull();
  expect(screen.getByText("None yet")).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Save channel" }));
  await waitFor(() => expect(seen).toHaveLength(1));
  expect(seen[0]).toMatchObject({ brand: { links: [] } });
});

it("leaves the links out for a channel that never had any", async () => {
  const user = userEvent.setup();
  const seen = brandTab({ ...main, id: otherId, isDefault: false }, {});
  // Save waits for a change: one that isn't a link.
  await user.type(await screen.findByLabelText("Series brief"), " More.");
  await user.click(await screen.findByRole("button", { name: "Save channel" }));
  await waitFor(() => expect(seen).toHaveLength(1));
  expect(seen[0]).toMatchObject({ brand: {} });
  expect((seen[0] as { brand: object }).brand).not.toHaveProperty("links");
});

it("says nothing on Settings while no links saved there before still apply", async () => {
  const summary = { ...main, templates: 0, cast: 0 };
  renderRouted(
    <>
      <ChannelLinksSettings />
      <p>Page</p>
    </>,
    testDeps({
      "GET /api/channels": jsonAnswer({ channels: [summary] }),
      "GET /api/settings/channel-links": jsonAnswer({ links: [] }),
    }),
  );
  await screen.findByText("Page");
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByText(/saved here before/)).toBeNull();
  expect(screen.queryByRole("link", { name: /links$/ })).toBeNull();
});

it("points links saved on Settings before at the default channel's Name and look tab", async () => {
  const summary = { ...main, templates: 0, cast: 0 };
  renderRouted(
    <ChannelLinksSettings />,
    testDeps({
      "GET /api/channels": jsonAnswer({ channels: [summary] }),
      "GET /api/settings/channel-links": jsonAnswer({
        links: [{ name: "Patreon", url: "https://patreon.com/me" }],
      }),
    }),
  );
  expect(
    await screen.findByText(
      "A link saved here before still fills My channel's descriptions. They move to its Channel links when you save its Name and look tab.",
    ),
  ).not.toBeNull();
  expect(screen.getByRole("link", { name: "Open My channel's links" }).getAttribute("href")).toBe(
    `/channels/${defaultId}`,
  );
});
