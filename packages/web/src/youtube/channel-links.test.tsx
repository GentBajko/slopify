import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { ChannelLinksSettings } from "./channel-links";

afterEach(cleanup);

it("adds a link and saves the list", async () => {
  let sent: unknown;
  renderApp(
    <ChannelLinksSettings />,
    testDeps({
      "GET /api/settings/channel-links": jsonAnswer({
        links: [{ name: "Patreon", url: "https://patreon.com/me" }],
      }),
      "PUT /api/settings/channel-links": async (request) => {
        sent = await request.json();
        return jsonAnswer(sent)(request);
      },
    }),
  );
  expect(
    ((await screen.findByRole("textbox", { name: "Name of link 1" })) as HTMLInputElement).value,
  ).toBe("Patreon");
  await userEvent.click(screen.getByRole("button", { name: "Add link" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Name of link 2" }), "Discord");
  await userEvent.type(
    screen.getByRole("textbox", { name: "Address of link 2" }),
    "https://discord.gg/abc",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(sent).toEqual({
      links: [
        { name: "Patreon", url: "https://patreon.com/me" },
        { name: "Discord", url: "https://discord.gg/abc" },
      ],
    }),
  );
  expect(await screen.findByText("Saved the channel links.")).not.toBeNull();
});

it("says what is wrong before saving a bad link", async () => {
  renderApp(
    <ChannelLinksSettings />,
    testDeps({ "GET /api/settings/channel-links": jsonAnswer({ links: [] }) }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Add link" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Name of link 1" }), "Discord");
  await userEvent.type(screen.getByRole("textbox", { name: "Address of link 1" }), "discord.gg");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/not a web address/u);
});
