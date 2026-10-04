import type { CastMember } from "@app/slices/channels/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { renderRouted, testDeps } from "@/test-app";
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
