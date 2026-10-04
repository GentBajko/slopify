import type { CastMember, Channel } from "@app/slices/channels/model.js";
import { useQuery } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { useApp } from "@/app-context";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { channelQuery } from "./api";
import { CastTab } from "./cast-tab";

afterEach(cleanup);

const channelId = "00000000-0000-4000-8000-000000000001";
const member = (index: number, name: string, aliases: string[] = []): CastMember => ({
  id: `7a0c1f3e-2b4d-4e6f-8a9b-0c1d2e3f4a${String(index).padStart(2, "0")}`,
  channelId,
  kind: "character",
  name,
  aliases,
  description: "",
  host: false,
  version: 1,
  images: [],
  createdAt: "a",
  updatedAt: "a",
});

it("searches a large cast by name or other name, and says when nothing matches", async () => {
  const user = userEvent.setup();
  const cast = [
    member(0, "Cleopatra", ["the Last Pharaoh"]),
    ...Array.from({ length: 9 }, (_, index) => member(index + 1, `Scribe ${String(index + 1)}`)),
  ];
  renderRouted(<CastTab channelId={channelId} cast={cast} />, testDeps({}));
  const search = await screen.findByRole("searchbox", { name: "Search the cast" });
  await user.type(search, "pharaoh");
  expect(screen.getByRole("button", { name: "Edit Cleopatra" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit Scribe 1" })).toBeNull();
  await user.clear(search);
  await user.type(search, "zzz");
  expect(screen.getByText(`No member's name, kind or description contains "zzz".`)).toBeTruthy();
});

it("shows no search box for a small cast", async () => {
  renderRouted(<CastTab channelId={channelId} cast={[member(0, "Cleopatra")]} />, testDeps({}));
  await screen.findByRole("button", { name: "Edit Cleopatra" });
  expect(screen.queryByRole("searchbox", { name: "Search the cast" })).toBeNull();
});

const channel: Channel = {
  id: channelId,
  name: "My channel",
  isDefault: true,
  brand: {},
  seriesBrief: "",
  aiDisclosure: "auto",
  version: 1,
  createdAt: "a",
  updatedAt: "a",
};

// The channel as the server keeps it: a move reorders it and answers with the new order.
function server(cast: CastMember[]) {
  const sent: { memberId: string; to: number }[] = [];
  let order = [...cast];
  const routes = {
    [`GET /api/channels/${channelId}`]: (request: Request) =>
      jsonAnswer({ channel, cast: order })(request),
    [`POST /api/channels/${channelId}/cast/move`]: async (request: Request) => {
      const body = (await request.json()) as { memberId: string; to: number };
      sent.push(body);
      const moving = order.find((one) => one.id === body.memberId);
      if (moving === undefined) return jsonAnswer({ detail: "gone" }, 404)(request);
      order = order.filter((one) => one !== moving);
      order.splice(body.to, 0, moving);
      return jsonAnswer({ cast: order })(request);
    },
  };
  return { routes, sent, names: () => order.map((one) => one.name) };
}

function Live() {
  const { api } = useApp();
  const query = useQuery(channelQuery(api, channelId));
  return query.data === undefined ? null : <CastTab channelId={channelId} cast={query.data.cast} />;
}

it("moves a member from its More menu, says where, and Undo puts it back", async () => {
  const user = userEvent.setup();
  const fake = server([member(0, "Ada"), member(1, "Bram"), member(2, "Cleo")]);
  renderRouted(<Live />, testDeps(fake.routes));
  await user.click(await screen.findByRole("button", { name: "More for Cleo" }));
  await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
  await waitFor(() => expect(fake.names()).toEqual(["Ada", "Cleo", "Bram"]));
  const toast = await screen.findByText("Moved Cleo up: 2 of 3.");
  await user.click(
    within(toast.closest("div") as HTMLElement).getByRole("button", { name: "Undo" }),
  );
  await waitFor(() => expect(fake.names()).toEqual(["Ada", "Bram", "Cleo"]));
  expect(fake.sent.at(-1)).toEqual({ memberId: member(2, "Cleo").id, to: 2 });
});

it("moves a member with Alt+Down on its Edit button, and not past the end", async () => {
  const user = userEvent.setup();
  const fake = server([member(0, "Ada"), member(1, "Bram")]);
  renderRouted(<Live />, testDeps(fake.routes));
  const edit = await screen.findByRole("button", { name: "Edit Ada" });
  fireEvent.keyDown(edit, { key: "ArrowDown", altKey: true });
  await waitFor(() => expect(fake.names()).toEqual(["Bram", "Ada"]));
  await screen.findByText("Moved Ada down: 2 of 2.");
  fireEvent.keyDown(screen.getByRole("button", { name: "Edit Ada" }), {
    key: "ArrowDown",
    altKey: true,
  });
  await user.click(screen.getByRole("button", { name: "More for Ada" }));
  expect(
    (await screen.findByRole("menuitem", { name: "Move down" })).getAttribute("data-disabled"),
  ).not.toBeNull();
  expect(fake.sent).toHaveLength(1);
});
