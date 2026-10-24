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

it("lands a Settings section's name on that section, not on Settings' first one", async () => {
  const registry = await mount();
  expect(matchCommands(registry.list(), "appearance")[0]?.id).toBe("settings.section.general");
  expect(matchCommands(registry.list(), "trash")[0]?.title).toBe("Open Settings: Trash");
  expect(matchCommands(registry.list(), "api keys")[0]?.title).toBe(
    "Open Settings: Keys & services",
  );
});

it("reopens the welcome screen and offers the tour", async () => {
  const registry = await mount();
  expect(matchCommands(registry.list(), "welcome")[0]?.title).toBe("Open the welcome screen");
  expect(matchCommands(registry.list(), "tour")[0]?.title).toBe("Start the tour");
  expect(matchCommands(registry.list(), "interactive tutorial")[0]?.title).toBe("Start the tour");
});
