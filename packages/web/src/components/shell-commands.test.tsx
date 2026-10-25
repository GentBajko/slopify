import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CurrentChannelProvider } from "@/channels/current";
import {
  CommandPaletteProvider,
  CommandRegistry,
  matchCommands,
} from "@/components/kit/command-palette";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { ShellCommands } from "./shell-commands.js";

afterEach(cleanup);

const channel = (id: string, name: string) => ({ id, name, isDefault: id === "c1" });

async function mount(channels = [channel("c1", "My channel")]) {
  const registry = new CommandRegistry();
  renderRouted(
    <CommandPaletteProvider registry={registry}>
      <CurrentChannelProvider>
        <ShellCommands />
      </CurrentChannelProvider>
    </CommandPaletteProvider>,
    testDeps({ "GET /api/channels": jsonAnswer({ channels }) }),
  );
  await waitFor(() => expect(registry.list().length).toBeGreaterThan(10));
  return registry;
}

const listed = (registry: CommandRegistry) =>
  matchCommands(registry.list(), "")
    .filter((command) => command.group !== "Help")
    .map((command) => command.title);

it("opens an empty palette on Create a video, then the rail's destinations in its order", async () => {
  const registry = await mount();
  await waitFor(() =>
    expect(listed(registry)).toEqual([
      "Create a video",
      "Open Home",
      "Open Projects",
      "Open Prompts",
      "Open Templates",
      "Open Calendar",
      "Open Settings",
    ]),
  );
  // One channel: no channel to switch to, and Channels is found by name only.
  expect(matchCommands(registry.list(), "channels")[0]?.title).toBe("Open Channels");
  expect(registry.list().some((command) => command.group === "Channel")).toBe(false);
});

it("lists Channels where the rail does, and each channel to switch to, with two or more", async () => {
  const registry = await mount([channel("c1", "My channel"), channel("c2", "Night Myths")]);
  await waitFor(() =>
    expect(listed(registry).slice(0, 8)).toEqual([
      "Create a video",
      "Open Home",
      "Open Projects",
      "Open Prompts",
      "Open Templates",
      "Open Calendar",
      "Open Channels",
      "Open Settings",
    ]),
  );
  expect(listed(registry)).toEqual(
    expect.arrayContaining(["Show all channels", "Switch to Night Myths"]),
  );
});

it("finds the pages that left Library from anywhere, by their names and the words for them", async () => {
  const registry = await mount();
  const first = (typed: string) => matchCommands(registry.list(), typed)[0]?.title;
  expect(first("pronunciation")).toBe("Open Pronunciation");
  expect(first("aliases")).toBe("Open Pronunciation");
  expect(first("what worked")).toBe("Open What worked on YouTube");
  expect(first("a/b")).toBe("Open What worked on YouTube");
  expect(first("intros")).toBe("Open intros and outros");
  expect(first("pdf looks")).toBe("Open PDF looks");
  expect(first("pdf themes")).toBe("Open PDF looks");
  expect(
    matchCommands(registry.list(), "pdf")
      .map((command) => command.title)
      .slice(0, 2),
  ).toEqual(expect.arrayContaining(["Open PDF looks", "New PDF look"]));
  // None of them crowds the empty palette.
  expect(listed(registry)).not.toContain("Open PDF looks");
  expect(listed(registry)).not.toContain("New PDF look");
});

it("lands a Settings section's name on that section, not on Settings' first one", async () => {
  const registry = await mount();
  expect(matchCommands(registry.list(), "appearance")[0]?.id).toBe("settings.section.general");
  expect(matchCommands(registry.list(), "trash")[0]?.title).toBe("Open Settings: Trash");
  expect(matchCommands(registry.list(), "api keys")[0]?.title).toBe(
    "Open Settings: Keys & services",
  );
  // The pages' former names and the plain words for them land there too.
  for (const typed of ["providers", "keys"])
    expect(matchCommands(registry.list(), typed)[0]?.title).toBe("Open Settings: Keys & services");
  expect(matchCommands(registry.list(), "template studio")[0]?.title).toBe(
    "Open Settings: Production defaults",
  );
  // A former name does not outrank a page whose name holds the word now.
  for (const typed of ["studio", "studio settings"])
    expect(matchCommands(registry.list(), typed)[0]?.title).toBe(
      "Open Settings: YouTube Studio and posting",
    );
});

it("reopens the welcome screen and offers the tour", async () => {
  const registry = await mount();
  expect(matchCommands(registry.list(), "welcome")[0]?.title).toBe("Open the welcome screen");
  expect(matchCommands(registry.list(), "tour")[0]?.title).toBe("Start the tour");
  expect(matchCommands(registry.list(), "interactive tutorial")[0]?.title).toBe("Start the tour");
});
