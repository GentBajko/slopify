import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  CommandPaletteProvider,
  CommandRegistry,
  matchCommands,
} from "@/components/kit/command-palette";
import { renderRouted, testDeps } from "@/test-app";
import { ShellCommands } from "./shell-commands.js";

afterEach(cleanup);

async function mount() {
  const registry = new CommandRegistry();
  renderRouted(
    <CommandPaletteProvider registry={registry}>
      <ShellCommands />
    </CommandPaletteProvider>,
    testDeps({}),
  );
  await waitFor(() => expect(registry.list().length).toBeGreaterThan(10));
  return registry;
}

it("lands a Settings section's name on that section, not on Settings' first one", async () => {
  const registry = await mount();
  expect(matchCommands(registry.list(), "appearance")[0]?.id).toBe("settings.section.general");
  expect(matchCommands(registry.list(), "trash")[0]?.title).toBe("Open Settings: Trash");
  expect(matchCommands(registry.list(), "api keys")[0]?.title).toBe("Open Settings: Providers");
});

it("reopens the welcome screen and offers the interactive tutorial", async () => {
  const registry = await mount();
  expect(matchCommands(registry.list(), "welcome")[0]?.title).toBe("Open the welcome screen");
  expect(matchCommands(registry.list(), "interactive tutorial")[0]?.title).toBe(
    "Start the interactive tutorial",
  );
});
